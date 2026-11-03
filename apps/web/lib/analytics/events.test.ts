import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const capture = vi.hoisted(() => vi.fn());
vi.mock("./server", () => ({ capture }));

import {
  trackFirstChat,
  trackKnowledgeAdded,
  trackMessageBlocked,
  trackProjectCreated,
  trackSignedUp,
  trackUpgraded,
} from "./events";

beforeEach(() => {
  capture.mockReset();
  capture.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("product events", () => {
  it.each([
    ["signed_up", () => trackSignedUp("u1"), "u1", undefined],
    ["project_created", () => trackProjectCreated("u1", { projectId: "p1", plan: "free" }), "u1", { project_id: "p1", plan: "free" }],
    ["knowledge_added", () => trackKnowledgeAdded("u1", { projectId: "p1", type: "pdf" }), "u1", { project_id: "p1", type: "pdf" }],
    ["first_chat", () => trackFirstChat("owner", "p1"), "owner", { project_id: "p1" }],
    ["message_blocked", () => trackMessageBlocked("owner", { projectId: "p1", reason: "rate_limited" }), "owner", { project_id: "p1", reason: "rate_limited" }],
    ["upgraded", () => trackUpgraded("u1", "pro"), "u1", { plan: "pro" }],
  ] as const)("%s fires once with the right distinct ID and properties", async (event, fire, distinctId, properties) => {
    await fire();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]![0]).toEqual({ distinctId, event, ...(properties ? { properties } : {}) });
  });

  it("swallows a capture failure and logs it", async () => {
    capture.mockRejectedValue(new Error("down"));
    await expect(trackSignedUp("u1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
