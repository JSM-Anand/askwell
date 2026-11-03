import Link from "next/link";
import type { ConversationSummary } from "@askwell/shared";
import { EmptyState } from "../ui/EmptyState";
import { conversationsHref } from "./conversations-client";
import { formatDateTime, relativeTime } from "./relative-time";

export type ConversationListProps = {
  projectId: string;
  conversations: ConversationSummary[];
  selectedId?: string;
  /** The current time, or null before the page is live (then the exact time is shown). */
  now: Date | null;
};

const count = (n: number) => `${n} message${n === 1 ? "" : "s"}`;

export function ConversationList({ projectId, conversations, selectedId, now }: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <EmptyState
        title="No conversations yet"
        text="Install the widget to start getting chats."
        action={
          <Link href="/dashboard/install" className="text-sm font-medium underline underline-offset-2">
            Go to Install
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {conversations.map((conversation) => {
        const selected = conversation.id === selectedId;
        return (
          <li key={conversation.id}>
            <Link
              href={conversationsHref(projectId, conversation.id)}
              aria-current={selected ? "true" : undefined}
              className={`flex min-w-0 flex-col gap-1 rounded-md border p-3 transition-colors hover:bg-glass focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                selected ? "border-fg bg-glass" : "border-glass-border bg-surface-raised"
              }`}
            >
              {/* Message text is rendered as text, never HTML. */}
              <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
                {conversation.firstMessagePreview ?? <span className="font-normal text-fg-muted">No visitor message yet</span>}
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs text-fg-muted">
                <span>{count(conversation.messageCount)}</span>
                <time dateTime={conversation.createdAt} title={formatDateTime(conversation.createdAt)}>
                  {now ? relativeTime(conversation.createdAt, now) : formatDateTime(conversation.createdAt)}
                </time>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
