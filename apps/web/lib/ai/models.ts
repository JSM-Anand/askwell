/** Embeddings: one model for chunks and questions. 1536 dimensions matches the `knowledge_chunks.embedding vector(1536)` column. */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * The chat model for answers: OpenAI's most efficient current model for focused,
 * high-volume tasks ($0.1 / $0.5 per million input / output tokens). OpenAI no
 * longer ships a "mini" at the top of its lineup: the newest is gpt-5.4-mini,
 * and its current docs name GPT-6 Luna for cost-sensitive work.
 * Source: https://developers.openai.com/api/docs/models (Choosing a model).
 */
export const CHAT_MODEL = "gpt-6-luna";
