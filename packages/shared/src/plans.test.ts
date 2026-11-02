import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, WIDGET_ANIMATIONS, WIDGET_POSITIONS } from "./index";

describe("PLAN_LIMITS (project.md §5)", () => {
  it("Free", () => {
    const free = PLAN_LIMITS.free;
    expect(free.projects).toBe(1);
    expect(free.messagesPerMonth).toBe(100);
    expect(free.knowledgeSources).toBe(3);
    expect(free.customize).toEqual({
      buttonColor: false,
      positions: ["bottom-right"],
      label: false,
      animations: ["fade"],
      headerText: false,
      hideBadge: false,
    });
  });

  it("Pro", () => {
    const pro = PLAN_LIMITS.pro;
    expect(pro.projects).toBe(5);
    expect(pro.messagesPerMonth).toBe(2000);
    expect(pro.knowledgeSources).toBe(25);
    expect(pro.customize.buttonColor).toBe(true);
    expect(pro.customize.positions).toEqual(WIDGET_POSITIONS);
    expect(pro.customize.label).toBe(true);
    expect(pro.customize.animations).toEqual(WIDGET_ANIMATIONS);
    expect(pro.customize.headerText).toBe(true);
    expect(pro.customize.hideBadge).toBe(true);
  });
});
