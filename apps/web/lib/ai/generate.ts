import "server-only";
import { CHAT_FALLBACK_MODEL, CHAT_MODEL } from "./models";
import { getGemini } from "./gemini";
import { AiRateLimitError, isModelNotFound, withBusyRetry } from "./rate-limit";
import { traceGeneration } from "./tracing";
import type { GenerationRecord, TracingContext } from "./tracing";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type GenerateAnswerInput = {
  /** The system prompt: what the bot may answer and how. */
  system: string;
  /** The conversation so far, oldest first, ending with the visitor's question. */
  messages: ChatTurn[];
};

/**
 * The reply text from the chat model. This is the only way the app asks a model for an answer, so
 * the chat route never touches the provider SDK.
 *
 * With a tracing context, a successful reply is recorded in PostHog as one `$ai_generation`: the model
 * that answered, token counts, latency and the project, never the prompt or the reply (see tracing.ts).
 * Tracing never changes the result: its failures are logged and swallowed.
 *
 * When Gemini is busy (429 or 503) the call is retried once. If it is still busy, or the model is not
 * found (404), the same request goes once to CHAT_FALLBACK_MODEL. If that fails too, the error is an
 * AiRateLimitError, so a visitor sees "busy", never a generic failure. Any other error (a bad request,
 * a bad key) is thrown as is, without a retry or a fallback. An answer with no text (blocked, or empty)
 * is an error.
 */
export async function generateAnswer({ system, messages }: GenerateAnswerInput, tracing?: TracingContext): Promise<string> {
  if (messages.length === 0) throw new Error("generateAnswer needs at least one message");

  // The model and the time of the call that produced the answer (a retry or the fallback replaces it).
  let answered: Pick<GenerationRecord, "model" | "latencySeconds"> | undefined;
  const ask = async (model: string) => {
    const startedAt = performance.now();
    const result = await getGemini().models.generateContent({
      model,
      contents: messages.map(({ role, content }) => ({
        role: role === "assistant" ? "model" : "user",
        parts: [{ text: content }],
      })),
      config: { systemInstruction: system },
    });
    answered = { model, latencySeconds: (performance.now() - startedAt) / 1000 };
    return result;
  };

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
  if (tracing && answered) {
    try {
      void traceGeneration(tracing, { ...answered, usage: response.usageMetadata });
    } catch (cause) {
      console.error("AI tracing failed", cause); // never costs the visitor their reply
    }
  }
  return text;
}
