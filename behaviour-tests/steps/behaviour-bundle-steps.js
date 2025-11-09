// behaviour-tests/behaviour-bundle-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-bundle-steps";

export async function goToBundlesPage(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user opens the menu and navigates to Bundles", async () => {
    // Go to bundles via hamburger menu
    console.log("Opening hamburger menu...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-bundles-page-hamburger-menu.png` });
    await expect(page.locator("button.hamburger-btn")).toBeVisible({ timeout: 10000 });
    await loggedClick(page, "button.hamburger-btn", "Opening hamburger menu");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-goto-bundles-page-hamburger-menu.png` });
    await expect(page.getByRole("link", { name: "Bundles", exact: true })).toBeVisible({ timeout: 16000 });
    await Promise.all([
      page.waitForURL(/bundles\.html/, { waitUntil: "domcontentloaded", timeout: 30000 }),
      loggedClick(page, "a[href*='bundles.html']", "Clicking Bundles in hamburger menu"),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-goto-bundles-page-hamburger-menu.png` });
  });
}

export async function clearBundles(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user clears any existing bundles before requesting a new one", async () => {
    // Remove all bundles first (idempotent operation)
    console.log("Removing all bundles first...");
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-01-removing-all-bundles.png`,
    });
    // Accept the confirmation dialog triggered by the click
    page.once("dialog", (dialog) => dialog.accept());
    await Promise.all([
      // No navigation expected, just UI update
      loggedClick(page, "#removeAllBtn", "Remove All Bundles"),
    ]);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-02-removing-all-bundles-clicked.png`,
    });
    await expect(page.getByText("Request test")).toBeVisible({ timeout: 16000 });
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-03-removed-all-bundles.png`,
    });
  });
}

export async function requestTestBundle(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user requests a test bundle and sees a confirmation message", async () => {
    // Request test bundle
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-request-test-bundle.png` });
    await expect(page.getByText("Request test")).toBeVisible();
    await loggedClick(page, "button:has-text('Request test')", "Request test");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-request-test-bundle-clicked.png` });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-request-test-bundle.png` });
    await expect(page.getByText("Added ✓")).toBeVisible({ timeout: 16000 });
  });
}

export async function ensureTestBundlePresent(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Ensure test bundle is present (idempotent)", async () => {
    // If the confirmation text for an added bundle is already visible, do nothing.
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-ensure-test-bundle.png` });
    const locator = page.getByRole("text", { name: "Added ✓", timeout: 16000 });
    // const isAddedVisible = await page.getByText("Added ✓").isVisible({ timeout: 16000 });
    if (locator.isVisible({ timeout: 16000 })) {
      console.log("Test bundle already present, skipping request.");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-ensure-test-bundle-skipping.png` });
      return;
    }
    // Otherwise request the test bundle once.
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-ensure-test-bundle-adding.png` });
    await requestTestBundle(page, screenshotPath);
  });
}
