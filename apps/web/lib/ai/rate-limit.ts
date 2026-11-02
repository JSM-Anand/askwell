import { ApiError } from "@google/genai";

/** Thrown when Gemini still answers 429 (free-tier rate limit) after the one retry. */
export class AiRateLimitError extends Error {
  constructor(message = "The AI service is rate limited. Try again in a moment.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiRateLimitError";
  }
}

/** How long to wait before the one retry. */
export const RATE_LIMIT_RETRY_DELAY_MS = 2_000;

export function isRateLimited(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 429;
  return typeof error === "object" && error !== null && (error as { status?: unknown }).status === 429;
}

/**
 * Runs a Gemini call. On a 429 it waits RATE_LIMIT_RETRY_DELAY_MS and tries once more; a second
 * 429 becomes an AiRateLimitError. Any other error is thrown as is, without a retry.
 */
export async function withRateLimitRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isRateLimited(error)) throw error;
  }

  await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS));
  try {
    return await call();
  } catch (error) {
    if (isRateLimited(error)) throw new AiRateLimitError(undefined, { cause: error });
    throw error;
  }
}
