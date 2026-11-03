import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ protect: vi.fn(), loadConversations: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: m.protect } }));
vi.mock("./load-conversations", () => ({ loadConversations: m.loadConversations }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import ConversationsPage from "./page";

const render = async (searchParams: { project?: string | string[]; conversation?: string | string[] } = {}) =>
  renderToStaticMarkup(await ConversationsPage({ searchParams: Promise.resolve(searchParams) }));

const p1 = { id: "p1", name: "Docs bot" };
const p2 = { id: "p2", name: "Support bot" };
const convo = { id: "c1", visitorId: "v1", createdAt: "2026-11-02T14:20:00Z", messageCount: 3, firstMessagePreview: "What are your hours?" };
const data = (over = {}) => ({ projects: [p1], selected: p1, conversations: [], ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.protect.mockResolvedValue({});
  m.loadConversations.mockResolvedValue(data());
});

describe("the Conversations page", () => {
  it("is its own gate: it checks the session before loading anything", async () => {
    await render();
    expect(m.protect.mock.invocationCallOrder[0]).toBeLessThan(m.loadConversations.mock.invocationCallOrder[0]!);
  });

  it("shows the heading, Refresh and the empty state for a project with no conversations", async () => {
    const html = await render();
    expect(html).toContain("Conversations");
    expect(html).toContain("Refresh");
    expect(html).toContain("No conversations yet");
    expect(html).toContain('href="/dashboard/install"');
  });

  it("lists the conversations of the selected project, with the exact time before the page is live", async () => {
    m.loadConversations.mockResolvedValue(data({ conversations: [convo] }));
    const html = await render();
    expect(html).toContain("What are your hours?");
    expect(html).toContain("3 messages");
    expect(html).toContain("Nov 2, 2026, 2:20 PM UTC");
  });

  it("passes ?project= on to the loader, and ignores a repeated parameter", async () => {
    await render({ project: "p2" });
    expect(m.loadConversations).toHaveBeenLastCalledWith("p2");
    await render({ project: ["p1", "p2"] });
    expect(m.loadConversations).toHaveBeenLastCalledWith(undefined);
  });

  it("has no project picker with a single project, and one when there are several", async () => {
    expect(await render()).not.toContain('id="conversations-project"');
    m.loadConversations.mockResolvedValue(data({ projects: [p1, p2], selected: p2 }));
    const html = await render({ project: "p2" });
    expect(html).toContain('id="conversations-project"');
    expect(html).toMatch(/<option value="p2" selected/);
  });

  it("opens the conversation named in ?conversation=", async () => {
    m.loadConversations.mockResolvedValue(data({ conversations: [convo] }));
    const html = await render({ conversation: "c1" });
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Loading conversation");
  });

  it("with no projects, says to create one first and links to /dashboard", async () => {
    m.loadConversations.mockResolvedValue({ projects: [], selected: null, conversations: [] });
    const html = await render();
    expect(html).toContain("Create a project first");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("Refresh");
  });
});
