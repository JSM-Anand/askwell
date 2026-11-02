import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "@askwell/shared";
import type { KnowledgeSourceSummary } from "@askwell/shared";
import { initialKnowledgeState, knowledgeReducer, sourceLimitInfo, statusLabel } from "./knowledge-state";

const source = (id: string, status: KnowledgeSourceSummary["status"] = "ready"): KnowledgeSourceSummary => ({
  id,
  title: `Source ${id}`,
  type: "text",
  status,
  createdAt: "2026-11-02T10:00:00Z",
});

describe("statusLabel", () => {
  it("shows uploading and processing as Processing", () => {
    expect(statusLabel("uploading")).toBe("Processing");
    expect(statusLabel("processing")).toBe("Processing");
    expect(statusLabel("ready")).toBe("Ready");
    expect(statusLabel("failed")).toBe("Failed");
  });
});

describe("knowledgeReducer", () => {
  it("puts a new source first and updates it in place when its status changes", () => {
    let state = initialKnowledgeState([source("a")], "free");
    state = knowledgeReducer(state, { type: "added", source: source("b", "uploading") });
    expect(state.sources.map((s) => s.id)).toEqual(["b", "a"]);
    state = knowledgeReducer(state, { type: "updated", source: source("b", "ready") });
    expect(state.sources.find((s) => s.id === "b")?.status).toBe("ready");
    expect(state.sources).toHaveLength(2);
  });

  it("tracks upload progress per source and clears it", () => {
    let state = initialKnowledgeState([], "free");
    state = knowledgeReducer(state, { type: "progress", id: "a", percent: 40 });
    state = knowledgeReducer(state, { type: "progress", id: "b", percent: 10 });
    expect(state.progress).toEqual({ a: 40, b: 10 });
    state = knowledgeReducer(state, { type: "progress", id: "a", percent: null });
    expect(state.progress).toEqual({ b: 10 });
  });

  it("a 402 marks the project at its limit, even if the local count has room", () => {
    const state = knowledgeReducer(initialKnowledgeState([], "free"), { type: "limitReached" });
    expect(sourceLimitInfo(state).atLimit).toBe(true);
  });

  it("deleting needs a confirm: asking only opens the confirm step", () => {
    const asked = knowledgeReducer(initialKnowledgeState([source("a")], "free"), { type: "askDelete", id: "a" });
    expect(asked.confirmingId).toBe("a");
    expect(asked.sources).toHaveLength(1);
    expect(knowledgeReducer(asked, { type: "cancelDelete" }).confirmingId).toBeNull();
  });

  it("removes a deleted source, its progress and a server limit", () => {
    let state = initialKnowledgeState([source("a"), source("b")], "free");
    state = knowledgeReducer(state, { type: "progress", id: "a", percent: 50 });
    state = knowledgeReducer(state, { type: "limitReached" });
    state = knowledgeReducer(state, { type: "askDelete", id: "a" });
    state = knowledgeReducer(state, { type: "deleted", id: "a" });
    expect(state.sources.map((s) => s.id)).toEqual(["b"]);
    expect(state.progress).toEqual({});
    expect(state.confirmingId).toBeNull();
    expect(state.serverLimit).toBe(false);
  });

  it("keeps a failure message until dismissed", () => {
    const failed = knowledgeReducer(initialKnowledgeState([], "free"), { type: "failed", message: "Nope" });
    expect(failed.notice).toBe("Nope");
    expect(knowledgeReducer(failed, { type: "dismissNotice" }).notice).toBeNull();
  });
});

describe("sourceLimitInfo", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => source(String(i)));

  it("has no message while there is room", () => {
    const free = PLAN_LIMITS.free.knowledgeSources;
    expect(sourceLimitInfo({ plan: "free", sources: many(free - 1), serverLimit: false })).toEqual({ atLimit: false, message: null, canUpgrade: false });
  });

  it("tells a Free owner at the limit to upgrade, with the numbers from PLAN_LIMITS", () => {
    expect(sourceLimitInfo({ plan: "free", sources: many(3), serverLimit: false })).toEqual({
      atLimit: true,
      message: "Free allows 3 sources per project. Upgrade to Pro for 25.",
      canUpgrade: true,
    });
  });

  it("tells a Pro owner the cap, without an upgrade link", () => {
    expect(sourceLimitInfo({ plan: "pro", sources: many(25), serverLimit: false })).toEqual({
      atLimit: true,
      message: "Pro allows 25 sources per project.",
      canUpgrade: false,
    });
    expect(sourceLimitInfo({ plan: "pro", sources: many(24), serverLimit: false }).atLimit).toBe(false);
  });
});
