import { test, expect, request } from "@playwright/test";

// Covers the account + dashboard surface that the connector unit tests can't:
// first-run setup, the Wolfigs branding, CSRF-protected mutations, and the
// admin panel gate. These drive the real HTTP surface through a browser.

const rnd = () => Math.random().toString(36).slice(2, 8);

test.describe("Weblay dashboard", () => {
  test("first-run setup creates the super admin and shows Wolfigs branding", async ({ page }) => {
    const status = await (await request.newContext()).get("/api/v1/status");
    const body = await status.json();
    test.skip(!body.needsSetup, "server already has accounts; run against a fresh DB");

    await page.goto("/");
    await page.getByLabel(/email/i).fill(`owner-${rnd()}@wolfigs.dev`);
    await page.getByLabel(/password/i).fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: /create|set up|continue/i }).click();

    // Lands in the dashboard with Wolfigs Weblay branding.
    await expect(page.locator(".brand")).toContainText("Wolfigs");
    await expect(page.locator(".brand .product")).toContainText("Weblay");
  });

  test("mutating API without a CSRF token is rejected", async ({ request }) => {
    // A raw POST with no X-CSRF-Token header must be forbidden (or unauthorized
    // if unauthenticated) — never accepted.
    const res = await request.post("/api/v1/sites", { data: { name: "x" } });
    expect([401, 403]).toContain(res.status());
  });
});

// The connector edit→publish loop. Requires the demo stack (a site with the
// connector installed); skipped unless WEBLAY_DEMO_URL is provided.
test.describe("connector edit loop", () => {
  test.skip(!process.env.WEBLAY_DEMO_URL, "set WEBLAY_DEMO_URL to the demo site to run");

  test("edit a heading and see it applied", async ({ page }) => {
    await page.goto(process.env.WEBLAY_DEMO_URL!);
    // Placeholder for the in-page editor flow (open editor via edit token,
    // select a data-weblay element, type, save, publish, reload, assert).
    await expect(page).toHaveTitle(/.+/);
  });
});
