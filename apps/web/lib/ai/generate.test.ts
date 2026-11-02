import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("./gemini", () => ({ getGemini: () => ({ models: { generateContent } }) }));

import { generateAnswer } from "./generate";
import { CHAT_MODEL } from "./models";
import { AiRateLimitError, RATE_LIMIT_RETRY_DELAY_MS } from "./rate-limit";

const reply = (text: string | undefined) => ({ text });

beforeEach(() => {
  vi.clearAllMocks();
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

  describe("rate limits", () => {
    beforeEach(() => vi.useFakeTimers());

    it("retries a 429 once after a pause and returns the answer", async () => {
      generateContent.mockRejectedValueOnce(new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 }));
      const result = generateAnswer({ system: "s", messages: [{ role: "user", content: "q" }] });
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAY_MS);
      await expect(result).resolves.toBe("We open at 9.");
      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it("throws an AiRateLimitError after a second 429", async () => {
      generateContent.mockRejectedValue(new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 }));
      const result = generateAnswer({ system: "s", messages: [{ role: "user", content: "q" }] });
      const assertion = expect(result).rejects.toBeInstanceOf(AiRateLimitError);
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAY_MS);
      await assertion;
      expect(generateContent).toHaveBeenCalledTimes(2);
    });
  });
});
