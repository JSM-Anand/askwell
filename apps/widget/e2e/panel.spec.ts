import { expect, test } from "@playwright/test";
import { APP, HOST, mockConfig, recordMessages, seenMessages } from "./helpers";

// T06's deferred browser checks: the /embed panel inside the widget's iframe, across origins.
// Needs the /embed page (P2P-T06) in the running app.

const MOCK_REPLY = "Thanks! Real answers arrive soon.";

async function openPanel(page: import("@playwright/test").Page) {
  await page.goto(HOST);
  await page.getByRole("button", { name: "Ask us" }).click();
  return page.frameLocator("iframe");
}

test("send → typing → mock reply", async ({ page }) => {
  await mockConfig(page, { headerText: "Ask Acme" });
  const panel = await openPanel(page);
  await expect(panel.getByRole("heading", { name: "Ask Acme" })).toBeVisible();

  await panel.getByLabel("Your message").fill("hello");
  await panel.getByLabel("Your message").press("Enter");
  await expect(panel.getByText("hello", { exact: true })).toBeVisible();
  await expect(panel.getByRole("status")).toContainText("Typing");
  await expect(panel.getByText(MOCK_REPLY)).toBeVisible({ timeout: 5000 });
  await expect(panel.getByRole("status")).toHaveCount(0);
});

test("<b>hi</b> shows as literal text", async ({ page }) => {
  await mockConfig(page);
  const panel = await openPanel(page);
  await panel.getByLabel("Your message").fill("<b>hi</b>");
  await panel.getByLabel("Your message").press("Enter");
  await expect(panel.getByText("<b>hi</b>", { exact: true })).toBeVisible();
  await expect(panel.locator("b")).toHaveCount(0);
});

test("the same visitor ID after a reload", async ({ page }) => {
  await mockConfig(page);
  const visitorId = async () => {
    const panel = await openPanel(page);
    await panel.getByLabel("Your message").waitFor(); // the iframe has loaded /embed by now
    const frame = page.frames().find((f) => f.url().startsWith(`${APP}/embed`))!;
    return frame.evaluate(() => localStorage.getItem("askwell-visitor-id"));
  };
  const first = await visitorId();
  expect(first).toBeTruthy();
  expect(await visitorId()).toBe(first); // goto reloads the host page and a fresh iframe
});

test("badge shows by default and hides when showBadge is false", async ({ page }) => {
  await mockConfig(page, { showBadge: true });
  await expect((await openPanel(page)).getByText("Powered by Askwell")).toBeVisible();

  const second = await page.context().newPage();
  await mockConfig(second, { showBadge: false });
  await second.goto(HOST);
  await second.getByRole("button", { name: "Ask us" }).click();
  await expect(second.frameLocator("iframe").getByLabel("Your message")).toBeVisible();
  await expect(second.frameLocator("iframe").getByText("Powered by")).toHaveCount(0);
});

test("close posts `close` to the parent origin, and the loader hides the panel", async ({ page }) => {
  await mockConfig(page);
  await recordMessages(page);
  const panel = await openPanel(page);
  await panel.getByRole("button", { name: "Close chat" }).click();

  await expect.poll(() => seenMessages(page).then((m) => m.filter((x) => (x.data as { type?: string }).type === "close"))).toEqual([
    { origin: APP, data: { type: "close" } },
  ]);
  await expect(page.locator("iframe")).toBeHidden();
});

test("with a different `origin` param, nothing is posted to the real parent", async ({ page }) => {
  await mockConfig(page);
  await recordMessages(page);
  await page.goto(HOST);
  // A panel told its parent is :9999 posts there only; the browser drops it for the real :8080 parent.
  await page.evaluate((src) => {
    const frame = document.createElement("iframe");
    frame.src = src;
    document.body.append(frame);
  }, `${APP}/embed?key=pk_demo&origin=${encodeURIComponent("http://localhost:9999")}`);
  const panel = page.frameLocator("iframe");
  await panel.getByRole("button", { name: "Close chat" }).click();
  await page.waitForTimeout(500);
  expect((await seenMessages(page)).filter((m) => (m.data as { type?: string }).type === "close")).toEqual([]);
});
