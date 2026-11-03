import type { NextResponse } from "next/server";
import { idParamSchema } from "@askwell/shared";
import type { GetConversationResponse } from "@askwell/shared";
import { summarizeThread, toMessage } from "../../../../lib/conversations/map";
import { apiError, getUserId, json, unauthorized } from "../../../../lib/projects/api";
import { createOwnerClient } from "../../../../lib/supabase/owner";

type Context = { params: Promise<{ id: string }> };

/** GET /api/conversations/:id: one conversation with its messages, oldest first. */
export async function GET(_request: Request, { params }: Context): Promise<NextResponse> {
  if (!(await getUserId())) return unauthorized();

  const id = idParamSchema.safeParse(await params);
  if (!id.success) return apiError("invalid_input", "The conversation ID is not valid.");

  try {
    // Both reads go through the owner client, so RLS decides: another owner's conversation, and a missing
    // one, come back as no row and are a 404. No service client here.
    const db = createOwnerClient();
    const conversation = await db
      .from("conversations")
      .select("id, visitor_id, created_at")
      .eq("id", id.data.id)
      .maybeSingle();
    if (conversation.error) throw new Error(conversation.error.message);
    if (!conversation.data) return apiError("not_found", "No conversation with that ID.");

    // Oldest first; the id breaks a tie so the order is stable.
    const messages = await db
      .from("messages")
      .select("id, role, body, created_at")
      .eq("conversation_id", id.data.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (messages.error) throw new Error(messages.error.message);

    const thread = (messages.data ?? []).map(toMessage);
    return json<GetConversationResponse>({
      conversation: summarizeThread(conversation.data, thread),
      messages: thread,
    });
  } catch (cause) {
    console.error("GET /api/conversations/:id failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}
