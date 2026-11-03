import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstallSnippet } from "./InstallSnippet";

describe("InstallSnippet", () => {
  it("makes the snippet box keyboard-focusable and named (a group, so the name is allowed), because it scrolls sideways at 375 px", () => {
    const html = renderToStaticMarkup(<InstallSnippet />);
    expect(html).toMatch(/<pre[^>]*tabindex="0"[^>]*role="group"[^>]*aria-label="Example script tag"/);
  });
});
