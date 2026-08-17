import { defineConfig, devices } from "@playwright/test";

// Playwright E2E for the Weblay dashboard + connector edit→publish loop.
//
// Prereqs (one-time):  npm install  &&  npx playwright install chromium
// Run:                 WEBLAY_BASE_URL=http://localhost:8787 npm test
//
// By default it targets a running server at WEBLAY_BASE_URL (e.g. the demo stack
// from scratchpad/restart.sh). Set WEBLAY_WEBSERVER=1 to have Playwright boot a
// throwaway SQLite server itself.

const baseURL = process.env.WEBLAY_BASE_URL || "http://localhost:8787";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.WEBLAY_WEBSERVER
    ? {
        command:
          "cd .. && go run ./cmd/weblay -addr :8799 -data $(mktemp -d)",
        url: "http://localhost:8799/api/v1/status",
        reuseExistingServer: false,
        timeout: 30_000,
      }
    : undefined,
});
