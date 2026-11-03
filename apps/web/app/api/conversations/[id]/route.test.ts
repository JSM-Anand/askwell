import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const CONV = "11111111-1111-4111-8111-111111111111";
const OTHERS = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

const m = vi.hoisted(() => {
  const state = { conversations: [] as Row[], messages: [] as Row[], visible: new Set<string>(), failOn: "" };
  const calls: string[] = [];
  const orders: string[] = [];
  const client = {
    from: (table: string) => {
      calls.push(`from ${table}`);
      if (table === "conversations") {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () =>
                state.failOn === "conversations"
                  ? { data: null, error: { message: "secret detail" } }
                  : { data: state.visible.has(id) ? state.conversations.find((c) => c.id === id) ?? null : null, error: null },
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: (_column: string, id: string) => {
            const chain = {
              order: (column: string, opts: { ascending: boolean }) => {
                orders.push(`${column} ${opts.ascending ? "asc" : "desc"}`);
                return chain;
              },
              then: (resolve: (v: unknown) => unknown) =>
                resolve(
                  state.failOn === "messages"
                    ? { data: null, error: { message: "secret detail" } }
                    : { data: state.visible.has(id) ? state.messages.filter((x) => x.conversation_id === id) : [], error: null },
                ),
            };
            return chain;
          },
        }),
      };
    },
  };
  return { state, calls, orders, auth: vi.fn(), createOwnerClient: vi.fn(() => client), createServiceClient: vi.fn() };
});
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: m.createOwnerClient }));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: m.createServiceClient }));

import { GET } from "./route";

const call = (id = CONV) => GET(new Request(`http://localhost:3000/api/conversations/${id}`), { params: Promise.resolve({ id }) });
const msg = (id: string, role: string, body: string, at: string, conversation = CONV): Row => ({ id, role, body, created_at: at, conversation_id: conversation });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.calls.length = 0;
  m.orders.length = 0;
  m.state.failOn = "";
  m.state.visible = new Set([CONV]);
  m.state.conversations = [
    { id: CONV, visitor_id: "visitor_1", created_at: "2026-11-02T10:00:00Z" },
    { id: OTHERS, visitor_id: "visitor_x", created_at: "2026-11-02T09:00:00Z" },
  ];
  m.state.messages = [
    msg("m1", "visitor", "Hi there", "2026-11-02T10:00:01Z"),
    msg("m2", "bot", "Hello! How can I help?", "2026-11-02T10:00:02Z"),
    msg("m3", "visitor", "What are your hours?", "2026-11-02T10:00:03Z"),
    msg("m4", "bot", "Nine to five.", "2026-11-02T10:00:04Z"),
    msg("x1", "visitor", "Someone else's secret", "2026-11-02T09:00:01Z", OTHERS),
  ];
  m.auth.mockResolvedValue({ userId: "user_1" });
});

describe("GET /api/conversations/:id", () => {
  it("returns the conversation and both sides of the thread in order", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages.map((x: { id: string; role: string }) => `${x.id}:${x.role}`)).toEqual(["m1:visitor", "m2:bot", "m3:visitor", "m4:bot"]);
    expect(body.messages[0]).toEqual({ id: "m1", role: "visitor", body: "Hi there", createdAt: "2026-11-02T10:00:01Z" });
  });

  it("builds messageCount and firstMessagePreview from the messages it read", async () => {
    const { conversation } = await (await call()).json();
    expect(conversation).toEqual({ id: CONV, visitorId: "visitor_1", createdAt: "2026-11-02T10:00:00Z", messageCount: 4, firstMessagePreview: "Hi there" });
  });

  it("asks the database for the messages oldest first, with the id as a tie-break", async () => {
    await call();
    expect(m.orders).toEqual(["created_at asc", "id asc"]);
  });

  it("previews the earliest visitor message, ignoring a bot message that comes first", async () => {
    m.state.messages = [msg("m0", "bot", "Welcome!", "2026-11-02T10:00:00Z"), msg("m1", "visitor", "Real first", "2026-11-02T10:00:01Z")];
    expect((await (await call()).json()).conversation.firstMessagePreview).toBe("Real first");
  });

  it("cuts a long first message to 140 characters in the preview, but returns the message whole", async () => {
    m.state.messages = [msg("m1", "visitor", "z".repeat(400), "2026-11-02T10:00:01Z")];
    const body = await (await call()).json();
    expect(body.conversation.firstMessagePreview).toBe("z".repeat(140));
    expect(body.messages[0].body).toBe("z".repeat(400));
  });

  it("has a null preview and count 0 for a conversation with no messages", async () => {
    m.state.messages = [];
    const body = await (await call()).json();
    expect(body.conversation).toMatchObject({ messageCount: 0, firstMessagePreview: null });
    expect(body.messages).toEqual([]);
  });

  it("has a null preview when there are only bot messages", async () => {
    m.state.messages = [msg("m1", "bot", "Anyone there?", "2026-11-02T10:00:01Z")];
    expect((await (await call()).json()).conversation.firstMessagePreview).toBeNull();
  });

  it("is 404 for another owner's conversation (RLS shows no row), and never reads its messages", async () => {
    const res = await call(OTHERS);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: expect.any(String) } });
    expect(m.calls).toEqual(["from conversations"]);
  });

  it("is 404 for a conversation that doesn't exist", async () => {
    expect((await call("33333333-3333-4333-8333-333333333333")).status).toBe(404);
  });

  it("never returns another conversation's messages", async () => {
    const body = await (await call()).json();
    expect(JSON.stringify(body)).not.toContain("Someone else's secret");
  });

  it("uses the owner client only, and never creates a service client", async () => {
    await call();
    expect(m.createOwnerClient).toHaveBeenCalledTimes(1);
    expect(m.createServiceClient).not.toHaveBeenCalled();
  });

  it("is 400 invalid_input for an ID that isn't a UUID, before any client is created", async () => {
    const res = await call("not-a-uuid");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(m.createOwnerClient).not.toHaveBeenCalled();
  });

  it("is 401 when signed out", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    const res = await call();
    expect(res.status).toBe(401);
    expect(m.createOwnerClient).not.toHaveBeenCalled();
  });

  it.each(["conversations", "messages"])("is 500 on a database error reading %s, without leaking it", async (failOn) => {
    m.state.failOn = failOn;
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });

  it("is 500 when a message has a role the contract doesn't know", async () => {
    m.state.messages = [msg("m1", "admin", "x", "2026-11-02T10:00:01Z")];
    expect((await call()).status).toBe(500);
  });

  it("returns message bodies untouched, even HTML (the dashboard renders them as text)", async () => {
    m.state.messages = [msg("m1", "visitor", "<img src=x onerror=alert(1)>", "2026-11-02T10:00:01Z")];
    expect((await (await call()).json()).messages[0].body).toBe("<img src=x onerror=alert(1)>");
  });

  it("sends no CORS header and caches nothing", async () => {
    const res = await call();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
