"use client";

import { useState } from "react";
import { MAX_PASTED_TEXT_LENGTH, MAX_TITLE_LENGTH } from "@askwell/shared";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export type PasteFormProps = {
  disabled?: boolean;
  busy?: boolean;
  /** Resolves true when the text was added, so the form can clear itself. */
  onPaste: (title: string, content: string) => Promise<boolean>;
};

export function PasteForm({ disabled = false, busy = false, onPaste }: PasteFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const ready = title.trim() !== "" && content.trim() !== "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || busy || !ready) return;
    if (await onPaste(title.trim(), content.trim())) {
      setTitle("");
      setContent("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label="Paste text">
      <label htmlFor="paste-title" className="text-sm font-medium">
        Title
      </label>
      <Input
        id="paste-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={MAX_TITLE_LENGTH}
        placeholder="e.g. Opening hours"
        disabled={disabled || busy}
        autoComplete="off"
      />
      <label htmlFor="paste-content" className="text-sm font-medium">
        Text
      </label>
      <textarea
        id="paste-content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={MAX_PASTED_TEXT_LENGTH}
        rows={6}
        placeholder="Paste the text your chat should answer from"
        disabled={disabled || busy}
        className="min-h-32 w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg-muted">
          {content.length.toLocaleString("en")} / {MAX_PASTED_TEXT_LENGTH.toLocaleString("en")} characters
        </span>
        <Button type="submit" disabled={disabled || busy || !ready}>
          {busy ? "Adding…" : "Add text"}
        </Button>
      </div>
    </form>
  );
}
