import { PLAN_LIMITS } from "@askwell/shared";
import type { Plan } from "@askwell/shared";

/** At or above this share of the limit, the bar turns to the warning style. */
export const WARNING_PERCENT = 90;

export type Usage = {
  /** Messages counted in the current period; 0 once the period has rolled over. */
  used: number;
  limit: number;
  /** Whole percent of the limit, 0 to 100 (it never exceeds 100, even if `used` does). */
  percent: number;
  /** At or above 90% of the limit. */
  warning: boolean;
  /** `used` has reached the limit: the widget is showing visitors the quota message. */
  limitReached: boolean;
  /** The count has restarted, but the database only starts the new period on the next message. */
  rolledOver: boolean;
  /** When the current period ends (its start plus one month); null once it has rolled over, or if the start is unreadable. */
  resetsAt: Date | null;
};

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * A date moved by whole calendar months in UTC, the way Postgres does `timestamptz +/- interval 'N month'`:
 * the day is clamped to the end of a shorter month (31 Jan + 1 month is 28 Feb), the time of day is kept.
 */
function addMonthsUtc(date: Date, months: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const day = Math.min(date.getUTCDate(), daysInMonth(year, month));
  return new Date(
    Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()),
  );
}

export type UsageInput = {
  messagesUsed: number;
  /** ISO timestamp of the start of the current period (`projects.period_start`). */
  periodStart: string;
  plan: Plan;
  now: Date;
};

/**
 * Messages used this month against the plan's limit, for display. The plan comes from the server.
 *
 * The database resets the count lazily: `consume_message` starts a new period on the first message after
 * `period_start < now() - interval '1 month'` (strictly more than one month ago). Until that message arrives
 * the row still holds the old count, so the same rule is applied here and an expired period shows as 0.
 */
export function displayUsage({ messagesUsed, periodStart, plan, now }: UsageInput): Usage {
  const limit = PLAN_LIMITS[plan].messagesPerMonth;
  const start = new Date(periodStart);
  const validStart = !Number.isNaN(start.getTime());

  const rolledOver = validStart && start.getTime() < addMonthsUtc(now, -1).getTime();
  const used = rolledOver ? 0 : Math.max(0, messagesUsed);

  return {
    used,
    limit,
    percent: Math.min(100, Math.round((used / limit) * 100)),
    // Exact integer maths, not the rounded percent: 89.95% must not count as 90%.
    warning: used * 100 >= limit * WARNING_PERCENT,
    limitReached: used >= limit,
    rolledOver,
    resetsAt: validStart && !rolledOver ? addMonthsUtc(start, 1) : null,
  };
}

// UTC, so the date doesn't depend on the viewer's time zone.
const resetFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "3 Dec". */
export const formatResetDate = (date: Date) => resetFormat.format(date);
