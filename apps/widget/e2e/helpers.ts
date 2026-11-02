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

export type ChatRequestBody = { key: string; visitorId: string; conversationId?: string; message: string };
export type ChatAnswer = { status?: number; body: unknown; delayMs?: number };

/**
 * Answer POST /api/widget/chat from the test, so the panel runs against a known route (the real one needs a
 * project with knowledge in the database). Returns the request bodies the panel sent, in order.
 */
export async function mockChat(page: Page, answer: (body: ChatRequestBody, n: number) => ChatAnswer) {
  const requests: ChatRequestBody[] = [];
  await page.route("**/api/widget/chat", async (route) => {
    const body = route.request().postDataJSON() as ChatRequestBody;
    requests.push(body);
    const { status = 200, body: payload, delayMs = 0 } = answer(body, requests.length);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
  return requests;
}

export const errorBody = (code: string) => ({ error: { code, message: "server wording that must not be shown" } });
