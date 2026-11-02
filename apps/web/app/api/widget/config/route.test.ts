import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";

vi.mock("server-only", () => ({}));

const { maybeSingle, eq, select, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingle, eq, select, from };
});
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: vi.fn(() => ({ from })) }));

const { protectWidgetConfig } = vi.hoisted(() => ({
  protectWidgetConfig: vi.fn(async (): Promise<{ allowed: true } | { allowed: false; reason: string }> => ({ allowed: true })),
}));
vi.mock("../../../../lib/security/arcjet", () => ({ protectWidgetConfig }));

import { GET, OPTIONS } from "./route";

const call = (query = "?key=pk_abc") => GET(new NextRequest(`http://localhost:3000/api/widget/config${query}`));

const proRow = {
  widget_configs: {
    button_color: "#ff0000",
    position: "top-left",
    label: "Help me",
    animation: "scale",
    header_text: "Support",
    show_badge: false,
  },
  accounts: { plan: "pro" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/widget/config", () => {
  it("returns a Pro project's config as stored", async () => {
    maybeSingle.mockResolvedValueOnce({ data: proRow, error: null });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      buttonColor: "#ff0000",
      position: "top-left",
      label: "Help me",
      animation: "scale",
      headerText: "Support",
      showBadge: false,
    });
  });

  it("looks the project up by public key only", async () => {
    maybeSingle.mockResolvedValueOnce({ data: proRow, error: null });
    await call("?key=pk_xyz");
    expect(from).toHaveBeenCalledWith("projects");
    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("public_key", "pk_xyz");
  });

  it("selects only the config and the plan, nothing else about the project", async () => {
    maybeSingle.mockResolvedValueOnce({ data: proRow, error: null });
    await call();
    const columns = (select.mock.calls[0] as unknown as [string])[0];
    expect(columns).toContain("widget_configs(");
    expect(columns).toContain("accounts(plan)");
    for (const secret of ["owner_id", "name", "messages_used", "public_key", "id,", "clerk_user_id"]) {
      expect(columns, secret).not.toContain(secret);
    }
  });

  it("gives a Free project the defaults and the badge, even with Pro-only values stored", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { ...proRow, accounts: { plan: "free" } }, error: null });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("treats an unknown plan as Free", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { ...proRow, accounts: { plan: "enterprise" } }, error: null });
    expect(await (await call()).json()).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("falls back to the defaults when the config row is missing", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { widget_configs: null, accounts: { plan: "pro" } }, error: null });
    expect(await (await call()).json()).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("returns 404 not_found for an unknown key", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await call("?key=pk_nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: expect.any(String) } });
  });

  it.each(["", "?key=", `?key=${"a".repeat(101)}`])("returns 400 invalid_input for %j", async (query) => {
    const res = await call(query);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "invalid_input", message: expect.any(String) } });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 500 internal_error without leaking the database message", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "secret detail" } });
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("secret detail");
  });

  it("asks Arcjet about the public key from the query, before touching the database", async () => {
    maybeSingle.mockResolvedValueOnce({ data: proRow, error: null });
    await call("?key=pk_xyz");
    expect(protectWidgetConfig).toHaveBeenCalledTimes(1);
    expect(protectWidgetConfig).toHaveBeenCalledWith(expect.any(NextRequest), "pk_xyz");
  });

  it("returns 429 rate_limited with the CORS headers when blocked, without any database work", async () => {
    protectWidgetConfig.mockResolvedValueOnce({ allowed: false, reason: "rate_limited" });
    const res = await call("?key=pk_busy");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "rate_limited", message: expect.any(String) } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(from).not.toHaveBeenCalled();
  });

  it("does not spend rate limit on a request that fails validation", async () => {
    await call("");
    await call("?key=");
    expect(protectWidgetConfig).not.toHaveBeenCalled();
  });

  it("allows any origin and disables caching on every response", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: proRow, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "x" } });
    const responses = [await call(), await call("?key=pk_nope"), await call("?key=pk_err"), await call("")];
    for (const res of responses) {
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(responses.map((r) => r.status)).toEqual([200, 404, 500, 400]);
  });
});

describe("OPTIONS /api/widget/config", () => {
  it("answers the CORS preflight", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
