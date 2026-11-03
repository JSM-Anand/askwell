import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const SECRET_BYTES = Buffer.from("askwell-test-signing-secret-bytes");
const SIGNING_SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;

type Item = { id: string; status: string; plan: { slug: string } | null; periodEnd: number | null };
const m = vi.hoisted(() => ({
  items: [] as Item[],
  clerkFails: false,
  accountPlan: undefined as string | undefined, // undefined: no accounts row yet
  getUserBillingSubscription: vi.fn(),
  ensureAccount: vi.fn(),
  trackUpgraded: vi.fn(),
  updates: [] as unknown[],
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ billing: { getUserBillingSubscription: m.getUserBillingSubscription } }),
}));
vi.mock("../../../../lib/accounts/ensure-account", () => ({ ensureAccount: m.ensureAccount }));
vi.mock("../../../../lib/analytics/events", () => ({ trackUpgraded: m.trackUpgraded }));
// An accounts table of one row, with the update ... where plan <> new semantics the sync relies on.
vi.mock("../../../../lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("accounts");
      return {
        update: (values: { plan: string }) => ({
          eq: () => ({
            neq: () => ({
              select: async () => {
                m.updates.push(values);
                if (m.accountPlan === undefined || m.accountPlan === values.plan) return { data: [], error: null };
                m.accountPlan = values.plan;
                return { data: [{ clerk_user_id: "user_1" }], error: null };
              },
            }),
          }),
        }),
      };
    },
  }),
}));

import { POST } from "./route";

const sign = (id: string, timestamp: string, body: string, secretBytes: Uint8Array = SECRET_BYTES) =>
  `v1,${createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64")}`;

function itemEvent(type: string, over: { slug?: string; status?: string; userId?: string | null; orgId?: string; itemId?: string } = {}) {
  return {
    type,
    object: "event",
    timestamp: 1_800_000_000_000,
    instance_id: "ins_1",
    data: {
      object: "commerce_subscription_item",
      id: over.itemId ?? "item_1",
      status: over.status ?? "active",
      plan: { slug: over.slug ?? "pro" },
      payer: {
        ...(over.userId === null ? {} : { user_id: over.userId ?? "user_1" }),
        ...(over.orgId ? { organization_id: over.orgId } : {}),
      },
    },
  };
}

