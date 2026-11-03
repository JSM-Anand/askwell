import "server-only";
import { geminiApiKey } from "../ai/api-key";
import { embedTexts } from "../ai/embed";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../ai/models";
import { createServiceClient } from "../supabase/service";
import { chunkText } from "./chunk";

/** Chunks embedded and stored per round trip, so a large document never holds all its vectors at once. */
export const STORE_BATCH_SIZE = 50;

export type ProcessSourceInput = { sourceId: string; projectId: string; text: string };

/**
 * Turns a source's text into stored chunks and marks the source `ready`: chunk,
 * embed, insert (project_id + source_id), then set the status. It runs with the
 * service client, so the caller must already have checked that the project is
 * the owner's. If anything fails, the source's chunks are deleted, the source is
 * set to `failed`, and the original error is thrown.
 */
export async function processSource({ sourceId, projectId, text }: ProcessSourceInput): Promise<{ chunks: number }> {
  // One line per run, so a failing deployment shows what it was set up with. Never the key itself.
  console.info(
    `Processing source: embedding model ${EMBEDDING_MODEL}, ${EMBEDDING_DIMENSIONS} dimensions, GEMINI_API_KEY ${
      geminiApiKey() ? "set" : "missing"
    }`,
  );
  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("The source has no text to process");

    const db = createServiceClient();
    for (let start = 0; start < chunks.length; start += STORE_BATCH_SIZE) {
      const batch = chunks.slice(start, start + STORE_BATCH_SIZE);
      const vectors = await embedTexts(batch);
      const { error } = await db.from("knowledge_chunks").insert(
        batch.map((content, i) => ({
          project_id: projectId,
          source_id: sourceId,
          content,
          // pgvector takes the vector as "[0.1,0.2,...]".
          embedding: JSON.stringify(vectors[i]),
        })),
      );
      if (error) throw new Error(`Could not store chunks: ${error.message}`);
    }

    const { error } = await db
      .from("knowledge_sources")
      .update({ status: "ready" })
      .eq("id", sourceId)
      .eq("project_id", projectId);
    if (error) throw new Error(`Could not mark the source ready: ${error.message}`);
    return { chunks: chunks.length };
  } catch (cause) {
    await markSourceFailed({ sourceId, projectId });
    throw cause;
  }
}

/**
 * Deletes a source's chunks and sets it to `failed`. `processSource` calls it
 * on any error; the routes call it when a file can't be read at all. It never
 * throws: a failure here is logged so the caller's original error is the one
 * that surfaces.
 */
export async function markSourceFailed({ sourceId, projectId }: Pick<ProcessSourceInput, "sourceId" | "projectId">): Promise<void> {
  try {
    const db = createServiceClient();
    const removed = await db.from("knowledge_chunks").delete().eq("source_id", sourceId).eq("project_id", projectId);
    if (removed.error) console.error("Could not delete chunks of a failed source", removed.error.message);
    const updated = await db
      .from("knowledge_sources")
      .update({ status: "failed" })
      .eq("id", sourceId)
      .eq("project_id", projectId);
    if (updated.error) console.error("Could not mark the source failed", updated.error.message);
  } catch (cause) {
    console.error("Could not clean up a failed source", cause);
  }
}
