// behaviour-tests/behaviour-bundle-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, timestamp, isSandboxMode } from "../helpers/behaviour-helpers.js";

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
    await expect(page.getByRole("button", { name: "Request Test (2 hours)", exact: true })).toBeVisible({ timeout: 16000 });
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-03-removed-all-bundles.png`,
    });
  });
}

export async function requestTestBundle(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user requests a test bundle and sees a confirmation message", async () => {
    // Request test bundle
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-request-test-bundle.png` });
    let requestTestLocator = page.getByRole("button", { name: "Request Test (2 hours)" });
    // await expect(page.getByText("Request test")).toBeVisible();
    // If the "Request test" button is not visible, wait 1000ms and try again and do that up to 5 times.
    if (!(await requestTestLocator.isVisible())) {
      for (let i = 0; i < 5; i++) {
        console.log(`"Request Test (2 hours)" button not visible, waiting 1000ms and trying again (${i + 1}/5)`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-request-test-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-request-test-bundle-waited.png` });
        requestTestLocator = page.getByRole("button", { name: "Request Test (2 hours)" });
        if (await requestTestLocator.isVisible()) {
          break;
        }
      }
    }

    // If the "Request test" button is not visible, check if "Added ✓" is visible instead and if so, skip the request.
    if (!(await requestTestLocator.isVisible())) {
      const addedLocator = page.getByRole("button", { name: "Added ✓ Test (2 hours)" });
      if (await addedLocator.isVisible()) {
        console.log("Test bundle already present, skipping request.");
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-request-test-bundle-skipping.png` });
        return;
      }
    }
    await loggedClick(page, "button:has-text('Request Test (2 hours)')", "Request Test (2 hours)");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-request-test-bundle-clicked.png` });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-request-test-bundle.png` });
    await expect(page.getByRole("button", { name: "Added ✓ Test (2 hours)" })).toBeVisible({ timeout: 16000 });
  });
}

export async function ensureTestBundlePresent(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Ensure test bundle is present (idempotent)", async () => {
    // If the confirmation text for an added bundle is already visible, do nothing.
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-ensure-test-bundle.png` });
    let addedLocator = page.getByRole("button", { name: "Added ✓ Test (2 hours)" });
    // const isAddedVisible = await page.getByText("Added ✓").isVisible({ timeout: 16000 });
    // If the "Added ✓" button is not visible, wait 1000ms and try again and do that up to 5 times.
    if (!(await addedLocator.isVisible())) {
      for (let i = 0; i < 5; i++) {
        console.log(`"Added ✓ Test (2 hours)" button not visible, waiting 1000ms and trying again (${i + 1}/5)`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-ensure-test-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        addedLocator = page.getByRole("button", { name: "Added ✓ Test (2 hours)" });
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-ensure-test-bundle-waited.png` });
        if (await addedLocator.isVisible()) {
          break;
        }
      }
    }
    // Fallback: look for the specific test bundle button by data attribute in case role+name fails (e.g., due to special characters)
    if (!(await addedLocator.isVisible())) {
      const specificAdded = page.locator("button.service-btn[data-bundle-id='test']:has-text('Added ✓ Test (2 hours)')");
      if (await specificAdded.isVisible()) {
        addedLocator = specificAdded;
      }
    }
    if (await addedLocator.isVisible({ timeout: 16000 })) {
      console.log("Test bundle already present, skipping request.");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-ensure-test-bundle-skipping.png` });
      return;
    }
    // Otherwise request the test bundle once.
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-test-bundle-adding.png` });
    await requestTestBundle(page, screenshotPath);
  });
}

/**
 * Request Guest bundle (free authenticated activities for a limited time)
 */
