// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const identify = vi.fn();
const reset = vi.fn();
const initAnalytics = vi.hoisted(() => vi.fn());
let pathname = "/dashboard";
let auth: { isLoaded: boolean; userId: string | null } = { isLoaded: true, userId: "user_1" };

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));
vi.mock("../../lib/analytics/client", () => ({ initAnalytics }));

import { PostHogProvider } from "./PostHogProvider";

beforeEach(() => {
  identify.mockClear();
  reset.mockClear();
  initAnalytics.mockReset();
  initAnalytics.mockImplementation(async (p: string) =>
    p.startsWith("/embed") ? null : { identify, reset },
  );
  pathname = "/dashboard";
  auth = { isLoaded: true, userId: "user_1" };
});
afterEach(cleanup);

describe("PostHogProvider", () => {
  it("identifies with the Clerk user ID and no properties", async () => {
    render(<PostHogProvider />);
    await waitFor(() => expect(identify).toHaveBeenCalledWith("user_1"));
    expect(identify.mock.calls[0]).toHaveLength(1);
  });

  it("does not identify on /embed", async () => {
    pathname = "/embed/key";
    render(<PostHogProvider />);
    await waitFor(() => expect(initAnalytics).toHaveBeenCalled());
    expect(identify).not.toHaveBeenCalled();
  });

  it("resets after sign-out", async () => {
    const { rerender } = render(<PostHogProvider />);
    await waitFor(() => expect(identify).toHaveBeenCalled());
    auth = { isLoaded: true, userId: null };
    rerender(<PostHogProvider />);
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  });
});
