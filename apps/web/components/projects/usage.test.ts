import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "@askwell/shared";
import { WARNING_PERCENT, displayUsage, formatResetDate } from "./usage";

const d = (iso: string) => new Date(iso);
const NOW = d("2026-11-10T12:00:00Z");
const START = "2026-11-03T14:30:00Z"; // a week ago, inside the period
const usage = (over: Partial<Parameters<typeof displayUsage>[0]> = {}) =>
  displayUsage({ messagesUsed: 42, periodStart: START, plan: "free", now: NOW, ...over });

describe("displayUsage: the limit", () => {
  it("is the plan's messages per month, from PLAN_LIMITS", () => {
    expect(usage({ plan: "free" }).limit).toBe(PLAN_LIMITS.free.messagesPerMonth);
    expect(usage({ plan: "free" }).limit).toBe(100);
    expect(usage({ plan: "pro" }).limit).toBe(PLAN_LIMITS.pro.messagesPerMonth);
    expect(usage({ plan: "pro" }).limit).toBe(2000);
  });
});

describe("displayUsage: used and percent", () => {
  it("shows the count of the current period", () => {
    expect(usage({ messagesUsed: 42 })).toMatchObject({ used: 42, limit: 100, percent: 42, rolledOver: false });
  });

  it("rounds the percent to a whole number", () => {
    expect(usage({ messagesUsed: 1, plan: "pro" }).percent).toBe(0);
    expect(usage({ messagesUsed: 1, plan: "free" }).percent).toBe(1);
    expect(usage({ messagesUsed: 1234, plan: "pro" }).percent).toBe(62);
  });

  it("is 0 percent for 0 messages", () => {
    expect(usage({ messagesUsed: 0 })).toMatchObject({ used: 0, percent: 0, warning: false, limitReached: false });
  });

  it("never lets the percent pass 100, even when used does (a downgraded plan)", () => {
    const over = usage({ messagesUsed: 500, plan: "free" });
    expect(over.used).toBe(500);
    expect(over.percent).toBe(100);
  });

  it("treats a negative count as 0", () => {
    expect(usage({ messagesUsed: -5 }).used).toBe(0);
  });
});

describe("displayUsage: the period rolls over", () => {
  it("shows 0 when period_start is more than a month before now", () => {
    const rolled = usage({ messagesUsed: 87, periodStart: "2026-10-09T11:59:59Z" });
    expect(rolled).toMatchObject({ used: 0, percent: 0, rolledOver: true, warning: false, limitReached: false });
  });

  it("shows 0 for a project that was at its limit last month", () => {
    expect(usage({ messagesUsed: 100, periodStart: "2026-09-01T00:00:00Z" })).toMatchObject({ used: 0, limitReached: false });
  });

  it("does NOT roll over exactly one month later, only strictly after it (the database uses `<`)", () => {
    expect(usage({ messagesUsed: 87, periodStart: "2026-10-10T12:00:00Z" })).toMatchObject({ used: 87, rolledOver: false });
    expect(usage({ messagesUsed: 87, periodStart: "2026-10-10T11:59:59.999Z" })).toMatchObject({ used: 0, rolledOver: true });
  });

  it("clamps month-end days the way Postgres does", () => {
    // 31 Mar minus one month is 28 Feb (not 3 Mar), in Postgres.
    const now = d("2026-03-31T10:00:00Z");
    expect(displayUsage({ messagesUsed: 5, periodStart: "2026-02-28T10:00:00Z", plan: "free", now }).rolledOver).toBe(false);
    expect(displayUsage({ messagesUsed: 5, periodStart: "2026-02-28T09:59:59Z", plan: "free", now }).rolledOver).toBe(true);
    // 1 Mar minus one month is 1 Feb.
    const first = d("2026-03-01T00:00:00Z");
    expect(displayUsage({ messagesUsed: 5, periodStart: "2026-02-01T00:00:00Z", plan: "free", now: first }).rolledOver).toBe(false);
    expect(displayUsage({ messagesUsed: 5, periodStart: "2026-01-31T23:59:59Z", plan: "free", now: first }).rolledOver).toBe(true);
  });

  it("works across a year boundary", () => {
    const now = d("2027-01-15T00:00:00Z");
    expect(displayUsage({ messagesUsed: 9, periodStart: "2026-12-15T00:00:00Z", plan: "free", now }).rolledOver).toBe(false);
    expect(displayUsage({ messagesUsed: 9, periodStart: "2026-12-14T23:59:59Z", plan: "free", now }).rolledOver).toBe(true);
  });

  it("applies to Pro too", () => {
    expect(usage({ plan: "pro", messagesUsed: 1999, periodStart: "2026-08-01T00:00:00Z" })).toMatchObject({ used: 0, limit: 2000 });
  });
});

