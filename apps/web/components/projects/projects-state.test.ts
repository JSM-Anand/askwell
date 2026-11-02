import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "@askwell/shared";
import type { ProjectSummary } from "@askwell/shared";
import { initialState, limitInfo, projectsReducer } from "./projects-state";
import type { ProjectsState } from "./projects-state";

const project = (id: string, name = `Project ${id}`): ProjectSummary => ({
  id,
  name,
  publicKey: `pk_${id}`,
  messagesUsed: 0,
  periodStart: "2026-11-01T00:00:00Z",
  createdAt: "2026-11-01T00:00:00Z",
});

const ready = (over: Partial<ProjectsState> = {}): ProjectsState => ({ ...initialState, status: "ready", ...over });

describe("projectsReducer", () => {
  it("starts loading, then shows what the server returned", () => {
    expect(initialState.status).toBe("loading");
    const state = projectsReducer(initialState, { type: "loaded", projects: [project("a")], plan: "pro" });
    expect(state).toMatchObject({ status: "ready", plan: "pro", projects: [project("a")] });
  });

  it("shows an error state, and goes back to loading on retry", () => {
    const failed = projectsReducer(initialState, { type: "loadFailed" });
    expect(failed.status).toBe("error");
    expect(projectsReducer(failed, { type: "retry" }).status).toBe("loading");
  });

  it("puts a new project first", () => {
    const state = projectsReducer(ready({ projects: [project("a")] }), { type: "created", project: project("b") });
    expect(state.projects.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("a 402 from the server marks the owner at the limit, even with room by the local count", () => {
    const state = projectsReducer(ready({ plan: "free", projects: [] }), { type: "limitReached" });
    expect(state.serverLimit).toBe(true);
    expect(limitInfo(state).atLimit).toBe(true);
  });

  it("deleting needs a confirm: asking only opens the confirm step", () => {
    const asked = projectsReducer(ready({ projects: [project("a")] }), { type: "askDelete", id: "a" });
    expect(asked.confirmingId).toBe("a");
    expect(asked.projects).toHaveLength(1);
    const cancelled = projectsReducer(asked, { type: "cancelDelete" });
    expect(cancelled.confirmingId).toBeNull();
    expect(cancelled.projects).toHaveLength(1);
  });

  it("removes the project once the delete is done, and clears a server limit", () => {
    const state = projectsReducer(
      ready({ projects: [project("a"), project("b")], confirmingId: "a", serverLimit: true }),
      { type: "deleted", id: "a" },
    );
    expect(state.projects.map((p) => p.id)).toEqual(["b"]);
    expect(state.confirmingId).toBeNull();
    expect(state.serverLimit).toBe(false);
  });

  it("renames in place and leaves edit mode", () => {
    const state = projectsReducer(
      ready({ projects: [project("a"), project("b")], editingId: "a" }),
      { type: "renamed", project: project("a", "New name") },
    );
    expect(state.projects.map((p) => p.name)).toEqual(["New name", "Project b"]);
    expect(state.editingId).toBeNull();
  });

  it("edit and delete-confirm don't open at once", () => {
    const editing = projectsReducer(ready({ confirmingId: "a" }), { type: "startEdit", id: "b" });
    expect(editing).toMatchObject({ editingId: "b", confirmingId: null });
    const confirming = projectsReducer(editing, { type: "askDelete", id: "a" });
    expect(confirming).toMatchObject({ editingId: null, confirmingId: "a" });
  });

  it("keeps a failure message until dismissed", () => {
    const failed = projectsReducer(ready(), { type: "failed", message: "Nope" });
    expect(failed.notice).toBe("Nope");
    expect(projectsReducer(failed, { type: "dismissNotice" }).notice).toBeNull();
  });
});

describe("limitInfo", () => {
  it("has no message while there is room", () => {
    expect(limitInfo({ plan: "free", projects: [], serverLimit: false })).toEqual({ atLimit: false, message: null, canUpgrade: false });
    const pro = Array.from({ length: PLAN_LIMITS.pro.projects - 1 }, (_, i) => project(String(i)));
    expect(limitInfo({ plan: "pro", projects: pro, serverLimit: false }).atLimit).toBe(false);
  });

  it("tells a Free owner at the limit to upgrade, with the numbers from PLAN_LIMITS", () => {
    const info = limitInfo({ plan: "free", projects: [project("a")], serverLimit: false });
    expect(info).toEqual({
      atLimit: true,
      message: "Free allows 1 project. Upgrade to Pro for 5.",
      canUpgrade: true,
    });
  });

  it("tells a Pro owner at the limit the cap, without an upgrade link", () => {
    const projects = Array.from({ length: PLAN_LIMITS.pro.projects }, (_, i) => project(String(i)));
    expect(limitInfo({ plan: "pro", projects, serverLimit: false })).toEqual({
      atLimit: true,
      message: "Pro allows 5 projects.",
      canUpgrade: false,
    });
  });
});
