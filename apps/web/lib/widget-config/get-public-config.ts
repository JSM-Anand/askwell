import "server-only";
import { DEFAULT_WIDGET_CONFIG, PLANS, widgetConfigSchema } from "@askwell/shared";
import type { Plan, WidgetConfig } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";
import { applyPlan } from "./apply-plan";

const isPlan = (value: unknown): value is Plan =>
  typeof value === "string" && (PLANS as readonly string[]).includes(value);

/**
 * The plan-applied widget config for a public key, or null if no project has
 * that key. This is a public route, so there is no owner: it uses the service
 * client and looks the project up by `public_key` only. It selects the config
 * and the owner's plan and returns nothing else about the project.
 */
export async function getPublicConfig(publicKey: string): Promise<WidgetConfig | null> {
  const { data, error } = await createServiceClient()
    .from("projects")
    .select("widget_configs(button_color, position, label, animation, header_text, show_badge), accounts(plan)")
    .eq("public_key", publicKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read the widget config: ${error.message}`);
  }
  if (!data) return null;

  const row = data.widget_configs;
  const parsed = widgetConfigSchema.safeParse(
    row && {
      buttonColor: row.button_color,
      position: row.position,
      label: row.label,
      animation: row.animation,
      headerText: row.header_text,
      showBadge: row.show_badge,
    },
  );
  const config = parsed.success ? parsed.data : DEFAULT_WIDGET_CONFIG;

  // An unknown plan gets the least privilege.
  const plan: Plan = isPlan(data.accounts?.plan) ? data.accounts.plan : "free";
  return applyPlan(config, plan);
}
