import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { KnowledgeView } from "../../../components/knowledge/KnowledgeView";
import { ProjectSelector } from "../../../components/knowledge/ProjectSelector";
import { EmptyState } from "../../../components/ui/EmptyState";
import { GlassPanel } from "../../../components/ui/GlassPanel";
import { loadKnowledge } from "./load-knowledge";

type PageProps = { searchParams: Promise<{ project?: string | string[] }> };

export default async function KnowledgePage({ searchParams }: PageProps) {
  // The layout checks the session too; each page is its own gate.
  await auth.protect();

  const { project } = await searchParams;
  const { projects, selected, plan, sources } = await loadKnowledge(typeof project === "string" ? project : undefined);

  return (
    <section aria-labelledby="knowledge-title" className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 id="knowledge-title" className="text-2xl font-semibold">
          Knowledge
        </h1>
        {selected && projects.length > 1 ? <ProjectSelector projects={projects} selectedId={selected.id} /> : null}
      </div>

      {selected ? (
        // Keyed by project, so switching projects starts from that project's list.
        <KnowledgeView key={selected.id} projectId={selected.id} plan={plan} initialSources={sources} />
      ) : (
        <GlassPanel>
          <EmptyState
            title="Create a project first"
            text="Knowledge belongs to a project. Create one, then add text or files for its chat to answer from."
            action={
              <Link href="/dashboard" className="text-sm font-medium underline underline-offset-2">
                Go to Projects
              </Link>
            }
          />
        </GlassPanel>
      )}
    </section>
  );
}
