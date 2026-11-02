import type { NextResponse } from "next/server";
import { uploadUrlSchema } from "@askwell/shared";
import type { UploadUrlResponse } from "@askwell/shared";
import { apiError, json, readJson } from "../../../../../../lib/projects/api";
import { createServiceClient } from "../../../../../../lib/supabase/service";
import {
  KNOWLEDGE_BUCKET,
  STALE_UPLOAD_MS,
  loadOwnerContext,
  removeFiles,
  reserveSource,
  toSourceSummary,
} from "../knowledge-api";

type Context = { params: Promise<{ id: string }> };

/** Files of this project's reservations that were never finalized: remove them from Storage (best effort). */
async function removeStaleUploads(projectId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
    const { data, error } = await createServiceClient()
      .from("knowledge_sources")
      .select("storage_key")
      .eq("project_id", projectId)
      .eq("status", "uploading")
      .lt("created_at", cutoff)
      .not("storage_key", "is", null);
    if (error) throw new Error(error.message);
    await removeFiles((data ?? []).flatMap((row) => (row.storage_key ? [row.storage_key] : [])));
  } catch (cause) {
    console.error("Could not clean up stale uploads", cause);
  }
}

/** POST /api/projects/:id/knowledge/upload-url: reserve a file source and return a one-time signed upload URL. */
export async function POST(request: Request, { params }: Context): Promise<NextResponse> {
  try {
    const ctx = await loadOwnerContext(params);
    if ("response" in ctx) return ctx.response;

    // The schema checks the declared type (pdf, md, txt) and size (up to 10 MB); the bucket enforces both again.
    const input = uploadUrlSchema.safeParse(await readJson(request));
    if (!input.success) {
      return apiError("invalid_input", "Send a title, a file type (pdf, md or txt) and a size up to 10 MB.");
    }

    // The database reclaims the rows of dead reservations when it reserves; their files are ours to remove.
    await removeStaleUploads(ctx.projectId);

    const reserved = await reserveSource(ctx, input.data.title, input.data.fileType);
    if ("response" in reserved) return reserved.response;
    const { source } = reserved;

    const db = createServiceClient();
    const signed = source.storage_key
      ? await db.storage.from(KNOWLEDGE_BUCKET).createSignedUploadUrl(source.storage_key)
      : null;
    if (!signed || signed.error || !signed.data) {
      // No URL to hand out: give the slot back rather than leave a reservation nobody can finalize.
      await db.from("knowledge_sources").delete().eq("id", source.id).eq("project_id", ctx.projectId);
      throw new Error(`Could not sign an upload URL: ${signed?.error?.message ?? "no storage key"}`);
    }

    return json<UploadUrlResponse>({ source: toSourceSummary(source), uploadUrl: signed.data.signedUrl }, 201);
  } catch (cause) {
    console.error("POST /api/projects/:id/knowledge/upload-url failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}
