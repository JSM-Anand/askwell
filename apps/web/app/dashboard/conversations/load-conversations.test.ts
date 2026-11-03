import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => {
  const calls: string[] = [];
  const state = { projects: [] as { id: string; name: string }[], activity: [] as Record<string, unknown>[], fail: "" };
  const client = {
    from: (table: string) => {
      calls.push(`from ${table}`);
      return {
        select: () => ({
          order: async () => ({
            data: state.fail === "projects" ? null : state.projects,
            error: state.fail === "projects" ? { message: "boom" } : null,
          }),
        }),
      };
    },
    rpc: async (name: string, args: { p_project_id: string }) => {
      calls.push(`rpc ${name} ${args.p_project_id}`);
      return { data: state.fail === "activity" ? null : state.activity, error: state.fail === "activity" ? { message: "boom" } : null };
    },
  };
  return { calls, state, createOwnerClient: vi.fn(() => client), createServiceClient: vi.fn() };
});
vi.mock("../../../lib/supabase/owner", () => ({ createOwnerClient: m.createOwnerClient }));
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: m.createServiceClient }));

import { loadConversations } from "./load-conversations";

const activity = (n: number, over: Record<string, unknown> = {}) => ({
  id: `c${n}`,
  visitor_id: `v${n}`,
  created_at: `2026-11-02T1${n}:00:00Z`,
  message_count: n,
  first_message_preview: `Question ${n}`,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.calls.length = 0;
  m.state.projects = [{ id: "p1", name: "Docs bot" }];
  m.state.activity = [activity(2), activity(1)];
  m.state.fail = "";
});

describe("loadConversations", () => {
  it("uses the only project and maps its conversations, keeping the order", async () => {
    const data = await loadConversations(undefined);
    expect(data.selected).toEqual({ id: "p1", name: "Docs bot" });
    expect(data.conversations).toEqual([
      { id: "c2", visitorId: "v2", createdAt: "2026-11-02T12:00:00Z", messageCount: 2, firstMessagePreview: "Question 2" },
      { id: "c1", visitorId: "v1", createdAt: "2026-11-02T11:00:00Z", messageCount: 1, firstMessagePreview: "Question 1" },
    ]);
  });

  it("reads only through the owner client, and never creates a service client", async () => {
    await loadConversations(undefined);
    expect(m.createOwnerClient).toHaveBeenCalledTimes(1);
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.calls).toEqual(["from projects", "rpc owner_activity p1"]);
  });

  it("picks the project named in ?project= when the owner has several", async () => {
    m.state.projects = [{ id: "p1", name: "A" }, { id: "p2", name: "B" }];
    const data = await loadConversations("p2");
    expect(data.selected?.id).toBe("p2");
    expect(m.calls).toContain("rpc owner_activity p2");
  });

  it("falls back to the first project for an unknown or someone else's ID", async () => {
    m.state.projects = [{ id: "p1", name: "A" }, { id: "p2", name: "B" }];
    const data = await loadConversations("someone-elses-project");
    expect(data.selected?.id).toBe("p1");
    expect(m.calls).not.toContain("rpc owner_activity someone-elses-project");
  });

  it("has no selection and asks for no conversations when the owner has no projects", async () => {
    m.state.projects = [];
    expect(await loadConversations(undefined)).toEqual({ projects: [], selected: null, conversations: [] });
    expect(m.calls).toEqual(["from projects"]);
  });

  it("keeps a null preview and a zero count", async () => {
    m.state.activity = [activity(3, { message_count: 0, first_message_preview: null })];
    expect((await loadConversations(undefined)).conversations[0]).toMatchObject({ messageCount: 0, firstMessagePreview: null });
  });

  it("throws on a database error rather than showing an empty page", async () => {
    m.state.fail = "projects";
    await expect(loadConversations(undefined)).rejects.toThrow("Could not read the projects: boom");
    m.state.fail = "activity";
    await expect(loadConversations(undefined)).rejects.toThrow("Could not read the conversations: boom");
  });
});
