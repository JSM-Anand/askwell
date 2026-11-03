import "server-only";
import type { ConversationSummary } from "@askwell/shared";
import { toConversationSummary } from "../../../lib/conversations/map";
import type { ActivityRow } from "../../../lib/conversations/map";
import { createOwnerClient } from "../../../lib/supabase/owner";

export type ConversationsData = {
  projects: { id: string; name: string }[];
  selected: { id: string; name: string } | null;
  conversations: ConversationSummary[];
};

/**
 * What the Conversations page shows first, read through the owner client, so RLS scopes every query to the
 * signed-in owner. With one project it is used; with several, `?project=` picks one (an unknown ID falls back to
 * the first, never to another owner's project, which RLS would not list anyway).
 */
export async function loadConversations(requestedProjectId: string | undefined): Promise<ConversationsData> {
  const db = createOwnerClient();

  const projects = await db.from("projects").select("id, name").order("created_at", { ascending: true });
  if (projects.error) throw new Error(`Could not read the projects: ${projects.error.message}`);
  const list = projects.data ?? [];
  const selected = list.find((project) => project.id === requestedProjectId) ?? list[0] ?? null;
  if (!selected) return { projects: list, selected: null, conversations: [] };

  const activity = await db.rpc("owner_activity", { p_project_id: selected.id });
  if (activity.error) throw new Error(`Could not read the conversations: ${activity.error.message}`);

  return {
    projects: list,
    selected,
    conversations: ((activity.data ?? []) as ActivityRow[]).map(toConversationSummary),
  };
}
