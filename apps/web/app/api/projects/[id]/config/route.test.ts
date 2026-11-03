import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";

vi.mock("server-only", () => ({}));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => {
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ upsert }));
  return {
    single, select, upsert, from,
    auth: vi.fn(),
    getAccount: vi.fn(),
    ownedProjects: new Set<string>(),
    createServiceClient: vi.fn(() => ({ from })),
  };
});
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../../../lib/accounts/get-account", () => ({ getAccount: m.getAccount }));
vi.mock("../../../../../lib/projects/get-owned-project", () => ({
  getOwnedProject: async (id: string) => (m.ownedProjects.has(id) ? { id } : null),
}));
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: m.createServiceClient }));

import { PATCH } from "./route";

const call = (body: unknown, project = PROJECT, raw = false) =>
  PATCH(new Request(`http://localhost:3000/api/projects/${project}/config`, { method: "PATCH", body: raw ? (body as string) : JSON.stringify(body) }), {
    params: Promise.resolve({ id: project }),
  });

const saved = { button_color: "#ff0000", position: "bottom-right", label: "Ask us", animation: "fade", header_text: "Chat with us", show_badge: true };
const plan = (p: "free" | "pro") => m.getAccount.mockResolvedValue({ clerkUserId: "user_1", plan: p, createdAt: "x" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ownedProjects = new Set([PROJECT]);
  m.auth.mockResolvedValue({ userId: "user_1" });
  plan("pro");
  m.single.mockResolvedValue({ data: saved, error: null });
});

