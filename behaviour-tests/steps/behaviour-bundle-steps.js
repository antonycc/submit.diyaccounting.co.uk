// behaviour-tests/behaviour-bundle-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, timestamp } from "../helpers/behaviour-helpers.js";

export async function goToBundlesPage(page) {
  await test.step("The user opens the menu and navigates to Bundles", async () => {
    // Go to bundles via hamburger menu
    console.log("Opening hamburger menu...");
    await loggedClick(page, "button.hamburger-btn", "Opening hamburger menu");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/071-hamburger-menu-${timestamp()}.png`,
    });
    await expect(page.getByRole("link", { name: "Bundles", exact: true })).toBeVisible();
    await loggedClick(page, "a[href*='bundles.html']", "Clicking Bundles in hamburger menu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/072-bundles-page-${timestamp()}.png`,
    });
  });
}

export async function clearBundles(page) {
  await test.step("The user clears any existing bundles before requesting a new one", async () => {
    // Remove all bundles first (idempotent operation)
    console.log("Removing all bundles first...");
    await loggedClick(page, "#removeAllBtn", "Remove All Bundles");
    await page.waitForTimeout(500);
    // Accept the confirmation dialog
    await page.on("dialog", (dialog) => dialog.accept());
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/073-removed-all-bundles-${timestamp()}.png`,
    });
  });
}

export async function requestTestBundle(page) {
  await test.step("The user requests a test bundle and sees a confirmation message", async () => {
    // Request test bundle
    await expect(page.getByText("Request test")).toBeVisible();
    await loggedClick(page, "button:has-text('Request test')", "Request test");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/bundles-screenshots/075-bundles-${timestamp()}.png` });
    await expect(page.getByText("Added ✓")).toBeVisible({ timeout: 16000 });
  });
}

export async function ensureTestBundlePresent(page) {
  await test.step("Ensure test bundle is present (idempotent)", async () => {
    // If the confirmation text for an added bundle is already visible, do nothing.
    const isAddedVisible = await page.getByText("Added ✓").isVisible();
    if (isAddedVisible) {
      console.log("Test bundle already present, skipping request.");
      return;
    }
    // Otherwise request the test bundle once.
    await requestTestBundle(page);
  });
}
