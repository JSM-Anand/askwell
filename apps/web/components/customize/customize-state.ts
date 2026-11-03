import { MAX_WIDGET_HEADER_LENGTH, MAX_WIDGET_LABEL_LENGTH, PLAN_LIMITS, WIDGET_ANIMATIONS, WIDGET_POSITIONS } from "@askwell/shared";
import type { Plan, WidgetConfig } from "@askwell/shared";

export type FieldName = keyof WidgetConfig;
export type FieldErrors = Partial<Record<FieldName, string>>;

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * A message for each field that is not valid, by the same rules as `widgetConfigSchema` in `packages/shared`
 * (a test checks the two agree). The server validates again; this is only so the owner sees the problem
 * next to the field before anything is sent.
 */
export function validateConfig(config: WidgetConfig): FieldErrors {
  const errors: FieldErrors = {};
  if (!HEX.test(config.buttonColor)) errors.buttonColor = "Use a hex color like #1a2b3c.";
  if (!(WIDGET_POSITIONS as readonly string[]).includes(config.position)) errors.position = "Choose a corner.";
  if (config.label.trim() === "") errors.label = "Enter a label.";
  else if (config.label.trim().length > MAX_WIDGET_LABEL_LENGTH) errors.label = `Use ${MAX_WIDGET_LABEL_LENGTH} characters or fewer.`;
  if (!(WIDGET_ANIMATIONS as readonly string[]).includes(config.animation)) errors.animation = "Choose an animation.";
  if (config.headerText.trim() === "") errors.headerText = "Enter a header.";
  else if (config.headerText.trim().length > MAX_WIDGET_HEADER_LENGTH) errors.headerText = `Use ${MAX_WIDGET_HEADER_LENGTH} characters or fewer.`;
  return errors;
}

/** The fields whose value differs from the saved config. The save sends only these. */
export function changedFields(saved: WidgetConfig, draft: WidgetConfig): Partial<WidgetConfig> {
  const changed: Partial<WidgetConfig> = {};
  // Text is compared as the server will store it: trimmed.
  const next = { ...draft, label: draft.label.trim(), headerText: draft.headerText.trim() };
  for (const key of Object.keys(saved) as FieldName[]) {
    if (next[key] !== saved[key]) (changed as Record<FieldName, unknown>)[key] = next[key];
  }
  return changed;
}

/**
 * What the preview draws: the draft, except that a field that isn't valid yet (a half-typed color, an empty
 * label) keeps the saved value, so the preview never breaks while the owner is typing.
 */
export function previewConfig(saved: WidgetConfig, draft: WidgetConfig): WidgetConfig {
  const errors = validateConfig(draft);
  return {
    buttonColor: errors.buttonColor ? saved.buttonColor : draft.buttonColor,
    position: errors.position ? saved.position : draft.position,
    label: errors.label ? saved.label : draft.label.trim(),
    animation: errors.animation ? saved.animation : draft.animation,
    headerText: errors.headerText ? saved.headerText : draft.headerText.trim(),
    showBadge: draft.showBadge,
  };
}

/** Readable text color for a #rrggbb background. The same rule the widget button uses (`apps/widget/src/loader.ts`). */
export function textOn(hex: string): "#000" | "#fff" {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#000" : "#fff";
}

/**
 * Whether the plan can change anything about the widget at all, from `PLAN_LIMITS`. Free can't: the form is shown
 * locked. The server decides for real (a save from Free is a 402); this only drives what the page shows.
 */
export function planCanCustomize(plan: Plan): boolean {
  const allowed = PLAN_LIMITS[plan].customize;
  return allowed.buttonColor || allowed.label || allowed.headerText || allowed.hideBadge || allowed.positions.length > 1 || allowed.animations.length > 1;
}
