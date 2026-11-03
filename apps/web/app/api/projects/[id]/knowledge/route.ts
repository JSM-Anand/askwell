import type { NextResponse } from "next/server";
import { pasteKnowledgeSchema } from "@askwell/shared";
import type { PasteKnowledgeResponse } from "@askwell/shared";
import { trackKnowledgeAdded } from "../../../../../lib/analytics/events";
import { processSource } from "../../../../../lib/knowledge/process-source";
import { apiError, getUserId, json, readJson } from "../../../../../lib/projects/api";
import { loadOwnerContext, reserveSource, toSourceSummary } from "./knowledge-api";

// Processing runs inside the request. 300 s is the most a Hobby plan allows (and Vercel's default
// with fluid compute); Pro could go to 800 s. Source: https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

/** POST /api/projects/:id/knowledge: paste text with a title, then process it. */
export async function POST(request: Request, { params }: Context): Promise<NextResponse> {
  try {
    const ctx = await loadOwnerContext(params);
    if ("response" in ctx) return ctx.response;

    const input = pasteKnowledgeSchema.safeParse(await readJson(request));
    if (!input.success) return apiError("invalid_input", "Send a title and the text to add.");

    const reserved = await reserveSource(ctx, input.data.title, "text");
    if ("response" in reserved) return reserved.response;
    const { source } = reserved;

    // processSource deletes the chunks and sets `failed` itself when anything goes wrong.
    let status = "ready";
    try {
      await processSource({ sourceId: source.id, projectId: ctx.projectId, text: input.data.content });
    } catch (cause) {
      console.error("Processing pasted text failed", cause);
      status = "failed";
    }
    if (status === "ready") {
      const ownerId = await getUserId();
      if (ownerId) await trackKnowledgeAdded(ownerId, { projectId: ctx.projectId, type: "text" });
    }
    return json<PasteKnowledgeResponse>({ source: toSourceSummary(source, status) }, 201);
  } catch (cause) {
    console.error("POST /api/projects/:id/knowledge failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}
