// behaviour-tests/behaviour-hmrc-steps.js

import { expect, test } from "@playwright/test";
import { loggedFill, timestamp } from "../helpers/behaviour-helpers.js";

export async function acceptCookiesHmrc(page) {
  await test.step("Accept additional cookies and hide banner if presented", async () => {
    // Accept cookies if the banner is present
    const acceptCookiesButton = page.getByRole("button", { name: "Accept additional cookies" });
    if (await acceptCookiesButton.isVisible()) {
      console.log("[USER INTERACTION] Clicking: Accept additional cookies button - Accepting cookies");
      await acceptCookiesButton.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/115-accepted-cookies-${timestamp()}.png`,
      });
    }
    // Hide the cookies message if it's still visible
    const hideCookiesButton = page.getByRole("button", { name: "Hide cookies message" });
    if (await hideCookiesButton.isVisible()) {
      console.log("[USER INTERACTION] Clicking: Hide cookies message button - Hiding cookies message");
      await hideCookiesButton.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/116-hid-cookies-message-${timestamp()}.png`,
      });
    }
  });
}

export async function goToHmrcAuth(page) {
  await test.step("The user continues and is offered to sign in to the HMRC online service", async () => {
    //  Submit the permission form and expect the sign in option to be visible
    await page.waitForTimeout(100);
    console.log(`[USER INTERACTION] Clicking: Continue button - Continuing with HMRC permission`);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/120-submit-permission-${timestamp()}.png`,
    });
    await expect(page.getByRole("button", { name: "Sign in to the HMRC online service" })).toContainText(
      "Sign in to the HMRC online service",
    );
  });
}

export async function initHmrcAuth(page) {
  await test.step("The user chooses to sign in to HMRC and sees the credential fields", async () => {
    // Submit the sign in and expect the credentials form to be visible
    console.log(`[USER INTERACTION] Clicking: Sign in to HMRC button - Starting HMRC authentication`);
    await page.getByRole("button", { name: "Sign in to the HMRC online service" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/130-hmrc-auth-${timestamp()}.png`,
    });
    await expect(page.locator("#userId")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });
}

export async function fillInHmrcAuth(page, hmrcTestUsername, hmrcTestPassword) {
  await test.step("The user provides HMRC credentials", async () => {
    // Fill in credentials and submit expecting this to initiate the HMRC sign in process
    await loggedFill(page, "#userId", hmrcTestUsername, "Entering HMRC user ID");
    await page.waitForTimeout(100);
    await loggedFill(page, "#password", hmrcTestPassword, "Entering HMRC password");
    await page.waitForTimeout(100);
  });
}

export async function submitHmrcAuth(page) {
  await test.step("The user submits HMRC credentials, expecting to be prompted to grant permission", async () => {
    console.log(`[USER INTERACTION] Clicking: Sign in button - Submitting HMRC credentials`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/140-hmrc-credentials-${timestamp()}.png`,
    });
    await expect(page.locator("#givePermission")).toBeVisible();
  });
}

export async function grantPermissionHmrcAuth(page) {
  await test.step("The user grants permission to HMRC and returns to the application", async () => {
    //  Submit the give permission form
    await page.click("#givePermission");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/150-give-permission-${timestamp()}.png`,
    });
  });
}