function delivery(payload: unknown, opts: { id?: string; secretBytes?: Uint8Array; omitSignature?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const id = opts.id ?? "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "svix-id": id, "svix-timestamp": timestamp, "content-type": "application/json" };
  if (!opts.omitSignature) headers["svix-signature"] = sign(id, timestamp, body, opts.secretBytes);
  return new NextRequest("http://localhost:3000/api/clerk/webhook", { method: "POST", body, headers });
}

const proItem = (over: Partial<Item> = {}): Item => ({ id: "item_1", status: "active", plan: { slug: "pro" }, periodEnd: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", SIGNING_SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.items = [proItem()];
  m.accountPlan = "free";
  m.updates = [];
  m.getUserBillingSubscription.mockImplementation(async () => ({ subscriptionItems: m.items }));
  m.ensureAccount.mockImplementation(async () => {
    m.accountPlan ??= "free";
  });
});

describe("signature", () => {
  it("rejects a bad signature with 400 and touches nothing", async () => {
    const res = await POST(delivery(itemEvent("subscriptionItem.active"), { secretBytes: Buffer.from("another-secret") }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(m.getUserBillingSubscription).not.toHaveBeenCalled();
    expect(m.ensureAccount).not.toHaveBeenCalled();
    expect(m.updates).toEqual([]);
  });

  it("rejects a missing signature with 400", async () => {
    const res = await POST(delivery(itemEvent("subscriptionItem.active"), { omitSignature: true }));
    expect(res.status).toBe(400);
    expect(m.updates).toEqual([]);
  });

  it.each([
    ["a trailing newline", `${SIGNING_SECRET}\n`],
    ["surrounding spaces", `  ${SIGNING_SECRET}  `],
    ["double quotes", `"${SIGNING_SECRET}"`],
    ["single quotes", `'${SIGNING_SECRET}'`],
    ["quotes and a CRLF", `"${SIGNING_SECRET}"\r\n`],
  ])("still verifies a correctly signed payload when the secret is stored with %s", async (_name, stored) => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", stored);
    const res = await POST(delivery(itemEvent("subscriptionItem.active")));
    expect(res.status).toBe(200);
    expect(m.updates).toEqual([{ plan: "pro" }]);
  });

  it("still rejects a wrong secret with 400 when the stored value is padded", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", `"${SIGNING_SECRET}"\n`);
    const res = await POST(delivery(itemEvent("subscriptionItem.active"), { secretBytes: Buffer.from("another-secret") }));
    expect(res.status).toBe(400);
    expect(m.updates).toEqual([]);
  });

  it.each([[""], ["   "], ['""'], [undefined]])("answers 500 and logs a clear reason when no signing secret is set (%j)", async (value) => {
    if (value === undefined) vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", undefined);
    else vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", value);
    const res = await POST(delivery(itemEvent("subscriptionItem.active")));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal_error");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("CLERK_WEBHOOK_SIGNING_SECRET is missing"));
    expect(m.updates).toEqual([]);
  });

  it("logs the reason for a failed check, never the secret or the payload", async () => {
    await POST(delivery(itemEvent("subscriptionItem.active"), { omitSignature: true }));
    await POST(delivery(itemEvent("subscriptionItem.active"), { secretBytes: Buffer.from("another-secret") }));
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("missing headers svix-signature");
    expect(logged).toContain("bad signature");
    expect(logged).not.toContain(SIGNING_SECRET);
    expect(logged).not.toContain(SECRET_BYTES.toString("base64"));
    expect(logged).not.toContain("user_1");
    expect(logged).not.toContain("subscriptionItem.active");
  });

  it("is a cache-less response", async () => {
    const res = await POST(delivery(itemEvent("subscriptionItem.active")));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("plan changes", () => {
  it("active Pro item: the account becomes pro, upgraded fires once, the response is { received: true }", async () => {
    const res = await POST(delivery(itemEvent("subscriptionItem.active")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(m.accountPlan).toBe("pro");
    expect(m.getUserBillingSubscription).toHaveBeenCalledWith("user_1");
    expect(m.trackUpgraded).toHaveBeenCalledTimes(1);
    expect(m.trackUpgraded).toHaveBeenCalledWith("user_1", "pro");
  });

  it("creates the account row first when the user paid before ever opening the dashboard", async () => {
    m.accountPlan = undefined;
    await POST(delivery(itemEvent("subscriptionItem.active")));
    expect(m.ensureAccount).toHaveBeenCalledWith("user_1");
    expect(m.accountPlan).toBe("pro");
    expect(m.trackUpgraded).toHaveBeenCalledTimes(1);
  });

  it("ended Pro item: the account goes back to free, with no upgraded event", async () => {
    m.accountPlan = "pro";
    m.items = [proItem({ status: "ended" })];
    const res = await POST(delivery(itemEvent("subscriptionItem.ended", { status: "ended" })));
    expect(res.status).toBe(200);
    expect(m.accountPlan).toBe("free");
    expect(m.trackUpgraded).not.toHaveBeenCalled();
  });

  it("ended event while Clerk's read still shows the item active: the event's item is not kept alive", async () => {
    m.accountPlan = "pro";
    m.items = [proItem({ status: "active" })];
    await POST(delivery(itemEvent("subscriptionItem.ended", { status: "ended", itemId: "item_1" })));
    expect(m.accountPlan).toBe("free");
  });

  it("canceled: no change, and Clerk is not even asked (Pro stays until the paid period ends)", async () => {
    m.accountPlan = "pro";
    const res = await POST(delivery(itemEvent("subscriptionItem.canceled", { status: "canceled" })));
    expect(res.status).toBe(200);
    expect(m.accountPlan).toBe("pro");
    expect(m.getUserBillingSubscription).not.toHaveBeenCalled();
    expect(m.updates).toEqual([]);
  });

  it("another plan's events are ignored with 200", async () => {
    const res = await POST(delivery(itemEvent("subscriptionItem.active", { slug: "starter" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(m.getUserBillingSubscription).not.toHaveBeenCalled();
    expect(m.accountPlan).toBe("free");
  });

  it("an organization's subscription is ignored", async () => {
    await POST(delivery(itemEvent("subscriptionItem.active", { userId: null, orgId: "org_1" })));
    expect(m.getUserBillingSubscription).not.toHaveBeenCalled();
    expect(m.accountPlan).toBe("free");
  });

  it("other event types are ignored with 200", async () => {
    for (const type of ["user.created", "subscriptionItem.pastDue", "paymentAttempt.created", "subscription.active"]) {
      const res = await POST(delivery({ ...itemEvent(type), type }));
      expect(res.status).toBe(200);
    }
    expect(m.updates).toEqual([]);
    expect(m.accountPlan).toBe("free");
  });
});

describe("duplicates and ordering", () => {
  it("the same event twice gives the same result and one upgraded", async () => {
    await POST(delivery(itemEvent("subscriptionItem.active"), { id: "msg_a" }));
    await POST(delivery(itemEvent("subscriptionItem.active"), { id: "msg_a" }));
    expect(m.accountPlan).toBe("pro");
    expect(m.trackUpgraded).toHaveBeenCalledTimes(1);
  });

  it("two copies at once still fire upgraded once", async () => {
    await Promise.all([
      POST(delivery(itemEvent("subscriptionItem.active"), { id: "msg_a" })),
      POST(delivery(itemEvent("subscriptionItem.active"), { id: "msg_a" })),
    ]);
    expect(m.accountPlan).toBe("pro");
    expect(m.trackUpgraded).toHaveBeenCalledTimes(1);
  });

  it("an old ended event arriving after a newer active one does not downgrade", async () => {
    // Newest state at Clerk: a fresh Pro item (item_2) is active; the first item (item_1) ended long ago.
    m.items = [proItem({ id: "item_1", status: "ended" }), proItem({ id: "item_2", status: "active" })];
    await POST(delivery(itemEvent("subscriptionItem.active", { itemId: "item_2" }), { id: "msg_new" }));
    expect(m.accountPlan).toBe("pro");
    await POST(delivery(itemEvent("subscriptionItem.ended", { status: "ended", itemId: "item_1" }), { id: "msg_old" }));
    expect(m.accountPlan).toBe("pro");
  });

  it("an old active event arriving after the subscription ended does not upgrade", async () => {
    m.items = [proItem({ status: "ended" })];
    await POST(delivery(itemEvent("subscriptionItem.active"), { id: "msg_late" }));
    expect(m.accountPlan).toBe("free");
    expect(m.trackUpgraded).not.toHaveBeenCalled();
  });

  it("a canceled item stays Pro until its paid period ends", async () => {
    m.items = [proItem({ status: "canceled", periodEnd: Date.now() + 86_400_000 })];
    await POST(delivery(itemEvent("subscriptionItem.active")));
    expect(m.accountPlan).toBe("pro");
    m.accountPlan = "pro";
    m.items = [proItem({ status: "canceled", periodEnd: Date.now() - 1000 })];
    await POST(delivery(itemEvent("subscriptionItem.ended", { itemId: "other" })));
    expect(m.accountPlan).toBe("free");
  });
});

describe("failures", () => {
  it("answers 500 (so Clerk retries) when Clerk's API fails, and writes nothing", async () => {
    m.getUserBillingSubscription.mockRejectedValue(new Error("clerk down"));
    const res = await POST(delivery(itemEvent("subscriptionItem.active")));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal_error");
    expect(m.updates).toEqual([]);
  });

  it("a failing analytics call does not change the outcome", async () => {
    m.trackUpgraded.mockResolvedValue(undefined);
    const res = await POST(delivery(itemEvent("subscriptionItem.active")));
    expect(res.status).toBe(200);
  });
});
