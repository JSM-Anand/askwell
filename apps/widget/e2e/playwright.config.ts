import { defineConfig } from "@playwright/test";

// Two origins, like a real install: the app on :3000 serves widget.js and /embed,
// the demo host page on :8080 stands in for a customer's site.
// Run `pnpm build` first (the app serves the built widget.js), then `pnpm --filter @askwell/widget e2e`.
// Once: `pnpm --filter @askwell/widget exec playwright install chromium`.
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  outputDir: "../node_modules/.e2e-results", // inside node_modules, so git ignores it
  use: { headless: true },
  webServer: [
    {
      command: "pnpm --filter @askwell/web start",
      url: "http://localhost:3000/widget.js",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @askwell/widget demo",
      url: "http://localhost:8080",
      reuseExistingServer: true,
    },
  ],
});
