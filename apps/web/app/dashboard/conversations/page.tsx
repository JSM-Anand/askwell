import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ConversationsView } from "../../../components/conversations/ConversationsView";
import { ProjectPicker } from "../../../components/conversations/ProjectPicker";
import { EmptyState } from "../../../components/ui/EmptyState";
import { GlassPanel } from "../../../components/ui/GlassPanel";
import { loadConversations } from "./load-conversations";

type PageProps = { searchParams: Promise<{ project?: string | string[]; conversation?: string | string[] }> };

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function ConversationsPage({ searchParams }: PageProps) {
  // The layout checks the session too; each page is its own gate.
  await auth.protect();

  const params = await searchParams;
  const { projects, selected, conversations } = await loadConversations(one(params.project));

  return (
    <section aria-labelledby="conversations-title" className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 id="conversations-title" className="text-2xl font-semibold">
          Conversations
        </h1>
        {selected && projects.length > 1 ? <ProjectPicker projects={projects} selectedId={selected.id} /> : null}
      </div>

      {selected ? (
        // Keyed by project and conversation, so switching starts from that project's list and thread.
        <ConversationsView
          key={`${selected.id}:${one(params.conversation) ?? ""}`}
          projectId={selected.id}
          initialConversations={conversations}
          selectedId={one(params.conversation)}
        />
      ) : (
        <GlassPanel>
          <EmptyState
            title="Create a project first"
            text="Conversations belong to a project. Create one, install the widget, and the chats will show up here."
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
