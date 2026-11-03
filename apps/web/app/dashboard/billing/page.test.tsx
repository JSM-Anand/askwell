import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ protect: vi.fn(), getAccount: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: m.protect } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openUserProfile: vi.fn() }),
  PricingTable: () => <div data-testid="pricing-table" />,
}));
vi.mock("../../../lib/accounts/get-account", () => ({
  getAccount: m.getAccount,
  planLabel: (p: string) => `${p.charAt(0).toUpperCase()}${p.slice(1)} plan`,
}));

import BillingPage from "./page";

const render = async (searchParams: Record<string, string | string[] | undefined> = {}) =>
  renderToStaticMarkup(await BillingPage({ searchParams: Promise.resolve(searchParams) }));
const account = (plan: string) => ({ clerkUserId: "u", plan, createdAt: "2026-01-01" });

beforeEach(() => {
  vi.clearAllMocks();
  m.protect.mockResolvedValue({});
  m.getAccount.mockResolvedValue(account("free"));
});

describe("the Billing page", () => {
  it("is its own gate: it checks the session before reading the account", async () => {
    await render();
    expect(m.protect.mock.invocationCallOrder[0]).toBeLessThan(m.getAccount.mock.invocationCallOrder[0]!);
  });

  it("shows the plan from our database, Free", async () => {
    const html = await render();
    expect(html).toContain("Billing");
    expect(html).toContain("Free plan");
    expect(html).toContain("1 project");
    expect(html).toContain("pricing-table");
    expect(html).not.toContain("Updating your plan");
  });

  it("shows the plan from our database, Pro", async () => {
    m.getAccount.mockResolvedValue(account("pro"));
    const html = await render();
    expect(html).toContain("Pro plan");
    expect(html).toContain("5 projects");
  });

  it("shows the pending upgrade after checkout while the database still says free", async () => {
    const html = await render({ checkout: "done" });
    expect(html).toContain("Updating your plan…");
    expect(html).toContain("Free plan");
  });

  it("does not show the pending state for another value of the query", async () => {
    expect(await render({ checkout: "yes" })).not.toContain("Updating your plan");
    expect(await render({ checkout: ["done", "done"] })).not.toContain("Updating your plan");
  });

  it("shows Pro as done after checkout once the webhook has run", async () => {
    m.getAccount.mockResolvedValue(account("pro"));
    const html = await render({ checkout: "done" });
    expect(html).toContain("You are on Pro");
    expect(html).not.toContain("Updating your plan");
  });

  it("shows an error state when the account cannot be read", async () => {
    m.getAccount.mockRejectedValue(new Error("db down"));
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("We could not load your plan");
    expect(html).not.toContain("db down");
  });

  it("shows an empty state when there is no account row", async () => {
    m.getAccount.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("No account yet");
    expect(html).toContain('href="/dashboard"');
  });
});
