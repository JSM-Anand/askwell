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
          Paste this before the closing body tag. Your dashboard gives you the real key.
        </p>
        <Reveal>
          <GlassPanel className="p-4">
            <pre className="overflow-x-auto text-sm">
              <code>{SNIPPET}</code>
            </pre>
          </GlassPanel>
        </Reveal>
      </div>
    </section>
  );
}
