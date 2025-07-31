// behaviour-tests/navigation-journeys/homeToActivitiesAndBack.behaviour.test.js

import { test, expect } from "@playwright/test";
import { setTimeout } from "timers/promises";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

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

test.describe("Navigation Journey: Home to Activities and Back", () => {
  test("should navigate from home page to activities and back successfully", async ({ page }) => {
    const timestamp = getTimestamp();
    
    // Navigate to the home page
    await page.goto("http://localhost:3000/");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/behaviour-navigation-test-results/home-to-activities-000-home_${timestamp}.png` });

    // Verify we're on the home page
    await expect(page.locator("h1")).toContainText("DIY Accounting Submit");
    await expect(page.locator("h2")).toContainText("Welcome");
    await expect(page.getByText("Choose from the available activities below to get started.")).toBeVisible();
    await expect(page.getByText("View available activities")).toBeVisible();

    // Click "View available activities" button
    await page.click("button:has-text('View available activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/behaviour-navigation-test-results/home-to-activities-010-activities_${timestamp}.png` });

    // Verify we're on the activities page
    await expect(page.locator("h1")).toContainText("DIY Accounting Submit");
    await expect(page.locator("h2")).toContainText("Available Activities");
    await expect(page.getByText("Select an activity to continue:")).toBeVisible();
    await expect(page.getByText("VAT Return Submission")).toBeVisible();
    await expect(page.getByText("Back to Home")).toBeVisible();

    // Click "Back to Home" button
    await page.click("button:has-text('Back to Home')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/behaviour-navigation-test-results/home-to-activities-020-back-home_${timestamp}.png` });

    // Verify we're back on the home page
    await expect(page.locator("h1")).toContainText("DIY Accounting Submit");
    await expect(page.locator("h2")).toContainText("Welcome");
    await expect(page.getByText("Choose from the available activities below to get started.")).toBeVisible();
    await expect(page.getByText("View available activities")).toBeVisible();

    console.log("Home to Activities and Back navigation journey completed successfully");
  });

  test("should handle multiple navigation cycles", async ({ page }) => {
    const timestamp = getTimestamp();
    
    // Start at home page
    await page.goto("http://localhost:3000/");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);

    // Perform multiple navigation cycles
    for (let i = 0; i < 3; i++) {
      // Go to activities
      await page.click("button:has-text('View available activities')");
      await page.waitForLoadState("networkidle");
      await setTimeout(200);
      
      // Verify activities page
      await expect(page.locator("h2")).toContainText("Available Activities");
      
      // Go back to home
      await page.click("button:has-text('Back to Home')");
      await page.waitForLoadState("networkidle");
      await setTimeout(200);
      
      // Verify home page
      await expect(page.locator("h2")).toContainText("Welcome");
    }

    await page.screenshot({ path: `target/behaviour-navigation-test-results/home-to-activities-multiple-cycles_${timestamp}.png` });
    console.log("Multiple navigation cycles completed successfully");
  });

  test("should maintain page state during navigation", async ({ page }) => {
    const timestamp = getTimestamp();
    
    // Navigate to home page
    await page.goto("http://localhost:3000/");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);

    // Verify initial state
    const homeTitle = await page.locator("title").textContent();
    expect(homeTitle).toBe("DIY Accounting Submit");

    // Navigate to activities
    await page.click("button:has-text('View available activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);

    // Verify activities page state
    const activitiesTitle = await page.locator("title").textContent();
    expect(activitiesTitle).toBe("DIY Accounting Submit - Activities");

    // Navigate back to home
    await page.click("button:has-text('Back to Home')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);

    // Verify home page state is restored
    const restoredHomeTitle = await page.locator("title").textContent();
    expect(restoredHomeTitle).toBe("DIY Accounting Submit");

    await page.screenshot({ path: `target/behaviour-navigation-test-results/home-to-activities-state-maintained_${timestamp}.png` });
    console.log("Page state maintained during navigation");
  });
});