import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { maybeSingle, eq, from, createOwnerClient, createServiceClient } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingle, eq, from, createOwnerClient: vi.fn(() => ({ from })), createServiceClient: vi.fn() };
});
vi.mock("../supabase/owner", () => ({ createOwnerClient }));
vi.mock("../supabase/service", () => ({ createServiceClient }));

import { getOwnedProject } from "./get-owned-project";

const row = { id: "p1", name: "Mine", public_key: "pk_1", messages_used: 2, period_start: "a", created_at: "b" };

beforeEach(() => vi.clearAllMocks());

describe("getOwnedProject", () => {
  it("returns the project the owner client can see", async () => {
    maybeSingle.mockResolvedValueOnce({ data: row, error: null });
    await expect(getOwnedProject("p1")).resolves.toMatchObject({ id: "p1", name: "Mine", publicKey: "pk_1" });
  });

  it("returns null when RLS hides it (missing or someone else's)", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getOwnedProject("p2")).resolves.toBeNull();
  });

  it("uses the owner client only, filtering by id and nothing else", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await getOwnedProject("p9");
    expect(createOwnerClient).toHaveBeenCalledTimes(1);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("projects");
    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("id", "p9");
  });

  it("throws on a database error", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(getOwnedProject("p1")).rejects.toThrow("Could not read the project: boom");
  });
});
