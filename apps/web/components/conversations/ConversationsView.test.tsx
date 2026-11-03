// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationSummary, GetConversationResponse } from "@askwell/shared";
import { ConversationsView } from "./ConversationsView";

const PROJECT = "11111111-1111-4111-8111-111111111111";

const minutesAgo = (n: number) => new Date(Date.now() - (n + 0.5) * 60_000).toISOString();
const summary = (id: string, over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id,
  visitorId: `visitor_${id}`,
  createdAt: minutesAgo(5),
  messageCount: 2,
  firstMessagePreview: `Question ${id}`,
  ...over,
});
const thread = (id: string, messages: [role: "visitor" | "bot", body: string][], over: Partial<ConversationSummary> = {}): GetConversationResponse => ({
  conversation: summary(id, { messageCount: messages.length, ...over }),
  messages: messages.map(([role, body], i) => ({ id: `m${i + 1}`, role, body, createdAt: "2026-11-02T14:20:0" + i + "Z" })),
});

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const urls = () => (fetchMock.mock.calls as [string][]).map(([url]) => url);

const view = (initial: ConversationSummary[] = [], selectedId?: string) =>
  render(<ConversationsView projectId={PROJECT} initialConversations={initial} selectedId={selectedId} />);

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("the conversation list", () => {
  it("shows the first message preview, the message count and a relative time for each conversation", () => {
    view([summary("a", { messageCount: 4, firstMessagePreview: "What are your hours?" }), summary("b", { messageCount: 1, firstMessagePreview: "Do you ship?" })]);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("What are your hours?")).toBeTruthy();
    expect(within(items[0]!).getByText("4 messages")).toBeTruthy();
    expect(within(items[1]!).getByText("1 message")).toBeTruthy();
    expect(within(items[0]!).getByText("5 minutes ago")).toBeTruthy();
  });

  it("keeps the order it was given, newest first", () => {
    view([summary("new", { firstMessagePreview: "Newest" }), summary("old", { firstMessagePreview: "Oldest" })]);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringContaining("Newest"), expect.stringContaining("Oldest")]);
  });

  it("links each conversation to its thread, keeping the project in the address", () => {
    view([summary("a")]);
    expect(screen.getByRole("link", { name: /Question a/ }).getAttribute("href")).toBe(`/dashboard/conversations?project=${PROJECT}&conversation=a`);
  });

  it("says so when a conversation has no visitor message yet", () => {
    view([summary("a", { firstMessagePreview: null, messageCount: 0 })]);
    expect(screen.getByText("No visitor message yet")).toBeTruthy();
    expect(screen.getByText("0 messages")).toBeTruthy();
  });

  it("shows an empty state that points to the install page when there are no conversations", () => {
    view([]);
    expect(screen.getByText("No conversations yet")).toBeTruthy();
    expect(screen.getByText("Install the widget to start getting chats.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Install" }).getAttribute("href")).toBe("/dashboard/install");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("marks the open conversation", () => {
    fetchMock.mockResolvedValue(reply(200, thread("b", [["visitor", "Hi"]])));
    view([summary("a"), summary("b")], "b");
    expect(screen.getByRole("link", { name: /Question b/ }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: /Question a/ }).getAttribute("aria-current")).toBeNull();
  });
});

