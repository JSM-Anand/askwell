import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_NAME, PLAN_LIMITS } from "@askwell/shared";
import { metadata } from "./layout";

const headerValues = vi.hoisted(() => ({ host: "askwell.test" as string | null }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => (name === "host" ? headerValues.host : null) }),
}));

import Home from "./page";

const render = async () => renderToStaticMarkup(await Home());
vi.stubEnv("LANDING_WIDGET_KEY", "");
vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
const html = await render();

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

  it("without the key it shows the static demo panel and no widget script", () => {
    expect(html).toContain("Message (preview only)");
    expect(html).not.toContain("/widget.js\" ");
    expect(html).not.toMatch(/<script[^>]*data-key/);
  });
});

describe("home page with LANDING_WIDGET_KEY", () => {
  const KEY = "pk_37807766949ec21e11640f7e5d8c4f8e08f26dd990037503";
  afterEach(() => {
    vi.stubEnv("LANDING_WIDGET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    headerValues.host = "askwell.test";
  });

  it("renders the widget script tag with that key and this app's origin", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    const live = await render();
    expect(live).toMatch(new RegExp(`<script[^>]*src="https://askwell.test/widget.js"[^>]*data-key="${KEY}"|<script[^>]*data-key="${KEY}"[^>]*src="https://askwell.test/widget.js"`));
  });

  it("uses NEXT_PUBLIC_APP_URL for the script origin when it is set", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/some/path");
    expect(await render()).toContain('src="https://app.example.com/widget.js"');
  });

  it("replaces the static panel with a pointer to the corner button", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    const live = await render();
    expect(live).not.toContain("Message (preview only)");
    expect(live).toContain("Open the chat button in the corner and ask it anything about");
    expect(live).toContain("See it in action");
  });

  it("cleans a padded or quoted key", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", ` "${KEY}"\n`);
    expect(await render()).toContain(`data-key="${KEY}"`);
  });

  it.each([["   "], ["not-a-key"], ["pk_"], ['pk_x"><script>alert(1)</script>'], ["sk_live_abc123"]])(
    "keeps the static demo, and still renders, for %j",
    async (bad) => {
      vi.stubEnv("LANDING_WIDGET_KEY", bad);
      const out = await render();
      expect(out).toContain("Message (preview only)");
      expect(out).toContain("Pricing");
      expect(out).not.toMatch(/<script[^>]*data-key/);
      expect(out).not.toContain("alert(1)");
    },
  );

  it("exposes nothing but the public key: no other environment value reaches the page", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    vi.stubEnv("GEMINI_API_KEY", "gemini-secret-value");
    vi.stubEnv("CLERK_SECRET_KEY", "clerk-secret-value");
    const live = await render();
    expect(live).not.toContain("gemini-secret-value");
    expect(live).not.toContain("clerk-secret-value");
    expect(live.match(/data-key="[^"]*"/g)).toEqual([`data-key="${KEY}"`]);
    vi.unstubAllEnvs();
  });

  it("does not put the widget key in the page when the variable is empty", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", "");
    expect(await render()).not.toContain(KEY);
  });
});
