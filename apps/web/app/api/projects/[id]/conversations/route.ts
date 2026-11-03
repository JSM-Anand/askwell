import type { NextResponse } from "next/server";
import { idParamSchema } from "@askwell/shared";
import type { ListConversationsResponse } from "@askwell/shared";
import { toConversationSummary } from "../../../../../lib/conversations/map";
import type { ActivityRow } from "../../../../../lib/conversations/map";
import { apiError, getUserId, json, unauthorized } from "../../../../../lib/projects/api";
import { getOwnedProject } from "../../../../../lib/projects/get-owned-project";
import { createOwnerClient } from "../../../../../lib/supabase/owner";

type Context = { params: Promise<{ id: string }> };

/** GET /api/projects/:id/conversations: the project's conversations, newest first, with count and preview. */
export async function GET(_request: Request, { params }: Context): Promise<NextResponse> {
  if (!(await getUserId())) return unauthorized();

  const id = idParamSchema.safeParse(await params);
  if (!id.success) return apiError("invalid_input", "The project ID is not valid.");

  try {
    // Ownership first: another owner's project, and a missing one, are both a 404.
    if (!(await getOwnedProject(id.data.id))) return apiError("not_found", "No project with that ID.");

    // owner_activity runs as the caller, so RLS scopes it again. The owner client only: no service client here.
    const { data, error } = await createOwnerClient().rpc("owner_activity", { p_project_id: id.data.id });
    if (error) throw new Error(`owner_activity failed: ${error.message}`);

    // The function already orders newest first; keep that order.
    return json<ListConversationsResponse>({ conversations: ((data ?? []) as ActivityRow[]).map(toConversationSummary) });
  } catch (cause) {
    console.error("GET /api/projects/:id/conversations failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}
