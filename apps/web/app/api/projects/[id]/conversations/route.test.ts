import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  ownedProjects: new Set<string>(),
  rpc: vi.fn(),
  createOwnerClient: vi.fn(),
  createServiceClient: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../../../lib/projects/get-owned-project", () => ({
  getOwnedProject: async (id: string) => (m.ownedProjects.has(id) ? { id } : null),
}));
vi.mock("../../../../../lib/supabase/owner", () => ({
  createOwnerClient: () => {
    m.createOwnerClient();
    return { rpc: m.rpc };
  },
}));
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: m.createServiceClient }));

import { GET } from "./route";

const call = (project = PROJECT) => GET(new Request(`http://localhost:3000/api/projects/${project}/conversations`), { params: Promise.resolve({ id: project }) });

const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  visitor_id: `visitor_${n}`,
  created_at: `2026-11-02T1${n}:00:00Z`,
  message_count: n,
  first_message_preview: `Question ${n}`,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ownedProjects = new Set([PROJECT]);
  m.auth.mockResolvedValue({ userId: "user_1" });
  m.rpc.mockResolvedValue({ data: [row(3), row(2), row(1)], error: null });
});

describe("GET /api/projects/:id/conversations", () => {
  it("returns the project's conversations as ConversationSummary values", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversations: [
        { id: row(3).id, visitorId: "visitor_3", createdAt: row(3).created_at, messageCount: 3, firstMessagePreview: "Question 3" },
        { id: row(2).id, visitorId: "visitor_2", createdAt: row(2).created_at, messageCount: 2, firstMessagePreview: "Question 2" },
        { id: row(1).id, visitorId: "visitor_1", createdAt: row(1).created_at, messageCount: 1, firstMessagePreview: "Question 1" },
      ],
    });
  });

  it("keeps the order owner_activity returns (newest first) and never re-sorts it", async () => {
    // Deliberately not sorted by date: whatever the database says, in that order.
    m.rpc.mockResolvedValueOnce({ data: [row(1), row(3), row(2)], error: null });
    const ids = (await (await call()).json()).conversations.map((c: { visitorId: string }) => c.visitorId);
    expect(ids).toEqual(["visitor_1", "visitor_3", "visitor_2"]);
  });

  it("calls owner_activity for this project through the owner client, and never creates a service client", async () => {
    await call();
    expect(m.createOwnerClient).toHaveBeenCalledTimes(1);
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.rpc).toHaveBeenCalledWith("owner_activity", { p_project_id: PROJECT });
  });

  it("passes a null preview and a zero count through", async () => {
    m.rpc.mockResolvedValueOnce({ data: [row(4, { message_count: 0, first_message_preview: null })], error: null });
    const [conversation] = (await (await call()).json()).conversations;
    expect(conversation).toMatchObject({ messageCount: 0, firstMessagePreview: null });
  });

  it("returns an empty list for a project with no conversations (and for a null result)", async () => {
    m.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await (await call()).json()).toEqual({ conversations: [] });
    m.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await (await call()).json()).toEqual({ conversations: [] });
  });

  it("is 404 not_found for another owner's project, and never asks the database for its conversations", async () => {
    const res = await call(OTHER);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: expect.any(String) } });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("is 400 invalid_input for an ID that isn't a UUID", async () => {
    const res = await call("not-a-uuid");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("is 401 when signed out", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    const res = await call();
    expect(res.status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("is 500 on a database error, without leaking it", async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: "secret detail" } });
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });

  it("returns only ConversationSummary fields, even if the row has more", async () => {
    m.rpc.mockResolvedValueOnce({ data: [row(1, { project_id: "secret", owner_id: "user_x" })], error: null });
    const [conversation] = (await (await call()).json()).conversations;
    expect(Object.keys(conversation).sort()).toEqual(["createdAt", "firstMessagePreview", "id", "messageCount", "visitorId"]);
  });

  it("sends no CORS header and caches nothing", async () => {
    const res = await call();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
