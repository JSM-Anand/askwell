import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { upsert, from, createServiceClient, trackSignedUp } = vi.hoisted(() => {
  const select = vi.fn();
  const upsert = vi.fn() as ReturnType<typeof vi.fn> & ((...args: unknown[]) => { select: typeof select });
  upsert.mockImplementation(() => ({ select }));
  const from = vi.fn(() => ({ upsert }));
  return { upsert: Object.assign(upsert, { select }), from, createServiceClient: vi.fn(() => ({ from })), trackSignedUp: vi.fn() };
});
vi.mock("../analytics/events", () => ({ trackSignedUp }));
vi.mock("../supabase/service", () => ({ createServiceClient }));

import { ensureAccount } from "./ensure-account";

beforeEach(() => {
  vi.clearAllMocks();
  upsert.select.mockResolvedValue({ data: [{ clerk_user_id: "user_123" }], error: null });
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
    upsert.select.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(ensureAccount("user_123")).rejects.toThrow("Could not create the account row: boom");
  });

  it("fires signed_up once, for the user whose row was created", async () => {
    await ensureAccount("user_123");
    expect(trackSignedUp).toHaveBeenCalledTimes(1);
    expect(trackSignedUp).toHaveBeenCalledWith("user_123");
  });

  it("does not fire signed_up on the second visit (nothing inserted)", async () => {
    upsert.select.mockResolvedValueOnce({ data: [], error: null });
    await ensureAccount("user_123");
    expect(trackSignedUp).not.toHaveBeenCalled();
  });

  it("does not fire signed_up when the insert fails", async () => {
    upsert.select.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(ensureAccount("user_123")).rejects.toThrow();
    expect(trackSignedUp).not.toHaveBeenCalled();
  });
});