export async function requestGuestBundle(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user requests a guest bundle and sees a confirmation message", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-request-guest-bundle.png` });
    let requestGuestLocator = page.getByRole("button", { name: "Request Guest (10 minutes)" });
    if (!(await requestGuestLocator.isVisible())) {
      for (let i = 0; i < 5; i++) {
        console.log(`"Request Guest (10 minutes)" button not visible, waiting 1000ms and trying again (${i + 1}/5)`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-request-guest-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-request-guest-bundle-waited.png` });
        requestGuestLocator = page.getByRole("button", { name: "Request Guest (10 minutes)" });
        if (await requestGuestLocator.isVisible()) {
          break;
        }
      }
    }

    if (!(await requestGuestLocator.isVisible())) {
      const addedLocator = page.getByRole("button", { name: "Added ✓ Guest (10 minutes)" });
      if (await addedLocator.isVisible()) {
        console.log("Guest bundle already present, skipping request.");
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-request-guest-bundle-skipping.png` });
        return;
      }
    }
    await loggedClick(page, "button:has-text('Request Guest (10 minutes)')", "Request Guest (10 minutes)");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-request-guest-bundle-clicked.png` });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-request-guest-bundle.png` });
    await expect(page.getByRole("button", { name: "Added ✓ Guest (10 minutes)" })).toBeVisible({ timeout: 16000 });
  });
}

export async function ensureGuestBundlePresent(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Ensure guest bundle is present (idempotent)", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-ensure-guest-bundle.png` });
    let addedLocator = page.getByRole("button", { name: "Added ✓ Guest (10 minutes)" });
    if (!(await addedLocator.isVisible())) {
      for (let i = 0; i < 5; i++) {
        console.log(`"Added ✓ Guest (10 minutes)" button not visible, waiting 1000ms and trying again (${i + 1}/5)`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-ensure-guest-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        addedLocator = page.getByRole("button", { name: "Added ✓ Guest (10 minutes)" });
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-ensure-guest-bundle-waited.png` });
        if (await addedLocator.isVisible()) {
          break;
        }
      }
    }
    if (await addedLocator.isVisible({ timeout: 16000 })) {
      console.log("Guest bundle already present, skipping request.");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-ensure-guest-bundle-skipping.png` });
      return;
    }
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-guest-bundle-adding.png` });
    await requestGuestBundle(page, screenshotPath);
  });
}

/**
 * Ensure the appropriate bundle is present based on sandbox mode
 * - Sandbox mode: request "test" bundle
 * - Production mode: request "guest" bundle
 */
export async function ensureAppropriateBundle(page, screenshotPath = defaultScreenshotPath) {
  const bundleId = isSandboxMode() ? "test" : "guest";
  const bundleDisplayNameFull = isSandboxMode() ? "Test (2 hours)" : "Guest (10 minutes)";

  await test.step(`Ensure ${bundleDisplayNameFull} bundle is present (idempotent)`, async () => {
    console.log(`Ensuring ${bundleDisplayNameFull} bundle is present for ${isSandboxMode() ? "sandbox" : "production"} mode`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-ensure-${bundleId}-bundle.png` });

    // Look for the specific bundle button by data attribute
    const specificAdded = page.locator(`button.service-btn[data-bundle-id='${bundleId}']:has-text('Added ✓ ${bundleDisplayNameFull}')`);

    // Check if bundle is already added
    if (await specificAdded.isVisible({ timeout: 5000 })) {
      console.log(`${bundleDisplayNameFull} bundle already present, skipping request.`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-ensure-${bundleId}-bundle-skipping.png` });
      return;
    }

    // Request the bundle
    console.log(`Requesting ${bundleDisplayNameFull} bundle...`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-ensure-${bundleId}-bundle-adding.png` });

    const requestButton = page.getByRole("button", { name: `Request ${bundleDisplayNameFull}` });
    await expect(requestButton).toBeVisible({ timeout: 10000 });
    await loggedClick(page, `button:has-text('Request ${bundleDisplayNameFull}')`, `Request ${bundleDisplayNameFull}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-ensure-${bundleId}-bundle-clicked.png` });

    // Wait for confirmation
    await expect(page.locator(`button.service-btn[data-bundle-id='${bundleId}']:has-text('Added ✓ ${bundleDisplayNameFull}')`)).toBeVisible(
      { timeout: 16000 },
    );
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-${bundleId}-bundle-added.png` });
    console.log(`${bundleDisplayNameFull} bundle added successfully`);
  });
}

/**
 * Ensure bundles for environment:
 * - Always ensure Guest bundle present
 * - If sandbox, also ensure Test bundle present
 * - If live, DO NOT add Test bundle
 */
export async function ensureBundlesForEnvironment(page, screenshotPath = defaultScreenshotPath) {
  await ensureGuestBundlePresent(page, screenshotPath);
  if (isSandboxMode()) {
    await ensureTestBundlePresent(page, screenshotPath);
  }
}
