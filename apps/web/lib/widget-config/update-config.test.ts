import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS } from "@askwell/shared";
import type { PlanLimits } from "@askwell/shared";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => {
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ upsert }));
  return { single, select, upsert, from, createServiceClient: vi.fn(() => ({ from })) };
});
vi.mock("../supabase/service", () => ({ createServiceClient: m.createServiceClient }));

import { canCustomize, disallowedFields, saveWidgetConfig, toColumns } from "./update-config";

const FREE = PLAN_LIMITS.free.customize;
const PRO = PLAN_LIMITS.pro.customize;
const custom = (over: Partial<PlanLimits["customize"]>): PlanLimits["customize"] => ({ ...PRO, ...over });

describe("canCustomize", () => {
  it("is false for Free and true for Pro, from PLAN_LIMITS", () => {
    expect(canCustomize(FREE)).toBe(false);
    expect(canCustomize(PRO)).toBe(true);
  });

  it("is true as soon as the plan can change any one thing", () => {
    const nothing = custom({ buttonColor: false, label: false, headerText: false, hideBadge: false, positions: ["bottom-right"], animations: ["fade"] });
    expect(canCustomize(nothing)).toBe(false);
    expect(canCustomize({ ...nothing, buttonColor: true })).toBe(true);
    expect(canCustomize({ ...nothing, label: true })).toBe(true);
    expect(canCustomize({ ...nothing, headerText: true })).toBe(true);
    expect(canCustomize({ ...nothing, hideBadge: true })).toBe(true);
    expect(canCustomize({ ...nothing, positions: ["bottom-right", "top-left"] })).toBe(true);
    expect(canCustomize({ ...nothing, animations: ["fade", "scale"] })).toBe(true);
  });
});

describe("disallowedFields", () => {
  it("allows everything on Pro", () => {
    expect(disallowedFields({ buttonColor: "#ff0000", position: "top-left", label: "Help", animation: "scale", headerText: "Support", showBadge: false }, PRO)).toEqual([]);
  });

  it("refuses every changed field on Free", () => {
    expect(disallowedFields({ buttonColor: "#ff0000", position: "top-left", label: "Help", animation: "scale", headerText: "Support", showBadge: false }, FREE)).toEqual([
      "buttonColor", "position", "label", "animation", "headerText", "showBadge",
    ]);
  });

  it("allows what the plan allows even when it can't change the rest: Free's own position and animation, and showing the badge", () => {
    expect(disallowedFields({ position: "bottom-right", animation: "fade", showBadge: true }, FREE)).toEqual([]);
  });

  it("checks position and animation against the plan's lists", () => {
    const limited = custom({ positions: ["bottom-right", "bottom-left"], animations: ["fade", "slide"] });
    expect(disallowedFields({ position: "bottom-left", animation: "slide" }, limited)).toEqual([]);
    expect(disallowedFields({ position: "top-right", animation: "scale" }, limited)).toEqual(["position", "animation"]);
  });

  it("only looks at the fields that were sent", () => {
    expect(disallowedFields({ label: "Help" }, custom({ buttonColor: false, headerText: false }))).toEqual([]);
    expect(disallowedFields({ buttonColor: "#112233" }, custom({ buttonColor: false }))).toEqual(["buttonColor"]);
  });

  it("treats hiding the badge as the plan feature, and showing it as free", () => {
    expect(disallowedFields({ showBadge: false }, custom({ hideBadge: false }))).toEqual(["showBadge"]);
    expect(disallowedFields({ showBadge: true }, custom({ hideBadge: false }))).toEqual([]);
  });
});

describe("toColumns", () => {
  it("maps each sent field to its column, and nothing else", () => {
    expect(toColumns({ buttonColor: "#ff0000" })).toEqual({ button_color: "#ff0000" });
    expect(toColumns({ headerText: "Hi", showBadge: false })).toEqual({ header_text: "Hi", show_badge: false });
  });

  it("maps all six fields", () => {
    expect(toColumns({ buttonColor: "#000000", position: "top-left", label: "L", animation: "slide", headerText: "H", showBadge: true })).toEqual({
      button_color: "#000000", position: "top-left", label: "L", animation: "slide", header_text: "H", show_badge: true,
    });
  });

  it("keeps a false showBadge (it is a value, not 'not sent')", () => {
    expect(toColumns({ showBadge: false })).toEqual({ show_badge: false });
  });
});

describe("saveWidgetConfig", () => {
  const row = { button_color: "#ff0000", position: "top-left", label: "Help me", animation: "scale", header_text: "Support", show_badge: false };

  beforeEach(() => {
    vi.clearAllMocks();
    m.single.mockResolvedValue({ data: row, error: null });
  });

  it("upserts only the sent fields for that project and returns the saved config", async () => {
    const saved = await saveWidgetConfig("p1", { buttonColor: "#ff0000" }, "pro");
    expect(m.from).toHaveBeenCalledWith("widget_configs");
    expect(m.upsert).toHaveBeenCalledWith({ project_id: "p1", button_color: "#ff0000" }, { onConflict: "project_id" });
    expect(saved).toEqual({ buttonColor: "#ff0000", position: "top-left", label: "Help me", animation: "scale", headerText: "Support", showBadge: false });
  });

  it("returns the config as visitors see it for the plan: a plan that doesn't allow a value shows the default", async () => {
    // Not reachable from the route (Free never writes), but the response is always plan-applied.
    const saved = await saveWidgetConfig("p1", { buttonColor: "#ff0000" }, "free");
    expect(saved).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("throws on a database error", async () => {
    m.single.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(saveWidgetConfig("p1", { label: "x" }, "pro")).rejects.toThrow("Could not save the widget config: boom");
  });
});
