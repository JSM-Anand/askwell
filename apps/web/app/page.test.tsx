import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_NAME, PLAN_LIMITS } from "@askwell/shared";
import { metadata } from "./layout";
import Home from "./page";

const html = renderToStaticMarkup(<Home />);

describe("home page", () => {
  it("shows APP_NAME", () => {
    expect(html).toContain(APP_NAME);
  });

  it("uses APP_NAME as the title", () => {
    expect(metadata.title).toBe(APP_NAME);
  });

  it("renders every section", () => {
    for (const heading of ["How it works", "See it in action", "Pricing", "Install in one line"]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain("<footer");
    expect(html).toContain("Add knowledge");
    expect(html).toContain("Paste one script tag");
    expect(html).toContain("Visitors get answers");
  });

  it("shows the install snippet as escaped text", () => {
    expect(html).toContain("&lt;script src=");
    expect(html).not.toContain("<script src=");
  });

  it("prices from PLAN_LIMITS", () => {
    const n = (v: number) => v.toLocaleString("en-US");
    for (const plan of ["free", "pro"] as const) {
      const l = PLAN_LIMITS[plan];
      const card = html.split(`data-plan="${plan}"`)[1]?.split("</dl>")[0] ?? "";
      expect(card).toContain(`<dd class="font-medium">${n(l.projects)}</dd>`);
      expect(card).toContain(`<dd class="font-medium">${n(l.messagesPerMonth)}</dd>`);
      expect(card).toContain(`<dd class="font-medium">${n(l.knowledgeSources)}</dd>`);
      expect(card).toContain(l.customize.hideBadge ? ">Hidden<" : ">Shown<");
    }
  });

  it("shows the customization differences from section 5", () => {
    const cardOf = (plan: string) => html.split(`data-plan="${plan}"`)[1]?.split("</dl>")[0] ?? "";
    const free = cardOf("free");
    const pro = cardOf("pro");
    for (const label of ["Button color", "Button position", "Button label", "Open animation", "Header text"]) {
      expect(free).toContain(label);
      expect(pro).toContain(label);
    }
    for (const value of ["Default", "Bottom right", "Fade", "Shown"]) expect(free).toContain(`>${value}<`);
    for (const value of ["Any", "Any corner", "Custom", "Fade / Slide / Scale", "Hidden"]) {
      expect(pro).toContain(`>${value}<`);
    }
  });

  it("labels the install snippet values as placeholders", () => {
    expect(html).toContain("This is an example");
    expect(html).toContain("YOUR_APP_URL");
  });

  it("links Start free to /sign-up in the hero and in pricing", () => {
    const links = html.match(/<a [^>]*href="\/sign-up"[^>]*>Start free<\/a>/g) ?? [];
    expect(links).toHaveLength(2);
  });
});
