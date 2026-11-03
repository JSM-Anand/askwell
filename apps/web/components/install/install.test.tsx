import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopyButton } from "./CopyButton";
import { InstallList } from "./InstallList";
import { resolveAppOrigin } from "./app-origin";
import { buildSnippet } from "./snippet";

describe("buildSnippet", () => {
  it("contains the origin, the key and defer", () => {
    expect(buildSnippet("https://app.example", "pk_abc")).toBe(
      '<script src="https://app.example/widget.js" data-key="pk_abc" defer></script>',
    );
  });
});

describe("InstallList", () => {
  it("renders one snippet and one copy button per project", () => {
    const html = renderToStaticMarkup(
      <InstallList
        origin="https://app.example"
        projects={[
          { id: "1", name: "Shop", public_key: "pk_one" },
          { id: "2", name: "Docs", public_key: "pk_two" },
        ]}
      />,
    );
    expect(html).toContain("Shop");
    expect(html).toContain("Docs");
    expect(html).toContain("data-key=&quot;pk_one&quot;");
    expect(html).toContain("data-key=&quot;pk_two&quot;");
    expect(html.match(/src=&quot;https:\/\/app\.example\/widget\.js&quot;/g)).toHaveLength(2);
    expect(html.match(/>Copy</g)).toHaveLength(2);
    expect(html).toContain("Reload the page");
  });

  it("renders the snippet as text, never HTML", () => {
    const html = renderToStaticMarkup(
      <InstallList origin="https://app.example" projects={[{ id: "1", name: "<b>x</b>", public_key: "pk_one" }]} />,
    );
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toContain("<script");
  });

  it("shows an empty state that links to /dashboard when there are no projects", () => {
    const html = renderToStaticMarkup(<InstallList origin="https://app.example" projects={[]} />);
    expect(html).toContain("No script tag yet");
    expect(html).toMatch(/<a [^>]*href="\/dashboard"[^>]*>Go to Projects<\/a>/);
    expect(html).not.toContain("widget.js");
  });
});

describe("CopyButton", () => {
  it("starts as a Copy button", () => {
    expect(renderToStaticMarkup(<CopyButton text="x" projectId="p1" />)).toContain(">Copy<");
  });
});

describe("resolveAppOrigin", () => {
  const request = { host: "askwell-git-x.vercel.app", proto: "https" };

  it("prefers NEXT_PUBLIC_APP_URL and keeps only its origin", () => {
    expect(resolveAppOrigin({ envUrl: "https://askwell.app/", ...request })).toBe("https://askwell.app");
    expect(resolveAppOrigin({ envUrl: "https://askwell.app/some/path", ...request })).toBe("https://askwell.app");
  });

  it("falls back to the request origin when the env var is unset, blank or invalid", () => {
    for (const envUrl of [undefined, "", "  ", "not a url", "javascript:alert(1)"]) {
      expect(resolveAppOrigin({ envUrl, ...request })).toBe("https://askwell-git-x.vercel.app");
    }
  });

  it("uses http for a local request, and the first host of a forwarded list", () => {
    expect(resolveAppOrigin({ envUrl: undefined, host: "localhost:3000", proto: "http" })).toBe("http://localhost:3000");
    expect(resolveAppOrigin({ envUrl: undefined, host: "a.example, b.example", proto: "https" })).toBe("https://a.example");
  });

  it("falls back to localhost when nothing is known", () => {
    expect(resolveAppOrigin({ envUrl: undefined, host: null, proto: null })).toBe("http://localhost:3000");
  });
});