describe("message text is text, never HTML", () => {
  it("shows a <b> in a preview literally", () => {
    view([summary("a", { firstMessagePreview: "Is this <b>bold</b>?" })]);
    expect(screen.getByText("Is this <b>bold</b>?")).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
  });

  it("shows markup in a thread literally, and creates no elements from it", async () => {
    fetchMock.mockResolvedValue(
      reply(200, thread("a", [["visitor", "<b>hello</b> <img src=x onerror=alert(1)>"], ["bot", "<script>alert(2)</script> **not bold**"]])),
    );
    view([summary("a")], "a");
    await screen.findByText("<b>hello</b> <img src=x onerror=alert(1)>");
    expect(screen.getByText("<script>alert(2)</script> **not bold**")).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("Refresh", () => {
  it("fetches the project's conversations again and shows the new ones", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { conversations: [summary("new", { firstMessagePreview: "Brand new chat" }), summary("a")] }));
    view([summary("a")]);
    expect(screen.queryByText("Brand new chat")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await screen.findByText("Brand new chat");
    expect(urls()).toEqual([`/api/projects/${PROJECT}/conversations`]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("is disabled and says Refreshing… while it works", async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    view([summary("a")]);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const busy = screen.getByRole("button", { name: "Refreshing…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    finish(reply(200, { conversations: [summary("a")] }));
    await screen.findByRole("button", { name: "Refresh" });
  });

  it("refetches every time it is clicked", async () => {
    fetchMock.mockResolvedValue(reply(200, { conversations: [summary("a")] }));
    view([summary("a")]);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("button", { name: "Refresh" });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(urls()).toHaveLength(2));
  });

  it("keeps the list and says so when the refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: { code: "internal_error", message: "Something went wrong." } }));
    view([summary("a")]);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Something went wrong.");
    expect(screen.getByText("Question a")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Something went wrong.")).toBeNull();
  });

  it("also loads the open thread again", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, thread("a", [["visitor", "Hi"], ["bot", "Hello"]])))
      .mockResolvedValueOnce(reply(200, { conversations: [summary("a", { messageCount: 4 })] }))
      .mockResolvedValueOnce(reply(200, thread("a", [["visitor", "Hi"], ["bot", "Hello"], ["visitor", "One more"], ["bot", "Sure"]])));
    view([summary("a")], "a");
    await screen.findByText("Hello");
    expect(screen.queryByText("One more")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await screen.findByText("One more");
    expect(urls()).toEqual(["/api/conversations/a", `/api/projects/${PROJECT}/conversations`, "/api/conversations/a"]);
  });
});

describe("the thread", () => {
  it("loads the open conversation and shows every message, both sides, in order", async () => {
    fetchMock.mockResolvedValue(reply(200, thread("a", [["visitor", "What are your hours?"], ["bot", "Nine to five."], ["visitor", "Thanks!"], ["bot", "You're welcome."]])));
    view([summary("a")], "a");
    expect(screen.getByRole("status", { name: "" }) ?? screen.getByText("Loading conversation")).toBeTruthy();

    await screen.findByText("Nine to five.");
    expect(urls()).toEqual(["/api/conversations/a"]);
    const messages = screen.getAllByRole("listitem").filter((li) => li.getAttribute("data-role"));
    expect(messages.map((li) => li.getAttribute("data-role"))).toEqual(["visitor", "bot", "visitor", "bot"]);
    expect(messages.map((li) => within(li).getByText(/Visitor|Bot/).textContent)).toEqual(["Visitor", "Bot", "Visitor", "Bot"]);
    expect(messages.map((li) => li.querySelector("p")?.textContent)).toEqual(["What are your hours?", "Nine to five.", "Thanks!", "You're welcome."]);
  });

  it("styles a visitor message differently from a bot message", async () => {
    fetchMock.mockResolvedValue(reply(200, thread("a", [["visitor", "Question"], ["bot", "Answer"]])));
    view([summary("a")], "a");
    await screen.findByText("Answer");
    const visitor = screen.getByText("Question");
    const bot = screen.getByText("Answer");
    expect(visitor.className).not.toBe(bot.className);
    expect(visitor.className).toContain("bg-surface-raised");
    expect(bot.className).toContain("bg-accent");
  });

  it("shows the time of each message, exactly", async () => {
    fetchMock.mockResolvedValue(reply(200, thread("a", [["visitor", "Hi"]])));
    view([summary("a")], "a");
    await screen.findByText("Hi");
    expect(screen.getByText("Nov 2, 2026, 2:20 PM UTC", { selector: "ol time" })).toBeTruthy();
  });

  it("keeps line breaks in a message", async () => {
    fetchMock.mockResolvedValue(reply(200, thread("a", [["visitor", "line one\nline two"]])));
    view([summary("a")], "a");
    const body = await screen.findByText(/line one/);
    expect(body.className).toContain("whitespace-pre-wrap");
  });

  it("says when a conversation has no messages", async () => {
    fetchMock.mockResolvedValue(reply(200, thread("a", [])));
    view([summary("a", { messageCount: 0 })], "a");
    await screen.findByText("This conversation has no messages yet.");
  });

  it("shows a not-found message for a conversation that isn't there, with no retry button", async () => {
    fetchMock.mockResolvedValue(reply(404, { error: { code: "not_found", message: "No conversation with that ID." } }));
    view([summary("a")], "gone");
    await screen.findByText("Conversation not found");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows an error, and loads it again on Try again", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(500, { error: { code: "internal_error", message: "Something went wrong." } }))
      .mockResolvedValueOnce(reply(200, thread("a", [["visitor", "Back again"]])));
    view([summary("a")], "a");
    await screen.findByText("Something went wrong");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Back again");
    expect(urls()).toEqual(["/api/conversations/a", "/api/conversations/a"]);
  });

  it("offers a way back to the list, which keeps the project", async () => {
    fetchMock.mockResolvedValue(reply(200, thread("a", [["visitor", "Hi"]])));
    view([summary("a")], "a");
    await screen.findByText("Hi");
    expect(screen.getByRole("link", { name: "← All conversations" }).getAttribute("href")).toBe(`/dashboard/conversations?project=${PROJECT}`);
  });

  it("makes no thread request when no conversation is open, and asks to select one", () => {
    view([summary("a")]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Select a conversation to read it.")).toBeTruthy();
  });

  it("ignores a slow answer for a conversation that is no longer open", async () => {
    let finishFirst: (value: unknown) => void = () => {};
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce(reply(200, thread("b", [["visitor", "The second one"]])));
    const { rerender } = view([summary("a"), summary("b")], "a");
    rerender(<ConversationsView projectId={PROJECT} initialConversations={[summary("a"), summary("b")]} selectedId="b" />);
    await screen.findByText("The second one");
    finishFirst(reply(200, thread("a", [["visitor", "The stale first one"]])));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText("The stale first one")).toBeNull();
    expect(screen.getByText("The second one")).toBeTruthy();
  });
});
