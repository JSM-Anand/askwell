import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => {
  const calls: string[] = [];
  const state = { projects: [] as { id: string; name: string }[], sources: [] as Record<string, unknown>[], fail: "" };
  const client = {
    from: (table: string) => {
      calls.push(`from ${table}`);
      if (table === "projects") {
        return {
          select: () => ({
            order: async () => ({ data: state.fail === "projects" ? null : state.projects, error: state.fail === "projects" ? { message: "boom" } : null }),
          }),
        };
      }
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            calls.push(`eq ${column}=${value}`);
            return { order: async () => ({ data: state.fail === "sources" ? null : state.sources, error: state.fail === "sources" ? { message: "boom" } : null }) };
          },
        }),
      };
    },
  };
  return { calls, state, createOwnerClient: vi.fn(() => client), createServiceClient: vi.fn(), getAccount: vi.fn() };
});
vi.mock("../../../lib/supabase/owner", () => ({ createOwnerClient: m.createOwnerClient }));
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: m.createServiceClient }));
vi.mock("../../../lib/accounts/get-account", () => ({ getAccount: m.getAccount }));

import { loadKnowledge } from "./load-knowledge";

const row = (id: string, status = "ready") => ({ id, title: `Source ${id}`, type: "text", status, created_at: "2026-11-02T10:00:00Z" });

beforeEach(() => {
  vi.clearAllMocks();
  m.calls.length = 0;
  m.state.projects = [{ id: "p1", name: "Docs bot" }];
  m.state.sources = [row("s1"), row("s2", "uploading")];
  m.state.fail = "";
  m.getAccount.mockResolvedValue({ clerkUserId: "u", plan: "pro", createdAt: "x" });
});

describe("loadKnowledge", () => {
  it("uses the only project, maps its sources and takes the plan from getAccount", async () => {
    const data = await loadKnowledge(undefined);
    expect(data.selected).toEqual({ id: "p1", name: "Docs bot" });
    expect(data.plan).toBe("pro");
    expect(data.sources).toEqual([
      { id: "s1", title: "Source s1", type: "text", status: "ready", createdAt: "2026-11-02T10:00:00Z" },
      { id: "s2", title: "Source s2", type: "text", status: "uploading", createdAt: "2026-11-02T10:00:00Z" },
    ]);
  });

  it("reads only through the owner client (RLS), and never creates a service client", async () => {
    await loadKnowledge(undefined);
    expect(m.createOwnerClient).toHaveBeenCalledTimes(1);
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.calls).toContain("eq project_id=p1");
  });

  it("picks the project named in ?project= when the owner has several", async () => {
    m.state.projects = [{ id: "p1", name: "A" }, { id: "p2", name: "B" }];
    const data = await loadKnowledge("p2");
    expect(data.selected?.id).toBe("p2");
    expect(m.calls).toContain("eq project_id=p2");
    expect(data.projects).toHaveLength(2);
  });

  it("falls back to the first project for an unknown or someone else's ID (RLS never lists theirs)", async () => {
    m.state.projects = [{ id: "p1", name: "A" }, { id: "p2", name: "B" }];
    const data = await loadKnowledge("someone-elses-project");
    expect(data.selected?.id).toBe("p1");
    expect(m.calls).toContain("eq project_id=p1");
    expect(m.calls).not.toContain("eq project_id=someone-elses-project");
  });

  it("has no selection and reads no sources when the owner has no projects", async () => {
    m.state.projects = [];
    const data = await loadKnowledge(undefined);
    expect(data).toMatchObject({ selected: null, sources: [], projects: [] });
    expect(m.calls).not.toContain("from knowledge_sources");
  });

  it("treats a missing account row as Free", async () => {
    m.getAccount.mockResolvedValue(null);
    expect((await loadKnowledge(undefined)).plan).toBe("free");
  });

  it("throws on a database error rather than showing an empty page", async () => {
    m.state.fail = "projects";
    await expect(loadKnowledge(undefined)).rejects.toThrow("Could not read the projects: boom");
    m.state.fail = "sources";
    await expect(loadKnowledge(undefined)).rejects.toThrow("Could not read the sources: boom");
  });
});
