import type { NextResponse } from "next/server";
import { idParamSchema } from "@askwell/shared";
import type { DeleteKnowledgeResponse } from "@askwell/shared";
import { apiError, getUserId, json, unauthorized } from "../../../../lib/projects/api";
import { createOwnerClient } from "../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../lib/supabase/service";
import { KNOWLEDGE_BUCKET } from "../../projects/[id]/knowledge/knowledge-api";

type Context = { params: Promise<{ id: string }> };

/** DELETE /api/knowledge/:id: delete a source, its file and (by cascade) its chunks. */
export async function DELETE(_request: Request, { params }: Context): Promise<NextResponse> {
  if (!(await getUserId())) return unauthorized();

  const id = idParamSchema.safeParse(await params);
  if (!id.success) return apiError("invalid_input", "The source ID is not valid.");

  try {
    // Ownership first, through the owner client: RLS shows a source only to the owner of its project,
    // so another owner's source and a missing one are both a 404.
    const owned = await createOwnerClient()
      .from("knowledge_sources")
      .select("id, project_id, storage_key")
      .eq("id", id.data.id)
      .maybeSingle();
    if (owned.error) throw new Error(owned.error.message);
    if (!owned.data) return apiError("not_found", "No source with that ID.");
    const { project_id: projectId, storage_key: storageKey } = owned.data;

    // Only now the service client. The file goes first: if it can't be removed, the row stays and the delete can be retried.
    const db = createServiceClient();
    if (storageKey) {
      const removed = await db.storage.from(KNOWLEDGE_BUCKET).remove([storageKey]);
      if (removed.error) throw new Error(`Could not delete the file: ${removed.error.message}`);
    }
    const deleted = await db.from("knowledge_sources").delete().eq("id", id.data.id).eq("project_id", projectId);
    if (deleted.error) throw new Error(deleted.error.message);

    return json<DeleteKnowledgeResponse>({ ok: true });
  } catch (cause) {
    console.error("DELETE /api/knowledge/:id failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}
