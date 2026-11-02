import "server-only";
import type { KnowledgeSourceSummary, Plan } from "@askwell/shared";
import { getAccount } from "../../../lib/accounts/get-account";
import { createOwnerClient } from "../../../lib/supabase/owner";
import { SOURCE_COLUMNS, toSourceSummary } from "../../../components/knowledge/source-summary";

export type KnowledgeData = {
  projects: { id: string; name: string }[];
  selected: { id: string; name: string } | null;
  plan: Plan;
  sources: KnowledgeSourceSummary[];
};

/**
 * What the Knowledge page shows, read through the owner client, so RLS scopes every query to the signed-in
 * owner. With one project it is used; with several, `?project=` picks one (an unknown ID falls back to the
 * first, never to another owner's project, which RLS would not show anyway).
 */
export async function loadKnowledge(requestedProjectId: string | undefined): Promise<KnowledgeData> {
  const db = createOwnerClient();

  const projects = await db.from("projects").select("id, name").order("created_at", { ascending: true });
  if (projects.error) throw new Error(`Could not read the projects: ${projects.error.message}`);
  const list = projects.data ?? [];
  const selected = list.find((project) => project.id === requestedProjectId) ?? list[0] ?? null;

  const account = await getAccount();
  const plan: Plan = account?.plan ?? "free";
  if (!selected) return { projects: list, selected: null, plan, sources: [] };

  const sources = await db
    .from("knowledge_sources")
    .select(SOURCE_COLUMNS)
    .eq("project_id", selected.id)
    .order("created_at", { ascending: false });
  if (sources.error) throw new Error(`Could not read the sources: ${sources.error.message}`);

  return { projects: list, selected, plan, sources: (sources.data ?? []).map(toSourceSummary) };
}
