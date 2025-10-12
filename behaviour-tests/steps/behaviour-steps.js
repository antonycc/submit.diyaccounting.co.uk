// behaviour-tests/behaviour-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedGoto, timestamp } from "../helpers/behaviour-helpers.js";

export async function goToHomePageExpectNotLoggedIn(page, testUrl) {
  await test.step("The user opens the home page expecting the log in link to be visible", async () => {
    // Load default document with warning message bypass
    console.log("Loading document...");
    await page.setExtraHTTPHeaders({
      "ngrok-skip-browser-warning": "any value",
    });
    await page.screenshot({ path: `target/behaviour-test-results/bundles-screenshots/000-start-${timestamp()}.png` });
    await loggedGoto(page, testUrl, "Loading home page");

    // Home page has a welcome message and clickable login link
    console.log("Checking home page...");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/bundles-screenshots/010-home-${timestamp()}.png` });
    await expect(page.getByText("Log in")).toBeVisible();
  });
}

export async function goToHomePage(page) {
  await test.step("The user returns to the home page from the Bundles screen", async () => {
    // Return to home
    await expect(page.getByText("Back to Home")).toBeVisible();
    await loggedClick(page, "button:has-text('Back to Home')", "Back to Home");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/bundles-screenshots/077-home-${timestamp()}.png` });
  });
}

export async function goToHomePageUsingHamburgerMenu(page) {
  await test.step("The user returns to the home page via the menu", async () => {
    // Return to home via hamburger menu
    console.log("Returning to home via hamburger menu...");
    await loggedClick(page, "button.hamburger-btn", "Opening hamburger menu to go home");
    await page.waitForTimeout(500);
    await loggedClick(page, "a:has-text('Home')", "Clicking Home in hamburger menu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/179-back-home-via-menu-${timestamp()}.png`,
    });
  });
}
