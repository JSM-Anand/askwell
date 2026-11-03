import "server-only";
import type { Plan, WidgetConfig } from "@askwell/shared";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { getAccount } from "../../../lib/accounts/get-account";
import { createOwnerClient } from "../../../lib/supabase/owner";
import { applyPlan } from "../../../lib/widget-config/apply-plan";

export type CustomizeData = {
  projects: { id: string; name: string }[];
  selected: { id: string; name: string } | null;
  plan: Plan;
  /** The config as visitors see it now: stored values, with what the plan doesn't allow shown as the default. */
  config: WidgetConfig;
};

/**
 * What the Customize page shows first, read through the owner client, so RLS scopes every query to the signed-in
 * owner. With one project it is used; with several, `?project=` picks one (an unknown ID falls back to the first,
 * never to another owner's project, which RLS would not list anyway). The plan comes from the database.
 */
export async function loadCustomize(requestedProjectId: string | undefined): Promise<CustomizeData> {
  const db = createOwnerClient();

  const projects = await db.from("projects").select("id, name").order("created_at", { ascending: true });
  if (projects.error) throw new Error(`Could not read the projects: ${projects.error.message}`);
  const list = projects.data ?? [];
  const selected = list.find((project) => project.id === requestedProjectId) ?? list[0] ?? null;

  const account = await getAccount();
  const plan: Plan = account?.plan ?? "free";
  if (!selected) return { projects: list, selected: null, plan, config: DEFAULT_WIDGET_CONFIG };

  const row = await db
    .from("widget_configs")
    .select("button_color, position, label, animation, header_text, show_badge")
    .eq("project_id", selected.id)
    .maybeSingle();
  if (row.error) throw new Error(`Could not read the widget config: ${row.error.message}`);

  const stored: WidgetConfig = row.data
    ? {
        buttonColor: row.data.button_color,
        position: row.data.position as WidgetConfig["position"],
        label: row.data.label,
        animation: row.data.animation as WidgetConfig["animation"],
        headerText: row.data.header_text,
        showBadge: row.data.show_badge,
      }
    : DEFAULT_WIDGET_CONFIG;

  return { projects: list, selected, plan, config: applyPlan(stored, plan) };
}
