"use client";

import { useState } from "react";
import { MAX_PROJECT_NAME_LENGTH } from "@askwell/shared";
import type { Plan, ProjectSummary } from "@askwell/shared";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { UsageMeter } from "./UsageMeter";

export type ProjectCardProps = {
  project: ProjectSummary;
  /** The owner's plan from the server; it sets the usage limit. */
  plan: Plan;
  /** The current time, so every card agrees on whether a period has rolled over. */
  now?: Date;
  editing: boolean;
  confirmingDelete: boolean;
  busy?: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onRename: (name: string) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

// UTC, so the date doesn't depend on the viewer's time zone.
const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));

type RenameFormProps = {
  project: ProjectSummary;
  busy: boolean;
  onRename: (name: string) => void;
  onCancel: () => void;
};

/**
 * Mounted only while a project is being renamed, so the draft starts from the
 * saved name every time Rename is clicked and an abandoned edit never comes back.
 */
function RenameForm({ project, busy, onRename, onCancel }: RenameFormProps) {
  const [draft, setDraft] = useState(project.name);
  const trimmed = draft.trim();

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed && trimmed !== project.name) onRename(trimmed);
        else onCancel();
      }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={`rename-${project.id}`} className="sr-only">
          Project name
        </label>
        <Input
          id={`rename-${project.id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_PROJECT_NAME_LENGTH}
          autoFocus
          autoComplete="off"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !trimmed}>
          Save
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ProjectCard({
  project,
  plan,
  now,
  editing,
  confirmingDelete,
  busy = false,
  onStartEdit,
  onCancelEdit,
  onRename,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: ProjectCardProps) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-md border border-glass-border bg-surface-raised p-4">
      {editing ? (
        <RenameForm project={project} busy={busy} onRename={onRename} onCancel={onCancelEdit} />
      ) : (
        <h3 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{project.name}</h3>
      )}

      <dl className="grid gap-1 text-sm text-fg-muted">
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt className="shrink-0">Public key</dt>
          <dd className="min-w-0">
            <code className="text-fg [overflow-wrap:anywhere]">{project.publicKey}</code>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Created</dt>
          <dd>
            <time dateTime={project.createdAt}>{formatDate(project.createdAt)}</time>
          </dd>
        </div>
      </dl>

      <UsageMeter messagesUsed={project.messagesUsed} periodStart={project.periodStart} plan={plan} now={now} />

      {confirmingDelete ? (
        <div role="alertdialog" aria-label={`Delete ${project.name}`} className="flex flex-col gap-2 rounded-md border border-danger bg-danger-soft p-3">
          <p className="text-sm text-fg">
            Delete “{project.name}”? This removes its settings, knowledge and conversations. It can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="border-danger" disabled={busy} onClick={onConfirmDelete}>
              Yes, delete
            </Button>
            <Button variant="ghost" onClick={onCancelDelete}>
              Keep it
            </Button>
          </div>
        </div>
      ) : editing ? null : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onStartEdit} aria-label={`Rename ${project.name}`}>
            Rename
          </Button>
          <Button variant="ghost" onClick={onAskDelete} aria-label={`Delete ${project.name}`}>
            Delete
          </Button>
        </div>
      )}
    </li>
  );
}
