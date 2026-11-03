import type { NextResponse } from "next/server";
import { KNOWLEDGE_FILE_TYPES, MAX_KNOWLEDGE_FILE_BYTES, finalizeKnowledgeSchema } from "@askwell/shared";
import type { FinalizeKnowledgeResponse, KnowledgeFileType } from "@askwell/shared";
import { trackKnowledgeAdded } from "../../../../../../lib/analytics/events";
import { ExtractError, extractText } from "../../../../../../lib/knowledge/extract";
import { markSourceFailed, processSource } from "../../../../../../lib/knowledge/process-source";
import { apiError, getUserId, json, readJson } from "../../../../../../lib/projects/api";
import { createServiceClient } from "../../../../../../lib/supabase/service";
import {
  KNOWLEDGE_BUCKET,
  SOURCE_COLUMNS,
  STALE_UPLOAD_MS,
  loadOwnerContext,
  removeFiles,
  toSourceSummary,
} from "../knowledge-api";
import type { SourceRow } from "../knowledge-api";

// Downloading, extracting, embedding and storing run inside the request. 300 s is the most a Hobby plan
// allows (and Vercel's default with fluid compute); Pro could go to 800 s.
// Source: https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

const isFileType = (type: string): type is KnowledgeFileType => (KNOWLEDGE_FILE_TYPES as readonly string[]).includes(type);

/** POST /api/projects/:id/knowledge/finalize: check the uploaded file, then process it. */
export async function POST(request: Request, { params }: Context): Promise<NextResponse> {
  try {
    const ctx = await loadOwnerContext(params);
    if ("response" in ctx) return ctx.response;

    const input = finalizeKnowledgeSchema.safeParse(await readJson(request));
    if (!input.success) return apiError("invalid_input", "Send the sourceId from the upload URL.");
    const sourceId = input.data.sourceId;

    const db = createServiceClient();

    // Claim the source once: only a fresh `uploading` source can become `processing`, and only one request wins.
    // "Fresh" is the same two-hour boundary the reserve function and the upload cleanup use: an older
    // reservation is dead, and its file may be removed at any moment, so it can't be claimed.
    const freshSince = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
    const claimed = await db
      .from("knowledge_sources")
      .update({ status: "processing" })
      .eq("id", sourceId)
      .eq("project_id", ctx.projectId)
      .eq("status", "uploading")
      .gte("created_at", freshSince)
      .select(SOURCE_COLUMNS)
      .maybeSingle();
    if (claimed.error) throw new Error(`Could not claim the source: ${claimed.error.message}`);
    const source: SourceRow | null = claimed.data;
    if (!source || !source.storage_key || !isFileType(source.type)) {
      return apiError("not_found", "No upload is waiting to be finalized for that ID.");
    }
    const { storage_key: key, type } = { storage_key: source.storage_key, type: source.type };

    /**
     * A file we won't keep: remove it from Storage, then drop its row (which frees the slot). The row goes only
     * after the file is gone, so a failed removal can't leave a file with no row; then the source is kept as
     * `failed` and the owner can delete it, which removes the file.
     */
    const refuse = async (code: "file_too_large" | "unsupported_file_type", message: string) => {
      if (!(await removeFiles([key]))) {
        await markSourceFailed({ sourceId, projectId: ctx.projectId });
        return apiError(code, message);
      }
      const deleted = await db.from("knowledge_sources").delete().eq("id", sourceId).eq("project_id", ctx.projectId);
      if (deleted.error) throw new Error(`Could not delete a refused source: ${deleted.error.message}`);
      return apiError(code, message);
    };
    /** Hand the claim back so the owner can upload the file and finalize again. A failed write is thrown, never ignored. */
    const release = async () => {
      const released = await db
        .from("knowledge_sources")
        .update({ status: "uploading" })
        .eq("id", sourceId)
        .eq("project_id", ctx.projectId)
        .eq("status", "processing");
      if (released.error) throw new Error(`Could not release the claim: ${released.error.message}`);
    };

    try {
      const download = await db.storage.from(KNOWLEDGE_BUCKET).download(key);
      if (download.error || !download.data) {
        await release();
        if (/not.?found/i.test(download.error?.message ?? "")) {
          return apiError("invalid_input", "The file has not been uploaded yet. Upload it, then finalize.");
        }
        // A Storage hiccup: the claim is released, so the owner can simply try again.
        console.error("Could not download the file", download.error?.message);
        return apiError("internal_error", "Something went wrong.");
      }

      // The real size, not the declared one.
      if (download.data.size > MAX_KNOWLEDGE_FILE_BYTES) {
        return await refuse("file_too_large", "The file is larger than 10 MB.");
      }

      let text: string;
      try {
        text = await extractText(new Uint8Array(await download.data.arrayBuffer()), type);
      } catch (cause) {
        if (cause instanceof ExtractError && cause.code === "not_a_pdf") {
          return await refuse("unsupported_file_type", "The file is not a PDF.");
        }
        if (!(cause instanceof ExtractError)) throw cause;
        // A file we can't read (damaged PDF, too many pages, no text, not UTF-8) is kept as a failed source.
        await markSourceFailed({ sourceId, projectId: ctx.projectId });
        return json<FinalizeKnowledgeResponse>({ source: toSourceSummary(source, "failed") });
      }

      // processSource deletes the chunks and sets `failed` itself when anything goes wrong.
      let status = "ready";
      try {
        await processSource({ sourceId, projectId: ctx.projectId, text });
      } catch (cause) {
        console.error("Processing an uploaded file failed", cause);
        status = "failed";
      }
      if (status === "ready") {
        const ownerId = await getUserId();
        if (ownerId) await trackKnowledgeAdded(ownerId, { projectId: ctx.projectId, type });
      }
      return json<FinalizeKnowledgeResponse>({ source: toSourceSummary(source, status) });
    } catch (cause) {
      // Anything unexpected after the claim: try to mark the source failed instead of leaving it in
      // `processing`. That write is best effort (it can fail too), so the request still ends in a 500.
      await markSourceFailed({ sourceId, projectId: ctx.projectId });
      throw cause;
    }
  } catch (cause) {
    console.error("POST /api/projects/:id/knowledge/finalize failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}
