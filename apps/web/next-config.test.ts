import { describe, expect, it } from "vitest";
import nextConfig, { securityHeaders } from "./next.config";

const rules = await securityHeaders();
type Rule = Awaited<ReturnType<typeof securityHeaders>>[number];

// Mirrors how Next matches a `source`: the whole path must match the pattern.
function ruleFor(rules: Rule[], path: string): Rule[] {
  return rules.filter((r) => {
    const pattern = r.source.replace(/\/:path\*$/, "(?:/.*)?");
    return new RegExp(`^${pattern}$`).test(path);
  });
}

function headersAt(path: string): Record<string, string> {
  return Object.fromEntries(
    ruleFor(rules, path).flatMap((r) => r.headers.map((h) => [h.key, h.value])),
  );
}

describe("security headers", () => {
  it("is wired into next.config", () => {
    expect(nextConfig.headers).toBe(securityHeaders);
  });

  it.each(["/", "/dashboard", "/dashboard/customize", "/api/projects", "/widget.js", "/embedded", "/embed-x"])(
    "%s may only be framed by our own pages",
    (path) => {
      const h = headersAt(path);
      expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'self'");
      expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
    },
  );

  it.each(["/embed", "/embed/anything"])("%s may be framed by any site, with no X-Frame-Options", (path) => {
    const h = headersAt(path);
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors *");
    expect(h["X-Frame-Options"]).toBeUndefined();
  });

  it("gives each path exactly one Content-Security-Policy rule", () => {
    for (const path of ["/", "/embed", "/embed/x", "/dashboard"]) {
      const count = ruleFor(rules, path).flatMap((r) => r.headers).filter((h) => h.key === "Content-Security-Policy").length;
      expect(count).toBe(1);
    }
  });

  it.each(["/", "/dashboard", "/embed", "/api/widget/chat", "/widget.js"])("%s gets the common headers", (path) => {
    const h = headersAt(path);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("sets no script/style CSP and no HSTS", () => {
    for (const r of rules) {
      for (const h of r.headers) {
        if (h.key === "Content-Security-Policy") expect(h.value).toMatch(/^frame-ancestors /);
        expect(h.key).not.toBe("Strict-Transport-Security");
      }
    }
  });

  it("never sets CORS headers (the widget routes own those)", () => {
    for (const r of rules) {
      expect(r.headers.some((h) => h.key.toLowerCase().startsWith("access-control-"))).toBe(false);
    }
  });

});
