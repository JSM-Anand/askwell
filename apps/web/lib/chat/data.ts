import "server-only";
import { PLANS } from "@askwell/shared";
import type { Plan } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";

/** Chunks fetched for a question, and past messages sent as history (project.md §6.6). */
export const MATCH_COUNT = 5;
export const HISTORY_MESSAGES = 6;

export type ChatProject = { id: string; ownerId: string; plan: Plan };
export type Excerpt = { content: string };
export type HistoryMessage = { role: "visitor" | "bot"; body: string };

const isPlan = (value: unknown): value is Plan =>
  typeof value === "string" && (PLANS as readonly string[]).includes(value);

function fail(what: string, error: { message: string }): never {
  throw new Error(`Chat: could not ${what}: ${error.message}`);
}

/**
 * The project for a public key and its owner's plan, or null. Public route, so there is no owner:
 * the lookup is by `public_key` only and selects nothing else about the project except its owner, whose ID is the analytics distinct ID. An unknown plan
 * counts as Free.
 */
export async function findProject(publicKey: string): Promise<ChatProject | null> {
  const { data, error } = await createServiceClient()
    .from("projects")
    .select("id, owner_id, accounts(plan)")
    .eq("public_key", publicKey)
    .maybeSingle();
  if (error) fail("read the project", error);
  if (!data) return null;
  return { id: data.id, ownerId: data.owner_id, plan: isPlan(data.accounts?.plan) ? data.accounts.plan : "free" };
}

/** True only when the conversation belongs to this project. */
export async function conversationBelongsToProject(conversationId: string, projectId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) fail("read the conversation", error);
  return data !== null;
}

/** The last HISTORY_MESSAGES messages of an already verified conversation, oldest first. */
export async function loadHistory(conversationId: string): Promise<HistoryMessage[]> {
  const { data, error } = await createServiceClient()
    .from("messages")
    .select("role, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_MESSAGES);
  if (error) fail("read the conversation history", error);
  return (data ?? [])
    .map(({ role, body }) => ({ role: role === "bot" ? ("bot" as const) : ("visitor" as const), body }))
    .reverse();
}

/** Counts one message against the monthly quota. False means the quota is used up (nothing changed). */
export async function consumeMessage(projectId: string, limit: number): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("consume_message", { p_project_id: projectId, p_limit: limit });
  if (error) fail("count the message", error);
  return data === true;
}

/** The closest chunks of this project's ready sources, best first. */
export async function findExcerpts(projectId: string, embedding: number[]): Promise<Excerpt[]> {
  const { data, error } = await createServiceClient().rpc("match_chunks", {
    p_project_id: projectId,
    p_embedding: JSON.stringify(embedding), // pgvector reads its text form
    p_count: MATCH_COUNT,
  });
  if (error) fail("search the knowledge", error);
  return (data ?? []).map(({ content }) => ({ content }));
}

/** Stores the visitor's message and the reply; a null conversation id starts a conversation. Returns its id. */
export async function saveTurn(input: {
  projectId: string;
  conversationId: string | undefined;
  visitorId: string;
  message: string;
  reply: string;
}): Promise<string> {
  const { data, error } = await createServiceClient().rpc("save_chat_turn", {
    p_project_id: input.projectId,
    // The generated type can't say the argument may be null; the function creates a conversation for null.
    p_conversation_id: (input.conversationId ?? null) as unknown as string,
    p_visitor_id: input.visitorId,
    p_visitor_message: input.message,
    p_bot_reply: input.reply,
  });
  if (error || typeof data !== "string") fail("save the conversation", error ?? { message: "no conversation id returned" });
  return data;
}

/**
 * True when this conversation is the project's earliest one, i.e. the save that just created it made
 * the project's first ever conversation. Comparing with the earliest row (not counting) keeps it
 * exactly once even when two first chats race.
 */
export async function isFirstConversation(projectId: string, conversationId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) fail("read the first conversation", error);
  return data?.id === conversationId;
}
