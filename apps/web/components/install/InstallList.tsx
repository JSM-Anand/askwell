import Link from "next/link";
import { EmptyState } from "../ui/EmptyState";
import { GlassPanel } from "../ui/GlassPanel";
import { CopyButton } from "./CopyButton";
import { buildSnippet } from "./snippet";

export type InstallProject = { id: string; name: string; public_key: string };

const STEPS = [
  "Copy the snippet.",
  "Paste it into your site's HTML, just before the closing body tag.",
  "Reload the page. The chat button appears in the corner.",
] as const;

export function InstallList({ projects, origin }: { projects: InstallProject[]; origin: string }) {
  if (projects.length === 0) {
    return (
      <GlassPanel>
        <EmptyState
          title="No script tag yet"
          text="Create a project and its install snippet will appear here."
          action={
            <Link
              href="/dashboard"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Go to Projects
            </Link>
          }
        />
      </GlassPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {projects.map((project) => {
        const snippet = buildSnippet(origin, project.public_key);
        return (
          <GlassPanel key={project.id} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{project.name}</h2>
            <pre className="overflow-x-auto rounded-md border border-border bg-surface-raised p-3 text-sm">
              <code>{snippet}</code>
            </pre>
            <div>
              <CopyButton text={snippet} />
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
              {STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </GlassPanel>
        );
      })}
    </div>
  );
}
