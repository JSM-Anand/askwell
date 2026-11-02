import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_NAME, DEFAULT_WIDGET_CONFIG, MAX_MESSAGE_LENGTH } from "@askwell/shared";
import { ChatView } from "./ChatView";
import { EmbedPanel } from "./EmbedPanel";
import { canSend, chatReducer, initialChat } from "./chat-state";
import { loadConfig } from "./load-config";
import { MOCK_REPLY, TYPING_MS, getReply } from "./mock-reply";
import { parseParentOrigin } from "./parent-origin";
import { getVisitorId } from "./visitor-id";

afterEach(() => vi.useRealTimers());

const view = (over: Partial<Parameters<typeof ChatView>[0]> = {}) =>
  renderToStaticMarkup(
    <ChatView messages={[]} typing={false} draft="" showBadge onDraftChange={() => {}} onSubmit={() => {}} {...over} />,
  );

describe("send → typing → reply", () => {
  it("shows the visitor message and typing, then the mock reply after about a second", async () => {
    vi.useFakeTimers();
    let state = chatReducer(initialChat, { type: "send", text: "Hi" });
    expect(state.typing).toBe(true);
    expect(view({ messages: state.messages, typing: state.typing })).toContain("Typing");

    const reply = getReply();
    await vi.advanceTimersByTimeAsync(TYPING_MS - 1);
    let settled = false;
    void reply.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    state = chatReducer(state, { type: "reply", text: await reply });

    expect(state.typing).toBe(false);
    expect(state.messages.map((m) => [m.from, m.text])).toEqual([
      ["visitor", "Hi"],
      ["bot", MOCK_REPLY],
    ]);
    const html = view({ messages: state.messages });
    expect(html).toContain(MOCK_REPLY);
    expect(html).not.toContain("Typing");
  });

  it("only lets a non-empty draft be sent, and not while typing", () => {
    expect(canSend("  ", false)).toBe(false);
    expect(canSend("Hi", true)).toBe(false);
    expect(canSend("Hi", false)).toBe(true);
  });

  it("limits the input to MAX_MESSAGE_LENGTH", () => {
    expect(view()).toContain(`maxLength="${MAX_MESSAGE_LENGTH}"`);
  });
});

describe("message text", () => {
  it("renders <b> as literal text, never HTML", () => {
    const html = view({
      messages: [
        { id: 0, from: "visitor", text: "<b>hi</b>" },
        { id: 1, from: "bot", text: "<img src=x onerror=alert(1)>" },
      ],
    });
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<img");
  });
});

describe("badge", () => {
  it("shows Powered by APP_NAME when showBadge is true", () => {
    expect(view({ showBadge: true })).toContain(`Powered by ${APP_NAME}`);
  });

  it("hides it when showBadge is false", () => {
    expect(view({ showBadge: false })).not.toContain("Powered by");
  });
});

describe("visitor ID", () => {
  const memoryStore = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it("creates an ID once and reuses it on later visits", () => {
    const store = memoryStore();
    const first = getVisitorId(() => store);
    expect(first).toMatch(/^[0-9a-f-]{32,36}$/);
    expect(getVisitorId(() => store)).toBe(first);
  });

  it("still returns an ID when storage throws", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    expect(getVisitorId(blocked)).toMatch(/^[0-9a-f-]{32,36}$/);
  });
});

describe("parent origin", () => {
  it("accepts exact http(s) origins only", () => {
    expect(parseParentOrigin("http://localhost:8080")).toBe("http://localhost:8080");
    expect(parseParentOrigin("https://shop.example")).toBe("https://shop.example");
    for (const bad of [undefined, "", "*", "null", "javascript:alert(1)", "http://a.example/path", "http://a.example/", "http://u:p@a.example", "file:///x"]) {
      expect(parseParentOrigin(bad)).toBeNull();
    }
  });
});

describe("loadConfig", () => {
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("uses the server config", async () => {
    const config = { ...DEFAULT_WIDGET_CONFIG, headerText: "Ask Acme", showBadge: false };
    const getJson = reply(config);
    expect(await loadConfig("pk_a b", getJson)).toEqual({ status: "ready", config });
    expect(getJson).toHaveBeenCalledWith("/api/widget/config?key=pk_a%20b", expect.anything());
  });

  it("says the chat isn't available for a missing key without fetching", async () => {
    const getJson = reply({});
    expect(await loadConfig(undefined, getJson)).toEqual({ status: "unavailable" });
    expect(getJson).not.toHaveBeenCalled();
  });

  it("says the chat isn't available for a key the server rejects", async () => {
    expect(await loadConfig("pk_x", reply({ error: { code: "not_found", message: "x" } }, 404))).toEqual({ status: "unavailable" });
    expect(await loadConfig("pk_x", reply({ error: { code: "invalid_input", message: "x" } }, 400))).toEqual({ status: "unavailable" });
  });

  it("falls back to the defaults on a network error, a 5xx or a malformed body", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    const defaults = { status: "ready", config: DEFAULT_WIDGET_CONFIG };
    expect(await loadConfig("pk_x", failing)).toEqual(defaults);
    expect(await loadConfig("pk_x", reply({}, 500))).toEqual(defaults);
    expect(await loadConfig("pk_x", reply({ nope: true }))).toEqual(defaults);
  });
});

describe("EmbedPanel", () => {
  it("starts with a loading state and a close button", () => {
    const html = renderToStaticMarkup(<EmbedPanel projectKey="pk_x" origin="http://localhost:8080" />);
    expect(html).toContain("Loading chat");
    expect(html).toContain('aria-label="Close chat"');
  });
});
