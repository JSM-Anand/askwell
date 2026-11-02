import type { ProjectSummary } from "@askwell/shared";

/** The `projects` columns a ProjectSummary needs. */
export const PROJECT_COLUMNS = "id, name, public_key, messages_used, period_start, created_at";

export type ProjectRow = {
  id: string;
  name: string;
  public_key: string;
  messages_used: number;
  period_start: string;
  created_at: string;
};

export function toProjectSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    messagesUsed: row.messages_used,
    periodStart: row.period_start,
    createdAt: row.created_at,
  };
}
