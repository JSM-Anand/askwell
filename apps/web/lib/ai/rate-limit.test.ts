import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiRateLimitError, BUSY_RETRY_DELAY_MS, isModelNotFound, isProviderBusy, withBusyRetry } from "./rate-limit";

const apiError = (status: number) => new ApiError({ message: `status ${status}`, status });
const busy = (status: 429 | 503) => apiError(status);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("isProviderBusy", () => {
  it("is true for 429 (RESOURCE_EXHAUSTED) and 503 (UNAVAILABLE), as an ApiError or as any error carrying the status", () => {
    for (const status of [429, 503]) {
      expect(isProviderBusy(apiError(status))).toBe(true);
      expect(isProviderBusy({ status })).toBe(true);
    }
  });

  it("is false for a request the provider rejects, and for anything else", () => {
    for (const status of [400, 401, 403, 404, 500, 502, 504]) expect(isProviderBusy(apiError(status)), String(status)).toBe(false);
    expect(isProviderBusy(new Error("503 in the text only"))).toBe(false);
    expect(isProviderBusy(null)).toBe(false);
    expect(isProviderBusy("503")).toBe(false);
  });
});

describe("isModelNotFound", () => {
  it("is true only for a 404", () => {
    expect(isModelNotFound(apiError(404))).toBe(true);
    expect(isModelNotFound({ status: 404 })).toBe(true);
    expect(isModelNotFound(apiError(400))).toBe(false);
    expect(isModelNotFound(apiError(503))).toBe(false);
    expect(isModelNotFound(undefined)).toBe(false);
  });
});

describe("withBusyRetry", () => {
  it("returns the result without waiting when the call works", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    await expect(withBusyRetry(call)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it.each([429, 503] as const)("waits, then retries once after a %i, and returns the second result", async (status) => {
    const call = vi.fn().mockRejectedValueOnce(busy(status)).mockResolvedValueOnce("second try");
    const result = withBusyRetry(call);

    await vi.advanceTimersByTimeAsync(BUSY_RETRY_DELAY_MS - 1);
    expect(call).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("second try");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it.each([
    [429, 429],
    [503, 503],
    [503, 429],
    [429, 503],
  ] as const)("throws an AiRateLimitError, keeping the cause, after %i then %i, and doesn't retry again", async (first, second) => {
    const call = vi.fn().mockRejectedValueOnce(busy(first)).mockRejectedValueOnce(busy(second));
    const result = withBusyRetry(call);
    const assertion = expect(result).rejects.toBeInstanceOf(AiRateLimitError);
    await vi.advanceTimersByTimeAsync(BUSY_RETRY_DELAY_MS);
    await assertion;
    expect(call).toHaveBeenCalledTimes(2);
    await result.catch((error: AiRateLimitError) => {
      expect(error.name).toBe("AiRateLimitError");
      expect(error.cause).toBeInstanceOf(ApiError);
      expect((error.cause as ApiError).status).toBe(second);
    });
  });

  it.each([400, 401, 403, 404, 500])("throws a %i as is, without waiting or retrying", async (status) => {
    const failure = apiError(status);
    const call = vi.fn().mockRejectedValue(failure);
    await expect(withBusyRetry(call)).rejects.toBe(failure);
    expect(call).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("throws a non-busy error from the retry as is", async () => {
    const failure = new Error("network down");
    const call = vi.fn().mockRejectedValueOnce(busy(503)).mockRejectedValueOnce(failure);
    const result = withBusyRetry(call);
    const assertion = expect(result).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(BUSY_RETRY_DELAY_MS);
    await assertion;
  });
});
