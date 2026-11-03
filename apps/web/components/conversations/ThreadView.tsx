import Link from "next/link";
import type { GetConversationResponse } from "@askwell/shared";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { Spinner } from "../ui/Spinner";
import { conversationsHref } from "./conversations-client";
import { formatDateTime } from "./relative-time";

export type ThreadState =
  | { status: "loading" }
  | { status: "error"; code: string; message: string }
  | { status: "ready"; data: GetConversationResponse };

export type ThreadViewProps = {
  projectId: string;
  state: ThreadState;
  onRetry: () => void;
};

export function ThreadView({ projectId, state, onRetry }: ThreadViewProps) {
  const back = (
    <Link href={conversationsHref(projectId)} className="text-sm font-medium underline underline-offset-2 md:hidden">
      ← All conversations
    </Link>
  );

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner label="Loading conversation" />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    const gone = state.code === "not_found";
    return (
      <div className="flex flex-col gap-3">
        {back}
        <ErrorState
          title={gone ? "Conversation not found" : "Something went wrong"}
          message={gone ? "We couldn't find that conversation. It may belong to another project." : "We couldn't load this conversation. Try again in a moment."}
          action={
            gone ? undefined : (
              <Button variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const { conversation, messages } = state.data;
  return (
    <div className="flex flex-col gap-3">
      {back}
      <p className="text-xs text-fg-muted">
        Visitor <span className="font-mono [overflow-wrap:anywhere]">{conversation.visitorId}</span> ·{" "}
        {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"} · started{" "}
        <time dateTime={conversation.createdAt}>{formatDateTime(conversation.createdAt)}</time>
      </p>
      {messages.length === 0 ? (
        <p className="text-sm text-fg-muted">This conversation has no messages yet.</p>
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Messages">
          {messages.map((message) => {
            const visitor = message.role === "visitor";
            return (
              <li key={message.id} className={`flex min-w-0 flex-col gap-1 ${visitor ? "items-start" : "items-end"}`} data-role={message.role}>
                <span className="text-xs font-medium text-fg-muted">{visitor ? "Visitor" : "Bot"}</span>
                {/* Message text is rendered as text, never HTML. */}
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm [overflow-wrap:anywhere] ${
                    visitor ? "border-border bg-surface-raised text-fg" : "border-transparent bg-accent text-accent-fg"
                  }`}
                >
                  {message.body}
                </p>
                <time dateTime={message.createdAt} className="text-xs text-fg-muted">
                  {formatDateTime(message.createdAt)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
