import type { Plan } from "@askwell/shared";
import { GlassPanel } from "../ui/GlassPanel";
import { planFacts } from "./billing-state";

/** Shows the plan our database says the owner is on, with what that plan includes. */
/** `label` is the plan name as the server formats it ("Pro plan"). */
export function PlanCard({ plan, label }: { plan: Plan; label: string }) {
  return (
    <GlassPanel aria-labelledby="current-plan-title" role="region" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="current-plan-title" className="text-lg font-semibold">
          Current plan
        </h2>
        <span data-testid="current-plan" className="rounded-full border border-border bg-surface-raised px-3 py-0.5 text-sm font-medium">
          {label}
        </span>
      </div>
      <ul className="grid gap-1 text-sm text-fg-muted sm:grid-cols-2">
        {planFacts(plan).map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </GlassPanel>
  );
}
