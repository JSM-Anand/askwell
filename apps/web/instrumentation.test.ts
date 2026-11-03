import { beforeEach, describe, expect, it, vi } from "vitest";

const captureServerException = vi.fn();
vi.mock("./lib/analytics/server", () => ({ captureServerException }));

import { onRequestError } from "./instrumentation";

const ctx = { routerKind: "App Router", routePath: "/x", routeType: "route" };
const cookie = `ph_phc_abc_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: "user_9" }))}; a=b`;

beforeEach(() => {
  vi.unstubAllEnvs();
  captureServerException.mockReset();
});

describe("onRequestError", () => {
  it("captures on the node runtime with the cookie distinct id", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const err = new Error("x");
    await onRequestError(err, { path: "/x", method: "GET", headers: { cookie } }, ctx);
    expect(captureServerException).toHaveBeenCalledWith(err, "user_9");
  });

  it("passes no id when the cookie is absent or malformed", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await onRequestError(new Error("x"), { path: "/", method: "GET", headers: { cookie: "ph_phc_a_posthog=%zz" } }, ctx);
    expect(captureServerException.mock.calls[0]![1]).toBeUndefined();
  });

  it("skips other runtimes", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("x"), { path: "/", method: "GET", headers: {} }, ctx);
    expect(captureServerException).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    captureServerException.mockRejectedValue(new Error("down"));
    await expect(
      onRequestError(new Error("x"), { path: "/", method: "GET", headers: {} }, ctx),
    ).resolves.toBeUndefined();
  });
});
