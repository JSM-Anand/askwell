import { describe, expect, it } from "vitest";
import { DEFAULT_WIDGET_CONFIG, MAX_WIDGET_HEADER_LENGTH, MAX_WIDGET_LABEL_LENGTH, widgetConfigSchema } from "@askwell/shared";
import type { WidgetConfig } from "@askwell/shared";
import { changedFields, planCanCustomize, previewConfig, textOn, validateConfig } from "./customize-state";

const base = DEFAULT_WIDGET_CONFIG;
const with_ = (over: Partial<WidgetConfig>): WidgetConfig => ({ ...base, ...over });

describe("validateConfig", () => {
  it("has no errors for the default config", () => {
    expect(validateConfig(base)).toEqual({});
  });

  it.each([
    ["not hex", "red"],
    ["too short", "#fff"],
    ["no hash", "ff0000"],
    ["too long", "#ff00000"],
    ["not hex digits", "#gggggg"],
    ["empty", ""],
  ])("flags a button color that is %s", (_label, buttonColor) => {
    expect(validateConfig(with_({ buttonColor })).buttonColor).toBe("Use a hex color like #1a2b3c.");
  });

  it("accepts upper and lower case hex", () => {
    expect(validateConfig(with_({ buttonColor: "#AbCdEf" }))).toEqual({});
  });

  it("flags an empty or blank label and header, and ones that are too long", () => {
    expect(validateConfig(with_({ label: "" })).label).toBe("Enter a label.");
    expect(validateConfig(with_({ label: "   " })).label).toBe("Enter a label.");
    expect(validateConfig(with_({ label: "x".repeat(MAX_WIDGET_LABEL_LENGTH + 1) })).label).toBe("Use 40 characters or fewer.");
    expect(validateConfig(with_({ headerText: "" })).headerText).toBe("Enter a header.");
    expect(validateConfig(with_({ headerText: "x".repeat(MAX_WIDGET_HEADER_LENGTH + 1) })).headerText).toBe("Use 60 characters or fewer.");
  });

  it("accepts the longest allowed label and header", () => {
    expect(validateConfig(with_({ label: "x".repeat(40), headerText: "y".repeat(60) }))).toEqual({});
  });

  it("measures the trimmed text, as the server does", () => {
    expect(validateConfig(with_({ label: `  ${"x".repeat(40)}  ` }))).toEqual({});
  });

  it("flags a position or animation that doesn't exist", () => {
    expect(validateConfig(with_({ position: "middle" as never })).position).toBe("Choose a corner.");
    expect(validateConfig(with_({ animation: "spin" as never })).animation).toBe("Choose an animation.");
  });

  it("agrees with the shared schema the server uses, on valid and invalid configs alike", () => {
    const samples: WidgetConfig[] = [
      base,
      with_({ buttonColor: "#123456", position: "top-left", animation: "scale", label: "Help", headerText: "Support", showBadge: false }),
      with_({ buttonColor: "red" }),
      with_({ buttonColor: "#12345" }),
      with_({ label: "" }),
      with_({ label: " " }),
      with_({ label: "x".repeat(41) }),
      with_({ label: "x".repeat(40) }),
      with_({ headerText: "" }),
      with_({ headerText: "y".repeat(61) }),
      with_({ headerText: "y".repeat(60) }),
      with_({ position: "middle" as never }),
      with_({ animation: "spin" as never }),
    ];
    for (const sample of samples) {
      expect(Object.keys(validateConfig(sample)).length === 0, JSON.stringify(sample)).toBe(widgetConfigSchema.safeParse(sample).success);
    }
  });
});

describe("changedFields", () => {
  it("is empty when nothing changed", () => {
    expect(changedFields(base, { ...base })).toEqual({});
  });

  it("has only the fields that differ", () => {
    expect(changedFields(base, with_({ buttonColor: "#ff0000" }))).toEqual({ buttonColor: "#ff0000" });
    expect(changedFields(base, with_({ label: "Help", showBadge: false }))).toEqual({ label: "Help", showBadge: false });
  });

  it("includes a change back to a value that differs from the saved one, even if it is the default", () => {
    const saved = with_({ position: "top-left" });
    expect(changedFields(saved, with_({ position: "bottom-right" }))).toEqual({ position: "bottom-right" });
  });

  it("compares text trimmed, as the server stores it, and sends it trimmed", () => {
    expect(changedFields(base, with_({ label: `  ${base.label}  ` }))).toEqual({});
    expect(changedFields(base, with_({ label: "  Help  " }))).toEqual({ label: "Help" });
  });

  it("treats a false showBadge as a change (hiding the badge)", () => {
    expect(changedFields(base, with_({ showBadge: false }))).toEqual({ showBadge: false });
  });
});

describe("previewConfig", () => {
  const saved = with_({ buttonColor: "#112233", label: "Saved label", headerText: "Saved header", position: "top-right", animation: "slide" });

  it("follows the draft", () => {
    const draft = with_({ buttonColor: "#ff0000", label: "New", headerText: "Hi", position: "bottom-left", animation: "scale", showBadge: false });
    expect(previewConfig(saved, draft)).toEqual(draft);
  });

  it("keeps the saved value for a field that isn't valid yet, so the preview never breaks while typing", () => {
    const draft = { ...saved, buttonColor: "#ff", label: "", headerText: "  " };
    expect(previewConfig(saved, draft)).toMatchObject({ buttonColor: "#112233", label: "Saved label", headerText: "Saved header" });
  });

  it("shows trimmed text, as visitors will see it", () => {
    expect(previewConfig(saved, { ...saved, label: "  Help  " }).label).toBe("Help");
  });

  it("always follows the badge toggle", () => {
    expect(previewConfig(saved, { ...saved, showBadge: false }).showBadge).toBe(false);
  });
});

describe("textOn", () => {
  it.each([
    ["#ffffff", "#000"],
    ["#ffff00", "#000"],
    ["#ffd700", "#000"],
    ["#000000", "#fff"],
    ["#ff0000", "#fff"],
    ["#0000ff", "#fff"],
    ["#1a2b3c", "#fff"],
    ["#00ff00", "#fff"], // luminance 149.7: just under the threshold, so white, like the widget
    ["#00ff80", "#000"],
  ])("puts %s text %s so it stays readable (the widget's own rule)", (hex, text) => {
    expect(textOn(hex)).toBe(text);
  });

  it("switches at a luminance of exactly 150: 150 is still white, 151 is black", () => {
    expect(textOn("#969696")).toBe("#fff");
    expect(textOn("#979797")).toBe("#000");
  });
});

describe("planCanCustomize", () => {
  it("is false for Free and true for Pro, from PLAN_LIMITS", () => {
    expect(planCanCustomize("free")).toBe(false);
    expect(planCanCustomize("pro")).toBe(true);
  });
});
