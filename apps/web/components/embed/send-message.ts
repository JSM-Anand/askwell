import type { ChatRequest, ChatResponse } from "@askwell/shared";

/** What the visitor sees when the chat route says no. Nothing from the server's message is shown. */
export const CHAT_ERRORS = {
  rateLimited: "You're sending messages quickly. Try again in a minute.",
  quotaExceeded: "This chat has reached its monthly limit.",
  promptInjection: "I can't help with that.",
  busy: "The assistant is busy right now. Try again in a moment.",
  generic: "Something went wrong. Try again.",
} as const;

/**
 * How long to wait for the route. The route itself gives up on the AI provider well before this (each
 * provider call has its own 60 s limit and a failed one is retried once), so a request still open after
 * this is never going to answer. Without a limit the panel would stay "typing" with the input disabled.
 */
export const CHAT_TIMEOUT_MS = 90_000;

export type SendResult = { ok: true; conversationId: string; reply: string } | { ok: false; message: string };

const isChatResponse = (data: unknown): data is ChatResponse =>
  typeof data === "object" &&
  data !== null &&
  typeof (data as ChatResponse).conversationId === "string" &&
  typeof (data as ChatResponse).reply === "string";

const errorCode = (data: unknown): unknown =>
  typeof data === "object" && data !== null ? (data as { error?: { code?: unknown } }).error?.code : undefined;

/** The friendly message for a failed response, from its status and the error code in its body. */
function friendlyMessage(status: number, code: unknown): string {
  if (status === 429 && code === "rate_limited") return CHAT_ERRORS.rateLimited;
  if (status === 429 && code === "quota_exceeded") return CHAT_ERRORS.quotaExceeded;
  if (status === 400 && code === "prompt_injection") return CHAT_ERRORS.promptInjection;
  if (status === 503) return CHAT_ERRORS.busy;
  return CHAT_ERRORS.generic;
}

/**
 * Sends one visitor message to POST /api/widget/chat (same origin) and returns the reply and the
 * conversation id to send with the next message, or a friendly message to show instead.
 * It never throws: a network failure, a timeout or an odd response is just the generic message.
 */
export async function sendChatMessage(
  input: ChatRequest,
  getJson: typeof fetch = (url, init) => fetch(url, init),
): Promise<SendResult> {
  // AbortController + setTimeout rather than AbortSignal.timeout, which older embedding browsers lack.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const response = await getJson("/api/widget/chat", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      // An undefined conversationId is left out of the JSON: the first message starts a conversation.
      body: JSON.stringify({
        key: input.key,
        visitorId: input.visitorId,
        conversationId: input.conversationId,
        message: input.message,
      }),
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (response.ok && isChatResponse(data)) {
      return { ok: true, conversationId: data.conversationId, reply: data.reply };
    }
    return { ok: false, message: friendlyMessage(response.status, errorCode(data)) };
  } catch {
    return { ok: false, message: CHAT_ERRORS.generic }; // a network failure or the timeout
  } finally {
    clearTimeout(timer);
  }
}
