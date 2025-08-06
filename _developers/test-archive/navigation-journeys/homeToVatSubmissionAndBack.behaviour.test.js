// behaviour-tests/navigation-journeys/homeToVatSubmissionAndBack.behaviour.test.js

import { test, expect } from "@playwright/test";
import { setTimeout } from "timers/promises";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

// Generate timestamp for file naming
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}

// Test configuration
test.use({
  video: {
    mode: "on",
    size: { width: 1280, height: 720 },
  },
});

test.outputDir = "target/behaviour-navigation-test-results";

test.describe("Navigation Journey: Home to VAT Submission and Back", () => {
  test("should navigate from home page to VAT submission and back successfully", async ({ page }) => {
    const timestamp = getTimestamp();

    // Navigate to the home page
    await page.goto("http://localhost:3000/");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/behaviour-navigation-test-results/home-to-vat-000-home_${timestamp}.png` });

    // Verify we're on the home page
    await expect(page.locator("h1")).toContainText("DIY Accounting Submit");
    await expect(page.locator("h2")).toContainText("Welcome");
    await expect(page.getByText("Choose from the available activities below to get started.")).toBeVisible();
    await expect(page.getByText("View available activities")).toBeVisible();

    // Click "View available activities" button to go to activities page
    await page.click("button:has-text('View available activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-navigation-test-results/home-to-vat-010-activities_${timestamp}.png`,
    });

    // Verify we're on the activities page
    await expect(page.locator("h1")).toContainText("DIY Accounting Submit");
    await expect(page.locator("h2")).toContainText("Available Activities");
    await expect(page.getByText("Select an activity to continue:")).toBeVisible();
    await expect(page.getByText("VAT Return Submission")).toBeVisible();
    await expect(page.getByText("Back to Home")).toBeVisible();

    // Click "VAT Return Submission" button to go to VAT form
    await page.click("button:has-text('VAT Return Submission')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-navigation-test-results/home-to-vat-020-vat-form_${timestamp}.png`,
    });

    // Verify we're on the VAT submission page
    await expect(page.locator("h1")).toContainText("DIY Accounting Submit");
    await expect(page.locator("h2")).toContainText("VAT Return Submission");
    await expect(page.locator("#vatSubmissionForm")).toBeVisible();
    await expect(page.locator("#vatNumber")).toBeVisible();
    await expect(page.locator("#periodKey")).toBeVisible();
    await expect(page.locator("#vatDue")).toBeVisible();
    await expect(page.getByText("View available activities")).toBeVisible();

    // Click "View available activities" button to go back to activities
    await page.click("button:has-text('View available activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-navigation-test-results/home-to-vat-030-back-activities_${timestamp}.png`,
    });

    // Verify we're back on the activities page
    await expect(page.locator("h1")).toContainText("DIY Accounting Submit");
    await expect(page.locator("h2")).toContainText("Available Activities");
    await expect(page.getByText("Select an activity to continue:")).toBeVisible();
    await expect(page.getByText("VAT Return Submission")).toBeVisible();
    await expect(page.getByText("Back to Home")).toBeVisible();

    // Click "Back to Home" button to return to home page
    await page.click("button:has-text('Back to Home')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-navigation-test-results/home-to-vat-040-back-home_${timestamp}.png`,
    });

    // Verify we're back on the home page
    await expect(page.locator("h1")).toContainText("DIY Accounting Submit");
    await expect(page.locator("h2")).toContainText("Welcome");
    await expect(page.getByText("Choose from the available activities below to get started.")).toBeVisible();
    await expect(page.getByText("View available activities")).toBeVisible();

    console.log("Home to VAT Submission and Back navigation journey completed successfully");
  });

  test("should navigate directly from VAT form back to home via activities", async ({ page }) => {
    const timestamp = getTimestamp();

    // Navigate to the home page
    await page.goto("http://localhost:3000/");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);

    // Navigate to VAT form (home -> activities -> VAT form)
    await page.click("button:has-text('View available activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(300);

    await page.click("button:has-text('VAT Return Submission')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-navigation-test-results/home-to-vat-direct-000-vat-form_${timestamp}.png`,
    });

    // Verify we're on the VAT submission page
    await expect(page.locator("h2")).toContainText("VAT Return Submission");
    await expect(page.locator("#vatSubmissionForm")).toBeVisible();

    // Navigate back to activities
    await page.click("button:has-text('View available activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(300);

    // Navigate back to home
    await page.click("button:has-text('Back to Home')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-navigation-test-results/home-to-vat-direct-010-back-home_${timestamp}.png`,
    });

    // Verify we're back on the home page
    await expect(page.locator("h2")).toContainText("Welcome");

    console.log("Direct navigation from VAT form back to home completed successfully");
  });

  test("should maintain form state when navigating away and back", async ({ page }) => {
    const timestamp = getTimestamp();

    // Navigate to VAT form
    await page.goto("http://localhost:3000/");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);

    await page.click("button:has-text('View available activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(300);

    await page.click("button:has-text('VAT Return Submission')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);

    // Fill in some form data
    await page.fill("#vatNumber", "123456789");
    await page.fill("#periodKey", "24A1");
    await page.fill("#vatDue", "1000.00");
    await setTimeout(300);
    await page.screenshot({
      path: `target/behaviour-navigation-test-results/home-to-vat-state-000-form-filled_${timestamp}.png`,
    });

    // Navigate away to activities
    await page.click("button:has-text('View available activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(300);

    // Navigate back to VAT form
    await page.click("button:has-text('VAT Return Submission')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-navigation-test-results/home-to-vat-state-010-form-restored_${timestamp}.png`,
    });

    // Verify form is empty (as expected for new page load)
    const vatNumber = await page.locator("#vatNumber").inputValue();
    const periodKey = await page.locator("#periodKey").inputValue();
    const vatDue = await page.locator("#vatDue").inputValue();

    expect(vatNumber).toBe("");
    expect(periodKey).toBe("");
    expect(vatDue).toBe("");

    console.log("Form state behavior verified during navigation");
  });

  test("should handle rapid navigation between pages", async ({ page }) => {
    const timestamp = getTimestamp();

    // Start at home page
    await page.goto("http://localhost:3000/");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);

    // Perform rapid navigation sequence
    for (let i = 0; i < 2; i++) {
      // Home -> Activities
      await page.click("button:has-text('View available activities')");
      await page.waitForLoadState("networkidle");
      await setTimeout(100);

      // Activities -> VAT Form
      await page.click("button:has-text('VAT Return Submission')");
      await page.waitForLoadState("networkidle");
      await setTimeout(100);

      // VAT Form -> Activities
      await page.click("button:has-text('View available activities')");
      await page.waitForLoadState("networkidle");
      await setTimeout(100);

      // Activities -> Home
      await page.click("button:has-text('Back to Home')");
      await page.waitForLoadState("networkidle");
      await setTimeout(100);
    }

    await page.screenshot({
      path: `target/behaviour-navigation-test-results/home-to-vat-rapid-navigation_${timestamp}.png`,
    });

    // Verify we end up on the home page
    await expect(page.locator("h2")).toContainText("Welcome");

    console.log("Rapid navigation sequence completed successfully");
  });
});
