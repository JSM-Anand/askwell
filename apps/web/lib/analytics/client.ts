import type { PostHog } from "posthog-js";

type ConfigResponse = { key: string | null; host: string | null };

// Tracked: the landing page and the dashboard. Never /embed (visitors' pages).
export function isTrackedPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

let instance: PostHog | null = null;
let pending: Promise<PostHog | null> | null = null;
let unconfigured = false;

async function load(): Promise<PostHog | null> {
  try {
    const res = await fetch("/api/posthog-config", { cache: "no-store" });
    if (!res.ok) return null;
    const { key, host } = (await res.json()) as ConfigResponse;
    if (!key || !host) {
      unconfigured = true;
      return null;
    }
    const { default: posthog } = await import("posthog-js");
    posthog.init(key, {
      api_host: host,
      defaults: "2026-08-30",
      person_profiles: "identified_only",
      session_recording: { maskAllInputs: true, maskTextSelector: "*" },
      capture_exceptions: true,
    });
    instance = posthog;
    return posthog;
  } catch {
    return null; // network failure: retry on the next call
  }
}

export async function initAnalytics(pathname: string): Promise<PostHog | null> {
  if (!isTrackedPath(pathname)) return null;
  if (instance) return instance;
  if (unconfigured) return null;
  pending ??= load().finally(() => {
    pending = null;
  });
  return pending;
}

export function getAnalytics(): PostHog | null {
  return instance;
}

export function resetAnalyticsForTests() {
  instance = null;
  pending = null;
  unconfigured = false;
}

/** The Install page's copy button. A no-op when PostHog isn't running (not configured, blocked). */
export function trackSnippetCopied(projectId: string): void {
  try {
    instance?.capture("snippet_copied", { project_id: projectId });
  } catch {
    // Analytics must never break the page.
  }
}
