// web/browser-tests/visibility-indicator.browser.test.js
import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
  dotenvConfigIfNotBlank({ path: ".env.test" });
}

test.describe("Visibility Indicator", () => {
  test.beforeEach(async ({ page }) => {
    // Start at a local test server (assumes server is running)
    await page.goto("http://127.0.0.1:3000/");
  });

  test("should display indicator on homepage", async ({ page }) => {
    const indicator = page.locator("#visibilityIndicator");
    await expect(indicator).toBeVisible();

    // Should contain some status text
    const text = await indicator.textContent();
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
  });

  test("should show Public status for homepage", async ({ page }) => {
    await page.goto("http://127.0.0.1:3000/index.html");
    const indicator = page.locator("#visibilityIndicator");

    await expect(indicator).toBeVisible();
    const text = await indicator.textContent();

    // Homepage should be public (no specific activity match)
    expect(text).toContain("Public");
  });

  test("should show appropriate status for bundles page", async ({ page }) => {
    await page.goto("http://127.0.0.1:3000/account/bundles.html");
    const indicator = page.locator("#visibilityIndicator");

    await expect(indicator).toBeVisible();
    const text = await indicator.textContent();

    // Bundles page requires "default" bundle which is automatic
    // So should show "Activity available" or similar positive status
    expect(text).toMatch(/Activity available|Public/);
  });

  test("should show Needs login for activity pages when not logged in", async ({ page }) => {
    await page.goto("http://127.0.0.1:3000/activities/submitVat.html");
    const indicator = page.locator("#visibilityIndicator");

    await expect(indicator).toBeVisible();
    const text = await indicator.textContent();

    // Submit VAT requires test bundle, which needs login
    expect(text).toContain("Needs login");

    // Should have a link to login
    const link = indicator.locator("a");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", expect.stringContaining("login"));
  });

  test("should update indicator after simulated login", async ({ page }) => {
    await page.goto("http://127.0.0.1:3000/activities/submitVat.html");

    // Initially should need login
    const indicator = page.locator("#visibilityIndicator");
    let text = await indicator.textContent();
    expect(text).toContain("Needs login");

    // Simulate login by setting localStorage
    await page.evaluate(() => {
      localStorage.setItem("cognitoIdToken", "mock-token");
      localStorage.setItem(
        "userInfo",
        JSON.stringify({
          email: "test@example.com",
          name: "Test User",
        }),
      );
      localStorage.setItem("userBundles", JSON.stringify([]));
    });

    // Trigger a re-render by dispatching event
    await page.evaluate(() => {
      window.dispatchEvent(new Event("auth-status-changed"));
    });

    await page.waitForTimeout(500);

    // Now should show "Needs activity" since logged in but no bundle
    text = await indicator.textContent();
    expect(text).toContain("Needs activity");

    // Should have link to bundles page
    const link = indicator.locator("a");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", expect.stringContaining("bundles"));
  });

  test("should show Activity available with correct bundle", async ({ page }) => {
    await page.goto("http://127.0.0.1:3000/activities/submitVat.html");

    // Set logged in state with test bundle
    await page.evaluate(() => {
      localStorage.setItem("cognitoIdToken", "mock-token");
      localStorage.setItem(
        "userInfo",
        JSON.stringify({
          email: "test@example.com",
          name: "Test User",
        }),
      );
      localStorage.setItem("userBundles", JSON.stringify(["test"]));
    });

    // Reload to apply localStorage state
    await page.reload();
    await page.waitForTimeout(500);

    const indicator = page.locator("#visibilityIndicator");
    await expect(indicator).toBeVisible();

    const text = await indicator.textContent();
    expect(text).toContain("Activity available");
  });
});
