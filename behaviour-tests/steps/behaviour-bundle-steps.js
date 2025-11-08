// behaviour-tests/behaviour-bundle-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-bundle-steps";

export async function goToBundlesPage(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user opens the menu and navigates to Bundles", async () => {
    // Go to bundles via hamburger menu
    console.log("Opening hamburger menu...");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-bundles-page-hamburger-menu.png` });
    await loggedClick(page, "button.hamburger-btn", "Opening hamburger menu");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-goto-bundles-page-hamburger-menu.png` });
    await expect(page.getByRole("link", { name: "Bundles", exact: true })).toBeVisible();
    await loggedClick(page, "a[href*='bundles.html']", "Clicking Bundles in hamburger menu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
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
    await loggedClick(page, "#removeAllBtn", "Remove All Bundles");
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-02-removing-all-bundles-clicked.png`,
    });
    await page.waitForTimeout(500);
    // Accept the confirmation dialog
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-03-popup.png`,
    });
    await page.on("dialog", (dialog) => dialog.accept());
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-04-popedup.png`,
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-05-removed-all-bundles.png`,
    });
    await expect(page.getByText("Request test")).toBeVisible();
  });
}

export async function requestTestBundle(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user requests a test bundle and sees a confirmation message", async () => {
    // Request test bundle
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-request-test-bundle.png` });
    await expect(page.getByText("Request test")).toBeVisible();
    await loggedClick(page, "button:has-text('Request test')", "Request test");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-request-test-bundle-clicked.png` });
    await page.waitForLoadState("networkidle");
    // await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-request-test-bundle.png` });
    await expect(page.getByText("Added ✓")).toBeVisible({ timeout: 16000 });
  });
}

export async function ensureTestBundlePresent(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Ensure test bundle is present (idempotent)", async () => {
    // If the confirmation text for an added bundle is already visible, do nothing.
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-ensure-test-bundle.png` });
    const isAddedVisible = await page.getByText("Added ✓").isVisible();
    if (isAddedVisible) {
      console.log("Test bundle already present, skipping request.");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-ensure-test-bundle-skipping.png` });
      return;
    }
    // Otherwise request the test bundle once.
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-ensure-test-bundle-adding.png` });
    await requestTestBundle(page, screenshotPath);
  });
}
