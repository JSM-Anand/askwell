import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import type { WidgetConfig } from "@askwell/shared";
import { WidgetPreview } from "./WidgetPreview";

const preview = (over: Partial<WidgetConfig> = {}, replayKey = 0) =>
  renderToStaticMarkup(<WidgetPreview config={{ ...DEFAULT_WIDGET_CONFIG, ...over }} replayKey={replayKey} />);

describe("WidgetPreview", () => {
  it("draws the button with the label and colour, and an opened panel with the header", () => {
    const html = preview({ buttonColor: "#ff0000", label: "Help me", headerText: "Support" });
    expect(html).toContain('data-preview="button"');
    expect(html).toMatch(/data-preview="button"[^>]*>Help me</);
    expect(html).toContain("background:#ff0000");
    expect(html).toMatch(/data-preview="header"[^>]*>Support</);
  });

  it("puts readable text on the button: black on a light colour, white on a dark one", () => {
    expect(preview({ buttonColor: "#ffff00" })).toContain("color:#000");
    expect(preview({ buttonColor: "#112233" })).toContain("color:#fff");
  });

  it.each([
    ["top-left", "top:16px", "left:16px"],
    ["top-right", "top:16px", "right:16px"],
    ["bottom-left", "bottom:16px", "left:16px"],
    ["bottom-right", "bottom:16px", "right:16px"],
  ] as const)("puts the button in the %s corner", (position, vertical, horizontal) => {
    const html = preview({ position });
    const button = html.slice(html.indexOf('data-preview="button"'));
    expect(button).toContain(vertical);
    expect(button).toContain(horizontal);
    expect(button).toContain(`data-position="${position}"`);
  });

  it("puts the panel in the same corner as the button, further in", () => {
    const panel = preview({ position: "top-left" });
    const start = panel.indexOf('data-preview="panel"');
    const style = panel.slice(start, panel.indexOf("</p>", start));
    expect(style).toContain("top:64px");
    expect(style).toContain("left:16px");
  });

  it("shows the badge only when it is on", () => {
    expect(preview({ showBadge: true })).toContain("Powered by Askwell");
    expect(preview({ showBadge: false })).not.toContain("Powered by");
    expect(preview({ showBadge: false })).not.toContain('data-preview="badge"');
  });

  it.each([
    ["fade", "aw-preview-fade"],
    ["scale", "aw-preview-scale"],
  ] as const)("uses the %s animation", (animation, keyframes) => {
    const html = preview({ animation });
    expect(html).toContain(`animation:${keyframes} 0.35s`);
    expect(html).toContain(`data-animation="${animation}"`);
  });

  it("slides toward the corner it opens from: down from a top corner, up from a bottom one", () => {
    expect(preview({ animation: "slide", position: "top-right" })).toContain("animation:aw-preview-slide-top");
    expect(preview({ animation: "slide", position: "bottom-left" })).toContain("animation:aw-preview-slide-bottom");
  });

  it("has keyframes that match the real widget, and turns them off for reduced motion", () => {
    const html = preview();
    expect(html).toContain("translateY(-16px)");
    expect(html).toContain("translateY(16px)");
    expect(html).toContain("scale(.9)");
    expect(html).toContain("prefers-reduced-motion:reduce");
  });

  it("renders the label and header as text, never HTML", () => {
    const html = preview({ label: "<b>x</b>", headerText: "<img src=x onerror=alert(1)>" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("is a labelled group, not a real widget (no script, no iframe)", () => {
    const html = preview();
    expect(html).toContain('aria-label="Widget preview"');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<script");
  });
});
