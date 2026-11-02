import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ getToken })),
}));

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ marker: "client" })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { createOwnerClient } from "./owner";

type Options = { accessToken: () => Promise<string | null>; auth?: unknown };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("createOwnerClient", () => {
  it("uses the URL and the publishable key", () => {
    createOwnerClient();
    const [url, key] = createClient.mock.calls[0] as unknown as [string, string];
    expect(url).toBe("https://example.supabase.co");
    expect(key).toBe("sb_publishable_test");
  });

  it("sends the current Clerk session token", async () => {
    getToken.mockResolvedValueOnce("clerk-token-1");
    createOwnerClient();
    const options = (createClient.mock.calls[0] as unknown as [string, string, Options])[2];
    await expect(options.accessToken()).resolves.toBe("clerk-token-1");
  });

  it("reads the token on every request", async () => {
    createOwnerClient();
    const options = (createClient.mock.calls[0] as unknown as [string, string, Options])[2];
    getToken.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    await expect(options.accessToken()).resolves.toBe("first");
    await expect(options.accessToken()).resolves.toBe("second");
  });

  it("passes null when signed out", async () => {
    getToken.mockResolvedValueOnce(null);
    createOwnerClient();
    const options = (createClient.mock.calls[0] as unknown as [string, string, Options])[2];
    await expect(options.accessToken()).resolves.toBeNull();
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])(
    "throws a clear error when %s is missing",
    (name) => {
      vi.stubEnv(name, "");
      expect(() => createOwnerClient()).toThrow(`Missing environment variable ${name}`);
      expect(createClient).not.toHaveBeenCalled();
    },
  );
});
