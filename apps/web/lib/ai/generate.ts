import "server-only";
import { CHAT_MODEL } from "./models";
import { getGemini } from "./gemini";
import { withRateLimitRetry } from "./rate-limit";

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
 * AI tracing). A rate limit (429) is retried once, then thrown as an AiRateLimitError. An answer
 * with no text (blocked, or empty) is an error.
 */
export async function generateAnswer({ system, messages }: GenerateAnswerInput): Promise<string> {
  if (messages.length === 0) throw new Error("generateAnswer needs at least one message");

  const response = await withRateLimitRetry(() =>
    getGemini().models.generateContent({
      model: CHAT_MODEL,
      contents: messages.map(({ role, content }) => ({
        role: role === "assistant" ? "model" : "user",
        parts: [{ text: content }],
      })),
      config: { systemInstruction: system },
    }),
  );

  const text = response.text?.trim();
  if (!text) throw new Error("The model returned no text");
  return text;
}
