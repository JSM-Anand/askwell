import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_ERRORS, CHAT_TIMEOUT_MS, sendChatMessage } from "./send-message";

const CONVERSATION = "2f0d4c6e-3b1a-4c1e-9d3b-5a6f7e8d9c10";
const input = { key: "pk_a", visitorId: "visitor_1", message: "When do you open?" };

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;
const error = (status: number, code: string) => reply(status, { error: { code, message: "server wording that must not be shown" } });

describe("sendChatMessage: the request", () => {
  it("POSTs JSON to the same-origin chat route with the key, visitor ID and message", async () => {
    const getJson = reply(200, { conversationId: CONVERSATION, reply: "We open at 9." });
    await sendChatMessage(input, getJson);
    expect(getJson).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(getJson).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/widget/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ key: "pk_a", visitorId: "visitor_1", message: "When do you open?" });
  });

  it("leaves conversationId out of the first message and sends it on the next", async () => {
    const getJson = reply(200, { conversationId: CONVERSATION, reply: "ok" });
    await sendChatMessage(input, getJson);
    await sendChatMessage({ ...input, conversationId: CONVERSATION }, getJson);
    const bodies = vi.mocked(getJson).mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies[0]).not.toHaveProperty("conversationId");
    expect(bodies[1]).toMatchObject({ conversationId: CONVERSATION });
  });
});

describe("sendChatMessage: a good reply", () => {
  it("returns the reply and the conversation id for the next message", async () => {
    const result = await sendChatMessage(input, reply(200, { conversationId: CONVERSATION, reply: "We open at 9." }));
    expect(result).toEqual({ ok: true, conversationId: CONVERSATION, reply: "We open at 9." });
  });

  it("returns the reply as plain text, markup and all", async () => {
    const result = await sendChatMessage(input, reply(200, { conversationId: CONVERSATION, reply: "<b>bold</b>" }));
    expect(result).toMatchObject({ ok: true, reply: "<b>bold</b>" });
  });
});

describe("sendChatMessage: each error shows its friendly message, never the server's", () => {
  it.each([
    ["429 rate_limited", 429, "rate_limited", "You're sending messages quickly. Try again in a minute."],
    ["429 quota_exceeded", 429, "quota_exceeded", "This chat has reached its monthly limit."],
    ["400 prompt_injection", 400, "prompt_injection", "I can't help with that."],
    ["503 (the AI is busy)", 503, "internal_error", "The assistant is busy right now. Try again in a moment."],
    ["500 internal_error", 500, "internal_error", "Something went wrong. Try again."],
    ["404 not_found", 404, "not_found", "Something went wrong. Try again."],
    ["400 invalid_input", 400, "invalid_input", "Something went wrong. Try again."],
    ["429 with an unknown code", 429, "something_else", "Something went wrong. Try again."],
  ])("%s", async (_name, status, code, message) => {
    const result = await sendChatMessage(input, error(status, code));
    expect(result).toEqual({ ok: false, message });
    expect(JSON.stringify(result)).not.toContain("server wording");
  });

  it("the messages are exactly the agreed ones", () => {
    expect(CHAT_ERRORS).toEqual({
      rateLimited: "You're sending messages quickly. Try again in a minute.",
      quotaExceeded: "This chat has reached its monthly limit.",
      promptInjection: "I can't help with that.",
      busy: "The assistant is busy right now. Try again in a moment.",
      generic: "Something went wrong. Try again.",
    });
  });

  it("a network failure is the generic message, and nothing is thrown", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    await expect(sendChatMessage(input, failing)).resolves.toEqual({ ok: false, message: CHAT_ERRORS.generic });
  });

  it.each([
    ["a body that isn't JSON", reply(500, "<html>Bad gateway</html>")],
    ["a 200 with the wrong shape", reply(200, { nope: true })],
    ["a 200 with a numeric reply", reply(200, { conversationId: CONVERSATION, reply: 5 })],
    ["a 200 with no body", reply(200, "")],
  ])("%s is the generic message", async (_name, getJson) => {
    await expect(sendChatMessage(input, getJson)).resolves.toEqual({ ok: false, message: CHAT_ERRORS.generic });
  });
});

describe("sendChatMessage: a request that never settles", () => {
  afterEach(() => vi.useRealTimers());

  /** A fetch that only ends when its signal aborts, like a real one whose server never answers. */
  const hanging = () =>
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    ) as unknown as typeof fetch;

  it("passes an abort signal to the request", async () => {
    const getJson = reply(200, { conversationId: CONVERSATION, reply: "ok" });
    await sendChatMessage(input, getJson);
    const [, init] = vi.mocked(getJson).mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("gives up after CHAT_TIMEOUT_MS with the generic message, so the panel can stop waiting", async () => {
    vi.useFakeTimers();
    const getJson = hanging();
    const result = sendChatMessage(input, getJson);

    await vi.advanceTimersByTimeAsync(CHAT_TIMEOUT_MS - 1);
    let settled = false;
    void result.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ ok: false, message: CHAT_ERRORS.generic });
  });

  it("waits longer than a slow answer (a minute) before giving up", () => {
    expect(CHAT_TIMEOUT_MS).toBeGreaterThan(60_000);
  });

  it("cancels the timer once the answer is in, so nothing is left pending", async () => {
    vi.useFakeTimers();
    await sendChatMessage(input, reply(200, { conversationId: CONVERSATION, reply: "ok" }));
    expect(vi.getTimerCount()).toBe(0);
    await sendChatMessage(input, error(500, "internal_error"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
