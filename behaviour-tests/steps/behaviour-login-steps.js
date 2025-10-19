// behaviour-tests/behaviour-login-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp } from "../helpers/behaviour-helpers.js";

export async function clickLogIn(page) {
  await test.step("The user chooses to log in from the home page and arrives at the sign-in options", async () => {
    await loggedClick(page, "a:has-text('Log in')", "Clicking login link");

    // Login
    console.log("Logging in...");

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/bundles-screenshots/020-login-${timestamp()}.png` });
  });
}

export async function loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername) {
  if (testAuthProvider === "mock") {
    await initMockAuth(page);
    await fillInMockAuth(page, testAuthUsername);
    await submitMockAuth(page);
  } else if (testAuthProvider === "cognito") {
    await initCognitoAuth(page);

    // Retry logic for Cognito button and OIDC login heading
    let retries = 0;
    const maxRetries = 5;
    while (retries < maxRetries) {
      try {
        await selectOidcCognitoAuth(page);
        break; // Success, exit loop
      } catch (err) {
        retries++;
        if (retries === maxRetries) throw err;
        await page.waitForTimeout(500);
      }
    }
    await page.waitForTimeout(100);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/050-cognito-auth-form-empty-${timestamp()}.png`,
    });
    await fillInCognitoAuth(page);
    await submitCognitoAuth(page);
  }
}

export async function verifyLoggedInStatus(page) {
  await test.step("The user returns to the home page and sees their logged-in status", async () => {
    console.log("Checking home page...");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/bundles-screenshots/070-home-${timestamp()}.png` });
    await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 16000 });
  });
}

export async function logOutAndExpectToBeLoggedOut(page) {
  await test.step("The user logs out and sees the public home page with the log in link", async () => {
    console.log("Logging out from home page");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/180-home-before-logout-${timestamp()}.png`,
    });
    await expect(page.locator("a:has-text('Logout')")).toBeVisible();

    await page.click("a:has-text('Logout')");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/bundles-screenshots/190-home-${timestamp()}.png` });
  });
}

export async function initCognitoAuth(page) {
  await test.step("Continue with Google via Amazon Cognito", async () => {
    await expect(page.getByText("Continue with Google via Amazon Cognito")).toBeVisible();
    await loggedClick(page, "button:has-text('Continue with Google via Amazon Cognito')", "Continue with Google via Amazon Cognito");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/040-cognito-provider-auth-clicked-${timestamp()}.png`,
    });
  });
}

export async function selectOidcCognitoAuth(page) {
  await test.step("Attempt to click Cognito button for OIDC", async () => {
    const cognitoBtn = await page.getByRole("button", { name: "cognito" });
    await expect(cognitoBtn).toBeVisible({ timeout: 2000 });
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/043-cognito-button-${timestamp()}.png`,
    });

    await cognitoBtn.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/045-cognito-button-clicked-${timestamp()}.png`,
    });

    // Wait for OIDC login heading, retry if not found
    await page.getByRole("heading", { name: "OIDC - Direct Login" }).waitFor({ timeout: 2000 });
  });
}

export async function fillInCognitoAuth(page) {
  await test.step("Fill in some login details", async () => {
    await page.getByRole("button", { name: "Fill Form" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/055-cognito-auth-form-filled-${timestamp()}.png`,
    });
  });
}

export async function submitCognitoAuth(page) {
  await test.step("Home page has logged in user email", async () => {
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/060-cognito-signed-in-${timestamp()}.png`,
    });
  });
}

export async function initMockAuth(page) {
  await test.step("The user continues with the mock identity provider and sees the sign-in form", async () => {
    await expect(page.getByText("Continue with mock-oauth2-server")).toBeVisible();
    await loggedClick(page, "button:has-text('Continue with mock-oauth2-server')", "Continue with OAuth provider");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/040-mock-provider-auth-${timestamp()}.png`,
    });
    await expect(page.locator('input[type="submit"][value="Sign-in"]')).toBeVisible({ timeout: 10000 });
  });
}

export async function fillInMockAuth(page, testAuthUsername) {
  await test.step("The user enters a username and identity claims for the session", async () => {
    // <input class="u-full-width" required="" type="text" name="username" placeholder="Enter any user/subject" autofocus="on">
    await loggedFill(page, 'input[name="username"]', `${testAuthUsername}`, "Entering username");
    await page.waitForTimeout(100);

    // <textarea class="u-full-width claims" name="claims" rows="15" placeholder="Optional claims JSON" autofocus="on"></textarea>
    // { "email": "user@example.com" }
    const identityToken = {
      email: `${testAuthUsername}@example.com`,
    };
    await loggedFill(page, 'textarea[name="claims"]', JSON.stringify(identityToken), "Entering identity claims");
    await page.waitForTimeout(100);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/050-mock-auth-form-filled-${timestamp()}.png`,
    });
  });
}

export async function submitMockAuth(page) {
  await test.step("The user submits the sign-in form and returns to the app as an authenticated user", async () => {
    // Home page has logged in user email
    // <input class="button-primary" type="submit" value="Sign-in">
    await loggedClick(page, 'input[type="submit"][value="Sign-in"]', "Submitting sign-in form");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/060-mock-signed-in-${timestamp()}.png`,
    });
  });
}
