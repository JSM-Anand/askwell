import "server-only";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models";
import { getOpenAI } from "./openai";

/**
 * Texts per request. OpenAI accepts up to 2,048 inputs and 300,000 tokens per
 * embeddings request; chunks are a few hundred tokens, so 100 stays well inside both.
 */
export const EMBEDDING_BATCH_SIZE = 100;

/**
 * Embeds each text and returns the vectors in the same order. Texts are sent in
 * batches; every vector is checked to be EMBEDDING_DIMENSIONS long, because the
 * database column would reject anything else. An API error is thrown as is.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.some((text) => text.trim() === "")) {
    throw new Error("Cannot embed an empty text");
  }

  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await getOpenAI().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    });

    if (response.data.length !== batch.length) {
      throw new Error(`Expected ${batch.length} embeddings, got ${response.data.length}`);
    }
    // `index` ties each vector to its input, so order doesn't depend on the response order.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    for (const { embedding } of ordered) {
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`);
      }
      vectors.push(embedding);
    }
  }
  return vectors;
}
