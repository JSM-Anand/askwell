"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "@askwell/shared";
import type { WidgetMessage } from "@askwell/shared";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";
import { ChatView, PanelShell } from "./ChatView";
import { canSend, chatReducer, initialChat } from "./chat-state";
import { loadConfig } from "./load-config";
import type { LoadResult } from "./load-config";
import { parseParentOrigin } from "./parent-origin";
import { sendChatMessage } from "./send-message";
import { getVisitorId } from "./visitor-id";

/** Height the panel asks the loader for. The loader clamps it to the viewport. */
const PANEL_HEIGHT = 560;

export type EmbedPanelProps = { projectKey: string | undefined; origin: string | undefined };

export function EmbedPanel({ projectKey, origin }: EmbedPanelProps) {
  const parentOrigin = useMemo(() => parseParentOrigin(origin), [origin]);
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [chat, dispatch] = useReducer(chatReducer, initialChat);
  const [draft, setDraft] = useState("");
  const unread = useRef(0);
  // In memory only: a reload starts a new conversation. The visitor ID is the stored one (see visitor-id.ts).
  const conversationId = useRef<string | undefined>(undefined);
  const visitorId = useRef<string | null>(null);

  // Only ever the embedding page's exact origin, never "*". With no valid origin nothing is posted.
  const post = useCallback(
    (message: WidgetMessage) => {
      if (parentOrigin && window.parent !== window) window.parent.postMessage(message, parentOrigin);
    },
    [parentOrigin],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadConfig(projectKey, undefined, controller.signal).then((result) => {
      if (!controller.signal.aborted) setLoad(result);
    });
    return () => controller.abort();
  }, [projectKey]);

  useEffect(() => {
    visitorId.current ??= getVisitorId(); // creates the ID on the first visit, before the first message
  }, []);

  useEffect(() => {
    if (load?.status === "ready") post({ type: "resize", height: PANEL_HEIGHT });
  }, [load?.status, post]);

  // Visitor came back to the panel: clear the loader's unread dot.
  useEffect(() => {
    const onFocus = () => {
      if (unread.current === 0) return;
      unread.current = 0;
      post({ type: "unread", count: 0 });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [post]);

  const send = () => {
    if (!canSend(draft, chat.typing) || !projectKey) return;
    const message = draft.trim().slice(0, MAX_MESSAGE_LENGTH);
    dispatch({ type: "send", text: message });
    setDraft("");
    visitorId.current ??= getVisitorId();

    void sendChatMessage({
      key: projectKey,
      visitorId: visitorId.current,
      conversationId: conversationId.current,
      message,
    }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "error", text: result.message });
        return;
      }
      conversationId.current = result.conversationId;
      dispatch({ type: "reply", text: result.reply });
      // A reply while the panel doesn't have focus counts as unread.
      if (!document.hasFocus()) {
        unread.current += 1;
        post({ type: "unread", count: unread.current });
      }
    });
  };

  const close = () => post({ type: "close" });

  if (!load) {
    return (
      <PanelShell title="Chat" onClose={close}>
        <div className="flex flex-1 items-center justify-center">
          <Spinner label="Loading chat" />
        </div>
      </PanelShell>
    );
  }

  if (load.status === "unavailable") {
    return (
      <PanelShell title="Chat" onClose={close}>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="This chat isn't available" text="Please try again later." />
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell title={load.config.headerText} onClose={close}>
      <ChatView
        messages={chat.messages}
        typing={chat.typing}
        draft={draft}
        showBadge={load.config.showBadge}
        onDraftChange={setDraft}
        onSubmit={send}
      />
    </PanelShell>
  );
}
