import { APP_NAME } from "@askwell/shared";
import { GlassPanel } from "../ui/GlassPanel";
import { Input } from "../ui/Input";
import { Reveal } from "./Reveal";

/**
 * The live demo. With the landing widget on, it points visitors at the real button in the corner.
 * Without it (local, previews), it shows a static mock of the panel.
 */
export function DemoPanel({ live = false }: { live?: boolean }) {
  if (live) {
    return (
      <section aria-labelledby="demo-title" className="px-4 py-16">
        <div className="mx-auto max-w-md text-center">
          <h2 id="demo-title" className="mb-2 text-2xl font-semibold sm:text-3xl">
            See it in action
          </h2>
          <p className="text-sm text-fg-muted">
            This is the real widget. Open the chat button in the corner and ask it anything about {APP_NAME}.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="demo-title" className="px-4 py-16">
      <div className="mx-auto max-w-md">
        <h2 id="demo-title" className="mb-2 text-center text-2xl font-semibold sm:text-3xl">
          See it in action
        </h2>
        <p className="mb-8 text-center text-sm text-fg-muted">A preview of the chat your visitors see.</p>
        <Reveal>
          <GlassPanel className="flex flex-col gap-4 p-4">
            <div className="border-b border-glass-border pb-3 text-sm font-semibold">Ask us anything</div>
            <div className="flex flex-col gap-3 text-sm">
              <p className="max-w-[85%] self-end rounded-md bg-accent px-3 py-2 text-accent-fg">
                Can I try it for free?
              </p>
              <p className="max-w-[85%] self-start rounded-md border border-glass-border bg-glass px-3 py-2">
                Yes. The free plan includes one project, so you can set up the chat before you upgrade.
              </p>
            </div>
            <Input aria-label="Message (preview only)" placeholder="Type your question" disabled />
            <p className="text-center text-xs text-fg-muted">Powered by {APP_NAME}</p>
          </GlassPanel>
        </Reveal>
      </div>
    </section>
  );
}
