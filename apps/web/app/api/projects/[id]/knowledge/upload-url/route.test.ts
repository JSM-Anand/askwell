import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_KNOWLEDGE_FILE_BYTES, PLAN_LIMITS } from "@askwell/shared";
import { createFakeSupabase } from "../fake-supabase";
import type { FakeSupabase } from "../fake-supabase";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  fake: undefined as unknown as FakeSupabase,
  ownedProjects: new Set<string>(),
  auth: vi.fn(),
  getAccount: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../../../../lib/accounts/get-account", () => ({ getAccount: m.getAccount }));
vi.mock("../../../../../../lib/projects/get-owned-project", () => ({
  getOwnedProject: async (id: string) => (m.ownedProjects.has(id) ? { id } : null),
}));
vi.mock("../../../../../../lib/supabase/service", () => ({ createServiceClient: () => m.fake.client }));

import { POST } from "./route";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const call = (body: unknown, project = PROJECT, raw = false) =>
  POST(
    new Request(`http://localhost:3000/api/projects/${project}/knowledge/upload-url`, { method: "POST", body: raw ? (body as string) : JSON.stringify(body) }),
    { params: Promise.resolve({ id: project }) },
  );
const valid = { title: "Guide", fileType: "pdf", size: 2048 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.fake = createFakeSupabase([PROJECT, OTHER]);
  m.ownedProjects = new Set([PROJECT]);
  m.auth.mockResolvedValue({ userId: "user_1" });
  m.getAccount.mockResolvedValue({ clerkUserId: "user_1", plan: "free", createdAt: "x" });
});

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  it("reserves an `uploading` source and returns a signed upload URL for its storage key (201)", async () => {
    const res = await call(valid);
    expect(res.status).toBe(201);
    const { source, uploadUrl } = await res.json();
    expect(source).toMatchObject({ title: "Guide", type: "pdf", status: "uploading" });
    expect(uploadUrl).toBe(`https://storage.example/upload/${PROJECT}/${source.id}.pdf?token=one-time`);
    expect(m.fake.state.buckets).toContain("knowledge");
    expect(m.fake.state.rpcCalls[0]).toMatchObject({ p_project_id: PROJECT, p_type: "pdf", p_max_sources: PLAN_LIMITS.free.knowledgeSources });
  });

  it.each(["pdf", "md", "txt"])("accepts %s, up to exactly 10 MB", async (fileType) => {
    const res = await call({ title: "Doc", fileType, size: MAX_KNOWLEDGE_FILE_BYTES });
    expect(res.status).toBe(201);
    expect((await res.json()).source.type).toBe(fileType);
  });

  it.each([
    ["an unsupported type", { ...valid, fileType: "exe" }],
    ["a type that is text (not a file)", { ...valid, fileType: "text" }],
    ["a file over 10 MB", { ...valid, size: MAX_KNOWLEDGE_FILE_BYTES + 1 }],
    ["a zero size", { ...valid, size: 0 }],
    ["a fractional size", { ...valid, size: 1.5 }],
    ["no title", { fileType: "pdf", size: 10 }],
    ["an empty title", { ...valid, title: "" }],
  ])("is 400 invalid_input for %s, and reserves nothing", async (_label, body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(m.fake.state.rpcCalls).toHaveLength(0);
  });

  it("is 400 for a body that isn't JSON", async () => {
    expect((await call("{nope", PROJECT, true)).status).toBe(400);
  });

  it("is 402 limit_reached at the limit, with no signed URL", async () => {
    for (let i = 0; i < 3; i++) m.fake.addSource({ project_id: PROJECT, status: "ready" });
    const res = await call(valid);
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("limit_reached");
    expect(m.fake.state.buckets).toHaveLength(0);
  });

  it("takes the plan and the limit from the server, never from the request", async () => {
    await call({ ...valid, plan: "pro", maxSources: 99 });
    expect(m.fake.state.rpcCalls[0]?.p_max_sources).toBe(3);
  });

  it("is 404 for another owner's project, and reserves nothing", async () => {
    const res = await call(valid, OTHER);
    expect(res.status).toBe(404);
    expect(m.fake.state.rpcCalls).toHaveLength(0);
  });

  it("is 401 when signed out", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    expect((await call(valid)).status).toBe(401);
  });

  it("gives the slot back and answers 500 when no URL can be signed", async () => {
    m.fake.state.fail.sign = { message: "storage down" };
    const res = await call(valid);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("storage down");
    expect(m.fake.state.sources).toHaveLength(0);
  });
});

describe("removing stale uploads before reserving", () => {
  it("removes the files of this project's `uploading` sources older than 2 hours, and only those", async () => {
    const stale = m.fake.addSource({ project_id: PROJECT, status: "uploading", created_at: ago(3 * HOUR) }, "old file");
    const fresh = m.fake.addSource({ project_id: PROJECT, status: "uploading", created_at: ago(30 * 60 * 1000) }, "fresh file");
    const oldReady = m.fake.addSource({ project_id: PROJECT, status: "ready", created_at: ago(5 * HOUR) }, "kept file");
    const otherProject = m.fake.addSource({ project_id: OTHER, status: "uploading", created_at: ago(5 * HOUR) }, "other file");

    expect((await call(valid)).status).toBe(201);

    expect(m.fake.state.files.has(stale.storage_key!)).toBe(false);
    expect(m.fake.state.files.has(fresh.storage_key!)).toBe(true);
    expect(m.fake.state.files.has(oldReady.storage_key!)).toBe(true);
    expect(m.fake.state.files.has(otherProject.storage_key!)).toBe(true);
    // The stale row itself was reclaimed by the reserve function.
    expect(m.fake.state.sources.find((s) => s.id === stale.id)).toBeUndefined();
  });

  it("cleans up before reserving, so a full project with only dead reservations can still reserve", async () => {
    for (let i = 0; i < 3; i++) m.fake.addSource({ project_id: PROJECT, status: "uploading", created_at: ago(3 * HOUR) }, "x");
    expect((await call(valid)).status).toBe(201);
  });

  it("still reserves when the cleanup itself fails (best effort)", async () => {
    m.fake.addSource({ project_id: PROJECT, status: "uploading", created_at: ago(3 * HOUR) }, "old");
    m.fake.state.fail.remove = { message: "storage down" };
    expect((await call(valid)).status).toBe(201);
  });

  it("still reserves when listing the stale uploads fails", async () => {
    m.fake.state.fail.select = { message: "db hiccup" };
    expect((await call(valid)).status).toBe(201);
  });
});
