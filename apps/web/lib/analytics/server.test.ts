import { beforeEach, describe, expect, it, vi } from "vitest";

const instance = { capture: vi.fn(), captureException: vi.fn(), flush: vi.fn() };
const ctor = vi.fn();
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      ctor(...args);
      return instance;
    }
  },
}));

import { capture, captureServerException, resetServerAnalyticsForTests } from "./server";

beforeEach(() => {
  vi.unstubAllEnvs();
  resetServerAnalyticsForTests();
  ctor.mockClear();
  Object.values(instance).forEach((f) => f.mockReset());
  instance.flush.mockResolvedValue(undefined);
});

describe("server analytics", () => {
  it("is a no-op without a key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    await capture({ distinctId: "u", event: "e" });
    await captureServerException(new Error("x"));
    expect(ctor).not.toHaveBeenCalled();
  });

  it("captures then flushes, with flushAt 1", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_x");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://h");
    await capture({ distinctId: "u", event: "e" });
    expect(ctor).toHaveBeenCalledWith("phc_x", { host: "https://h", flushAt: 1, flushInterval: 0 });
    expect(instance.capture).toHaveBeenCalledWith({ distinctId: "u", event: "e" });
    expect(instance.flush).toHaveBeenCalledTimes(1);
  });

  it("swallows flush errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_x");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://h");
    vi.spyOn(console, "error").mockImplementation(() => {});
    instance.flush.mockRejectedValue(new Error("down"));
    const err = new Error("boom");
    await expect(captureServerException(err, "u")).resolves.toBeUndefined();
    expect(instance.captureException).toHaveBeenCalledWith(err, "u");
  });
});
