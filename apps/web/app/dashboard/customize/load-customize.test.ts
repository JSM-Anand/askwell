import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => {
  const calls: string[] = [];
  const state = { projects: [] as { id: string; name: string }[], config: null as Record<string, unknown> | null, fail: "" };
  const client = {
    from: (table: string) => {
      calls.push(`from ${table}`);
      if (table === "projects") {
        return { select: () => ({ order: async () => ({ data: state.fail === "projects" ? null : state.projects, error: state.fail === "projects" ? { message: "boom" } : null }) }) };
      }
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            calls.push(`eq ${column}=${value}`);
            return { maybeSingle: async () => ({ data: state.fail === "config" ? null : state.config, error: state.fail === "config" ? { message: "boom" } : null }) };
          },
        }),
      };
    },
  };
  return { calls, state, getAccount: vi.fn(), createOwnerClient: vi.fn(() => client), createServiceClient: vi.fn() };
});
vi.mock("../../../lib/supabase/owner", () => ({ createOwnerClient: m.createOwnerClient }));
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: m.createServiceClient }));
vi.mock("../../../lib/accounts/get-account", () => ({ getAccount: m.getAccount }));

import { loadCustomize } from "./load-customize";

const custom = { button_color: "#ff0000", position: "top-left", label: "Help me", animation: "scale", header_text: "Support", show_badge: false };

beforeEach(() => {
  vi.clearAllMocks();
  m.calls.length = 0;
  m.state.projects = [{ id: "p1", name: "Docs bot" }];
  m.state.config = custom;
  m.state.fail = "";
  m.getAccount.mockResolvedValue({ clerkUserId: "u", plan: "pro", createdAt: "x" });
});

describe("loadCustomize", () => {
  it("returns a Pro owner's stored settings as they are", async () => {
    const data = await loadCustomize(undefined);
    expect(data.selected).toEqual({ id: "p1", name: "Docs bot" });
    expect(data.plan).toBe("pro");
    expect(data.config).toEqual({ buttonColor: "#ff0000", position: "top-left", label: "Help me", animation: "scale", headerText: "Support", showBadge: false });
  });

  it("shows a Free owner what visitors see: the defaults, even if Pro-only values are stored", async () => {
    m.getAccount.mockResolvedValue({ clerkUserId: "u", plan: "free", createdAt: "x" });
    const data = await loadCustomize(undefined);
    expect(data.plan).toBe("free");
    expect(data.config).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("reads only through the owner client, and never creates a service client", async () => {
    await loadCustomize(undefined);
    expect(m.createOwnerClient).toHaveBeenCalledTimes(1);
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.calls).toEqual(["from projects", "from widget_configs", "eq project_id=p1"]);
  });

  it("picks the project named in ?project=, and falls back to the first for an unknown or someone else's id", async () => {
    m.state.projects = [{ id: "p1", name: "A" }, { id: "p2", name: "B" }];
    expect((await loadCustomize("p2")).selected?.id).toBe("p2");
    expect(m.calls).toContain("eq project_id=p2");
    expect((await loadCustomize("someone-elses")).selected?.id).toBe("p1");
    expect(m.calls).not.toContain("eq project_id=someone-elses");
  });

  it("uses the defaults when the project has no config row", async () => {
    m.state.config = null;
    expect((await loadCustomize(undefined)).config).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("has no selection and reads no config when the owner has no projects", async () => {
    m.state.projects = [];
    expect(await loadCustomize(undefined)).toMatchObject({ projects: [], selected: null, config: DEFAULT_WIDGET_CONFIG });
    expect(m.calls).toEqual(["from projects"]);
  });

  it("treats a missing account row as Free", async () => {
    m.getAccount.mockResolvedValue(null);
    expect((await loadCustomize(undefined)).plan).toBe("free");
  });

  it("throws on a database error rather than showing defaults that could be saved over real settings", async () => {
    m.state.fail = "projects";
    await expect(loadCustomize(undefined)).rejects.toThrow("Could not read the projects: boom");
    m.state.fail = "config";
    await expect(loadCustomize(undefined)).rejects.toThrow("Could not read the widget config: boom");
  });
});
