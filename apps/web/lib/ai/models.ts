/**
 * Embeddings: one model for chunks and questions. 1536 dimensions matches the
 * `knowledge_chunks.embedding vector(1536)` column.
 * gemini-embedding-2 is Google's current stable embedding model. Its output size is
 * flexible (128-3072, 1536 is one of the recommended sizes) and it normalises truncated
 * vectors itself. It has no `task_type` setting: the task goes in the text (see embed.ts).
 * Source: https://ai.google.dev/gemini-api/docs/embeddings
 */
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * The chat model for answers: the cheapest current stable Flash-Lite model, and free of
 * charge on the free tier (paid: $0.25 / $1.50 per million input / output tokens;
 * gemini-3.5-flash-lite costs $0.30 / $2.50).
 * Sources: https://ai.google.dev/gemini-api/docs/models and
 * https://ai.google.dev/gemini-api/docs/pricing
 */
export const CHAT_MODEL = "gemini-3.1-flash-lite";
