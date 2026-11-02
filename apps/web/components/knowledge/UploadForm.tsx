"use client";

import { useRef } from "react";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";

export type UploadFormProps = {
  disabled?: boolean;
  busy?: boolean;
  onFile: (file: File) => void;
};

const MAX_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);

export function UploadForm({ disabled = false, busy = false, onFile }: UploadFormProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="knowledge-file" className="text-sm font-medium">
        Upload a file
      </label>
      <input
        ref={input}
        id="knowledge-file"
        type="file"
        accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset, so choosing the same file again (after a message) fires another change.
          if (input.current) input.current.value = "";
          if (file) onFile(file);
        }}
        className="block w-full min-w-0 text-sm text-fg file:mr-3 file:min-h-10 file:rounded-md file:border file:border-border file:bg-surface-raised file:px-4 file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50"
      />
      <p className="text-xs text-fg-muted">
        PDF, Markdown or text, up to {MAX_MB} MB. {busy ? "Working on your file…" : ""}
      </p>
    </div>
  );
}
