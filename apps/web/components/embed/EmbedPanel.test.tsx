// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { EmbedPanel } from "./EmbedPanel";
import { CHAT_ERRORS } from "./send-message";

const CONVERSATION = "2f0d4c6e-3b1a-4c1e-9d3b-5a6f7e8d9c10";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const chatError = (status: number, code: string) => json(status, { error: { code, message: "server wording" } });

type ChatCall = { key: string; visitorId: string; conversationId?: string; message: string };
let chatCalls: ChatCall[];
let chatResponses: (() => Promise<Response>)[];
const fetchMock = vi.fn();

/** Queue what the chat route answers next; a function lets a test hold the response back. */
const answerWith = (...responses: (Response | (() => Promise<Response>))[]) =>
  responses.forEach((r) => chatResponses.push(typeof r === "function" ? r : async () => r));

beforeEach(() => {
  chatCalls = [];
  chatResponses = [];
  localStorage.clear();
  fetchMock.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/widget/config")) return json(200, { ...DEFAULT_WIDGET_CONFIG, headerText: "Ask Acme" });
    if (url === "/api/widget/chat") {
      chatCalls.push(JSON.parse(init?.body as string));
      const next = chatResponses.shift();
      if (!next) throw new Error("no chat response queued");
      return next();
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openPanel(projectKey: string | undefined = "pk_a") {
  const user = userEvent.setup();
  render(<EmbedPanel projectKey={projectKey} origin="http://localhost:8080" />);
  const input = await screen.findByLabelText("Your message");
  const ask = async (text: string) => {
    await user.type(input, text);
    await user.keyboard("{Enter}");
  };
  return { user, input, ask };
}

describe("the panel talks to the real chat route", () => {
  it("shows the typing state and disables the input while waiting, then shows the reply and enables it again", async () => {
    let release: (r: Response) => void = () => {};
    answerWith(() => new Promise<Response>((resolve) => (release = resolve)));
    const { input, ask } = await openPanel();

    await ask("When do you open?");
    expect(await screen.findByText("When do you open?")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Typing");
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);

    release(json(200, { conversationId: CONVERSATION, reply: "We open at 9am." }));
    expect(await screen.findByText("We open at 9am.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect((input as HTMLInputElement).disabled).toBe(false);
  });

  it("sends the project key, the stored visitor ID and the trimmed message", async () => {
    answerWith(json(200, { conversationId: CONVERSATION, reply: "ok" }));
    const { ask } = await openPanel("pk_live");
    await ask("  hello there  ");
    await screen.findByText("ok");

    expect(chatCalls).toHaveLength(1);
    expect(chatCalls[0]).toMatchObject({ key: "pk_live", message: "hello there" });
    expect(chatCalls[0]!.visitorId).toBe(localStorage.getItem("askwell-visitor-id"));
    expect(chatCalls[0]!.visitorId.length).toBeGreaterThan(10);
  });

  it("keeps the conversation: the first message has no conversationId, the next ones send the one the route returned", async () => {
    answerWith(
      json(200, { conversationId: CONVERSATION, reply: "A flat white costs 4.50." }),
      json(200, { conversationId: CONVERSATION, reply: "A cappuccino costs 4.80." }),
    );
    const { ask } = await openPanel();

    await ask("How much is a flat white?");
    await screen.findByText("A flat white costs 4.50.");
    await ask("And the cappuccino?");
    await screen.findByText("A cappuccino costs 4.80.");

    expect(chatCalls[0]).not.toHaveProperty("conversationId");
    expect(chatCalls[1]).toMatchObject({ conversationId: CONVERSATION, message: "And the cappuccino?" });
    expect(chatCalls[1]!.visitorId).toBe(chatCalls[0]!.visitorId);
  });

  it("a reload starts a new conversation: a fresh panel sends no conversationId", async () => {
    answerWith(json(200, { conversationId: CONVERSATION, reply: "first" }), json(200, { conversationId: CONVERSATION, reply: "second" }));
    const first = await openPanel();
    await first.ask("hi");
    await screen.findByText("first");
    cleanup();

    const second = await openPanel();
    await second.ask("hi again");
    await screen.findByText("second");
    expect(chatCalls[1]).not.toHaveProperty("conversationId");
    expect(chatCalls[1]!.visitorId).toBe(chatCalls[0]!.visitorId); // the visitor ID survives a reload
  });

  it("renders replies and messages as text, never HTML", async () => {
    answerWith(json(200, { conversationId: CONVERSATION, reply: '<b>bold</b><img src=x onerror="alert(1)">' }));
    const { ask } = await openPanel();
    await ask("<i>question</i>");
    await screen.findByText('<b>bold</b><img src=x onerror="alert(1)">');

    expect(screen.getByText("<i>question</i>")).toBeTruthy();
    expect(document.querySelector("b, i, img")).toBeNull();
  });
});

describe("each failure shows its friendly message", () => {
  it.each([
    ["429 rate_limited", chatError(429, "rate_limited"), "You're sending messages quickly. Try again in a minute."],
    ["429 quota_exceeded", chatError(429, "quota_exceeded"), "This chat has reached its monthly limit."],
    ["400 prompt_injection", chatError(400, "prompt_injection"), "I can't help with that."],
    ["503", chatError(503, "internal_error"), "The assistant is busy right now. Try again in a moment."],
    ["500", chatError(500, "internal_error"), "Something went wrong. Try again."],
    ["404", chatError(404, "not_found"), "Something went wrong. Try again."],
  ])("%s", async (_name, response, message) => {
    answerWith(response);
    const { input, ask } = await openPanel();
    await ask("hello");

    const notice = await screen.findByRole("alert");
    expect(notice.textContent).toBe(message);
    expect(screen.queryByText("server wording")).toBeNull();
    expect(screen.getByText("hello")).toBeTruthy(); // the visitor's message stays
    expect(screen.queryByRole("status")).toBeNull();
    expect((input as HTMLInputElement).disabled).toBe(false); // they can try again
  });

  it("a network failure shows the generic message", async () => {
    answerWith(async () => {
      throw new TypeError("network down");
    });
    const { ask } = await openPanel();
    await ask("hello");
    expect((await screen.findByRole("alert")).textContent).toBe(CHAT_ERRORS.generic);
  });

  it("a failed first message doesn't start a conversation: the retry sends no conversationId", async () => {
    answerWith(chatError(503, "internal_error"), json(200, { conversationId: CONVERSATION, reply: "back again" }));
    const { ask } = await openPanel();
    await ask("first try");
    await screen.findByRole("alert");
    await ask("second try");
    await screen.findByText("back again");
    expect(chatCalls[1]).not.toHaveProperty("conversationId");
  });

  it("an error in the middle of a conversation keeps the conversation going", async () => {
    answerWith(
      json(200, { conversationId: CONVERSATION, reply: "one" }),
      chatError(429, "rate_limited"),
      json(200, { conversationId: CONVERSATION, reply: "three" }),
    );
    const { ask } = await openPanel();
    await ask("a");
    await screen.findByText("one");
    await ask("b");
    await screen.findByRole("alert");
    await ask("c");
    await screen.findByText("three");
    expect(chatCalls[2]).toMatchObject({ conversationId: CONVERSATION });
  });
});

describe("states the panel is in before a chat", () => {
  it("says the chat isn't available when there is no key, and never calls the chat route", async () => {
    render(<EmbedPanel projectKey={undefined} origin="http://localhost:8080" />);
    expect(await screen.findByText("This chat isn't available")).toBeTruthy();
    await waitFor(() => expect(chatCalls).toHaveLength(0));
  });

  it("shows the configured header", async () => {
    await openPanel();
    expect(screen.getByRole("heading", { name: "Ask Acme" })).toBeTruthy();
  });
});
