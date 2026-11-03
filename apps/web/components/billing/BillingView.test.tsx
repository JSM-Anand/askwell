// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ refresh: vi.fn(), openUserProfile: vi.fn(), table: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openUserProfile: m.openUserProfile }),
  PricingTable: (props: { newSubscriptionRedirectUrl?: string }) => {
    m.table(props);
    return <div data-testid="pricing-table" />;
  },
}));

import { BillingView } from "./BillingView";
import { MAX_POLLS, POLL_INTERVAL_MS } from "./billing-state";

const view = (over: Partial<Parameters<typeof BillingView>[0]> = {}) =>
  render(<BillingView plan="free" planLabel="Free plan" checkedOut={false} {...over} />);

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("BillingView", () => {
  it("shows the plan from our data with its limits", () => {
    view({ plan: "pro", planLabel: "Pro plan" });
    expect(screen.getByTestId("current-plan").textContent).toBe("Pro plan");
    expect(screen.getByText("5 projects")).toBeTruthy();
  });

  it("shows Free with the Free limits", () => {
    view();
    expect(screen.getByTestId("current-plan").textContent).toBe("Free plan");
    expect(screen.getByText("1 project")).toBeTruthy();
  });

  it("renders Clerk's pricing table, returning to the pending state after checkout", () => {
    view();
    expect(screen.getByTestId("pricing-table")).toBeTruthy();
    expect(m.table.mock.calls[0]![0].newSubscriptionRedirectUrl).toBe("/dashboard/billing?checkout=done");
  });

  it("opens Clerk's account portal from Manage subscription", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: "Manage subscription" }));
    expect(m.openUserProfile).toHaveBeenCalledTimes(1);
  });

  it("shows no pending state when the owner did not just check out", () => {
    view();
    expect(screen.queryByText("Updating your plan…")).toBeNull();
    vi.advanceTimersByTime(POLL_INTERVAL_MS * 3);
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it("shows Updating your plan… and refreshes on a timer after checkout while still Free", () => {
    view({ checkedOut: true });
    expect(screen.getByText("Updating your plan…")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(m.refresh).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(m.refresh).toHaveBeenCalledTimes(2);
  });

  it("stops polling and says it is still Free, with a Refresh button", async () => {
    view({ checkedOut: true });
    for (let i = 0; i < MAX_POLLS; i++) act(() => void vi.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(m.refresh).toHaveBeenCalledTimes(MAX_POLLS);
    expect(screen.queryByText("Updating your plan…")).toBeNull();
    expect(screen.getByText(/Your plan is still Free/)).toBeTruthy();
    act(() => void vi.advanceTimersByTime(POLL_INTERVAL_MS * 5));
    expect(m.refresh).toHaveBeenCalledTimes(MAX_POLLS);

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(m.refresh).toHaveBeenCalledTimes(MAX_POLLS + 1);
  });

  it("shows Pro as done, and does not poll, once our data says pro", () => {
    view({ plan: "pro", planLabel: "Pro plan", checkedOut: true });
    expect(screen.getByText(/You are on Pro/)).toBeTruthy();
    expect(screen.queryByText("Updating your plan…")).toBeNull();
    vi.advanceTimersByTime(POLL_INTERVAL_MS * 3);
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it("switches from waiting to done when a refresh brings the Pro plan", () => {
    const { rerender } = view({ checkedOut: true });
    expect(screen.getByText("Updating your plan…")).toBeTruthy();
    rerender(<BillingView plan="pro" planLabel="Pro plan" checkedOut />);
    expect(screen.queryByText("Updating your plan…")).toBeNull();
    expect(screen.getByText(/You are on Pro/)).toBeTruthy();
  });
});
