import { beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
vi.mock("posthog-js", () => ({ default: { init } }));

import { initAnalytics, isTrackedPath, resetAnalyticsForTests } from "./client";

const fetchMock = vi.fn();

beforeEach(() => {
  resetAnalyticsForTests();
  init.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const configured = () =>
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ key: "phc_x", host: "https://h" }),
  });

describe("isTrackedPath", () => {
  it.each(["/", "/dashboard", "/dashboard/abc"])("tracks %s", (p) =>
    expect(isTrackedPath(p)).toBe(true),
  );
  it.each(["/embed", "/embed/key", "/dashboardx", "/sign-in"])("skips %s", (p) =>
    expect(isTrackedPath(p)).toBe(false),
  );
});

describe("initAnalytics", () => {
  it("does nothing on /embed: no fetch, no init", async () => {
    expect(await initAnalytics("/embed/abc")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
  });

  it("inits once with masked replay and exception capture", async () => {
    configured();
    await initAnalytics("/dashboard");
    await initAnalytics("/dashboard/x");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      "phc_x",
      expect.objectContaining({
        api_host: "https://h",
        person_profiles: "identified_only",
        capture_exceptions: true,
        session_recording: { maskAllInputs: true, maskTextSelector: "*" },
      }),
    );
  });

  it("stays off, and stops fetching, when config is missing", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ key: null, host: null }) });
    expect(await initAnalytics("/")).toBeNull();
    expect(await initAnalytics("/")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(init).not.toHaveBeenCalled();
  });

  it("retries after a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await initAnalytics("/")).toBeNull();
    configured();
    expect(await initAnalytics("/")).not.toBeNull();
  });
});
