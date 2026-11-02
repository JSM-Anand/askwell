import type { KnowledgeSourceSummary } from "@askwell/shared";

/** The `knowledge_sources` columns the page reads. */
export const SOURCE_COLUMNS = "id, title, type, status, created_at";

export type SourceRow = { id: string; title: string; type: string; status: string; created_at: string };

export const toSourceSummary = (row: SourceRow): KnowledgeSourceSummary => ({
  id: row.id,
  title: row.title,
  type: row.type as KnowledgeSourceSummary["type"],
  status: row.status as KnowledgeSourceSummary["status"],
  createdAt: row.created_at,
});
