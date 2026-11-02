import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_LIMITS } from "@askwell/shared";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => {
  const order = vi.fn();
  const ownerSelect = vi.fn(() => ({ order }));
  const ownerFrom = vi.fn(() => ({ select: ownerSelect }));
  const rpc = vi.fn();
  return {
    auth: vi.fn(),
    ensureAccount: vi.fn(),
    getAccount: vi.fn(),
    order,
    ownerSelect,
    ownerFrom,
    rpc,
    createOwnerClient: vi.fn(() => ({ from: ownerFrom })),
    createServiceClient: vi.fn(() => ({ rpc })),
  };
});
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../lib/accounts/ensure-account", () => ({ ensureAccount: m.ensureAccount }));
vi.mock("../../../lib/accounts/get-account", () => ({ getAccount: m.getAccount }));
vi.mock("../../../lib/supabase/owner", () => ({ createOwnerClient: m.createOwnerClient }));
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: m.createServiceClient }));

import { GET, POST } from "./route";

const row = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "user_1",
  name: "Docs bot",
  public_key: "pk_abc",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00Z",
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

const post = (body: unknown, raw = false) =>
  POST(new Request("http://localhost:3000/api/projects", { method: "POST", body: raw ? (body as string) : JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.auth.mockResolvedValue({ userId: "user_1" });
  m.ensureAccount.mockResolvedValue(undefined);
  m.getAccount.mockResolvedValue({ clerkUserId: "user_1", plan: "free", createdAt: "x" });
});

describe("GET /api/projects", () => {
  it("lists the owner's projects with the plan from getAccount", async () => {
    m.order.mockResolvedValueOnce({ data: [row()], error: null });
    m.getAccount.mockResolvedValueOnce({ clerkUserId: "user_1", plan: "pro", createdAt: "x" });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("pro");
    expect(body.projects).toEqual([
      { id: row().id, name: "Docs bot", publicKey: "pk_abc", messagesUsed: 0, periodStart: row().period_start, createdAt: row().created_at },
    ]);
    expect(JSON.stringify(body)).not.toContain("owner_id");
  });

  it("reads through the owner client with no owner filter, and never the service client", async () => {
    m.order.mockResolvedValueOnce({ data: [], error: null });
    await GET();
    expect(m.createOwnerClient).toHaveBeenCalled();
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.ownerFrom).toHaveBeenCalledWith("projects");
  });

  it("returns an empty list on Free for an owner with no account row yet, without writing", async () => {
    m.getAccount.mockResolvedValueOnce(null);
    m.order.mockResolvedValueOnce({ data: [], error: null });
    const res = await GET();
    expect(await res.json()).toEqual({ projects: [], plan: "free" });
    expect(m.ensureAccount).not.toHaveBeenCalled();
  });

  it("is 401 when signed out", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
    expect(m.createOwnerClient).not.toHaveBeenCalled();
  });

  it("is 500 on a database error, without leaking it", async () => {
    m.order.mockResolvedValueOnce({ data: null, error: { message: "secret detail" } });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });

  it("sends no CORS header and is not cacheable", async () => {
    m.order.mockResolvedValueOnce({ data: [], error: null });
    const res = await GET();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("POST /api/projects", () => {
  it("creates a project: 201 with the summary, the owner from the session, and the Free limit", async () => {
    m.rpc.mockResolvedValueOnce({ data: row(), error: null });
    const res = await post({ name: "Docs bot" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      project: { id: row().id, name: "Docs bot", publicKey: "pk_abc", messagesUsed: 0, periodStart: row().period_start, createdAt: row().created_at },
    });
    expect(m.ensureAccount).toHaveBeenCalledWith("user_1");
    expect(m.rpc).toHaveBeenCalledWith("create_project", {
      p_owner_id: "user_1",
      p_name: "Docs bot",
      p_public_key: expect.stringMatching(/^pk_[0-9a-f]{48}$/),
      p_max_projects: PLAN_LIMITS.free.projects,
    });
  });

  it("passes the Pro limit for a Pro account", async () => {
    m.getAccount.mockResolvedValueOnce({ clerkUserId: "user_1", plan: "pro", createdAt: "x" });
    m.rpc.mockResolvedValueOnce({ data: row(), error: null });
    await post({ name: "Docs bot" });
    expect(m.rpc.mock.calls[0]?.[1]).toMatchObject({ p_max_projects: PLAN_LIMITS.pro.projects });
  });

  it("takes the plan and the owner from the server, never from the request", async () => {
    m.rpc.mockResolvedValueOnce({ data: row(), error: null });
    await post({ name: "Docs bot", plan: "pro", ownerId: "someone_else", maxProjects: 999, publicKey: "pk_mine" });
    const args = m.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args.p_max_projects).toBe(PLAN_LIMITS.free.projects);
    expect(args.p_owner_id).toBe("user_1");
    expect(args.p_public_key).not.toBe("pk_mine");
    expect(m.getAccount).toHaveBeenCalledTimes(1);
  });

  it("maps AW001 to 402 limit_reached", async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: "AW001", message: "project_limit_reached" } });
    const res = await post({ name: "Second" });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: { code: "limit_reached", message: expect.stringContaining("1 project") } });
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });

  it("retries with a new key on a duplicate key, then succeeds", async () => {
    m.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate" } })
      .mockResolvedValueOnce({ data: row(), error: null });
    const res = await post({ name: "Docs bot" });
    expect(res.status).toBe(201);
    expect(m.rpc).toHaveBeenCalledTimes(2);
    expect(m.rpc.mock.calls[0]?.[1].p_public_key).not.toBe(m.rpc.mock.calls[1]?.[1].p_public_key);
  });

  it("gives up with 500 after repeated duplicate keys", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    const res = await post({ name: "Docs bot" });
    expect(res.status).toBe(500);
    expect(m.rpc).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["no body", ""],
    ["not JSON", "{nope"],
    ["empty name", JSON.stringify({ name: "" })],
    ["blank name", JSON.stringify({ name: "   " })],
    ["name too long", JSON.stringify({ name: "a".repeat(101) })],
    ["name not a string", JSON.stringify({ name: 5 })],
    ["missing name", JSON.stringify({})],
  ])("is 400 invalid_input for %s, and touches nothing", async (_label, body) => {
    const res = await post(body, true);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "invalid_input", message: expect.any(String) } });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.ensureAccount).not.toHaveBeenCalled();
  });

  it("is 401 when signed out", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    const res = await post({ name: "x" });
    expect(res.status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.ensureAccount).not.toHaveBeenCalled();
  });

  it("is 500 on any other database error, without leaking it", async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "secret detail" } });
    const res = await post({ name: "x" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });

  it("uses the service client only for the create, and the owner client only for the plan", async () => {
    m.rpc.mockResolvedValueOnce({ data: row(), error: null });
    await post({ name: "x" });
    expect(m.createServiceClient).toHaveBeenCalled();
    expect(m.createOwnerClient).not.toHaveBeenCalled();
  });
});
