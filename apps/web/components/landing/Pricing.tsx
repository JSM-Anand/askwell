import { PLAN_LIMITS, PLANS, type Plan } from "@askwell/shared";
import { GlassPanel } from "../ui/GlassPanel";
import { CtaLink } from "./CtaLink";
import { Reveal } from "./Reveal";

const PLAN_NAMES: Record<Plan, string> = { free: "Free", pro: "Pro" };

const words = (value: string) => {
  const text = value.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function rows(plan: Plan): { label: string; value: string }[] {
  const limits = PLAN_LIMITS[plan];
  return [
    { label: "Projects", value: limits.projects.toLocaleString("en-US") },
    { label: "Messages / month (per project)", value: limits.messagesPerMonth.toLocaleString("en-US") },
    { label: "Knowledge sources (per project)", value: limits.knowledgeSources.toLocaleString("en-US") },
    { label: "Button color", value: limits.customize.buttonColor ? "Any" : "Default" },
    {
      label: "Button position",
      value: limits.customize.positions.length > 1 ? "Any corner" : words(limits.customize.positions[0] ?? "bottom-right"),
    },
    { label: "Button label", value: limits.customize.label ? "Custom" : "Default" },
    { label: "Open animation", value: limits.customize.animations.map(words).join(" / ") },
    { label: "Header text", value: limits.customize.headerText ? "Custom" : "Default" },
    { label: "“Powered by” badge", value: limits.customize.hideBadge ? "Hidden" : "Shown" },
  ];
}

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 id="pricing-title" className="mb-8 text-center text-2xl font-semibold sm:text-3xl">
          Pricing
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {PLANS.map((plan, i) => (
            <Reveal key={plan} delay={i * 100} className="h-full">
              <GlassPanel className="flex h-full flex-col gap-4" data-plan={plan}>
                <h3 className="text-lg font-semibold">{PLAN_NAMES[plan]}</h3>
                <dl className="flex flex-col gap-2 text-sm">
                  {rows(plan).map((row) => (
                    <div key={row.label} className="flex justify-between gap-4">
                      <dt className="text-fg-muted">{row.label}</dt>
                      <dd className="font-medium">{row.value}</dd>
                    </div>
                  ))}
                </dl>
                {plan === "free" ? (
                  <CtaLink href="/sign-up" className="mt-auto">
                    Start free
                  </CtaLink>
                ) : (
                  <p className="mt-auto text-sm text-fg-muted">Upgrade any time from your dashboard.</p>
                )}
              </GlassPanel>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
