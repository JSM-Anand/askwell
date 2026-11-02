import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_LIMITS } from "@askwell/shared";
import { createFakeSupabase } from "./fake-supabase";
import type { FakeSupabase } from "./fake-supabase";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  fake: undefined as unknown as FakeSupabase,
  ownedProjects: new Set<string>(),
  auth: vi.fn(),
  getAccount: vi.fn(),
  processSource: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../../../lib/accounts/get-account", () => ({ getAccount: m.getAccount }));
vi.mock("../../../../../lib/projects/get-owned-project", () => ({
  getOwnedProject: async (id: string) => (m.ownedProjects.has(id) ? { id } : null),
}));
vi.mock("../../../../../lib/knowledge/process-source", () => ({ processSource: m.processSource }));
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: () => m.fake.client }));

import { POST, maxDuration } from "./route";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const call = (body: unknown, project = PROJECT, raw = false) =>
  POST(
    new Request(`http://localhost:3000/api/projects/${project}/knowledge`, { method: "POST", body: raw ? (body as string) : JSON.stringify(body) }),
    { params: Promise.resolve({ id: project }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.fake = createFakeSupabase([PROJECT, OTHER]);
  m.ownedProjects = new Set([PROJECT]);
  m.auth.mockResolvedValue({ userId: "user_1" });
  m.getAccount.mockResolvedValue({ clerkUserId: "user_1", plan: "free", createdAt: "x" });
  m.processSource.mockResolvedValue({ chunks: 2 });
});

describe("POST /api/projects/:id/knowledge (paste)", () => {
  it("reserves a text source, processes it and returns it ready (201)", async () => {
    const res = await call({ title: "FAQ", content: "Open nine to five." });
    expect(res.status).toBe(201);
    const { source } = await res.json();
    expect(source).toMatchObject({ title: "FAQ", type: "text", status: "ready" });
    expect(m.processSource).toHaveBeenCalledWith({ sourceId: source.id, projectId: PROJECT, text: "Open nine to five." });
    expect(m.fake.state.rpcCalls[0]).toMatchObject({ p_project_id: PROJECT, p_title: "FAQ", p_type: "text" });
  });

  it("uses the Free limit from the server, and the Pro limit for a Pro account", async () => {
    await call({ title: "A", content: "x" });
    expect(m.fake.state.rpcCalls[0]?.p_max_sources).toBe(PLAN_LIMITS.free.knowledgeSources);
    m.getAccount.mockResolvedValue({ clerkUserId: "user_1", plan: "pro", createdAt: "x" });
    await call({ title: "B", content: "x" });
    expect(m.fake.state.rpcCalls[1]?.p_max_sources).toBe(PLAN_LIMITS.pro.knowledgeSources);
  });

  it("takes the plan and limit from the server, never from the request", async () => {
    await call({ title: "A", content: "x", plan: "pro", maxSources: 999, p_max_sources: 999, projectId: OTHER });
    expect(m.fake.state.rpcCalls[0]).toMatchObject({ p_max_sources: 3, p_project_id: PROJECT });
  });

  it("is 402 limit_reached at the limit, and processes nothing", async () => {
    for (let i = 0; i < 3; i++) m.fake.addSource({ project_id: PROJECT, type: "text", status: "ready" });
    const res = await call({ title: "Fourth", content: "x" });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: { code: "limit_reached", message: expect.stringContaining("3 knowledge sources") } });
    expect(m.processSource).not.toHaveBeenCalled();
    expect(m.fake.state.sources).toHaveLength(3);
  });

  it("returns the source as failed when processing fails, so the owner can see it and delete it", async () => {
    m.processSource.mockRejectedValueOnce(new Error("embedding service down"));
    const res = await call({ title: "FAQ", content: "x" });
    expect(res.status).toBe(201);
    expect((await res.json()).source.status).toBe("failed");
  });

  it("is 404 for another owner's project, and reserves nothing", async () => {
    const res = await call({ title: "FAQ", content: "x" }, OTHER);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(m.fake.state.rpcCalls).toHaveLength(0);
    expect(m.processSource).not.toHaveBeenCalled();
  });

  it.each([
    ["no body", "", true],
    ["not JSON", "{nope", true],
    ["no title", { content: "x" }, false],
    ["empty title", { title: "", content: "x" }, false],
    ["empty content", { title: "A", content: "  " }, false],
    ["title too long", { title: "a".repeat(201), content: "x" }, false],
  ])("is 400 invalid_input for %s, and reserves nothing", async (_label, body, raw) => {
    const res = await call(body, PROJECT, raw);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(m.fake.state.rpcCalls).toHaveLength(0);
  });

  it("is 400 for a project ID that isn't a UUID", async () => {
    expect((await call({ title: "A", content: "x" }, "nope")).status).toBe(400);
  });

  it("is 401 when signed out", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    expect((await call({ title: "A", content: "x" })).status).toBe(401);
    expect(m.fake.state.rpcCalls).toHaveLength(0);
  });

  it("is 500 on an unexpected database error, without leaking it", async () => {
    m.fake.client.rpc = async () => ({ data: null, error: { code: "XX000", message: "secret detail" } });
    const res = await call({ title: "A", content: "x" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });

  it("sends no CORS header and caches nothing", async () => {
    const res = await call({ title: "A", content: "x" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("allows 300 s, the most a Hobby plan gives", () => {
    expect(maxDuration).toBe(300);
  });
});
