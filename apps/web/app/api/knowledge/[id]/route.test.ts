import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../../projects/[id]/knowledge/fake-supabase";
import type { FakeSupabase } from "../../projects/[id]/knowledge/fake-supabase";

vi.mock("server-only", () => ({}));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  fake: undefined as unknown as FakeSupabase,
  visibleToOwner: new Set<string>(),
  auth: vi.fn(),
  createServiceClient: vi.fn(),
  createOwnerClient: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../../lib/supabase/service", () => ({
  createServiceClient: () => {
    m.createServiceClient();
    return m.fake.client;
  },
}));
// The owner client sees only what RLS would show: the sources of the owner's own projects.
vi.mock("../../../../lib/supabase/owner", () => ({
  createOwnerClient: () => {
    m.createOwnerClient();
    return {
      from: () => ({
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => ({
              data: m.visibleToOwner.has(id) ? m.fake.state.sources.find((s) => s.id === id) ?? null : null,
              error: null,
            }),
          }),
        }),
      }),
    };
  },
}));

import { DELETE } from "./route";

const del = (id: string) =>
  DELETE(new Request(`http://localhost:3000/api/knowledge/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.fake = createFakeSupabase([PROJECT, OTHER]);
  m.visibleToOwner = new Set();
  m.auth.mockResolvedValue({ userId: "user_1" });
});

describe("DELETE /api/knowledge/:id", () => {
  it("deletes the source's file, then its row, and returns ok", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "pdf", status: "ready" }, "file");
    m.visibleToOwner.add(source.id);
    const res = await del(source.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(m.fake.state.files.has(source.storage_key!)).toBe(false);
    expect(m.fake.state.sources).toHaveLength(0);
    // The file goes first, so a failed file delete leaves the row to retry.
    expect(m.fake.state.log).toEqual([`remove ${source.storage_key}`, "delete source"]);
  });

  it("deletes a pasted-text source (no file) without touching Storage", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "text", status: "ready" });
    m.visibleToOwner.add(source.id);
    expect((await del(source.id)).status).toBe(200);
    expect(m.fake.state.buckets).toHaveLength(0);
    expect(m.fake.state.sources).toHaveLength(0);
  });

  it("deletes only the one source, leaving the project's others", async () => {
    const a = m.fake.addSource({ project_id: PROJECT, type: "txt", status: "ready" }, "a");
    const b = m.fake.addSource({ project_id: PROJECT, type: "txt", status: "ready" }, "b");
    m.visibleToOwner.add(a.id);
    await del(a.id);
    expect(m.fake.state.sources.map((s) => s.id)).toEqual([b.id]);
    expect(m.fake.state.files.has(b.storage_key!)).toBe(true);
  });

  it("is 404 for another owner's source, and never reaches the service client", async () => {
    const source = m.fake.addSource({ project_id: OTHER, type: "pdf", status: "ready" }, "file");
    const res = await del(source.id);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: expect.any(String) } });
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.fake.state.files.has(source.storage_key!)).toBe(true);
    expect(m.fake.state.sources).toHaveLength(1);
  });

  it("is 404 for a source that doesn't exist", async () => {
    expect((await del("33333333-3333-4333-8333-333333333333")).status).toBe(404);
  });

  it("checks ownership through the owner client before the service client is used", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt", status: "ready" }, "x");
    m.visibleToOwner.add(source.id);
    await del(source.id);
    expect(m.createOwnerClient).toHaveBeenCalledTimes(1);
    expect(m.createOwnerClient.mock.invocationCallOrder[0]).toBeLessThan(m.createServiceClient.mock.invocationCallOrder[0]!);
  });

  it("is 500 and keeps the row when the file can't be deleted, so the delete can be retried", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "pdf", status: "ready" }, "file");
    m.visibleToOwner.add(source.id);
    m.fake.state.fail.remove = { message: "storage down" };
    const res = await del(source.id);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("storage down");
    expect(m.fake.state.sources).toHaveLength(1);
  });

  it("is 400 for an ID that isn't a UUID, before any client is created", async () => {
    expect((await del("not-a-uuid")).status).toBe(400);
    expect(m.createOwnerClient).not.toHaveBeenCalled();
  });

  it("is 401 when signed out", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    expect((await del("33333333-3333-4333-8333-333333333333")).status).toBe(401);
    expect(m.createOwnerClient).not.toHaveBeenCalled();
  });

  it("sends no CORS header and caches nothing", async () => {
    const res = await del("33333333-3333-4333-8333-333333333333");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
