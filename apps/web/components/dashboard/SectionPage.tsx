import { auth } from "@clerk/nextjs/server";
import { EmptyState } from "../ui/EmptyState";
import { GlassPanel } from "../ui/GlassPanel";

export type SectionPageProps = {
  title: string;
  emptyTitle: string;
  emptyText: string;
};

/** Shared body of each dashboard section page. Checks the session itself; the layout is not the only gate. */
export async function SectionPage({ title, emptyTitle, emptyText }: SectionPageProps) {
  await auth.protect();
  return (
    <section aria-labelledby="section-title" className="flex flex-col gap-4">
      <h1 id="section-title" className="text-2xl font-semibold">
        {title}
      </h1>
      <GlassPanel>
        <EmptyState title={emptyTitle} text={emptyText} />
      </GlassPanel>
    </section>
  );
}
