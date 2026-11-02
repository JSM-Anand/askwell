import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ protect: vi.fn(), loadKnowledge: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: m.protect } }));
vi.mock("./load-knowledge", () => ({ loadKnowledge: m.loadKnowledge }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import KnowledgePage from "./page";

const render = async (searchParams: { project?: string | string[] } = {}) =>
  renderToStaticMarkup(await KnowledgePage({ searchParams: Promise.resolve(searchParams) }));

const p1 = { id: "p1", name: "Docs bot" };
const p2 = { id: "p2", name: "Support bot" };
const data = (over = {}) => ({ projects: [p1], selected: p1, plan: "free", sources: [], ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.protect.mockResolvedValue({});
  m.loadKnowledge.mockResolvedValue(data());
});

describe("the Knowledge page", () => {
  it("is its own gate: it checks the session before loading anything", async () => {
    await render();
    expect(m.protect).toHaveBeenCalledTimes(1);
    expect(m.protect.mock.invocationCallOrder[0]).toBeLessThan(m.loadKnowledge.mock.invocationCallOrder[0]!);
  });

  it("shows the heading, the forms and the empty state for a project with no sources", async () => {
    const html = await render();
    expect(html).toContain("Knowledge");
    expect(html).toContain("Add text");
    expect(html).toContain("No knowledge yet");
  });

  it("passes ?project= on to the loader, and ignores a repeated parameter", async () => {
    await render({ project: "p2" });
    expect(m.loadKnowledge).toHaveBeenLastCalledWith("p2");
    await render({ project: ["p1", "p2"] });
    expect(m.loadKnowledge).toHaveBeenLastCalledWith(undefined);
    await render();
    expect(m.loadKnowledge).toHaveBeenLastCalledWith(undefined);
  });

  it("has no project selector with a single project", async () => {
    expect(await render()).not.toContain('id="project-select"');
  });

  it("shows a project selector, with the selected one chosen, when there are several", async () => {
    m.loadKnowledge.mockResolvedValue(data({ projects: [p1, p2], selected: p2 }));
    const html = await render({ project: "p2" });
    expect(html).toContain('id="project-select"');
    expect(html).toContain("Support bot");
    expect(html).toMatch(/<option value="p2" selected/);
  });

  it("lists the sources of the selected project", async () => {
    m.loadKnowledge.mockResolvedValue(
      data({ sources: [{ id: "s1", title: "Opening hours", type: "text", status: "ready", createdAt: "2026-11-02T10:00:00Z" }] }),
    );
    const html = await render();
    expect(html).toContain("Opening hours");
    expect(html).toContain("Ready");
  });

  it("with no projects, says to create one first and links to /dashboard", async () => {
    m.loadKnowledge.mockResolvedValue({ projects: [], selected: null, plan: "free", sources: [] });
    const html = await render();
    expect(html).toContain("Create a project first");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("Add text");
  });
});
