"use client";

import { useEffect, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import { APP_NAME, MAX_MESSAGE_LENGTH } from "@askwell/shared";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { ChatMessage } from "./chat-state";
import { canSend } from "./chat-state";

export function PanelShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-surface text-fg">
      <header className="flex items-center justify-between gap-2 border-b border-glass-border bg-glass px-4 py-3 backdrop-blur-(--blur-glass)">
        <h1 className="min-w-0 truncate text-sm font-semibold">{title}</h1>
        <Button variant="ghost" aria-label="Close chat" className="min-h-8 px-2" onClick={onClose}>
          ✕
        </Button>
      </header>
      {children}
    </div>
  );
}

export type ChatViewProps = {
  messages: ChatMessage[];
  typing: boolean;
  draft: string;
  showBadge: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
};

/** Every message is rendered as text: React escapes it, and nothing here sets HTML. */
export function ChatView({ messages, typing, draft, showBadge, onDraftChange, onSubmit }: ChatViewProps) {
  const log = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const wasTyping = useRef(false);

  // Disabling the input while a reply is on its way drops its focus. When the reply (or an error notice)
  // arrives, give it back, unless the visitor moved on to another control in the meantime.
  useEffect(() => {
    if (wasTyping.current && !typing) {
      const input = form.current?.querySelector("input");
      const active = document.activeElement;
      if (input && (!active || active === document.body || active === input)) input.focus();
    }
    wasTyping.current = typing;
  }, [typing]);

  // Keep the newest message in view. Set scrollTop on the list itself: scrollIntoView can also scroll the host page.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <>
      <div ref={log} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" role="log" aria-live="polite">
        {messages.length === 0 ? <p className="text-sm text-fg-muted">Ask a question to get started.</p> : null}
        {messages.map((m) => (
          <p
            key={m.id}
            role={m.from === "notice" ? "alert" : undefined}
            className={`max-w-[85%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm ${
              m.from === "visitor"
                ? "self-end bg-accent text-accent-fg"
                : m.from === "notice"
                  ? "self-start border border-danger bg-danger-soft"
                  : "self-start border border-glass-border bg-glass"
            }`}
          >
            {m.text}
          </p>
        ))}
        {typing ? (
          <p role="status" className="self-start rounded-md border border-glass-border bg-glass px-3 py-2 text-sm text-fg-muted">
            Typing…
          </p>
        ) : null}
      </div>
      <form ref={form} onSubmit={submit} className="flex gap-2 border-t border-glass-border bg-glass p-3 backdrop-blur-(--blur-glass)">
        <Input
          aria-label="Your message"
          placeholder="Type your question"
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={typing}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <Button type="submit" disabled={!canSend(draft, typing)}>
          Send
        </Button>
      </form>
      {showBadge ? <p className="pb-2 text-center text-xs text-fg-muted">Powered by {APP_NAME}</p> : null}
    </>
  );
}
