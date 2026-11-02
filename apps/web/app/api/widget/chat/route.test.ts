import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { handleChat } = vi.hoisted(() => ({ handleChat: vi.fn() }));
vi.mock("../../../../lib/chat/handle-chat", () => ({ handleChat }));

import { OPTIONS, POST } from "./route";

const post = (body: BodyInit | null = JSON.stringify({ key: "pk_a" })) =>
  POST(new NextRequest("http://localhost:3000/api/widget/chat", { method: "POST", body, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  handleChat.mockResolvedValue({ status: 200, body: { conversationId: "c1", reply: "Hi" } });
});

describe("POST /api/widget/chat", () => {
  it("returns the handler's status and body", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversationId: "c1", reply: "Hi" });
  });

  it("hands the request and the parsed JSON body to the handler", async () => {
    await post(JSON.stringify({ key: "pk_a", message: "hello" }));
    expect(handleChat).toHaveBeenCalledWith(expect.any(NextRequest), { key: "pk_a", message: "hello" });
  });

  it("hands undefined to the handler when the body isn't JSON, so the schema check answers 400", async () => {
    await post("{not json");
    expect(handleChat).toHaveBeenCalledWith(expect.any(NextRequest), undefined);
  });

  it.each([200, 400, 404, 429, 500, 503])("allows any origin and disables caching on a %i response", async (status) => {
    handleChat.mockResolvedValueOnce({ status, body: { error: { code: "x", message: "y" } } });
    const res = await post();
    expect(res.status).toBe(status);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("OPTIONS /api/widget/chat", () => {
  it("answers the CORS preflight for a JSON POST from any origin", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
