"use client";

import Link from "next/link";
import { useState } from "react";
import { MAX_PROJECT_NAME_LENGTH } from "@askwell/shared";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { LimitInfo } from "./projects-state";

export type CreateProjectFormProps = {
  limit: LimitInfo;
  busy?: boolean;
  onCreate: (name: string) => void | Promise<boolean>;
};

export function CreateProjectForm({ limit, busy = false, onCreate }: CreateProjectFormProps) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const disabled = limit.atLimit || busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || !trimmed) return;
    const created = await onCreate(trimmed);
    if (created !== false) setName("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label="Create a project">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <label htmlFor="new-project-name" className="sr-only">
            Project name
          </label>
          <Input
            id="new-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
            maxLength={MAX_PROJECT_NAME_LENGTH}
            disabled={disabled}
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={disabled || !trimmed}>
          {busy ? "Creating…" : "Create project"}
        </Button>
      </div>
      {limit.message ? (
        <p role="status" className="text-sm text-fg-muted">
          {limit.message}{" "}
          {limit.canUpgrade ? (
            <Link href="/dashboard/billing" className="font-medium text-fg underline underline-offset-2">
              Upgrade
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
