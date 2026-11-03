import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conversationsHref, getConversation, listConversations } from "./conversations-client";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("conversations client", () => {
  it("lists a project's conversations, never from the cache", async () => {
    reply(200, { conversations: [] });
    await expect(listConversations("p1")).resolves.toEqual({ ok: true, data: { conversations: [] } });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/conversations", { cache: "no-store" });
  });

  it("gets one conversation by id", async () => {
    reply(200, { conversation: { id: "c1" }, messages: [] });
    await getConversation("c1");
    expect(fetchMock).toHaveBeenCalledWith("/api/conversations/c1", { cache: "no-store" });
  });

  it("returns the server's error code and message", async () => {
    reply(404, { error: { code: "not_found", message: "No conversation with that ID." } });
    await expect(getConversation("c1")).resolves.toEqual({ ok: false, code: "not_found", message: "No conversation with that ID." });
  });

  it.each([null, "ok", 5])("treats a 200 with the body %j as a failure", async (body) => {
    reply(200, body);
    await expect(listConversations("p1")).resolves.toMatchObject({ ok: false, code: "internal_error" });
  });

  it("falls back to a generic error when the body isn't JSON, and reports a network failure", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error("no json"); } });
    await expect(listConversations("p1")).resolves.toMatchObject({ ok: false, code: "internal_error" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(listConversations("p1")).resolves.toMatchObject({ ok: false, code: "network" });
  });
});

describe("conversationsHref", () => {
  it("builds the project and conversation addresses", () => {
    expect(conversationsHref("p1")).toBe("/dashboard/conversations?project=p1");
    expect(conversationsHref("p1", "c1")).toBe("/dashboard/conversations?project=p1&conversation=c1");
  });

  it("encodes the ids", () => {
    expect(conversationsHref("a&b", "c=d")).toBe("/dashboard/conversations?project=a%26b&conversation=c%3Dd");
  });
});
