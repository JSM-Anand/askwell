import "server-only";
import { CHAT_FALLBACK_MODEL, CHAT_MODEL } from "./models";
import { getGemini } from "./gemini";
import { AiRateLimitError, isModelNotFound, withBusyRetry } from "./rate-limit";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type GenerateAnswerInput = {
  /** The system prompt: what the bot may answer and how. */
  system: string;
  /** The conversation so far, oldest first, ending with the visitor's question. */
  messages: ChatTurn[];
};

/**
 * The reply text from the chat model. This is the only way the app asks a model for an answer, so
 * the chat route never touches the provider SDK (and Phase 4 can wrap this one function for PostHog
 * AI tracing).
 *
 * When Gemini is busy (429 or 503) the call is retried once. If it is still busy, or the model is not
 * found (404), the same request goes once to CHAT_FALLBACK_MODEL. If that fails too, the error is an
 * AiRateLimitError, so a visitor sees "busy", never a generic failure. Any other error (a bad request,
 * a bad key) is thrown as is, without a retry or a fallback. An answer with no text (blocked, or empty)
 * is an error.
 */
export async function generateAnswer({ system, messages }: GenerateAnswerInput): Promise<string> {
  if (messages.length === 0) throw new Error("generateAnswer needs at least one message");

  const ask = (model: string) =>
    getGemini().models.generateContent({
      model,
      contents: messages.map(({ role, content }) => ({
        role: role === "assistant" ? "model" : "user",
        parts: [{ text: content }],
      })),
      config: { systemInstruction: system },
    });

  let response;
  try {
    response = await withBusyRetry(() => ask(CHAT_MODEL));
  } catch (error) {
    if (!(error instanceof AiRateLimitError) && !isModelNotFound(error)) throw error;
    console.warn(`Chat model ${CHAT_MODEL} unavailable, answering with ${CHAT_FALLBACK_MODEL}:`, error instanceof Error ? error.message : error);
    try {
      response = await ask(CHAT_FALLBACK_MODEL);
    } catch (fallbackError) {
      console.error(`Fallback chat model ${CHAT_FALLBACK_MODEL} failed too:`, fallbackError);
      throw new AiRateLimitError(undefined, { cause: fallbackError });
    }
  }

  const text = response.text?.trim();
  if (!text) throw new Error("The model returned no text");
  return text;
}
