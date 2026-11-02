import { expect, test } from "@playwright/test";
import { APP, HOST, errorBody, mockChat, mockConfig, recordMessages, seenMessages } from "./helpers";

// The /embed panel inside the widget's iframe, across origins, talking to the chat route.
// The config and chat routes are mocked, so no project or knowledge is needed in the database.

const CONVERSATION = "2f0d4c6e-3b1a-4c1e-9d3b-5a6f7e8d9c10";
const REPLY = "We open at 9am.";

async function openPanel(page: import("@playwright/test").Page) {
  await page.goto(HOST);
  await page.getByRole("button", { name: "Ask us" }).click();
  return page.frameLocator("iframe");
}

test("send → typing → the route's reply, with the input disabled while waiting", async ({ page }) => {
  await mockConfig(page, { headerText: "Ask Acme" });
  await mockChat(page, () => ({ body: { conversationId: CONVERSATION, reply: REPLY }, delayMs: 700 }));
  const panel = await openPanel(page);
  await expect(panel.getByRole("heading", { name: "Ask Acme" })).toBeVisible();

  const input = panel.getByLabel("Your message");
  await input.fill("hello");
  await input.press("Enter");
  await expect(panel.getByText("hello", { exact: true })).toBeVisible();
  await expect(panel.getByRole("status")).toContainText("Typing");
  await expect(input).toBeDisabled();
  await expect(panel.getByText(REPLY)).toBeVisible({ timeout: 5000 });
  await expect(panel.getByRole("status")).toHaveCount(0);
  await expect(input).toBeEnabled();
});

test("the conversation carries across messages, with the key and the stored visitor ID", async ({ page }) => {
  await mockConfig(page);
  const requests = await mockChat(page, (_body, n) => ({ body: { conversationId: CONVERSATION, reply: `answer ${n}` } }));
  const panel = await openPanel(page);
  const input = panel.getByLabel("Your message");

  await input.fill("first question");
  await input.press("Enter");
  await expect(panel.getByText("answer 1")).toBeVisible();
  await input.fill("and a follow-up");
  await input.press("Enter");
  await expect(panel.getByText("answer 2")).toBeVisible();

  expect(requests).toHaveLength(2);
  expect(requests[0]).not.toHaveProperty("conversationId");
  expect(requests[0]).toMatchObject({ key: "pk_demo", message: "first question" });
  expect(requests[1]).toMatchObject({ conversationId: CONVERSATION, message: "and a follow-up" });
  expect(requests[1]!.visitorId).toBe(requests[0]!.visitorId);
});

for (const [name, status, code, message] of [
  ["429 rate_limited", 429, "rate_limited", "You're sending messages quickly. Try again in a minute."],
  ["429 quota_exceeded", 429, "quota_exceeded", "This chat has reached its monthly limit."],
  ["400 prompt_injection", 400, "prompt_injection", "I can't help with that."],
  ["503 (the AI is busy)", 503, "internal_error", "The assistant is busy right now. Try again in a moment."],
  ["500", 500, "internal_error", "Something went wrong. Try again."],
] as const) {
  test(`${name} shows its friendly message and the panel stays usable`, async ({ page }) => {
    await mockConfig(page);
    await mockChat(page, () => ({ status, body: errorBody(code) }));
    const panel = await openPanel(page);
    const input = panel.getByLabel("Your message");
    await input.fill("hello");
    await input.press("Enter");

    // Next adds its own role="alert" route announcer, so pick the notice by its text.
    await expect(panel.getByRole("alert").filter({ hasText: message })).toHaveCount(1);
    await expect(panel.getByText("server wording")).toHaveCount(0);
    await expect(panel.getByText("hello", { exact: true })).toBeVisible();
    await expect(input).toBeEnabled();
  });
}

test("<b>hi</b> and markup in a reply show as literal text", async ({ page }) => {
  await mockConfig(page);
  await mockChat(page, () => ({ body: { conversationId: CONVERSATION, reply: "<i>italic</i> and <b>bold</b>" } }));
  const panel = await openPanel(page);
  await panel.getByLabel("Your message").fill("<b>hi</b>");
  await panel.getByLabel("Your message").press("Enter");
  await expect(panel.getByText("<b>hi</b>", { exact: true })).toBeVisible();
  await expect(panel.getByText("<i>italic</i> and <b>bold</b>", { exact: true })).toBeVisible();
  await expect(panel.locator("b, i")).toHaveCount(0);
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
