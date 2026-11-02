import "server-only";
import type { NextRequest } from "next/server";
import { ERROR_STATUS, PLAN_LIMITS, chatRequestSchema } from "@askwell/shared";
import type { ApiError, ChatResponse, ErrorCode } from "@askwell/shared";
import { embedQuery } from "../ai/embed";
import { generateAnswer } from "../ai/generate";
import type { ChatTurn } from "../ai/generate";
import { AiRateLimitError } from "../ai/rate-limit";
import { protectChat } from "../security/arcjet";
import { consumeMessage, conversationBelongsToProject, findExcerpts, findProject, loadHistory, saveTurn } from "./data";
import type { HistoryMessage } from "./data";
import { NO_ANSWER_REPLY, SYSTEM_PROMPT, buildQuestionMessage } from "./prompt";

export type ChatResult = { status: number; body: ChatResponse | ApiError };

const fail = (code: ErrorCode, message: string, status = ERROR_STATUS[code]): ChatResult => ({
  status,
  body: { error: { code, message } },
});

/** Past messages as chat turns. A history can't start with the bot: drop anything before the first visitor message. */
function toTurns(history: HistoryMessage[]): ChatTurn[] {
  const firstVisitor = history.findIndex((m) => m.role === "visitor");
  return (firstVisitor === -1 ? [] : history.slice(firstVisitor)).map((m) => ({
    role: m.role === "bot" ? "assistant" : "user",
    content: m.body,
  }));
}

/**
 * POST /api/widget/chat (project.md §6.6): protect, validate, count, retrieve, answer, save.
 * Public route: the project comes from the public key only, never from an owner.
 */
export async function handleChat(request: NextRequest, rawBody: unknown): Promise<ChatResult> {
  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("invalid_input", "Send a project key, a visitor ID and a message of 1 to 1,000 characters.");
  }
  const { key, visitorId, conversationId, message } = parsed.data;

  // 1. Protect. Before any database work, count or AI call, so a blocked message costs nothing.
  const protection = await protectChat(request, key, message);
  if (!protection.allowed) {
    return protection.reason === "prompt_injection"
      ? fail("prompt_injection", "That message can't be processed.")
      : fail("rate_limited", "Too many messages. Try again in a minute.");
  }

  // 2. Validate against the database, then 3. count. A foreign conversation is refused before anything is counted.
  let projectId: string;
  try {
    const project = await findProject(key);
    if (!project) return fail("not_found", "No project has that key.");
    if (conversationId && !(await conversationBelongsToProject(conversationId, project.id))) {
      return fail("not_found", "No conversation with that id.");
    }
    if (!(await consumeMessage(project.id, PLAN_LIMITS[project.plan].messagesPerMonth))) {
      return fail("quota_exceeded", "This chat has reached its monthly message limit.");
    }
    projectId = project.id;
  } catch (cause) {
    console.error("POST /api/widget/chat failed before counting", cause);
    return fail("internal_error", "Something went wrong.");
  }

  // From here the message is counted: a failure below still uses it (no refund).
  try {
    // 4. Retrieve.
    const excerpts = await findExcerpts(projectId, await embedQuery(message));

    let reply: string;
    if (excerpts.length === 0) {
      reply = NO_ANSWER_REPLY; // nothing to answer from: the chat model is not called
    } else {
      // 5. History, then 6. answer. Phase 4: AI tracing wraps generateAnswer.
      const history = conversationId ? await loadHistory(conversationId) : [];
      reply = await generateAnswer({
        system: SYSTEM_PROMPT,
        messages: [
          ...toTurns(history),
          { role: "user", content: buildQuestionMessage(excerpts.map((e) => e.content), message) },
        ],
      });
    }

    // 7. Save.
    const savedConversationId = await saveTurn({ projectId, conversationId, visitorId, message, reply });
    return { status: 200, body: { conversationId: savedConversationId, reply } };
  } catch (cause) {
    if (cause instanceof AiRateLimitError) {
      return fail("internal_error", "The assistant is busy right now. Please try again in a moment.", 503);
    }
    console.error("POST /api/widget/chat failed after counting", cause);
    return fail("internal_error", "Something went wrong.");
  }
}
