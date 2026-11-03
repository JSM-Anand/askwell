import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("../supabase/service", () => ({ createServiceClient: () => ({ from, rpc }) }));

import { HISTORY_MESSAGES, MATCH_COUNT, consumeMessage, conversationBelongsToProject, findExcerpts, findProject, isFirstConversation, loadHistory, saveTurn } from "./data";

type Result = { data: unknown; error: { message: string } | null };

/** A query chain `from(table).a(..).b(..)...` that records every call and ends with `result`. */
function chain(methods: string[], result: Result) {
  const calls: [string, unknown[]][] = [];
  const build = (i: number): unknown => {
    const name = methods[i]!;
    return (...args: unknown[]) => {
      calls.push([name, args]);
      return i === methods.length - 1 ? Promise.resolve(result) : { [methods[i + 1]!]: build(i + 1) };
    };
  };
  return { calls, entry: { [methods[0]!]: build(0) } };
}

beforeEach(() => vi.clearAllMocks());

describe("findProject", () => {
  it("looks the project up by public key only and selects only the id, owner and plan", async () => {
    const { calls, entry } = chain(["select", "eq", "maybeSingle"], { data: { id: "p1", owner_id: "user_o", accounts: { plan: "pro" } }, error: null });
    from.mockReturnValueOnce(entry);
    expect(await findProject("pk_a")).toEqual({ id: "p1", ownerId: "user_o", plan: "pro" });
    expect(from).toHaveBeenCalledWith("projects");
    expect(calls).toEqual([["select", ["id, owner_id, accounts(plan)"]], ["eq", ["public_key", "pk_a"]], ["maybeSingle", []]]);
  });

  it("returns null for an unknown key", async () => {
    from.mockReturnValueOnce(chain(["select", "eq", "maybeSingle"], { data: null, error: null }).entry);
    expect(await findProject("pk_nope")).toBeNull();
  });

  it.each([[{ plan: "enterprise" }], [null], [{ plan: null }]])("treats an unknown plan (%j) as Free", async (accounts) => {
    from.mockReturnValueOnce(chain(["select", "eq", "maybeSingle"], { data: { id: "p1", owner_id: "user_o", accounts }, error: null }).entry);
    expect(await findProject("pk_a")).toEqual({ id: "p1", ownerId: "user_o", plan: "free" });
  });

  it("throws on a database error", async () => {
    from.mockReturnValueOnce(chain(["select", "eq", "maybeSingle"], { data: null, error: { message: "boom" } }).entry);
    await expect(findProject("pk_a")).rejects.toThrow("could not read the project: boom");
  });
});

describe("conversationBelongsToProject", () => {
  it("asks for the conversation id AND the project id", async () => {
    const { calls, entry } = chain(["select", "eq", "eq", "maybeSingle"], { data: { id: "c1" }, error: null });
    from.mockReturnValueOnce(entry);
    expect(await conversationBelongsToProject("c1", "p1")).toBe(true);
    expect(from).toHaveBeenCalledWith("conversations");
    expect(calls.filter(([n]) => n === "eq").map(([, a]) => a)).toEqual([["id", "c1"], ["project_id", "p1"]]);
  });

  it("is false when no such conversation exists in this project", async () => {
    from.mockReturnValueOnce(chain(["select", "eq", "eq", "maybeSingle"], { data: null, error: null }).entry);
    expect(await conversationBelongsToProject("c1", "other-project")).toBe(false);
  });

  it("throws on a database error", async () => {
    from.mockReturnValueOnce(chain(["select", "eq", "eq", "maybeSingle"], { data: null, error: { message: "boom" } }).entry);
    await expect(conversationBelongsToProject("c1", "p1")).rejects.toThrow("could not read the conversation: boom");
  });
});

