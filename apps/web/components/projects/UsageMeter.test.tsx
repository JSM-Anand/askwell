import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsageMeter } from "./UsageMeter";

const NOW = new Date("2026-11-10T12:00:00Z");
const START = "2026-11-03T14:30:00Z";
const meter = (props: Partial<Parameters<typeof UsageMeter>[0]> = {}) =>
  renderToStaticMarkup(<UsageMeter messagesUsed={42} periodStart={START} plan="free" now={NOW} {...props} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("UsageMeter", () => {
  it("reads '42 / 100 messages this month · resets 3 Dec'", () => {
    expect(text(meter())).toContain("42 / 100 messages this month · resets 3 Dec");
  });

  it("keeps the reset date on one line", () => {
    expect(meter()).toContain('whitespace-nowrap');
    expect(meter()).toMatch(/whitespace-nowrap">· resets (<!-- -->)?3 Dec<\/span>/);
  });

  it("has a thin bar as a progressbar with the count and the limit", () => {
    const html = meter();
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain("h-1.5");
    expect(html).toContain("width:42%");
  });

  it("uses the normal style under 90%", () => {
    const html = meter({ messagesUsed: 89 });
    expect(html).toContain('data-usage="ok"');
    expect(html).toContain("bg-accent");
    expect(html).not.toContain("bg-danger");
    expect(html).not.toContain("Limit reached");
  });

  it("turns the bar to the warning style at 90%, without the limit message", () => {
    const html = meter({ messagesUsed: 90 });
    expect(html).toContain('data-usage="warning"');
    expect(html).toContain("bg-danger");
    expect(html).not.toContain("bg-accent");
    expect(html).not.toContain("Limit reached");
  });

  it("says the limit is reached, with the quota-message wording, and a full bar", () => {
    const html = meter({ messagesUsed: 100 });
    expect(html).toContain('data-usage="limit"');
    expect(text(html)).toContain("Limit reached: the widget is showing visitors the quota message.");
    expect(html).toContain("width:100%");
    expect(html).toContain("bg-danger");
  });

  it("links a Free owner at the limit to /dashboard/billing", () => {
    const html = meter({ messagesUsed: 100, plan: "free" });
    expect(html).toContain('href="/dashboard/billing"');
    expect(text(html)).toContain("Upgrade");
  });

  it("has no billing link below the limit on Free", () => {
    expect(meter({ messagesUsed: 99 })).not.toContain("/dashboard/billing");
  });

  it("has no upgrade link for a Pro owner at the limit", () => {
    const html = meter({ messagesUsed: 2000, plan: "pro" });
    expect(text(html)).toContain("2,000 / 2,000 messages this month");
    expect(text(html)).toContain("Limit reached");
    expect(html).not.toContain("/dashboard/billing");
  });

  it("uses the Pro limit and formats thousands", () => {
    const html = meter({ messagesUsed: 1500, plan: "pro" });
    expect(text(html)).toContain("1,500 / 2,000 messages this month");
    expect(html).toContain("width:75%");
    expect(html).toContain('aria-valuemax="2000"');
  });

  it("shows 0 and no reset date once the period has rolled over, even if the old count was at the limit", () => {
    const html = meter({ messagesUsed: 100, periodStart: "2026-09-01T00:00:00Z" });
    expect(text(html)).toContain("0 / 100 messages this month");
    expect(text(html)).not.toContain("resets");
    expect(text(html)).not.toContain("Limit reached");
    expect(html).toContain("width:0%");
    expect(html).toContain('data-usage="ok"');
  });

  it("keeps the bar within the track when used is over the limit, but shows the real count", () => {
    const html = meter({ messagesUsed: 500 });
    expect(text(html)).toContain("500 / 100 messages this month");
    expect(html).toContain("width:100%");
    expect(html).toContain('aria-valuenow="100"');
  });
});
