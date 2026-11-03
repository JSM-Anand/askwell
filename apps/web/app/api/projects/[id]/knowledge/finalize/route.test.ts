import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { createFakeSupabase } from "../fake-supabase";
import type { FakeSupabase } from "../fake-supabase";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  fake: undefined as unknown as FakeSupabase,
  ownedProjects: new Set<string>(),
  auth: vi.fn(),
  getAccount: vi.fn(),
  processSource: vi.fn(),
  markSourceFailed: vi.fn(),
  trackKnowledgeAdded: vi.fn(),
}));
vi.mock("../../../../../../lib/analytics/events", () => ({ trackKnowledgeAdded: m.trackKnowledgeAdded }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../../../../lib/accounts/get-account", () => ({ getAccount: m.getAccount }));
vi.mock("../../../../../../lib/projects/get-owned-project", () => ({
  getOwnedProject: async (id: string) => (m.ownedProjects.has(id) ? { id } : null),
}));
vi.mock("../../../../../../lib/knowledge/process-source", () => ({
  processSource: m.processSource,
  markSourceFailed: m.markSourceFailed,
}));
vi.mock("../../../../../../lib/supabase/service", () => ({ createServiceClient: () => m.fake.client }));

import { POST, maxDuration } from "./route";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const call = (body: unknown, project = PROJECT, raw = false) =>
  POST(
    new Request(`http://localhost:3000/api/projects/${project}/knowledge/finalize`, { method: "POST", body: raw ? (body as string) : JSON.stringify(body) }),
    { params: Promise.resolve({ id: project }) },
  );
const finalize = (sourceId: string, project = PROJECT) => call({ sourceId }, project);
const statusOf = (id: string) => m.fake.state.sources.find((s) => s.id === id)?.status;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.fake = createFakeSupabase([PROJECT, OTHER]);
  m.ownedProjects = new Set([PROJECT]);
  m.auth.mockResolvedValue({ userId: "user_1" });
  m.getAccount.mockResolvedValue({ clerkUserId: "user_1", plan: "free", createdAt: "x" });
  m.processSource.mockResolvedValue({ chunks: 1 });
  m.markSourceFailed.mockImplementation(async ({ sourceId }: { sourceId: string }) => {
    const row = m.fake.state.sources.find((s) => s.id === sourceId);
    if (row) row.status = "failed";
  });
});

describe("POST finalize: the ready path", () => {
  it("claims the source, reads the file, processes it and returns it ready (200)", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt", title: "Notes" }, "Opening hours are nine to five.");
    let statusWhenProcessing: string | undefined;
    m.processSource.mockImplementationOnce(async () => {
      statusWhenProcessing = statusOf(source.id);
      return { chunks: 1 };
    });

    const res = await finalize(source.id);
    expect(res.status).toBe(200);
    expect((await res.json()).source).toMatchObject({ id: source.id, title: "Notes", type: "txt", status: "ready" });
    expect(statusWhenProcessing).toBe("processing");
    expect(m.processSource).toHaveBeenCalledWith({ sourceId: source.id, projectId: PROJECT, text: "Opening hours are nine to five." });
    expect(m.fake.state.buckets).toContain("knowledge");
  });

  it("keeps the file in Storage once processed (it goes when the source is deleted)", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "md" }, "# Title");
    await finalize(source.id);
    expect(m.fake.state.files.has(source.storage_key!)).toBe(true);
  });

  it("accepts a file exactly at the 10 MB limit", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" }, new Blob([new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES).fill(97)]));
    expect((await finalize(source.id)).status).toBe(200);
  });

  it("fires knowledge_added once with the file type when the source ends ready", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt", title: "Secret title" }, "Secret text.");
    await finalize(source.id);
    expect(m.trackKnowledgeAdded).toHaveBeenCalledTimes(1);
    expect(m.trackKnowledgeAdded).toHaveBeenCalledWith("user_1", { projectId: PROJECT, type: "txt" });
    expect(JSON.stringify(m.trackKnowledgeAdded.mock.calls)).not.toMatch(/Secret/);
  });

  it("returns the source as failed when processing fails", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" }, "Some text");
    m.processSource.mockRejectedValueOnce(new Error("embedding service down"));
    const res = await finalize(source.id);
    expect(res.status).toBe(200);
    expect((await res.json()).source.status).toBe("failed");
    expect(m.trackKnowledgeAdded).not.toHaveBeenCalled();
  });
});