describe("loadHistory", () => {
  it("fetches the newest messages of that conversation and returns them oldest first", async () => {
    const { calls, entry } = chain(["select", "eq", "order", "limit"], {
      // The query asks newest first, as the database returns it.
      data: [{ role: "bot", body: "answer 2" }, { role: "visitor", body: "question 2" }, { role: "bot", body: "answer 1" }, { role: "visitor", body: "question 1" }],
      error: null,
    });
    from.mockReturnValueOnce(entry);
    const history = await loadHistory("c1");
    expect(from).toHaveBeenCalledWith("messages");
    expect(calls).toEqual([
      ["select", ["role, body"]],
      ["eq", ["conversation_id", "c1"]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [HISTORY_MESSAGES]],
    ]);
    expect(HISTORY_MESSAGES).toBe(6);
    expect(history).toEqual([
      { role: "visitor", body: "question 1" },
      { role: "bot", body: "answer 1" },
      { role: "visitor", body: "question 2" },
      { role: "bot", body: "answer 2" },
    ]);
  });

  it("returns an empty list when there is nothing", async () => {
    from.mockReturnValueOnce(chain(["select", "eq", "order", "limit"], { data: null, error: null }).entry);
    expect(await loadHistory("c1")).toEqual([]);
  });

  it("throws on a database error", async () => {
    from.mockReturnValueOnce(chain(["select", "eq", "order", "limit"], { data: null, error: { message: "boom" } }).entry);
    await expect(loadHistory("c1")).rejects.toThrow("could not read the conversation history: boom");
  });
});

describe("consumeMessage", () => {
  it("calls consume_message with the project and the limit, and returns its answer", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await consumeMessage("p1", 100)).toBe(true);
    expect(await consumeMessage("p1", 100)).toBe(false);
    expect(rpc).toHaveBeenCalledWith("consume_message", { p_project_id: "p1", p_limit: 100 });
  });

  it("throws on a database error instead of reading it as 'quota used up'", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(consumeMessage("p1", 100)).rejects.toThrow("could not count the message: boom");
  });
});

describe("findExcerpts", () => {
  it("calls match_chunks with the embedding as pgvector text and the top 5", async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: "c1", source_id: "s1", content: "first", similarity: 0.9 }, { id: "c2", source_id: "s1", content: "second", similarity: 0.5 }], error: null });
    expect(await findExcerpts("p1", [0.5, -1, 2])).toEqual([{ content: "first" }, { content: "second" }]);
    expect(rpc).toHaveBeenCalledWith("match_chunks", { p_project_id: "p1", p_embedding: "[0.5,-1,2]", p_count: 5 });
    expect(MATCH_COUNT).toBe(5);
  });

  it("returns an empty list when nothing matches, and throws on an error", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await findExcerpts("p1", [1])).toEqual([]);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(findExcerpts("p1", [1])).rejects.toThrow("could not search the knowledge: boom");
  });
});

describe("saveTurn", () => {
  it("passes a null conversation id to start a conversation, and returns the new id", async () => {
    rpc.mockResolvedValueOnce({ data: "new-conversation", error: null });
    const id = await saveTurn({ projectId: "p1", conversationId: undefined, visitorId: "v1", message: "Hi", reply: "Hello" });
    expect(id).toBe("new-conversation");
    expect(rpc).toHaveBeenCalledWith("save_chat_turn", {
      p_project_id: "p1",
      p_conversation_id: null,
      p_visitor_id: "v1",
      p_visitor_message: "Hi",
      p_bot_reply: "Hello",
    });
  });

  it("passes the existing conversation id", async () => {
    rpc.mockResolvedValueOnce({ data: "c1", error: null });
    await saveTurn({ projectId: "p1", conversationId: "c1", visitorId: "v1", message: "Hi", reply: "Hello" });
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_conversation_id: "c1" });
  });

  it("throws on an error or when no id comes back", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(saveTurn({ projectId: "p1", conversationId: undefined, visitorId: "v", message: "m", reply: "r" })).rejects.toThrow("could not save the conversation: boom");
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(saveTurn({ projectId: "p1", conversationId: undefined, visitorId: "v", message: "m", reply: "r" })).rejects.toThrow("no conversation id returned");
  });
});

describe("isFirstConversation", () => {
  const methods = ["select", "eq", "order", "order", "limit", "maybeSingle"];

  it("is true when the saved conversation is the project's earliest", async () => {
    const { calls, entry } = chain(methods, { data: { id: "c1" }, error: null });
    from.mockReturnValueOnce(entry);
    expect(await isFirstConversation("p1", "c1")).toBe(true);
    expect(from).toHaveBeenCalledWith("conversations");
    expect(calls[1]).toEqual(["eq", ["project_id", "p1"]]);
  });

  it("is false when an earlier conversation exists", async () => {
    from.mockReturnValueOnce(chain(methods, { data: { id: "c0" }, error: null }).entry);
    expect(await isFirstConversation("p1", "c1")).toBe(false);
  });

  it("throws on a database error", async () => {
    from.mockReturnValueOnce(chain(methods, { data: null, error: { message: "boom" } }).entry);
    await expect(isFirstConversation("p1", "c1")).rejects.toThrow("could not read the first conversation: boom");
  });
});
