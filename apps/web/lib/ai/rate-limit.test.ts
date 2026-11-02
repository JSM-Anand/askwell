import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiRateLimitError, RATE_LIMIT_RETRY_DELAY_MS, isRateLimited, withRateLimitRetry } from "./rate-limit";

const rateLimited = () => new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("isRateLimited", () => {
  it("is true for a 429 ApiError and for any error carrying status 429", () => {
    expect(isRateLimited(rateLimited())).toBe(true);
    expect(isRateLimited({ status: 429 })).toBe(true);
  });

  it("is false for other statuses and other values", () => {
    expect(isRateLimited(new ApiError({ message: "bad", status: 400 }))).toBe(false);
    expect(isRateLimited(new ApiError({ message: "down", status: 503 }))).toBe(false);
    expect(isRateLimited(new Error("429 in the text only"))).toBe(false);
    expect(isRateLimited(null)).toBe(false);
    expect(isRateLimited("429")).toBe(false);
  });
});

describe("withRateLimitRetry", () => {
  it("returns the result without waiting when the call works", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    await expect(withRateLimitRetry(call)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("waits, then retries once after a 429, and returns the second result", async () => {
    const call = vi.fn().mockRejectedValueOnce(rateLimited()).mockResolvedValueOnce("second try");
    const result = withRateLimitRetry(call);

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAY_MS - 1);
    expect(call).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("second try");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("throws an AiRateLimitError, keeping the cause, after a second 429, and doesn't retry again", async () => {
    const call = vi.fn().mockRejectedValue(rateLimited());
    const result = withRateLimitRetry(call);
    const assertion = expect(result).rejects.toBeInstanceOf(AiRateLimitError);
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAY_MS);
    await assertion;
    expect(call).toHaveBeenCalledTimes(2);
    await result.catch((error: AiRateLimitError) => {
      expect(error.name).toBe("AiRateLimitError");
      expect(error.cause).toBeInstanceOf(ApiError);
    });
  });

  it("throws any other error as is, without retrying", async () => {
    const failure = new ApiError({ message: "bad request", status: 400 });
    const call = vi.fn().mockRejectedValue(failure);
    await expect(withRateLimitRetry(call)).rejects.toBe(failure);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("throws a non-429 error from the retry as is", async () => {
    const failure = new Error("network down");
    const call = vi.fn().mockRejectedValueOnce(rateLimited()).mockRejectedValueOnce(failure);
    const result = withRateLimitRetry(call);
    const assertion = expect(result).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAY_MS);
    await assertion;
  });
});
