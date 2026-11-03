import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { APP, HOST } from "./helpers";

// Phase 5 check, the parts that don't need Clerk's checkout: Free is locked and refused (402), then, with the
// plan set by hand (what the webhook does), Pro customizes the widget and the demo page shows it, and going back
// to Free returns the widget to its defaults and the badge. The real upgrade / cancel / end through Clerk Billing
// and its webhook is checked separately, on a deployment the webhook can reach.
// It needs real keys, so it skips itself without them, and it deletes its test user and rows at the end.

// The e2e project has no Node types; this is all the spec reads from the environment.
declare const process: { env: Record<string, string | undefined> };

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const HAS_KEYS = Boolean(CLERK_SECRET_KEY && SUPABASE_URL && SUPABASE_SECRET_KEY);

const PRO_LOOK = { color: "#2563eb", rgb: "rgb(37, 99, 235)", label: "Chat with Harbor" };
const DEFAULT_LABEL = "Ask us";
const DEFAULT_RGB = "rgb(0, 0, 0)";

async function clerk(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.clerk.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}`, "Content-Type": "application/json" },
  });
  return (await res.json()) as { id?: string; token?: string };
}

/** What the Clerk webhook does: set the account's plan. Through the REST API with the secret key (an `sb_secret_` key goes in `apikey` only). */
async function setPlan(userId: string, plan: "free" | "pro") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/accounts?clerk_user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_SECRET_KEY!, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ plan }),
  });
  expect(res.ok, `setting the plan to ${plan}`).toBe(true);
  expect(await res.json(), "the account row exists").toHaveLength(1);
}

/** Load the demo host page with the project's real key, as if the copied snippet were pasted in (see phase4.spec.ts for why the page's own placeholder load is skipped). */
async function openHostPage(context: BrowserContext, key: string): Promise<Page> {
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
    { src: `${APP}/widget.js`, key },
  );
  return host;
}

test.use({ actionTimeout: 30_000 }); // fail on a missing element instead of waiting out the test

test.skip(!HAS_KEYS, "needs CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");

test("Phase 5: Free is locked, Pro customizes the widget, Free returns it to the defaults", async ({ browser }) => {
  test.setTimeout(240_000);
  const email = `askwell-e2e5-${Date.now()}+clerk_test@example.com`;
  const user = await clerk("/v1/users", {
    method: "POST",
    body: JSON.stringify({ email_address: [email], password: `Askwell-${Date.now()}-Pa55word`, skip_password_checks: true }),
  });
  expect(user.id, "the Clerk test user is created").toBeTruthy();
  const userId = user.id!;

  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const ticket = (await clerk("/v1/sign_in_tokens", { method: "POST", body: JSON.stringify({ user_id: userId, expires_in_seconds: 900 }) })).token;
    await page.goto(`${APP}/sign-in?__clerk_ticket=${ticket}`);
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 });

    await page.getByPlaceholder("Project name").fill("Harbor Bikes Phase 5");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Harbor Bikes Phase 5").first()).toBeVisible({ timeout: 15_000 });
    const { projects } = (await page.evaluate(() => fetch("/api/projects").then((r) => r.json()))) as { projects: { id: string; publicKey: string }[] };
    const { id: projectId, publicKey: key } = projects[0]!;

    // 1. Free: the form is locked, and a direct save is refused with 402 (nothing is written).
    await page.goto(`${APP}/dashboard/customize`);
    await expect(page.getByText("Customize is a Pro feature.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await expect(page.getByLabel("Button label")).toBeDisabled();
    const refused = await page.evaluate(
      (id) =>
        fetch(`/api/projects/${id}/config`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: "Sneaky" }),
        }).then(async (r) => ({ status: r.status, code: (await r.json()).error?.code })),
      projectId,
    );
    expect(refused).toEqual({ status: 402, code: "plan_required" });

    // Free visitors see the defaults, with the badge.
    const freeHost = await openHostPage(context, key);
    await expect(freeHost.getByRole("button", { name: DEFAULT_LABEL })).toHaveCSS("background-color", DEFAULT_RGB);
    await freeHost.getByRole("button", { name: DEFAULT_LABEL }).click();
    await expect(freeHost.frameLocator("iframe").getByText("Powered by Askwell")).toBeVisible();
    await freeHost.close();

    // 2. Upgrade (by hand here: the webhook's job). 3. Customize and save.
    await setPlan(userId, "pro");
    await page.goto(`${APP}/dashboard/customize`);
    await expect(page.getByText("Customize is a Pro feature.")).toHaveCount(0);
    await page.getByLabel("Button color", { exact: true }).fill(PRO_LOOK.color);
    await page.getByLabel("Top left").check();
    await page.getByLabel("Button label").fill(PRO_LOOK.label);
    await page.getByLabel("Slide").check();
    await page.getByLabel(/Show the .Powered by/).uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/^Saved\./)).toBeVisible();

    // 4. The demo page shows it on load: colour, corner, label, slide, and no badge.
    const proHost = await openHostPage(context, key);
    const button = proHost.getByRole("button", { name: PRO_LOOK.label });
    await expect(button).toHaveCSS("background-color", PRO_LOOK.rgb);
    const box = (await button.boundingBox())!;
    expect(box.x, "left").toBeLessThan(60);
    expect(box.y, "top").toBeLessThan(60);
    // Slide: the panel waits 16px above its place (top corner) until opened. The iframe only exists after the first click, so read the loader's own stylesheet.
    const widgetCss = await proHost.evaluate(
      () => [...document.body.querySelectorAll("*")].find((el) => el.shadowRoot)?.shadowRoot?.querySelector("style")?.textContent ?? "",
    );
    expect(widgetCss).toContain("transform:translateY(-16px)");
    expect(widgetCss).not.toContain("scale(.9)");
    await button.click();
    await expect(proHost.locator("iframe")).toBeVisible();
    await expect(proHost.frameLocator("iframe").getByLabel("Your message")).toBeVisible();
    await expect(proHost.frameLocator("iframe").getByText("Powered by Askwell")).toHaveCount(0);
    await proHost.close();

    // 5. Back to Free (the subscription ended): the saved Pro settings stay in the database, but visitors get the defaults and the badge.
    await setPlan(userId, "free");
    const endedHost = await openHostPage(context, key);
    const fallback = endedHost.getByRole("button", { name: DEFAULT_LABEL });
    await expect(fallback).toHaveCSS("background-color", DEFAULT_RGB);
    const fallbackBox = (await fallback.boundingBox())!;
    expect(fallbackBox.x, "right").toBeGreaterThan(300);
    expect(fallbackBox.y, "bottom").toBeGreaterThan(300);
    await expect(endedHost.getByRole("button", { name: PRO_LOOK.label })).toHaveCount(0);
    await fallback.click();
    await expect(endedHost.frameLocator("iframe").getByText("Powered by Askwell")).toBeVisible();
  } finally {
    await context?.close().catch(() => {});
    // Cleanup: the account row (its project and settings cascade), then the Clerk user. Both are always attempted, failures
    // are reported together afterwards. For Clerk a 404 means the user is already gone; for Supabase every non-OK status is a failure.
    const failures: string[] = [];
    const cleanup = async (what: string, request: () => Promise<Response>, alreadyGoneStatus?: number) => {
      try {
        const res = await request();
        if (!res.ok && res.status !== alreadyGoneStatus) failures.push(`${what}: HTTP ${res.status}`);
      } catch (error) {
        failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    await cleanup("Supabase account", () =>
      fetch(`${SUPABASE_URL}/rest/v1/accounts?clerk_user_id=eq.${userId}`, { method: "DELETE", headers: { apikey: SUPABASE_SECRET_KEY! } }),
    );
    await cleanup(
      "Clerk user",
      () => fetch(`https://api.clerk.com/v1/users/${userId}`, { method: "DELETE", headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } }),
      404,
    );
    expect(failures, "the test data is cleaned up").toEqual([]);
  }
});
