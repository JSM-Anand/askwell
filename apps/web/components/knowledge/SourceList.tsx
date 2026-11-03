"use client";

import { useEffect, useRef } from "react";
import type { KnowledgeSourceSummary } from "@askwell/shared";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { statusLabel } from "./knowledge-state";

export type SourceListProps = {
  sources: KnowledgeSourceSummary[];
  confirmingId: string | null;
  progress: Record<string, number>;
  busyId?: string | null;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
};

const TYPE_LABEL: Record<KnowledgeSourceSummary["type"], string> = { text: "Pasted text", pdf: "PDF", md: "Markdown", txt: "Text file" };

// UTC, so the date doesn't depend on the viewer's time zone.
const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));

const STATUS_STYLE = {
  ready: "border-border bg-surface-raised text-fg",
  failed: "border-danger bg-danger-soft text-fg",
  processing: "border-border bg-glass text-fg-muted",
  uploading: "border-border bg-glass text-fg-muted",
} as const;

const deleteButtonId = (sourceId: string) => `delete-source-${sourceId}`;

export function SourceList({ sources, confirmingId, progress, busyId = null, onAskDelete, onCancelDelete, onConfirmDelete }: SourceListProps) {
  const previousConfirmingId = useRef<string | null>(null);

  // The Delete button is replaced by the confirm while it is open. When the confirm closes without the
  // source being deleted (Keep it), put focus back on that source's Delete button instead of losing it.
  useEffect(() => {
    const was = previousConfirmingId.current;
    previousConfirmingId.current = confirmingId;
    if (was && confirmingId === null) document.getElementById(deleteButtonId(was))?.focus();
  }, [confirmingId]);

  if (sources.length === 0) {
    return (
      <EmptyState
        title="No knowledge yet"
        text="Add text or a file above. Your chat answers from what you add here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {sources.map((source) => {
        const percent = progress[source.id];
        return (
          <li key={source.id} className="flex min-w-0 flex-col gap-3 rounded-md border border-glass-border bg-surface-raised p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{source.title}</h3>
              <span
                className={`shrink-0 rounded-full border px-3 py-0.5 text-xs font-medium ${STATUS_STYLE[source.status]}`}
                data-status={source.status}
              >
                {percent === undefined ? statusLabel(source.status) : `Uploading ${percent}%`}
              </span>
            </div>

            {percent !== undefined ? (
              <progress value={percent} max={100} aria-label={`Uploading ${source.title}`} className="h-2 w-full" />
            ) : null}

            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
              <div className="flex gap-2">
                <dt>Type</dt>
                <dd className="text-fg">{TYPE_LABEL[source.type]}</dd>
              </div>
              <div className="flex gap-2">
                <dt>Added</dt>
                <dd>
                  <time dateTime={source.createdAt}>{formatDate(source.createdAt)}</time>
                </dd>
              </div>
            </dl>

            {source.status === "failed" ? (
              <p className="text-sm text-fg">We couldn&apos;t process this one. Delete it and add it again.</p>
            ) : null}

            {confirmingId === source.id ? (
              <div role="alertdialog" aria-label={`Delete ${source.title}`} className="flex flex-col gap-2 rounded-md border border-danger bg-danger-soft p-3">
                <p className="text-sm text-fg">
                  Delete “{source.title}”? Your chat will stop using it. It can&apos;t be undone.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" className="border-danger" disabled={busyId === source.id} onClick={() => onConfirmDelete(source.id)}>
                    Yes, delete
                  </Button>
                  {/* The safe action takes focus when the confirm opens. */}
                  <Button variant="ghost" autoFocus onClick={onCancelDelete}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button variant="ghost" id={deleteButtonId(source.id)} onClick={() => onAskDelete(source.id)} aria-label={`Delete ${source.title}`}>
                  Delete
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
