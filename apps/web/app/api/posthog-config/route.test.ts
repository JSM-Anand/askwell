import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/posthog-config", () => {
  it("returns the values set at request time, uncached", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_a");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://a");
    const res = GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ key: "phc_a", host: "https://a" });

    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_b");
    expect(await GET().json()).toEqual({ key: "phc_b", host: "https://a" });
  });

  it("returns nulls when not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    expect(await GET().json()).toEqual({ key: null, host: null });
  });
});
