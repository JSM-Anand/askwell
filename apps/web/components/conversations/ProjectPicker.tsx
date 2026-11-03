"use client";

import { useRouter } from "next/navigation";
import { conversationsHref } from "./conversations-client";

export type ProjectPickerProps = {
  projects: { id: string; name: string }[];
  selectedId: string;
};

/** A plain select that puts the chosen project in `?project=`. Switching project closes any open conversation. */
export function ProjectPicker({ projects, selectedId }: ProjectPickerProps) {
  const router = useRouter();
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor="conversations-project" className="text-sm font-medium">
        Project
      </label>
      <select
        id="conversations-project"
        value={selectedId}
        onChange={(event) => router.push(conversationsHref(event.target.value))}
        className="min-h-10 w-full min-w-0 rounded-md border border-border bg-surface-raised px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-auto sm:max-w-xs"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  );
}
