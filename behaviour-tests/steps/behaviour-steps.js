// behaviour-tests/behaviour-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedGoto, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-steps";

export async function goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath = defaultScreenshotPath) {
  await test.step("The user opens the home page expecting the log in link to be visible", async () => {
    // Load default document with warning message bypass
    console.log("Loading document...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-home-page.png` });
    await page.setExtraHTTPHeaders({
      "ngrok-skip-browser-warning": "any value",
    });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-home-page.png` });
    await loggedGoto(page, testUrl, "Loading home page");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-home-page.png` });

    // Home page has a welcome message and clickable login link
    console.log("Checking home page...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-home-page.png` });
    await expect(page.getByText("Log in")).toBeVisible({ timeout: 15000 });
  });
}

export async function goToHomePage(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user returns to the home page from the Bundles screen", async () => {
    // Return to home
    await expect(page.getByText("Back to Home")).toBeVisible();
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-home-page.png` });
    await Promise.all([
      page.waitForURL(/index\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      loggedClick(page, "button:has-text('Back to Home')", "Back to Home"),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-goto-home.png` });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-goto-home.png` });
  });
}

export async function goToHomePageUsingHamburgerMenu(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user returns to the home page via the menu", async () => {
    // Return to home via hamburger menu
    console.log("Returning to home via hamburger menu...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-home-hamburger.png` });
    await loggedClick(page, "button.hamburger-btn", "Opening hamburger menu to go home");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-goto-home-hamburger-clicked-menu.png` });
    await expect(page.getByRole("link", { name: "Home" })).toBeVisible({ timeout: 10000 });
    await Promise.all([
      page.waitForURL(/index\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      loggedClick(page, "a:has-text('Home')", "Clicking Home in hamburger menu"),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-goto-home.png` });
  });
}

export async function consentToDataCollection(page, screenshotPath = defaultScreenshotPath) {
  // If there is a "CloudWatch RUM" analytics consent dialog, accept it
  await test.step("Accept CloudWatch RUM analytics consent if shown", async () => {
    const consentSelector = 'button:has-text("Accept")';
    const isConsentVisible = await page
      .locator(consentSelector)
      .isVisible()
      .catch(() => false);
    if (isConsentVisible) {
      console.log("CloudWatch RUM analytics consent dialog is visible, accepting...");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-consent-dialog.png` });
      await page.click(consentSelector);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-consent-accepted.png` });
    } else {
      console.log("CloudWatch RUM analytics consent dialog not shown, continuing...");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-no-consent-dialog.png` });
    }
  });
}
