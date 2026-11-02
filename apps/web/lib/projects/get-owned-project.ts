import "server-only";
import type { ProjectSummary } from "@askwell/shared";
import { createOwnerClient } from "../supabase/owner";
import { PROJECT_COLUMNS, toProjectSummary } from "./to-summary";

/**
 * The project with this ID if the signed-in owner owns it, otherwise null. It
 * reads through the owner client, so RLS decides: a missing project and
 * another owner's project look the same. Call it before any service-client
 * write on a project.
 */
export async function getOwnedProject(id: string): Promise<ProjectSummary | null> {
  const { data, error } = await createOwnerClient()
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read the project: ${error.message}`);
  }
  return data ? toProjectSummary(data) : null;
}