describe("POST finalize: claim once", () => {
  it("finalizing twice processes the file only once; the second call is a 404", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" }, "Some text");
    expect((await finalize(source.id)).status).toBe(200);
    const second = await finalize(source.id);
    expect(second.status).toBe(404);
    expect((await second.json()).error.code).toBe("not_found");
    expect(m.processSource).toHaveBeenCalledTimes(1);
  });

  it("two simultaneous finalizes: exactly one wins the claim", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" }, "Some text");
    const [a, b] = await Promise.all([finalize(source.id), finalize(source.id)]);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
    expect(m.processSource).toHaveBeenCalledTimes(1);
  });

  it.each(["processing", "ready", "failed"])("is 404 for a source that is already %s", async (status) => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt", status }, "Some text");
    expect((await finalize(source.id)).status).toBe(404);
    expect(m.processSource).not.toHaveBeenCalled();
    expect(statusOf(source.id)).toBe(status);
  });

  it("is 404 for a source that doesn't exist", async () => {
    expect((await finalize("33333333-3333-4333-8333-333333333333")).status).toBe(404);
  });

  it("is 404 for a source of another project, even one this owner could name", async () => {
    const source = m.fake.addSource({ project_id: OTHER, type: "txt" }, "Some text");
    const res = await finalize(source.id);
    expect(res.status).toBe(404);
    expect(statusOf(source.id)).toBe("uploading");
  });
});

describe("POST finalize: files that are refused", () => {
  it("refuses a .txt posing as a PDF: 400 unsupported_file_type, the file and the row are gone", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "pdf" }, "This is just plain text renamed to .pdf");
    const res = await finalize(source.id);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "unsupported_file_type", message: expect.any(String) } });
    expect(m.fake.state.files.has(source.storage_key!)).toBe(false);
    expect(m.fake.state.sources).toHaveLength(0);
    expect(m.processSource).not.toHaveBeenCalled();
  });

  it("refuses an oversized file by its real size: 400 file_too_large, the file and the row are gone", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" }, new Blob([new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES + 1)]));
    const res = await finalize(source.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("file_too_large");
    expect(m.fake.state.files.has(source.storage_key!)).toBe(false);
    expect(m.fake.state.sources).toHaveLength(0);
    expect(m.processSource).not.toHaveBeenCalled();
  });

  it("frees the slot of a refused file", async () => {
    for (let i = 0; i < 2; i++) m.fake.addSource({ project_id: PROJECT, status: "ready", type: "text" });
    const source = m.fake.addSource({ project_id: PROJECT, type: "pdf" }, "not a pdf");
    await finalize(source.id);
    expect(m.fake.state.sources).toHaveLength(2);
  });
});

describe("POST finalize: only a fresh reservation can be claimed", () => {
  const HOUR = 60 * 60 * 1000;
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it("is 404 for a reservation older than 2 hours, and leaves it and its file alone", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt", created_at: ago(3 * HOUR) }, "Some text");
    const res = await finalize(source.id);
    expect(res.status).toBe(404);
    expect(m.processSource).not.toHaveBeenCalled();
    expect(statusOf(source.id)).toBe("uploading");
    expect(m.fake.state.files.has(source.storage_key!)).toBe(true);
    // The claim attempt matched nothing; nothing was removed or deleted.
    expect(m.fake.state.log.filter((line) => !line.startsWith("update"))).toEqual([]);
    expect(m.fake.state.sources).toHaveLength(1);
  });

  it("still claims one that is just inside the 2 hours", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt", created_at: ago(2 * HOUR - 60_000) }, "Some text");
    expect((await finalize(source.id)).status).toBe(200);
    expect(m.processSource).toHaveBeenCalledTimes(1);
  });
});

describe("POST finalize: a refused file's cleanup", () => {
  const fakePdf = () => m.fake.addSource({ project_id: PROJECT, type: "pdf" }, "This is plain text renamed to .pdf");
  const bigTxt = () => m.fake.addSource({ project_id: PROJECT, type: "txt" }, new Blob([new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES + 1)]));

  it.each([
    ["a .txt posing as a PDF", fakePdf, "unsupported_file_type"],
    ["an oversized file", bigTxt, "file_too_large"],
  ])("keeps the row, as failed, when %s can't be removed from Storage, so no file is left without its row", async (_label, add, code) => {
    const source = add();
    m.fake.state.fail.remove = { message: "storage down" };
    const res = await finalize(source.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(code);
    expect(m.fake.state.sources.map((s) => s.id)).toEqual([source.id]);
    expect(statusOf(source.id)).toBe("failed");
    expect(m.fake.state.files.has(source.storage_key!)).toBe(true);
  });

  it("deletes the row only after the file is gone", async () => {
    const source = fakePdf();
    await finalize(source.id);
    expect(m.fake.state.log.slice(-2)).toEqual([expect.stringContaining("remove "), "delete source"]);
  });

  it("is 500, not a refusal, when the row of a refused file can't be deleted", async () => {
    const source = fakePdf();
    m.fake.state.fail.delete = { message: "db down" };
    const res = await finalize(source.id);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal_error");
    expect(m.fake.state.files.has(source.storage_key!)).toBe(false);
  });
});

