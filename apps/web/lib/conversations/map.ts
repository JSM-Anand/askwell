import { MESSAGE_ROLES } from "@askwell/shared";
import type { ConversationMessage, ConversationSummary, MessageRole } from "@askwell/shared";

/** Characters of the first visitor message shown in the list. The same length `owner_activity` cuts to. */
export const PREVIEW_LENGTH = 140;

/** A row of `owner_activity`. The generated type has `first_message_preview` as `string` (the generator can't say null), but it is null when there is no visitor message. */
export type ActivityRow = {
  id: string;
  visitor_id: string;
  created_at: string;
  message_count: number | string;
  first_message_preview: string | null;
};

export type ConversationRow = { id: string; visitor_id: string; created_at: string };
export type MessageRow = { id: string; role: string; body: string; created_at: string };

/** One list entry from an `owner_activity` row. */
export function toConversationSummary(row: ActivityRow): ConversationSummary {
  return {
    id: row.id,
    visitorId: row.visitor_id,
    createdAt: row.created_at,
    // PostgREST sends bigint as a number; accept a numeric string too.
    messageCount: Number(row.message_count),
    firstMessagePreview: row.first_message_preview ?? null,
  };
}

const isRole = (value: string): value is MessageRole => (MESSAGE_ROLES as readonly string[]).includes(value);

/** One message of a thread. A role the contract doesn't know is a data problem, not something to pass on. */
export function toMessage(row: MessageRow): ConversationMessage {
  if (!isRole(row.role)) throw new Error(`Unknown message role "${row.role}"`);
  return { id: row.id, role: row.role, body: row.body, createdAt: row.created_at };
}

/**
 * The first `PREVIEW_LENGTH` characters of a message. Counted in characters (code points), not UTF-16 units,
 * so an emoji is one character here, as in Postgres' `left()`.
 */
export const previewOf = (body: string): string => Array.from(body).slice(0, PREVIEW_LENGTH).join("");

/**
 * The summary of an opened conversation, built from the messages already read (oldest first): the count is
 * how many there are, the preview comes from the earliest visitor message, and is null if there is none.
 */
export function summarizeThread(conversation: ConversationRow, messages: ConversationMessage[]): ConversationSummary {
  const firstVisitor = messages.find((message) => message.role === "visitor");
  return {
    id: conversation.id,
    visitorId: conversation.visitor_id,
    createdAt: conversation.created_at,
    messageCount: messages.length,
    firstMessagePreview: firstVisitor ? previewOf(firstVisitor.body) : null,
  };
}
