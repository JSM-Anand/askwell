import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { CustomizeView } from "../../../components/customize/CustomizeView";
import { ProjectPicker } from "../../../components/customize/ProjectPicker";
import { EmptyState } from "../../../components/ui/EmptyState";
import { GlassPanel } from "../../../components/ui/GlassPanel";
import { loadCustomize } from "./load-customize";

type PageProps = { searchParams: Promise<{ project?: string | string[] }> };

export default async function CustomizePage({ searchParams }: PageProps) {
  // The layout checks the session too; each page is its own gate.
  await auth.protect();

  const { project } = await searchParams;
  const { projects, selected, plan, config } = await loadCustomize(typeof project === "string" ? project : undefined);

  return (
    <section aria-labelledby="customize-title" className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 id="customize-title" className="text-2xl font-semibold">
          Customize
        </h1>
        {selected && projects.length > 1 ? <ProjectPicker projects={projects} selectedId={selected.id} /> : null}
      </div>

      {selected ? (
        // Keyed by project, so switching projects starts from that project's saved settings.
        <CustomizeView key={selected.id} projectId={selected.id} plan={plan} initialConfig={config} />
      ) : (
        <GlassPanel>
          <EmptyState
            title="Create a project first"
            text="Customize belongs to a project. Create one, then style its chat widget here."
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
