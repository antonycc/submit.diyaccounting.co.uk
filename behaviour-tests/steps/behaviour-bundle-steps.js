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
    await loggedClick(page, "button.hamburger-btn", "Opening hamburger menu", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-goto-bundles-page-hamburger-menu.png` });
    await expect(page.getByRole("link", { name: "Bundles", exact: true })).toBeVisible({ timeout: 16000 });
    await Promise.all([
      page.waitForURL(/bundles\.html/, { waitUntil: "domcontentloaded", timeout: 30000 }),
      loggedClick(page, "a[href*='bundles.html']", "Clicking Bundles in hamburger menu", { screenshotPath }),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-goto-bundles-page-hamburger-menu.png` });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-goto-bundles-page-hamburger-menu.png` });
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
      loggedClick(page, "#removeAllBtn", "Remove All Bundles", { screenshotPath }),
    ]);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-02-removing-all-bundles-clicked.png`,
    });
    await expect(page.getByRole("button", { name: "Request Test", exact: true })).toBeVisible({ timeout: 16000 });
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-03-removed-all-bundles.png`,
    });
  });
}

export async function ensureBundlePresent(page, bundleName = "Test", screenshotPath = defaultScreenshotPath) {
  await test.step(`Ensure ${bundleName} bundle is present (idempotent)`, async () => {
    // If the confirmation text for an added bundle is already visible, do nothing.
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-ensure-bundle.png` });
    let addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
    // const isAddedVisible = await page.getByText("Added ✓").isVisible({ timeout: 16000 });
    // If the "Added ✓" button is not visible, wait 1000ms and try again.
    if (!(await addedLocator.isVisible({ timeout: 1000 }))) {
      const tries = 5;
      for (let i = 0; i < tries; i++) {
        console.log(`"Added ✓ ${bundleName}" button not visible, waiting 1000ms and trying again (${i + 1}/${tries})`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-ensure-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-ensure-bundle-waited.png` });
        if (await addedLocator.isVisible({ timeout: 1000 })) {
          console.log(`[polling]: ${bundleName} bundle present.`);
          break;
        } else {
          console.log(`[polling]: ${bundleName} bundle still not present.`);
        }
      }
    }
    // Fallback: look for the specific test bundle button by data attribute in case role+name fails (e.g., due to special characters)
    //const bundleId = bundleName.toLowerCase().replace(/\s+/g, "-");
    //if (!(await addedLocator.isVisible())) {
    //  const specificAdded = page.locator(`button.service-btn[data-bundle-id='${bundleId}']:has-text('Added ✓ ${bundleName}')`);
    //  if (await specificAdded.isVisible()) {
    //    addedLocator = specificAdded;
    //  }
    //}
    if (await addedLocator.isVisible({ timeout: 16000 })) {
      console.log(`${bundleName} bundle already present, skipping request.`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-ensure-bundle-skipping.png` });
      return;
    } else {
      console.log(`${bundleName} bundle not present.`);
    }
    // Otherwise request the bundle once.
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-bundle-adding.png` });
    await requestBundle(page, bundleName, screenshotPath);
  });
}

export async function requestBundle(page, bundleName = "Test", screenshotPath = defaultScreenshotPath) {
  await test.step(`The user requests a ${bundleName} bundle and sees a confirmation message`, async () => {
    // Request test bundle
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-request-bundle.png` });
    let requestTestLocator = page.getByRole("button", { name: `Request ${bundleName}` });
    // await expect(page.getByText("Request test")).toBeVisible();
    // If the "Request test" button is not visible, wait 1000ms and try again.
    if (!(await requestTestLocator.isVisible({ timeout: 1000 }))) {
      const tries = 5;
      for (let i = 0; i < tries; i++) {
        console.log(`"Request ${bundleName}" button not visible, waiting 1000ms and trying again (${i + 1}/${tries})`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-request-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-request-bundle-waited.png` });
        requestTestLocator = page.getByRole("button", { name: `Request ${bundleName}` });
        if (await requestTestLocator.isVisible({ timeout: 1000 })) {
          console.log(`[polling]: ${bundleName} bundle request button visible.`);
          break;
        } else {
          console.log(`[polling]: ${bundleName} bundle request button still not visible.`);
        }
      }
    }

    // If the "Request test" button is not visible, check if "Added ✓" is visible instead and if so, skip the request.
    if (!(await requestTestLocator.isVisible({ timeout: 1000 }))) {
      const addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
      if (await addedLocator.isVisible({ timeout: 1000 })) {
        console.log(`${bundleName} bundle already present, skipping request.`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-request-bundle-skipping.png` });
        return;
      } else {
        console.log(`${bundleName} bundle request button still not visible, assuming it's a different error.`);
      }
    }
    await loggedClick(page, `button:has-text('Request ${bundleName}')`, `Request ${bundleName}`, { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-request-bundle-clicked.png` });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-request-bundle.png` });
    await expect(page.getByRole("button", { name: `Added ✓ ${bundleName}` })).toBeVisible({ timeout: 16000 });
  });
}
