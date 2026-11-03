import { GlassPanel } from "../ui/GlassPanel";
import { Reveal } from "./Reveal";

const SNIPPET = '<script src="https://YOUR_APP_URL/widget.js" data-key="pk_your_key"></script>';

export function InstallSnippet() {
  return (
    <section aria-labelledby="install-title" className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <h2 id="install-title" className="mb-2 text-center text-2xl font-semibold sm:text-3xl">
          Install in one line
        </h2>
        <p className="mb-8 text-center text-sm text-fg-muted">
          This is an example. Replace both <code>YOUR_APP_URL</code> and <code>pk_your_key</code>, or copy
          the ready-made snippet from your dashboard&apos;s Install page once you create a project.
        </p>
        <Reveal>
          <GlassPanel className="p-4">
            <pre
              tabIndex={0}
              role="group"
              aria-label="Example script tag"
              className="overflow-x-auto text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <code>{SNIPPET}</code>
            </pre>
          </GlassPanel>
        </Reveal>
      </div>
    </section>
  );
}
