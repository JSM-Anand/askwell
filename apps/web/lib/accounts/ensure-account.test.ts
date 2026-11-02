import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { upsert, from, createServiceClient } = vi.hoisted(() => {
  const upsert = vi.fn();
  const from = vi.fn(() => ({ upsert }));
  return { upsert, from, createServiceClient: vi.fn(() => ({ from })) };
});
vi.mock("../supabase/service", () => ({ createServiceClient }));

import { ensureAccount } from "./ensure-account";

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
});

describe("ensureAccount", () => {
  it("inserts a free account with the service client, ignoring duplicates", async () => {
    await ensureAccount("user_123");
    expect(createServiceClient).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("accounts");
    expect(upsert).toHaveBeenCalledWith(
      { clerk_user_id: "user_123", plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );
  });

  it("is idempotent: calling it again, or twice at once, does not throw", async () => {
    await ensureAccount("user_123");
    await ensureAccount("user_123");
    await Promise.all([ensureAccount("user_456"), ensureAccount("user_456")]);
    expect(upsert).toHaveBeenCalledTimes(4);
    for (const call of upsert.mock.calls) {
      expect(call[1]).toMatchObject({ ignoreDuplicates: true });
    }
  });

  it("always writes plan free, so it can never grant Pro", async () => {
    await ensureAccount("user_123");
    const row = upsert.mock.calls[0]?.[0] as { plan: string };
    expect(row.plan).toBe("free");
  });

  it("throws when the database rejects the insert", async () => {
    upsert.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(ensureAccount("user_123")).rejects.toThrow("Could not create the account row: boom");
  });
});
