import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveConfig } from "./customize-client";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const config = { buttonColor: "#ff0000", position: "bottom-right", label: "Ask us", animation: "fade", headerText: "Chat with us", showBadge: true };

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("saveConfig", () => {
  it("PATCHes the project's config with only the fields it is given", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { config }));
    await expect(saveConfig("p1", { buttonColor: "#ff0000" })).resolves.toEqual({ ok: true, config });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/projects/p1/config");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ buttonColor: "#ff0000" });
  });

  it("returns the server's error code and message, so a 402 can be recognised", async () => {
    fetchMock.mockResolvedValueOnce(reply(402, { error: { code: "plan_required", message: "Customizing the widget is a Pro feature." } }));
    await expect(saveConfig("p1", { label: "x" })).resolves.toEqual({ ok: false, code: "plan_required", message: "Customizing the widget is a Pro feature." });
  });

  it.each([null, "ok", 5, {}])("treats a 200 whose body is %j as a failure, not a save", async (body) => {
    fetchMock.mockResolvedValueOnce(reply(200, body));
    await expect(saveConfig("p1", { label: "x" })).resolves.toMatchObject({ ok: false, code: "internal_error" });
  });

  it("falls back to a generic error when the body isn't JSON, and reports a network failure", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error("no json"); } });
    await expect(saveConfig("p1", { label: "x" })).resolves.toMatchObject({ ok: false, code: "internal_error" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(saveConfig("p1", { label: "x" })).resolves.toMatchObject({ ok: false, code: "network" });
  });
});
