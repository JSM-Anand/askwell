import { describe, expect, it } from "vitest";
import { isOwnerApiPath, isProtectedPath, isPublicPath } from "./proxy";

describe("route matchers", () => {
  it.each([
    "/dashboard",
    "/dashboard/projects/1",
    "/api/projects",
    "/api/projects/abc/knowledge",
    "/api/knowledge/abc",
    "/api/conversations/abc",
  ])("protects %s", (path) => {
    expect(isProtectedPath(path)).toBe(true);
    expect(isPublicPath(path)).toBe(false);
  });

  it.each([
    "/",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/embed",
    "/embed/pk_abc",
    "/api/widget/config",
    "/api/widget/chat",
    "/api/clerk/webhook",
    "/api/posthog-config",
  ])("leaves %s public", (path) => {
    expect(isPublicPath(path)).toBe(true);
    expect(isProtectedPath(path)).toBe(false);
  });

  it("treats owner API routes as JSON-401 routes, not redirects", () => {
    expect(isOwnerApiPath("/api/projects/1")).toBe(true);
    expect(isOwnerApiPath("/api/knowledge/1")).toBe(true);
    expect(isOwnerApiPath("/api/conversations/1")).toBe(true);
    expect(isOwnerApiPath("/dashboard")).toBe(false);
  });
});
