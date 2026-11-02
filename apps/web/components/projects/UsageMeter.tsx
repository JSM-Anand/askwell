import Link from "next/link";
import type { Plan } from "@askwell/shared";
import { displayUsage, formatResetDate } from "./usage";

export type UsageMeterProps = {
  messagesUsed: number;
  periodStart: string;
  plan: Plan;
  /** The current time; the page passes one value so every card agrees. Defaults to now. */
  now?: Date;
};

const number = (n: number) => n.toLocaleString("en");

/** A project's messages this month against its plan limit, with a thin bar. The server enforces the limit; this only shows it. */
export function UsageMeter({ messagesUsed, periodStart, plan, now = new Date() }: UsageMeterProps) {
  const usage = displayUsage({ messagesUsed, periodStart, plan, now });

  return (
    <div className="flex flex-col gap-1.5" data-usage={usage.limitReached ? "limit" : usage.warning ? "warning" : "ok"}>
      <p className="text-sm text-fg-muted">
        <span className="font-medium text-fg">
          {number(usage.used)} / {number(usage.limit)}
        </span>{" "}
        messages this month
        {usage.resetsAt ? (
          <>
            {" "}
            {/* Kept together, so "resets 3 Dec" never splits across lines at 375 px. */}
            <span className="whitespace-nowrap">· resets {formatResetDate(usage.resetsAt)}</span>
          </>
        ) : null}
      </p>
      <div
        role="progressbar"
        aria-label="Messages used this month"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={Math.min(usage.used, usage.limit)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className={`h-full rounded-full ${usage.warning ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${usage.percent}%` }}
        />
      </div>
      {usage.limitReached ? (
        <p role="status" className="text-sm text-fg">
          Limit reached: the widget is showing visitors the quota message.{" "}
          {plan === "free" ? (
            <Link href="/dashboard/billing" className="font-medium underline underline-offset-2">
              Upgrade
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
