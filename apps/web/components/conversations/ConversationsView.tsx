"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConversationSummary } from "@askwell/shared";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { GlassPanel } from "../ui/GlassPanel";
import { ConversationList } from "./ConversationList";
import { ThreadView } from "./ThreadView";
import type { ThreadState } from "./ThreadView";
import { getConversation, listConversations } from "./conversations-client";
import { useNow } from "./use-now";

export type ConversationsViewProps = {
  projectId: string;
  initialConversations: ConversationSummary[];
  /** The conversation open in the URL (`?conversation=`), if any. */
  selectedId?: string;
};

/**
 * The Conversations section of one project: the list, newest first, and the open thread. There is no realtime
 * (project.md §12): Refresh reloads the list, and the open thread with it.
 */
export function ConversationsView({ projectId, initialConversations, selectedId }: ConversationsViewProps) {
  const now = useNow();
  const [conversations, setConversations] = useState(initialConversations);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped to load the open thread again (Refresh, Try again).
  const [reload, setReload] = useState(0);
  // The last answer, tagged with the request it belongs to. While it doesn't match the current request the
  // thread is loading, so there is no need to set "loading" from inside the effect.
  const requestKey = `${selectedId ?? ""}:${reload}`;
  const [answer, setAnswer] = useState<{ key: string; state: ThreadState } | null>(null);
  const thread: ThreadState = answer?.key === requestKey ? answer.state : { status: "loading" };

  useEffect(() => {
    if (!selectedId) return;
    let current = true; // a slow answer for a conversation that is no longer open is ignored
    void getConversation(selectedId).then((result) => {
      if (!current) return;
      const state: ThreadState = result.ok
        ? { status: "ready", data: result.data }
        : { status: "error", code: result.code, message: result.message };
      setAnswer({ key: requestKey, state });
    });
    return () => {
      current = false;
    };
  }, [selectedId, reload, requestKey]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setNotice(null);
    const result = await listConversations(projectId);
    setRefreshing(false);
    if (result.ok) {
      setConversations(result.data.conversations);
      if (selectedId) setReload((n) => n + 1);
    } else {
      // Keep what is on screen; say that the refresh didn't work.
      setNotice(result.message);
    }
  }, [projectId, selectedId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button variant="secondary" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {notice ? (
        <ErrorState
          title="Couldn't refresh"
          message={notice}
          action={
            <Button variant="secondary" onClick={() => setNotice(null)}>
              Dismiss
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* On a phone, an open conversation takes the whole screen; the list is one tap away. */}
        <GlassPanel className={`p-4 sm:p-6 ${selectedId ? "hidden md:block" : ""}`}>
          <ConversationList projectId={projectId} conversations={conversations} selectedId={selectedId} now={now} />
        </GlassPanel>

        {selectedId ? (
          <GlassPanel className="p-4 sm:p-6">
            <ThreadView projectId={projectId} state={thread} onRetry={() => setReload((n) => n + 1)} />
          </GlassPanel>
        ) : conversations.length > 0 ? (
          <GlassPanel className="hidden p-4 sm:p-6 md:block">
            <p className="text-sm text-fg-muted">Select a conversation to read it.</p>
          </GlassPanel>
        ) : null}
      </div>
    </div>
  );
}
