import { afterEach, describe, expect, it, vi } from "vitest";
import { readPostHogConfig } from "./config";

afterEach(() => vi.restoreAllMocks());

describe("readPostHogConfig", () => {
  it("returns key and host when both are set", () => {
    expect(
      readPostHogConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "https://h" }),
    ).toEqual({ key: "phc_x", host: "https://h" });
  });

  it("returns null and stays silent outside development", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(readPostHogConfig({ NODE_ENV: "production" })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs the missing variable once in development, never throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = { NODE_ENV: "development", NEXT_PUBLIC_POSTHOG_HOST: "https://h" };
    expect(readPostHogConfig(env)).toBeNull();
    expect(readPostHogConfig(env)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toContain("NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog");
  });
});
