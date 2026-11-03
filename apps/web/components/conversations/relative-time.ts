const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

// UTC, so the text doesn't depend on the viewer's (or the server's) time zone.
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** "Nov 2, 2026". */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** "Nov 2, 2026, 2:20 PM UTC": exact, and the same on the server and in the browser. */
export const formatDateTime = (iso: string) => `${dateTimeFormat.format(new Date(iso))} UTC`;

/**
 * "just now", "5 minutes ago", "3 hours ago", "2 days ago", and the date after 30 days. A time a little in the
 * future (a clock that is slightly off) reads as "just now". Pure: `now` is passed in.
 */
export function relativeTime(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.floor((now.getTime() - then) / 1000);

  if (seconds < 45) return "just now";
  if (seconds < HOUR) return plural(Math.max(1, Math.floor(seconds / MINUTE)), "minute");
  if (seconds < DAY) return plural(Math.floor(seconds / HOUR), "hour");
  if (seconds < 30 * DAY) return plural(Math.floor(seconds / DAY), "day");
  return formatDate(iso);
}
