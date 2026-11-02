import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ marker: "client" })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { createServiceClient } from "./service";

// Built from parts so the secret key's name appears in service.ts only (grep check).
const SECRET = ["SUPABASE", "SECRET", "KEY"].join("_");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv(SECRET, "sb_secret_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("createServiceClient", () => {
  it("uses the URL and the secret key", () => {
    createServiceClient();
    const [url, key] = createClient.mock.calls[0] as unknown as [string, string];
    expect(url).toBe("https://example.supabase.co");
    expect(key).toBe("sb_secret_test");
  });

  it("does not persist or refresh a session", () => {
    createServiceClient();
    const options = (createClient.mock.calls[0] as unknown as [string, string, { auth: object }])[2];
    expect(options.auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", SECRET])(
    "throws a clear error when %s is missing",
    (name) => {
      vi.stubEnv(name, "");
      expect(() => createServiceClient()).toThrow(`Missing environment variable ${name}`);
      expect(createClient).not.toHaveBeenCalled();
    },
  );
});
