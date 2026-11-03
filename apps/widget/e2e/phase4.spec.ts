import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { APP, HOST } from "./helpers";

// Phase 4 check, end to end on two origins (app :3000, demo :8080), with a fresh Clerk test user and the
// real database and Gemini: land → sign in → create a project → paste knowledge → copy the snippet → chat
// on the demo page → the thread appears in Conversations after Refresh → usage went up by the messages.
// It needs real keys, so it skips itself without them. It deletes the test user and its rows at the end.
// The PostHog parts (funnel, trace with cost) are checked in PostHog, not here.

// The e2e project has no Node types; this is all the spec reads from the environment.
declare const process: { env: Record<string, string | undefined> };

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HAS_KEYS = Boolean(CLERK_SECRET_KEY && SUPABASE_URL && SUPABASE_SECRET_KEY && GEMINI_API_KEY);

const KNOWLEDGE = "Harbor Bikes is open Monday to Friday, nine to five. Repairs take two days. Closed on Sundays.";
const QUESTIONS = ["When are you open?", "How long do repairs take?"];

async function clerk(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.clerk.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}`, "Content-Type": "application/json" },
  });
  return (await res.json()) as { id?: string; token?: string };
}

/** posthog-js drops events from automated browsers; hide the automation signals so the landing pageview is real. */
async function looksLikeABrowser(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  });
}

test.use({ actionTimeout: 30_000 }); // fail on a missing element instead of waiting out the test

test.skip(!HAS_KEYS, "needs CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and GEMINI_API_KEY");

test("Phase 4: install, chat, see the conversation and the usage", async ({ browser }) => {
  test.setTimeout(480_000); // two real Gemini answers, which can be slow when the model is busy
  const email = `askwell-e2e-${Date.now()}+clerk_test@example.com`;
  const user = await clerk("/v1/users", {
    method: "POST",
    body: JSON.stringify({ email_address: [email], password: `Askwell-${Date.now()}-Pa55word`, skip_password_checks: true }),
  });
  expect(user.id, "the Clerk test user is created").toBeTruthy();
  const userId = user.id!;

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
  });
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP });
    const page = await context.newPage();
    await looksLikeABrowser(page);

    // Land on `/`, then sign in (a sign-in ticket stands in for the sign-up form, which Clerk's bot protection blocks here).
    await page.goto(APP);
    await page.waitForLoadState("networkidle").catch(() => {});
    const ticket = (await clerk("/v1/sign_in_tokens", { method: "POST", body: JSON.stringify({ user_id: userId, expires_in_seconds: 900 }) })).token;
    await page.goto(`${APP}/sign-in?__clerk_ticket=${ticket}`);
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 });

    // Create a project in the UI.
    await page.getByPlaceholder("Project name").fill("Harbor Bikes E2E");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Harbor Bikes E2E").first()).toBeVisible({ timeout: 15_000 });
    const { projects } = (await page.evaluate(() => fetch("/api/projects").then((r) => r.json()))) as { projects: { id: string }[] };
    const projectId = projects[0]!.id;

    // Paste knowledge.
    const pasted = await page.evaluate(
      ({ id, content }) =>
        fetch(`/api/projects/${id}/knowledge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Hours and repairs", content }),
        }).then(async (r) => ({ status: r.status, source: (await r.json()).source })),
      { id: projectId, content: KNOWLEDGE },
    );
    expect(pasted.status).toBe(201);
    expect(pasted.source.status).toBe("ready");

    // Copy the snippet from the Install page and read the public key out of it.
    await page.goto(`${APP}/dashboard/install`);
    const snippet = await page.locator("pre code").first().innerText();
    const key = /data-key="(pk_[^"]+)"/.exec(snippet)?.[1];
    expect(key, "the snippet carries the project's public key").toBeTruthy();
    await page.getByRole("button", { name: "Copy" }).first().click();
    await expect(page.getByText("Copied")).toBeVisible();

    // The demo host page stands in for a customer's site. Its own snippet carries a placeholder key, so skip that
    // load and add the same script tag with the real key, like pasting the copied snippet into the page. (The page
    // itself is served by the demo server, so the widget loads cross-origin exactly as on a real install.)
    const host = await context.newPage();
    let skippedPlaceholder = false;
    await host.route("**/widget.js", (route) => {
      if (skippedPlaceholder) return route.continue();
      skippedPlaceholder = true;
      return route.abort();
    });
    await host.goto(HOST);
    await host.evaluate(
      ({ src, key }) => {
        const script = document.createElement("script");
        script.src = src;
        script.dataset.key = key;
        document.body.append(script);
      },
      { src: `${APP}/widget.js`, key: key! },
    );
    await host.getByRole("button", { name: "Ask us" }).click();
    const panel = host.frameLocator("iframe");
    const input = panel.getByLabel("Your message");
    for (const question of QUESTIONS) {
      await input.fill(question);
      await input.press("Enter");
      await expect(panel.getByRole("status")).toHaveCount(0, { timeout: 120_000 }); // no more "Typing" (Gemini can retry or fall back first)
      await expect(input).toBeEnabled({ timeout: 120_000 });
    }
    await expect(panel.getByText(QUESTIONS[1]!, { exact: true })).toBeVisible();

    // The conversation shows up after Refresh, with the whole thread.
    await page.goto(`${APP}/dashboard/conversations`);
    await page.getByRole("button", { name: "Refresh" }).click();
    // One conversation, listed with its first question and the message count (visitor and bot messages together).
    const entry = page.getByRole("link", { name: new RegExp(`^${QUESTIONS[0]!.replace("?", "\\?")}.*${QUESTIONS.length * 2} messages`) });
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await entry.click();
    const thread = page.getByRole("list", { name: "Messages" });
    for (const question of QUESTIONS) await expect(thread.getByText(question, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(thread.locator('[data-role="bot"]')).toHaveCount(QUESTIONS.length);

    // Usage rose by the number of messages.
    await page.goto(`${APP}/dashboard`);
    await expect(page.getByText(`${QUESTIONS.length} / 100`)).toBeVisible();
  } finally {
    await context.close().catch(() => {});
    // Cleanup: the account row (its projects, sources, chunks, conversations and messages cascade), then the Clerk user.
    // Both are always attempted, whatever the first one does; failures are reported together afterwards. For Clerk a
    // 404 means the user is already gone, which is fine. For Supabase every non-OK status is a failure: deleting no
    // matching row is a 204, while a 404 means something is wrong (an unavailable table).
    const failures: string[] = [];
    const cleanup = async (what: string, request: () => Promise<Response>, alreadyGoneStatus?: number) => {
      try {
        const res = await request();
        if (!res.ok && res.status !== alreadyGoneStatus) failures.push(`${what}: HTTP ${res.status}`);
      } catch (error) {
        failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    // A Supabase secret key (sb_secret_...) goes in `apikey` only.
    await cleanup("Supabase account", () =>
      fetch(`${SUPABASE_URL}/rest/v1/accounts?clerk_user_id=eq.${userId}`, { method: "DELETE", headers: { apikey: SUPABASE_SECRET_KEY! } }),
    );
    await cleanup("Clerk user", () =>
      fetch(`https://api.clerk.com/v1/users/${userId}`, { method: "DELETE", headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } }),
      404,
    );
    expect(failures, "the test data is cleaned up").toEqual([]);
  }
});