describe("Free: 402 plan_required, and nothing is written", () => {
  beforeEach(() => plan("free"));

  it("refuses a valid save with 402 plan_required", async () => {
    const res = await call({ buttonColor: "#ff0000" });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: { code: "plan_required", message: expect.stringContaining("Pro") } });
  });

  it("never creates the service client, so nothing is written", async () => {
    await call({ buttonColor: "#ff0000", label: "Help" });
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it.each([
    [{ buttonColor: "#ff0000" }],
    [{ position: "top-left" }],
    [{ label: "Help" }],
    [{ animation: "scale" }],
    [{ headerText: "Support" }],
    [{ showBadge: false }],
    [{ showBadge: true }],
    [{ position: "bottom-right", animation: "fade" }],
  ])("refuses the save %j, even one that matches Free's own defaults", async (body) => {
    expect((await call(body)).status).toBe(402);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("takes the plan from the server, even if the body claims Pro", async () => {
    const res = await call({ buttonColor: "#ff0000", plan: "pro", isPro: true, accountPlan: "pro" });
    expect(res.status).toBe(402);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("answers 400, not 402, for a body that isn't a valid save (nothing to refuse yet)", async () => {
    expect((await call({ buttonColor: "red" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
  });
});

describe("Pro: saving", () => {
  it("saves a partial update: only the sent field is written, and the response is the saved config", async () => {
    const res = await call({ buttonColor: "#ff0000" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      config: { buttonColor: "#ff0000", position: "bottom-right", label: "Ask us", animation: "fade", headerText: "Chat with us", showBadge: true },
    });
    expect(m.upsert).toHaveBeenCalledTimes(1);
    expect(m.upsert).toHaveBeenCalledWith({ project_id: PROJECT, button_color: "#ff0000" }, { onConflict: "project_id" });
  });

  it("saves all six fields at once", async () => {
    m.single.mockResolvedValueOnce({ data: { button_color: "#112233", position: "top-left", label: "Help", animation: "scale", header_text: "Support", show_badge: false }, error: null });
    const res = await call({ buttonColor: "#112233", position: "top-left", label: "Help", animation: "scale", headerText: "Support", showBadge: false });
    expect(res.status).toBe(200);
    expect(m.upsert).toHaveBeenCalledWith(
      { project_id: PROJECT, button_color: "#112233", position: "top-left", label: "Help", animation: "scale", header_text: "Support", show_badge: false },
      { onConflict: "project_id" },
    );
    expect((await res.json()).config).toEqual({ buttonColor: "#112233", position: "top-left", label: "Help", animation: "scale", headerText: "Support", showBadge: false });
  });

  it("writes false for showBadge (hiding the badge) and doesn't mistake it for 'not sent'", async () => {
    await call({ showBadge: false });
    expect(m.upsert).toHaveBeenCalledWith({ project_id: PROJECT, show_badge: false }, { onConflict: "project_id" });
  });

  it("ignores fields it doesn't know, such as project_id, plan or an owner", async () => {
    await call({ label: "Help", project_id: OTHER, plan: "free", owner_id: "user_x", messages_used: 0 });
    expect(m.upsert).toHaveBeenCalledWith({ project_id: PROJECT, label: "Help" }, { onConflict: "project_id" });
  });

  it("writes to the project in the URL, which the route has checked, never one named in the body", async () => {
    await call({ label: "Help", projectId: OTHER });
    expect((m.upsert.mock.calls[0] as unknown as [{ project_id: string }])[0].project_id).toBe(PROJECT);
  });

  it("answers with the plan-applied config: what visitors see", async () => {
    m.single.mockResolvedValueOnce({ data: { ...saved, button_color: "#00ff00", show_badge: false }, error: null });
    const { config } = await (await call({ buttonColor: "#00ff00" })).json();
    expect(config).toMatchObject({ buttonColor: "#00ff00", showBadge: false });
    expect(Object.keys(config).sort()).toEqual(Object.keys(DEFAULT_WIDGET_CONFIG).sort());
  });
});

describe("validation", () => {
  it.each([
    ["a color that isn't hex", { buttonColor: "red" }],
    ["a short hex", { buttonColor: "#fff" }],
    ["a position that doesn't exist", { position: "middle" }],
    ["an animation that doesn't exist", { animation: "spin" }],
    ["an empty label", { label: "" }],
    ["a blank label", { label: "   " }],
    ["a label over 40 characters", { label: "x".repeat(41) }],
    ["a header over 60 characters", { headerText: "x".repeat(61) }],
    ["a showBadge that isn't a boolean", { showBadge: "no" }],
    ["an empty body", {}],
    ["fields that are present but undefined", { label: undefined }],
  ])("is 400 invalid_input for %s, and writes nothing", async (_label, body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.createServiceClient).not.toHaveBeenCalled();
  });

  it.each([["no body", ""], ["not JSON", "{nope"]])("is 400 for %s", async (_label, body) => {
    expect((await call(body, PROJECT, true)).status).toBe(400);
  });

  it("is 400 for a project ID that isn't a UUID", async () => {
    expect((await call({ label: "x" }, "nope")).status).toBe(400);
  });

  it("accepts a color in either case, and the longest allowed label and header", async () => {
    expect((await call({ buttonColor: "#AbCdEf" })).status).toBe(200);
    expect((await call({ label: "x".repeat(40), headerText: "y".repeat(60) })).status).toBe(200);
  });
});

describe("access", () => {
  it("is 404 for another owner's project, and reads no plan and writes nothing", async () => {
    const res = await call({ buttonColor: "#ff0000" }, OTHER);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: expect.any(String) } });
    expect(m.getAccount).not.toHaveBeenCalled();
    expect(m.createServiceClient).not.toHaveBeenCalled();
  });

  it("is 404 before 402: another owner's project is never reported as a plan problem", async () => {
    plan("free");
    expect((await call({ buttonColor: "#ff0000" }, OTHER)).status).toBe(404);
  });

  it("is 401 when signed out, and touches nothing", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    expect((await call({ label: "x" })).status).toBe(401);
    expect(m.getAccount).not.toHaveBeenCalled();
    expect(m.createServiceClient).not.toHaveBeenCalled();
  });

  it("is 500, without leaking it, on a database error while saving", async () => {
    m.single.mockResolvedValueOnce({ data: null, error: { message: "secret detail" } });
    const res = await call({ label: "x" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });

  it("is 500 when the owner has no account row", async () => {
    m.getAccount.mockResolvedValueOnce(null);
    expect((await call({ label: "x" })).status).toBe(500);
    expect(m.createServiceClient).not.toHaveBeenCalled();
  });

  it("sends no CORS header and caches nothing", async () => {
    const res = await call({ label: "x" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