describe("POST finalize: a failed write is never ignored", () => {
  it("is 500, not 400, when the claim of a not-yet-uploaded file can't be handed back", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" });
    m.fake.state.fail.updateTo = { status: "uploading", failure: { message: "db down" } };
    const res = await finalize(source.id);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("db down");
  });

  it("is 500 when the claim can't be handed back after a Storage error", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" }, "x");
    m.fake.state.fail.download = { message: "storage down" };
    m.fake.state.fail.updateTo = { status: "uploading", failure: { message: "db down" } };
    expect((await finalize(source.id)).status).toBe(500);
  });
});

describe("POST finalize: files that can't be read are kept as failed", () => {
  it.each([
    ["a PDF that can't be parsed", "pdf", "%PDF-1.4\nnot a real body"],
    ["an empty text file", "txt", ""],
    ["a file that isn't UTF-8", "txt", new Uint8Array([0x43, 0x61, 0x66, 0xe9])],
  ])("%s → 200 with status failed, the file kept, nothing processed", async (_label, type, content) => {
    const source = m.fake.addSource({ project_id: PROJECT, type }, content as string | Uint8Array);
    const res = await finalize(source.id);
    expect(res.status).toBe(200);
    expect((await res.json()).source.status).toBe("failed");
    expect(m.trackKnowledgeAdded).not.toHaveBeenCalled();
    expect(m.markSourceFailed).toHaveBeenCalledWith({ sourceId: source.id, projectId: PROJECT });
    expect(statusOf(source.id)).toBe("failed");
    expect(m.fake.state.files.has(source.storage_key!)).toBe(true);
    expect(m.processSource).not.toHaveBeenCalled();
  });
});

describe("POST finalize: the file isn't there, or Storage is down", () => {
  it("is 400 when the file was never uploaded, and hands the claim back so the owner can retry", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" });
    const res = await finalize(source.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(statusOf(source.id)).toBe("uploading");
    m.fake.state.files.set(source.storage_key!, new Blob(["now uploaded"]));
    expect((await finalize(source.id)).status).toBe(200);
  });

  it("is 500 on a Storage error, releasing the claim instead of failing the source", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" }, "x");
    m.fake.state.fail.download = { message: "storage down" };
    const res = await finalize(source.id);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("storage down");
    expect(statusOf(source.id)).toBe("uploading");
    expect(m.markSourceFailed).not.toHaveBeenCalled();
  });

  it("marks the source failed, not stuck in processing, when something unexpected breaks after the claim", async () => {
    const broken = { size: 10, arrayBuffer: async () => { throw new Error("boom"); } } as unknown as Blob;
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" }, broken);
    const res = await finalize(source.id);
    expect(res.status).toBe(500);
    expect(statusOf(source.id)).toBe("failed");
  });
});

describe("POST finalize: input and access", () => {
  it("is 404 for another owner's project, and claims nothing", async () => {
    const source = m.fake.addSource({ project_id: OTHER, type: "txt" }, "x");
    expect((await finalize(source.id, OTHER)).status).toBe(404);
    expect(statusOf(source.id)).toBe("uploading");
  });

  it.each([
    ["no body", "", true],
    ["not JSON", "{nope", true],
    ["no sourceId", {}, false],
    ["a sourceId that isn't a UUID", { sourceId: "123" }, false],
  ])("is 400 invalid_input for %s", async (_label, body, raw) => {
    const res = await call(body, PROJECT, raw);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
  });

  it("is 401 when signed out, and touches nothing", async () => {
    const source = m.fake.addSource({ project_id: PROJECT, type: "txt" }, "x");
    m.auth.mockResolvedValueOnce({ userId: null });
    expect((await finalize(source.id)).status).toBe(401);
    expect(statusOf(source.id)).toBe("uploading");
  });

  it("allows 300 s, the most a Hobby plan gives", () => {
    expect(maxDuration).toBe(300);
  });
});
