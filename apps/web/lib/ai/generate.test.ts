import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("./gemini", () => ({ getGemini: () => ({ models: { generateContent } }) }));
const { traceGeneration } = vi.hoisted(() => ({ traceGeneration: vi.fn() }));
vi.mock("./tracing", () => ({ traceGeneration }));

import { generateAnswer } from "./generate";
import { CHAT_FALLBACK_MODEL, CHAT_MODEL } from "./models";
import { AiRateLimitError, BUSY_RETRY_DELAY_MS } from "./rate-limit";

const reply = (text: string | undefined) => ({ text });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  generateContent.mockResolvedValue(reply("We open at 9."));
});
afterEach(() => vi.useRealTimers());

describe("generateAnswer", () => {
  it("returns the reply text", async () => {
    await expect(
      generateAnswer({ system: "Answer from the chunks.", messages: [{ role: "user", content: "When do you open?" }] }),
    ).resolves.toBe("We open at 9.");
  });

  it("asks the chat model with the system prompt as the system instruction", async () => {
    await generateAnswer({ system: "Answer only from the chunks.", messages: [{ role: "user", content: "Hi" }] });
    expect(generateContent).toHaveBeenCalledTimes(1);
    const params = generateContent.mock.calls[0]![0];
    expect(params.model).toBe("gemini-3.1-flash-lite");
    expect(params.model).toBe(CHAT_MODEL);
    expect(params.config).toEqual({ systemInstruction: "Answer only from the chunks." });
  });

  it("sends the conversation in order, mapping the bot's turns to Gemini's `model` role", async () => {
    await generateAnswer({
      system: "s",
      messages: [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "second question" },
      ],
    });
    expect(generateContent.mock.calls[0]![0].contents).toEqual([
      { role: "user", parts: [{ text: "first question" }] },
      { role: "model", parts: [{ text: "first answer" }] },
      { role: "user", parts: [{ text: "second question" }] },
    ]);
  });

  it("trims the reply", async () => {
    generateContent.mockResolvedValueOnce(reply("  \n Yes.  \n"));
    await expect(generateAnswer({ system: "s", messages: [{ role: "user", content: "q" }] })).resolves.toBe("Yes.");
  });

  it.each([[undefined], [""], ["   "]])("throws when the model returns no text (%j)", async (text) => {
    generateContent.mockResolvedValueOnce(reply(text));
    await expect(generateAnswer({ system: "s", messages: [{ role: "user", content: "q" }] })).rejects.toThrow(
      "The model returned no text",
    );
  });

  it("throws, without calling the model, when there are no messages", async () => {
    await expect(generateAnswer({ system: "s", messages: [] })).rejects.toThrow("at least one message");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("lets other API errors through without retrying", async () => {
    generateContent.mockRejectedValueOnce(new ApiError({ message: "bad request", status: 400 }));
    await expect(generateAnswer({ system: "s", messages: [{ role: "user", content: "q" }] })).rejects.toThrow("bad request");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

});

const ask = () => generateAnswer({ system: "Be brief.", messages: [{ role: "user", content: "When do you open?" }] });
const modelsUsed = () => generateContent.mock.calls.map(([params]) => (params as { model: string }).model);
const apiError = (status: number) => new ApiError({ message: `status ${status}`, status });

describe("generateAnswer when the chat model is busy", () => {
  beforeEach(() => vi.useFakeTimers());

  /** Runs ask() through the retry pause and returns what it settled to. */
  const settle = async () => {
    const result = ask();
    const outcome = result.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(BUSY_RETRY_DELAY_MS);
    return outcome;
  };

  it.each([429, 503])("retries a %i on the same model after a pause, and answers from it", async (status) => {
    generateContent.mockRejectedValueOnce(apiError(status)).mockResolvedValueOnce(reply("Primary answer."));
    const result = ask();
    await vi.advanceTimersByTimeAsync(BUSY_RETRY_DELAY_MS - 1);
    expect(generateContent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("Primary answer.");
    expect(modelsUsed()).toEqual([CHAT_MODEL, CHAT_MODEL]);
  });

  it.each([429, 503])("after two %is, answers from the fallback model with the same request", async (status) => {
    generateContent
      .mockRejectedValueOnce(apiError(status))
      .mockRejectedValueOnce(apiError(status))
      .mockResolvedValueOnce(reply("Fallback answer."));
    const outcome = await settle();

    expect(outcome).toEqual({ value: "Fallback answer." });
    expect(modelsUsed()).toEqual([CHAT_MODEL, CHAT_MODEL, CHAT_FALLBACK_MODEL]);
    const [primary, , fallback] = generateContent.mock.calls.map(([params]) => params);
    expect(fallback.contents).toEqual(primary.contents);
    expect(fallback.config).toEqual({ systemInstruction: "Be brief." });
  });

  it("does not use the fallback when the retry succeeds", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(reply("ok"));
    await settle();
    expect(modelsUsed()).not.toContain(CHAT_FALLBACK_MODEL);
  });

  it("tries the fallback model once, with no retry of its own", async () => {
    generateContent.mockRejectedValue(apiError(503));
    const outcome = await settle();
    expect(outcome).toHaveProperty("error");
    expect(modelsUsed()).toEqual([CHAT_MODEL, CHAT_MODEL, CHAT_FALLBACK_MODEL]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("when the fallback is busy too, throws the typed busy error (with the cause)", async () => {
    generateContent.mockRejectedValue(apiError(503));
    const outcome = (await settle()) as { error: AiRateLimitError };
    expect(outcome.error).toBeInstanceOf(AiRateLimitError);
    expect((outcome.error.cause as ApiError).status).toBe(503);
  });

  it("when the fallback fails some other way, still throws the busy error, so the visitor never sees a generic failure", async () => {
    generateContent
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(500));
    const outcome = (await settle()) as { error: unknown };
    expect(outcome.error).toBeInstanceOf(AiRateLimitError);
    expect(console.error).toHaveBeenCalled(); // and the real failure is logged
  });

  it("an empty answer from the fallback is still an error", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(reply(""));
    const outcome = (await settle()) as { error: Error };
    expect(outcome.error.message).toBe("The model returned no text");
  });

  it("logs that the fallback is being used", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(reply("ok"));
    await settle();
    expect(vi.mocked(console.warn).mock.calls[0]?.join(" ")).toContain(CHAT_FALLBACK_MODEL);
  });
});

describe("generateAnswer when the chat model is not found", () => {
  it("goes straight to the fallback model, with no retry or pause", async () => {
    generateContent.mockRejectedValueOnce(apiError(404)).mockResolvedValueOnce(reply("Fallback answer."));
    await expect(ask()).resolves.toBe("Fallback answer.");
    expect(modelsUsed()).toEqual([CHAT_MODEL, CHAT_FALLBACK_MODEL]);
  });

  it("if the fallback fails too, throws the busy error", async () => {
    generateContent.mockRejectedValue(apiError(404));
    await expect(ask()).rejects.toBeInstanceOf(AiRateLimitError);
    expect(modelsUsed()).toEqual([CHAT_MODEL, CHAT_FALLBACK_MODEL]);
  });
});

describe("generateAnswer with errors that are not about load", () => {
  it.each([400, 401, 403, 500])("throws a %i as is: no retry, no fallback model", async (status) => {
    generateContent.mockRejectedValue(apiError(status));
    await expect(ask()).rejects.toThrow(`status ${status}`);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(modelsUsed()).toEqual([CHAT_MODEL]);
  });

  it("never touches the fallback model when the primary works", async () => {
    await ask();
    expect(modelsUsed()).toEqual([CHAT_MODEL]);
  });
});

describe("generateAnswer tracing", () => {
  const ctx = { distinctId: "owner_1", projectId: "p1", traceId: "conv-1" };
  const input = { system: "s", messages: [{ role: "user" as const, content: "Hi" }] };

  it("records one generation with the model that answered, its usage and a latency", async () => {
    generateContent.mockResolvedValue({ text: "ok", usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } });
    await generateAnswer(input, ctx);
    expect(traceGeneration).toHaveBeenCalledTimes(1);
    const [passedCtx, rec] = traceGeneration.mock.calls[0]!;
    expect(passedCtx).toBe(ctx);
    expect(rec.model).toBe(CHAT_MODEL);
    expect(rec.usage).toEqual({ promptTokenCount: 7, candidatesTokenCount: 3 });
    expect(rec.latencySeconds).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(rec)).not.toContain("Hi");
  });

  it("records the fallback model when the fallback answered", async () => {
    generateContent
      .mockRejectedValueOnce(new ApiError({ message: "busy", status: 503 }))
      .mockRejectedValueOnce(new ApiError({ message: "busy", status: 503 }))
      .mockResolvedValueOnce({ text: "from fallback", usageMetadata: {} });
    vi.useFakeTimers();
    const pending = generateAnswer(input, ctx);
    await vi.advanceTimersByTimeAsync(BUSY_RETRY_DELAY_MS);
    await pending;
    expect(traceGeneration.mock.calls[0]![1].model).toBe(CHAT_FALLBACK_MODEL);
  });

  it("records nothing without a context, or when no text comes back", async () => {
    await generateAnswer(input);
    expect(traceGeneration).not.toHaveBeenCalled();
    generateContent.mockResolvedValue({ text: "  " });
    await expect(generateAnswer(input, ctx)).rejects.toThrow("no text");
    expect(traceGeneration).not.toHaveBeenCalled();
  });

  it("returns the reply even if tracing throws", async () => {
    traceGeneration.mockImplementation(() => {
      throw new Error("tracing broke");
    });
    await expect(generateAnswer(input, ctx)).resolves.toBe("We open at 9.");
  });
});
