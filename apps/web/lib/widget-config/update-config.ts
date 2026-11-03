import "server-only";
import { PLAN_LIMITS } from "@askwell/shared";
import type { Plan, PlanLimits, UpdateConfigInput, WidgetConfig } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";
import { applyPlan } from "./apply-plan";

type Customize = PlanLimits["customize"];

/** Whether the plan may change anything about the widget at all. Free may not: every save is refused. */
export const canCustomize = (allowed: Customize): boolean =>
  allowed.buttonColor || allowed.label || allowed.headerText || allowed.hideBadge || allowed.positions.length > 1 || allowed.animations.length > 1;

/**
 * The fields of a patch that the plan doesn't allow, by the same rules `applyPlan` uses to show a config.
 * Showing the badge is always allowed; only hiding it is a plan feature.
 */
export function disallowedFields(patch: UpdateConfigInput, allowed: Customize): (keyof WidgetConfig)[] {
  const blocked: (keyof WidgetConfig)[] = [];
  if (patch.buttonColor !== undefined && !allowed.buttonColor) blocked.push("buttonColor");
  if (patch.position !== undefined && !allowed.positions.includes(patch.position)) blocked.push("position");
  if (patch.label !== undefined && !allowed.label) blocked.push("label");
  if (patch.animation !== undefined && !allowed.animations.includes(patch.animation)) blocked.push("animation");
  if (patch.headerText !== undefined && !allowed.headerText) blocked.push("headerText");
  if (patch.showBadge === false && !allowed.hideBadge) blocked.push("showBadge");
  return blocked;
}

/** The `widget_configs` columns for the fields that were sent, and no others. */
export function toColumns(patch: UpdateConfigInput): Record<string, string | boolean> {
  const columns: Record<string, string | boolean> = {};
  if (patch.buttonColor !== undefined) columns.button_color = patch.buttonColor;
  if (patch.position !== undefined) columns.position = patch.position;
  if (patch.label !== undefined) columns.label = patch.label;
  if (patch.animation !== undefined) columns.animation = patch.animation;
  if (patch.headerText !== undefined) columns.header_text = patch.headerText;
  if (patch.showBadge !== undefined) columns.show_badge = patch.showBadge;
  return columns;
}

const CONFIG_COLUMNS = "button_color, position, label, animation, header_text, show_badge";

type ConfigRow = {
  button_color: string;
  position: string;
  label: string;
  animation: string;
  header_text: string;
  show_badge: boolean;
};

const toConfig = (row: ConfigRow): WidgetConfig => ({
  buttonColor: row.button_color,
  position: row.position as WidgetConfig["position"],
  label: row.label,
  animation: row.animation as WidgetConfig["animation"],
  headerText: row.header_text,
  showBadge: row.show_badge,
});

/**
 * Saves the sent fields of a project's widget config and returns the saved config as visitors will see it for
 * this plan. Owners can't write `widget_configs` under RLS, so this uses the service client: call it only after
 * the route has checked ownership and that the plan allows the change. Only the sent fields are written; the rest
 * keep their stored values. An upsert, so a project that somehow has no config row gets one.
 */
export async function saveWidgetConfig(projectId: string, patch: UpdateConfigInput, plan: Plan): Promise<WidgetConfig> {
  const { data, error } = await createServiceClient()
    .from("widget_configs")
    .upsert({ project_id: projectId, ...toColumns(patch) }, { onConflict: "project_id" })
    .select(CONFIG_COLUMNS)
    .single();

  if (error) throw new Error(`Could not save the widget config: ${error.message}`);
  return applyPlan(toConfig(data), plan);
}

/** The customize limits of a plan, for the route. */
export const customizeLimits = (plan: Plan): Customize => PLAN_LIMITS[plan].customize;
