import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, relativeTime } from "./relative-time";

const NOW = new Date("2026-11-10T12:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();

describe("relativeTime", () => {
  it.each([
    [0, "just now"],
    [44, "just now"],
    [45, "1 minute ago"],
    [60, "1 minute ago"],
    [119, "1 minute ago"],
    [120, "2 minutes ago"],
    [59 * 60, "59 minutes ago"],
    [60 * 60, "1 hour ago"],
    [2 * 3600 + 59, "2 hours ago"],
    [23 * 3600, "23 hours ago"],
    [24 * 3600, "1 day ago"],
    [3 * 86400, "3 days ago"],
    [29 * 86400, "29 days ago"],
  ])("%i seconds ago reads %j", (seconds, text) => {
    expect(relativeTime(ago(seconds), NOW)).toBe(text);
  });

  it("falls back to the date after 30 days", () => {
    expect(relativeTime("2026-10-01T09:00:00Z", NOW)).toBe("Oct 1, 2026");
    expect(relativeTime(ago(30 * 86400), NOW)).toBe("Oct 11, 2026");
  });

  it("reads a time slightly in the future (a clock that is a little off) as just now", () => {
    expect(relativeTime(new Date(NOW.getTime() + 30_000).toISOString(), NOW)).toBe("just now");
  });

  it("returns an empty string for a date it can't read", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});

describe("absolute formats", () => {
  it("formats the date and the date and time in UTC, so the server and the browser agree", () => {
    expect(formatDate("2026-11-02T23:59:00Z")).toBe("Nov 2, 2026");
    expect(formatDateTime("2026-11-02T14:20:00Z")).toBe("Nov 2, 2026, 2:20 PM UTC");
    expect(formatDateTime("2026-11-02T00:05:00Z")).toBe("Nov 2, 2026, 12:05 AM UTC");
  });
});
