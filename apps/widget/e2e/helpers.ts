import type { Page } from "@playwright/test";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import type { WidgetConfig } from "@askwell/shared";

export const APP = "http://localhost:3000";
export const HOST = "http://localhost:8080";

/** Answer /api/widget/config with a fixed config, so these tests need no project in the database. */
export async function mockConfig(page: Page, patch: Partial<WidgetConfig> = {}) {
  await page.route("**/api/widget/config*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ...DEFAULT_WIDGET_CONFIG, ...patch }),
    }),
  );
}

/** Record every postMessage the host page receives: who sent it and what it said. */
export async function recordMessages(page: Page) {
  await page.addInitScript(() => {
    const seen: { origin: string; data: unknown }[] = [];
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    window.addEventListener("message", (event) => seen.push({ origin: event.origin, data: event.data }));
  });
}

export const seenMessages = (page: Page) =>
  page.evaluate(() => (window as unknown as { __seen: { origin: string; data: unknown }[] }).__seen);
