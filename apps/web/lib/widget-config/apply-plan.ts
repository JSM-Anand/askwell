import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS } from "@askwell/shared";
import type { Plan, WidgetConfig } from "@askwell/shared";

/**
 * Keeps only the customizations the plan allows (project.md §5). Every field
 * the plan doesn't allow falls back to the default, so a project that was Pro
 * and is now Free shows the defaults and the "Powered by" badge. The plan must
 * come from the database, never from the client.
 */
export function applyPlan(config: WidgetConfig, plan: Plan): WidgetConfig {
  const allowed = PLAN_LIMITS[plan].customize;
  const defaults = DEFAULT_WIDGET_CONFIG;

  return {
    buttonColor: allowed.buttonColor ? config.buttonColor : defaults.buttonColor,
    position: allowed.positions.includes(config.position) ? config.position : defaults.position,
    label: allowed.label ? config.label : defaults.label,
    animation: allowed.animations.includes(config.animation) ? config.animation : defaults.animation,
    headerText: allowed.headerText ? config.headerText : defaults.headerText,
    showBadge: allowed.hideBadge ? config.showBadge : defaults.showBadge,
  };
}
