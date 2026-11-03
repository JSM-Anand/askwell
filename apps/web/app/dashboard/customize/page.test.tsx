import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";

const m = vi.hoisted(() => ({ protect: vi.fn(), loadCustomize: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: m.protect } }));
vi.mock("./load-customize", () => ({ loadCustomize: m.loadCustomize }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import CustomizePage from "./page";

const render = async (searchParams: { project?: string | string[] } = {}) =>
  renderToStaticMarkup(await CustomizePage({ searchParams: Promise.resolve(searchParams) }));

const p1 = { id: "p1", name: "Docs bot" };
const p2 = { id: "p2", name: "Support bot" };
const data = (over = {}) => ({ projects: [p1], selected: p1, plan: "pro", config: DEFAULT_WIDGET_CONFIG, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.protect.mockResolvedValue({});
  m.loadCustomize.mockResolvedValue(data());
});

describe("the Customize page", () => {
  it("is its own gate: it checks the session before loading anything", async () => {
    await render();
    expect(m.protect.mock.invocationCallOrder[0]).toBeLessThan(m.loadCustomize.mock.invocationCallOrder[0]!);
  });

  it("shows the heading, the form and the preview for a Pro owner, with no upgrade prompt", async () => {
    const html = await render();
    expect(html).toContain("Customize");
    expect(html).toContain('aria-label="Widget settings"');
    expect(html).toContain('aria-label="Widget preview"');
    expect(html).not.toContain("Customize is a Pro feature");
  });

  it("shows a Free owner the locked form with the upgrade prompt", async () => {
    m.loadCustomize.mockResolvedValue(data({ plan: "free" }));
    const html = await render();
    expect(html).toContain("Customize is a Pro feature.");
    expect(html).toContain('href="/dashboard/billing"');
    expect(html).toMatch(/<fieldset[^>]* disabled=""/);
  });

  it("passes ?project= on to the loader, and ignores a repeated parameter", async () => {
    await render({ project: "p2" });
    expect(m.loadCustomize).toHaveBeenLastCalledWith("p2");
    await render({ project: ["p1", "p2"] });
    expect(m.loadCustomize).toHaveBeenLastCalledWith(undefined);
  });

  it("has a project picker only with several projects", async () => {
    expect(await render()).not.toContain('id="customize-project"');
    m.loadCustomize.mockResolvedValue(data({ projects: [p1, p2], selected: p2 }));
    const html = await render({ project: "p2" });
    expect(html).toContain('id="customize-project"');
    expect(html).toMatch(/<option value="p2" selected/);
  });

  it("with no projects, says to create one first and links to /dashboard", async () => {
    m.loadCustomize.mockResolvedValue({ projects: [], selected: null, plan: "free", config: DEFAULT_WIDGET_CONFIG });
    const html = await render();
    expect(html).toContain("Create a project first");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('aria-label="Widget settings"');
  });
});
