import type { NextResponse } from "next/server";
import { idParamSchema, renameProjectSchema } from "@askwell/shared";
import type { DeleteProjectResponse, RenameProjectResponse } from "@askwell/shared";
import { apiError, getUserId, json, readJson, unauthorized } from "../../../../lib/projects/api";
import { PROJECT_COLUMNS, toProjectSummary } from "../../../../lib/projects/to-summary";
import { createOwnerClient } from "../../../../lib/supabase/owner";

type Context = { params: Promise<{ id: string }> };

const notFound = () => apiError("not_found", "No project with that ID.");

// Both handlers go through the owner client, so RLS decides what the owner may
// touch: another owner's project and a missing one both come back as 404.

export async function PATCH(request: Request, { params }: Context): Promise<NextResponse> {
  if (!(await getUserId())) return unauthorized();

  const id = idParamSchema.safeParse(await params);
  if (!id.success) return apiError("invalid_input", "The project ID is not valid.");
  const input = renameProjectSchema.safeParse(await readJson(request));
  if (!input.success) return apiError("invalid_input", "Send a project name of 1 to 100 characters.");

  try {
    const { data, error } = await createOwnerClient()
      .from("projects")
      .update({ name: input.data.name })
      .eq("id", id.data.id)
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return notFound();
    return json<RenameProjectResponse>({ project: toProjectSummary(data) });
  } catch (cause) {
    console.error("PATCH /api/projects/:id failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}

export async function DELETE(_request: Request, { params }: Context): Promise<NextResponse> {
  if (!(await getUserId())) return unauthorized();

  const id = idParamSchema.safeParse(await params);
  if (!id.success) return apiError("invalid_input", "The project ID is not valid.");

  try {
    // The database cascades to the project's config, sources, chunks and conversations.
    const { data, error } = await createOwnerClient()
      .from("projects")
      .delete()
      .eq("id", id.data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return notFound();
    return json<DeleteProjectResponse>({ ok: true });
  } catch (cause) {
    console.error("DELETE /api/projects/:id failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}
