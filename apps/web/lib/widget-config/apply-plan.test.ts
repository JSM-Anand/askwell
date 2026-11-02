import { describe, expect, it } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import type { WidgetConfig } from "@askwell/shared";
import { applyPlan } from "./apply-plan";

// Every field changed from its default, so a fallback to the default is visible.
const custom: WidgetConfig = {
  buttonColor: "#ff0000",
  position: "top-left",
  label: "Help me",
  animation: "scale",
  headerText: "Support",
  showBadge: false,
};

describe("applyPlan: Free", () => {
  const result = applyPlan(custom, "free");

  it("uses the default button color", () => expect(result.buttonColor).toBe(DEFAULT_WIDGET_CONFIG.buttonColor));
  it("uses the default position", () => expect(result.position).toBe(DEFAULT_WIDGET_CONFIG.position));
  it("uses the default label", () => expect(result.label).toBe(DEFAULT_WIDGET_CONFIG.label));
  it("uses the default animation", () => expect(result.animation).toBe(DEFAULT_WIDGET_CONFIG.animation));
  it("uses the default header text", () => expect(result.headerText).toBe(DEFAULT_WIDGET_CONFIG.headerText));
  it("always shows the badge", () => expect(result.showBadge).toBe(true));

  it("returns exactly the defaults for a fully customized config", () => {
    expect(result).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("keeps values that equal what Free may use", () => {
    expect(applyPlan({ ...DEFAULT_WIDGET_CONFIG, animation: "fade", position: "bottom-right" }, "free")).toEqual(
      DEFAULT_WIDGET_CONFIG,
    );
  });
});

describe("applyPlan: Pro", () => {
  const result = applyPlan(custom, "pro");

  it("keeps the button color", () => expect(result.buttonColor).toBe("#ff0000"));
  it("keeps the position", () => expect(result.position).toBe("top-left"));
  it("keeps the label", () => expect(result.label).toBe("Help me"));
  it("keeps the animation", () => expect(result.animation).toBe("scale"));
  it("keeps the header text", () => expect(result.headerText).toBe("Support"));
  it("keeps the badge setting, hidden or shown", () => {
    expect(result.showBadge).toBe(false);
    expect(applyPlan({ ...custom, showBadge: true }, "pro").showBadge).toBe(true);
  });

  it("returns the config unchanged", () => expect(result).toEqual(custom));
});

describe("applyPlan", () => {
  it("does not mutate its input", () => {
    const input = { ...custom };
    applyPlan(input, "free");
    expect(input).toEqual(custom);
  });
});