describe("displayUsage: the reset date", () => {
  it("is the start of the period plus one month", () => {
    expect(usage({ periodStart: "2026-11-03T14:30:00Z" }).resetsAt?.toISOString()).toBe("2026-12-03T14:30:00.000Z");
  });

  it("clamps to the end of a shorter month (31 Jan resets 28 Feb, 29 Feb in a leap year)", () => {
    const early = d("2026-02-05T00:00:00Z");
    expect(displayUsage({ messagesUsed: 1, periodStart: "2026-01-31T10:00:00Z", plan: "free", now: early }).resetsAt?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    const leap = d("2028-02-05T00:00:00Z");
    expect(displayUsage({ messagesUsed: 1, periodStart: "2028-01-31T10:00:00Z", plan: "free", now: leap }).resetsAt?.toISOString()).toBe("2028-02-29T10:00:00.000Z");
  });

  it("crosses a year", () => {
    const now = d("2027-01-05T00:00:00Z");
    expect(displayUsage({ messagesUsed: 1, periodStart: "2026-12-31T23:59:59Z", plan: "free", now }).resetsAt?.toISOString()).toBe("2027-01-31T23:59:59.000Z");
  });

  it("is null once the period has rolled over, since the next one starts with the next message", () => {
    expect(usage({ periodStart: "2026-01-01T00:00:00Z" }).resetsAt).toBeNull();
  });

  it("is null, and nothing else changes, when period_start can't be read", () => {
    expect(usage({ periodStart: "not a date", messagesUsed: 7 })).toMatchObject({ used: 7, resetsAt: null, rolledOver: false });
  });

  it("is formatted like '3 Dec', in UTC", () => {
    expect(formatResetDate(d("2026-12-03T14:30:00Z"))).toBe("3 Dec");
    expect(formatResetDate(d("2026-02-28T23:59:59Z"))).toBe("28 Feb");
    expect(formatResetDate(d("2027-01-01T00:00:00Z"))).toBe("1 Jan");
  });
});

describe("displayUsage: the warning threshold", () => {
  it("is 90 percent", () => {
    expect(WARNING_PERCENT).toBe(90);
  });

  it("turns on at 90 of 100, not at 89", () => {
    expect(usage({ messagesUsed: 89 }).warning).toBe(false);
    expect(usage({ messagesUsed: 90 }).warning).toBe(true);
    expect(usage({ messagesUsed: 99 }).warning).toBe(true);
  });

  it("uses the exact share, not the rounded percent: 1799 of 2000 is 89.95% and does not warn", () => {
    const almost = usage({ messagesUsed: 1799, plan: "pro" });
    expect(almost.percent).toBe(90); // rounds up for display
    expect(almost.warning).toBe(false);
    expect(usage({ messagesUsed: 1800, plan: "pro" }).warning).toBe(true);
  });

  it("is also on at and over the limit", () => {
    expect(usage({ messagesUsed: 100 }).warning).toBe(true);
    expect(usage({ messagesUsed: 150 }).warning).toBe(true);
  });

  it("is off for a rolled-over period", () => {
    expect(usage({ messagesUsed: 99, periodStart: "2026-01-01T00:00:00Z" }).warning).toBe(false);
  });
});

describe("displayUsage: the limit is reached", () => {
  it("at exactly the limit, not one before", () => {
    expect(usage({ messagesUsed: 99 }).limitReached).toBe(false);
    expect(usage({ messagesUsed: 100 }).limitReached).toBe(true);
  });

  it("over the limit too, as after a downgrade", () => {
    expect(usage({ messagesUsed: 250 }).limitReached).toBe(true);
  });

  it("uses the Pro limit for a Pro plan", () => {
    expect(usage({ messagesUsed: 100, plan: "pro" }).limitReached).toBe(false);
    expect(usage({ messagesUsed: 1999, plan: "pro" }).limitReached).toBe(false);
    expect(usage({ messagesUsed: 2000, plan: "pro" }).limitReached).toBe(true);
  });
});
