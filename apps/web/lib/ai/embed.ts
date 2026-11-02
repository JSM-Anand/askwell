import "server-only";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models";
import { getGemini } from "./gemini";
import { withRateLimitRetry } from "./rate-limit";

/** Texts per request. Chunks are a few hundred tokens, so 100 stays well inside the input limits. */
export const EMBEDDING_BATCH_SIZE = 100;

// gemini-embedding-2 has no task_type setting: the task is part of the text. These are Google's
// documented formats for asymmetric retrieval (stored documents vs. questions). Callers never see them.
// https://ai.google.dev/gemini-api/docs/embeddings#specify-task-type-to-improve-performance
const formatDocument = (text: string) => `title: none | text: ${text}`;
const formatQuery = (text: string) => `task: question answering | query: ${text}`;

const assertNotEmpty = (text: string) => {
  if (text.trim() === "") throw new Error("Cannot embed an empty text");
};

/**
 * One request for one batch. Each input is its own Content object: a plain list of strings would
 * be aggregated into a single vector. Gemini returns the vectors in the order of the inputs, and
 * the database column would reject any other length, so both the count and the size are checked.
 * gemini-embedding-2 normalises truncated vectors itself, so there is nothing to normalise here.
 */
async function embedBatch(inputs: string[]): Promise<number[][]> {
  const response = await withRateLimitRetry(() =>
    getGemini().models.embedContent({
      model: EMBEDDING_MODEL,
      contents: inputs.map((text) => ({ parts: [{ text }] })),
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    }),
  );

  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== inputs.length) {
    throw new Error(`Expected ${inputs.length} embeddings, got ${embeddings.length}`);
  }
  return embeddings.map(({ values }) => {
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${values?.length ?? 0}`);
    }
    return values;
  });
}

/**
 * Embeds each text to be stored (a knowledge chunk) and returns the vectors in the same order.
 * Texts are sent in batches; every vector is checked to be EMBEDDING_DIMENSIONS long. A rate limit
 * (429) is retried once, then thrown as an AiRateLimitError; any other API error is thrown as is.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  texts.forEach(assertNotEmpty);

  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    vectors.push(...(await embedBatch(batch.map(formatDocument))));
  }
  return vectors;
}

/** Embeds a visitor's question for searching the stored chunks. */
export async function embedQuery(text: string): Promise<number[]> {
  assertNotEmpty(text);
  const [vector] = await embedBatch([formatQuery(text)]);
  if (!vector) throw new Error("Expected 1 embedding, got 0");
  return vector;
}
