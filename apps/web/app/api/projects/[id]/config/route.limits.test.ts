import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PROJECT = "11111111-1111-4111-8111-111111111111";

// A plan that can customize, but not everything: the route must check each value against what the plan allows.
// (Pro allows everything today, so this is the only way to exercise that path.)
vi.mock("@askwell/shared", async (importOriginal) => {
  const shared = await importOriginal<typeof import("@askwell/shared")>();
  return {
    ...shared,
    PLAN_LIMITS: {
      ...shared.PLAN_LIMITS,
      pro: {
        ...shared.PLAN_LIMITS.pro,
        customize: {
          buttonColor: true,
          positions: ["bottom-right", "bottom-left"],
          label: false,
          animations: ["fade", "slide"],
          headerText: true,
          hideBadge: false,
        },
      },
    },
  };
});

const m = vi.hoisted(() => {
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select }));
  return { single, upsert, auth: vi.fn(), getAccount: vi.fn(), createServiceClient: vi.fn(() => ({ from: () => ({ upsert }) })) };
});
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../../../lib/accounts/get-account", () => ({ getAccount: m.getAccount }));
vi.mock("../../../../../lib/projects/get-owned-project", () => ({ getOwnedProject: async (id: string) => ({ id }) }));
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: m.createServiceClient }));

import { PATCH } from "./route";

const call = (body: unknown) =>
  PATCH(new Request(`http://localhost:3000/api/projects/${PROJECT}/config`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: PROJECT }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.auth.mockResolvedValue({ userId: "user_1" });
  m.getAccount.mockResolvedValue({ clerkUserId: "user_1", plan: "pro", createdAt: "x" });
  m.single.mockResolvedValue({
    data: { button_color: "#ff0000", position: "bottom-right", label: "Ask us", animation: "fade", header_text: "Chat with us", show_badge: true },
    error: null,
  });
});

describe("a plan that can customize, but not every value", () => {
  it("saves what the plan allows", async () => {
    const res = await call({ buttonColor: "#ff0000", position: "bottom-left", animation: "slide", headerText: "Support" });
    expect(res.status).toBe(200);
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ position: "top-left" }, "position"],
    [{ animation: "scale" }, "animation"],
    [{ label: "Help" }, "label"],
    [{ showBadge: false }, "showBadge"],
  ])("refuses %j with 402 plan_required naming %s, and writes nothing", async (body, field) => {
    const res = await call(body);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: { code: "plan_required", message: expect.stringContaining(field) } });
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("names every field it refuses, and writes none of the save, even the allowed part", async () => {
    const res = await call({ buttonColor: "#ff0000", position: "top-right", label: "Help" });
    expect(res.status).toBe(402);
    const message: string = (await res.json()).error.message;
    expect(message).toContain("position");
    expect(message).toContain("label");
    expect(message).not.toContain("buttonColor");
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("allows showing the badge, which is never a plan feature", async () => {
    expect((await call({ showBadge: true })).status).toBe(200);
  });
});
