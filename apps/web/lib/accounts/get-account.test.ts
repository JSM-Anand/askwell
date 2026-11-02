import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { maybeSingle, select, from, createOwnerClient, createServiceClient } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const select = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn(() => ({ select }));
  return {
    maybeSingle,
    select,
    from,
    createOwnerClient: vi.fn(() => ({ from })),
    createServiceClient: vi.fn(),
  };
});
vi.mock("../supabase/owner", () => ({ createOwnerClient }));
vi.mock("../supabase/service", () => ({ createServiceClient }));

import { getAccount, planLabel } from "./get-account";

beforeEach(() => vi.clearAllMocks());

describe("getAccount", () => {
  it("reads the plan from the database row", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { clerk_user_id: "user_123", plan: "pro", created_at: "2026-11-02T00:00:00Z" },
      error: null,
    });
    await expect(getAccount()).resolves.toEqual({
      clerkUserId: "user_123",
      plan: "pro",
      createdAt: "2026-11-02T00:00:00Z",
    });
  });

  it("uses the owner client with no owner filter, and never the service client", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await getAccount();
    expect(createOwnerClient).toHaveBeenCalledTimes(1);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("accounts");
    expect(select).toHaveBeenCalledTimes(1);
    // RLS scopes the read, so the chain is from().select().maybeSingle() with no .eq()/.filter().
    expect(select.mock.results[0]?.value).toEqual({ maybeSingle });
  });

  it("takes no arguments, so the client can't choose whose plan to read", () => {
    expect(getAccount.length).toBe(0);
  });

  it("returns null when RLS shows no row", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getAccount()).resolves.toBeNull();
  });

  it("throws on a database error", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(getAccount()).rejects.toThrow("Could not read the account: boom");
  });

  it("throws on a plan it doesn't know", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { clerk_user_id: "user_123", plan: "enterprise", created_at: "x" },
      error: null,
    });
    await expect(getAccount()).rejects.toThrow('Unknown plan "enterprise"');
  });
});

describe("planLabel", () => {
  it("labels each plan", () => {
    expect(planLabel("free")).toBe("Free plan");
    expect(planLabel("pro")).toBe("Pro plan");
  });
});
