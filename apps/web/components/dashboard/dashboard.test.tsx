import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NavList } from "./NavList";
import { NAV_SECTIONS, isActiveSection } from "./nav";

const LABELS = ["Projects", "Knowledge", "Conversations", "Customize", "Install", "Billing"];

describe("dashboard nav", () => {
  it("renders all six items with their links", () => {
    const html = renderToStaticMarkup(<NavList pathname="/dashboard" />);
    expect(NAV_SECTIONS).toHaveLength(6);
    for (const label of LABELS) expect(html).toContain(`>${label}</a>`);
    expect(html).toContain('href="/dashboard/knowledge"');
    expect(html).toContain('href="/dashboard/billing"');
  });

  it("marks only the active item", () => {
    const html = renderToStaticMarkup(<NavList pathname="/dashboard/conversations" />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Conversations<\/a>/);
  });

  it("marks Projects on /dashboard and not on sub-pages", () => {
    expect(isActiveSection("/dashboard", "/dashboard")).toBe(true);
    expect(isActiveSection("/dashboard", "/dashboard/install")).toBe(false);
    expect(isActiveSection("/dashboard/install", "/dashboard/install")).toBe(true);
  });
});
