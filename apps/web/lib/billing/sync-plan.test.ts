import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("../accounts/ensure-account", () => ({ ensureAccount: vi.fn() }));
vi.mock("../analytics/events", () => ({ trackUpgraded: vi.fn() }));
vi.mock("../supabase/service", () => ({ createServiceClient: vi.fn() }));

import { grantsPro } from "./sync-plan";

const item = (over = {}) => ({ id: "i1", status: "active", planSlug: "pro", periodEnd: null as number | null, ...over });
const now = 1_000_000;

describe("grantsPro", () => {
  it("is true for an active Pro item", () => expect(grantsPro(item(), { now })).toBe(true));
  it("is false for another plan", () => expect(grantsPro(item({ planSlug: "starter" }), { now })).toBe(false));
  it.each(["ended", "expired", "abandoned", "incomplete", "upcoming"])("is false for a %s item", (status) =>
    expect(grantsPro(item({ status }), { now })).toBe(false),
  );
  it("keeps a past_due item (grace period)", () => expect(grantsPro(item({ status: "past_due" }), { now })).toBe(true));
  it("keeps a canceled item until its period ends", () => {
    expect(grantsPro(item({ status: "canceled", periodEnd: now + 1 }), { now })).toBe(true);
    expect(grantsPro(item({ status: "canceled", periodEnd: now - 1 }), { now })).toBe(false);
  });
  it("never counts the item an ended event is about", () =>
    expect(grantsPro(item(), { now, endedItemId: "i1" })).toBe(false));
});
