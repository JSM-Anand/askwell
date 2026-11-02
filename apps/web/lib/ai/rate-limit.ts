import { ApiError } from "@google/genai";

/**
 * Thrown when Gemini is still too busy after the retry: it answered 429 (free-tier rate limit,
 * RESOURCE_EXHAUSTED) or 503 (UNAVAILABLE, "high demand"). The chat route turns it into a 503 and the
 * panel shows "The assistant is busy right now. Try again in a moment."
 */
export class AiRateLimitError extends Error {
  constructor(message = "The AI service is busy. Try again in a moment.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiRateLimitError";
  }
}

/** How long to wait before the one retry. */
export const BUSY_RETRY_DELAY_MS = 2_000;

const statusOf = (error: unknown): unknown =>
  error instanceof ApiError
    ? error.status
    : typeof error === "object" && error !== null
      ? (error as { status?: unknown }).status
      : undefined;

/**
 * The provider is too busy right now, not rejecting the request: 429 (RESOURCE_EXHAUSTED) or 503
 * (UNAVAILABLE). Worth waiting and trying again. A 400, 401, 403 or 500 is not.
 */
export const isProviderBusy = (error: unknown): boolean => statusOf(error) === 429 || statusOf(error) === 503;

/** The model itself doesn't exist (any more): 404. */
export const isModelNotFound = (error: unknown): boolean => statusOf(error) === 404;

/**
 * Runs a Gemini call. When the provider is busy it waits BUSY_RETRY_DELAY_MS and tries once more; a
 * second busy answer becomes an AiRateLimitError. Any other error is thrown as is, without a retry.
 */
export async function withBusyRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isProviderBusy(error)) throw error;
  }

  await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_DELAY_MS));
  try {
    return await call();
  } catch (error) {
    if (isProviderBusy(error)) throw new AiRateLimitError(undefined, { cause: error });
    throw error;
  }
}
