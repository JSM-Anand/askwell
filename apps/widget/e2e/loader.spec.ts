import { expect, test } from "@playwright/test";
import { APP, HOST, mockConfig, recordMessages, seenMessages } from "./helpers";

// T05's deferred browser checks: the loader on a page from another origin.

const shadowHosts = (page: import("@playwright/test").Page) =>
  page.evaluate(() => [...document.body.querySelectorAll("*")].filter((el) => el.shadowRoot).length);

test("a key the app doesn't know: no button, no script errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  // The browser itself logs "Failed to load resource" for the 404; that isn't the widget's doing.
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) problems.push(msg.text());
  });

  const config = page.waitForResponse((res) => res.url().startsWith(`${APP}/api/widget/config`));
  await page.goto(HOST);
  expect((await config).status()).toBe(404);
  await page.waitForTimeout(300);

  expect(await shadowHosts(page)).toBe(0);
  expect(problems).toEqual([]);
});

test("a real config: button in the configured corner and color, host page unchanged", async ({ page }) => {
  await mockConfig(page, { buttonColor: "#ff0000", position: "top-left", label: "Help me" });
  await page.goto(HOST);

  const button = page.getByRole("button", { name: "Help me" });
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(box.x).toBeLessThan(60);
  expect(box.y).toBeLessThan(60);
  await expect(button).toHaveCSS("background-color", "rgb(255, 0, 0)");
  // The host page's loud global `button` rule must not reach into the shadow root.
  await expect(button).toHaveCSS("border-top-width", "0px");

  const hostButton = page.getByRole("button", { name: "A host page button" });
  await expect(hostButton).toHaveCSS("background-color", "rgb(255, 105, 180)");
  await expect(hostButton).toHaveCSS("border-top-style", "dashed");
  expect(await page.locator("head style, head link").count()).toBe(1); // only the demo page's own <style>
});

test("click opens the app's /embed in an iframe, click again hides it", async ({ page }) => {
  await mockConfig(page);
  await page.goto(HOST);
  const button = page.getByRole("button", { name: "Ask us" });
  await button.click();
  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", `${APP}/embed?key=pk_demo&origin=${encodeURIComponent(HOST)}`);
  await expect(iframe).toBeVisible();
  await button.click();
  await expect(iframe).toBeHidden();
});

test("a message that isn't from the app's iframe is ignored", async ({ page }) => {
  await mockConfig(page);
  await recordMessages(page);
  await page.goto(HOST);
  await page.getByRole("button", { name: "Ask us" }).click();
  await expect(page.locator("iframe")).toBeVisible();

  // The host page posting to itself has origin :8080 and isn't the iframe's window.
  await page.evaluate(() => window.postMessage({ type: "close" }, "*"));
  await expect.poll(async () => (await seenMessages(page)).length).toBeGreaterThan(0);
  await expect(page.locator("iframe")).toBeVisible();
});
