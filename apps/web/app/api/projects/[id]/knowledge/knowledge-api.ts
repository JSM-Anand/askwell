import "server-only";
import { PLAN_LIMITS, idParamSchema } from "@askwell/shared";
import type { KnowledgeSourceSummary, Plan } from "@askwell/shared";
import { getAccount } from "../../../../../lib/accounts/get-account";
import { getOwnedProject } from "../../../../../lib/projects/get-owned-project";
import { apiError, getUserId, unauthorized } from "../../../../../lib/projects/api";
import { createServiceClient } from "../../../../../lib/supabase/service";

/** The private Storage bucket (created by the knowledge_chat migration). */
export const KNOWLEDGE_BUCKET = "knowledge";

/** An `uploading` reservation older than this is dead; the database reclaims its row. */
export const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;

// Error codes of reserve_knowledge_source (supabase/migrations/*_knowledge_chat.sql).
const SOURCE_LIMIT_REACHED = "AW003";
const PROJECT_NOT_FOUND = "AW004";

/** The columns of a source that the routes read back. */
export const SOURCE_COLUMNS = "id, project_id, title, type, status, storage_key, created_at";

export type SourceRow = {
  id: string;
  project_id: string;
  title: string;
  type: string;
  status: string;
  storage_key: string | null;
  created_at: string;
};

export type OwnerContext = { projectId: string; plan: Plan; limit: number };

type Response = ReturnType<typeof apiError>;

/**
 * The checks every project-scoped knowledge route starts with: a signed-in
 * user, a valid project ID, a project this owner owns (RLS decides, so another
 * owner's project is a 404), and the plan from the database. Everything after
 * this may use the service client.
 */
export async function loadOwnerContext(params: Promise<{ id: string }>): Promise<{ response: Response } | OwnerContext> {
  if (!(await getUserId())) return { response: unauthorized() };

  const id = idParamSchema.safeParse(await params);
  if (!id.success) return { response: apiError("invalid_input", "The project ID is not valid.") };

  if (!(await getOwnedProject(id.data.id))) {
    return { response: apiError("not_found", "No project with that ID.") };
  }

  const account = await getAccount();
  if (!account) throw new Error("No account row for an owner who owns a project");
  return { projectId: id.data.id, plan: account.plan, limit: PLAN_LIMITS[account.plan].knowledgeSources };
}

export const toSourceSummary = (row: SourceRow, status = row.status): KnowledgeSourceSummary => ({
  id: row.id,
  title: row.title,
  type: row.type as KnowledgeSourceSummary["type"],
  status: status as KnowledgeSourceSummary["status"],
  createdAt: row.created_at,
});

/**
 * Claims a source slot under the plan's limit (the database locks the project,
 * so two reserves can't both pass). The limit comes from PLAN_LIMITS for the
 * plan read from the database, never from the request.
 */
export async function reserveSource(
  ctx: OwnerContext,
  title: string,
  type: string,
): Promise<{ response: Response } | { source: SourceRow }> {
  const { data, error } = await createServiceClient().rpc("reserve_knowledge_source", {
    p_project_id: ctx.projectId,
    p_title: title,
    p_type: type,
    p_max_sources: ctx.limit,
  });

  if (error) {
    if (error.code === SOURCE_LIMIT_REACHED) {
      return {
        response: apiError(
          "limit_reached",
          `Your ${ctx.plan === "free" ? "Free" : "Pro"} plan allows ${ctx.limit} knowledge source${ctx.limit === 1 ? "" : "s"} per project.`,
        ),
      };
    }
    if (error.code === PROJECT_NOT_FOUND) return { response: apiError("not_found", "No project with that ID.") };
    throw new Error(`reserve_knowledge_source failed: ${error.code} ${error.message}`);
  }
  return { source: data as SourceRow };
}

/** Best effort: a Storage failure here must never fail the request that called it. */
export async function removeFiles(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const { error } = await createServiceClient().storage.from(KNOWLEDGE_BUCKET).remove(keys);
    if (error) console.error("Could not remove files from Storage", error.message);
  } catch (cause) {
    console.error("Could not remove files from Storage", cause);
  }
}
