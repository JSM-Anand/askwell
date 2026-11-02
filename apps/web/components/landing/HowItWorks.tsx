import { GlassPanel } from "../ui/GlassPanel";
import { Reveal } from "./Reveal";

const STEPS = [
  { title: "Add knowledge", text: "Paste text or upload a PDF about your product." },
  { title: "Paste one script tag", text: "Drop a single line into your site's HTML." },
  { title: "Visitors get answers", text: "The chat replies from your knowledge, around the clock." },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <h2 id="how-title" className="mb-8 text-center text-2xl font-semibold sm:text-3xl">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Reveal delay={i * 100} className="h-full">
                <GlassPanel className="h-full">
                  <span className="text-sm text-fg-muted">Step {i + 1}</span>
                  <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-fg-muted">{step.text}</p>
                </GlassPanel>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
