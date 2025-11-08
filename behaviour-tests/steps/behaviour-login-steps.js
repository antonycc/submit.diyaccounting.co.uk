// behaviour-tests/behaviour-login-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-login-steps";

export async function clickLogIn(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user chooses to log in from the home page and arrives at the sign-in options", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-login.png` });
    await loggedClick(page, "a:has-text('Log in')", "Clicking login link");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-login-clicked.png` });

    // Login
    console.log("Logging in...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-login-loggining-in.png` });

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-login.png` });
  });
}

export async function loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath = defaultScreenshotPath) {
  if (testAuthProvider === "mock") {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-login-with-cognito-or-mock-auth.png` });
    await initMockAuth(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-login-with-cognito-or-mock-auth.png` });
    await fillInMockAuth(page, testAuthUsername, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-login-with-cognito-or-mock-auth.png` });
    await submitMockAuth(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-login-with-cognito-or-mock-auth.png` });
  } else if (testAuthProvider === "cognito") {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-login-with-cognito-or-mock-auth.png` });
    await initCognitoAuth(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-login-with-cognito-or-mock-auth.png` });

    // Retry logic for Cognito button and OIDC login heading
    let retries = 0;
    const maxRetries = 5;
    while (retries < maxRetries) {
      try {
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-login-with-cognito-or-mock-auth-retry.png` });
        await selectOidcCognitoAuth(page, screenshotPath);
        break; // Success, exit loop
      } catch (err) {
        retries++;
        if (retries === maxRetries) throw err;
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-login-with-cognito-or-mock-auth-failed-attempt.png` });
      }
    }
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-login-with-cognito-or-mock-auth.png` });
    await fillInCognitoAuth(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-10-login-with-cognito-or-mock-auth-filled-in.png` });
    await submitCognitoAuth(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-11-login-with-cognito-or-mock-auth-submitted.png` });
  }
}

export async function verifyLoggedInStatus(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user returns to the home page and sees their logged-in status", async () => {
    console.log("Checking home page...");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-home.png` });
    await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 16000 });
  });
}

export async function logOutAndExpectToBeLoggedOut(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user logs out and sees the public home page with the log in link", async () => {
    console.log("Logging out from home page");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-home-before-waiting.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-home-before-logout.png` });
    await expect(page.locator("a:has-text('Logout')")).toBeVisible();

    await page.click("a:has-text('Logout')");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-home-before-logout-clicked.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-home.png` });
  });
}

export async function initCognitoAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Continue with Google via Amazon Cognito", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-cognito-auth.png` });
    await expect(page.getByText("Continue with Google via Amazon Cognito")).toBeVisible();
    await loggedClick(page, "button:has-text('Continue with Google via Amazon Cognito')", "Continue with Google via Amazon Cognito");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-02-cognito-provider-auth-clicked.png`,
    });
  });
}

export async function selectOidcCognitoAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Attempt to click Cognito button for OIDC", async () => {
    const cognitoBtn = await page.getByRole("button", { name: "cognito" });
    await expect(cognitoBtn).toBeVisible({ timeout: 2000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-cognito-button.png` });

    await cognitoBtn.click();
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-cognito-button-clicked.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-cognito-button-loaded.png` });

    // Wait for OIDC login heading, retry if not found
    await page.getByRole("heading", { name: "OIDC - Direct Login" }).waitFor({ timeout: 2000 });
  });
}

export async function fillInCognitoAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Fill in some login details", async () => {
    await page.getByRole("button", { name: "Fill Form" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-cognito-auth-form-filled.png` });
  });
}

export async function submitCognitoAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Home page has logged in user email", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submitting-auth.png` });
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-submit-auth.png` });
  });
}

export async function initMockAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user continues with the mock identity provider and sees the sign-in form", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-init-mock-auth.png` });
    await expect(page.getByText("Continue with mock-oauth2-server")).toBeVisible();
    await loggedClick(page, "button:has-text('Continue with mock-oauth2-server')", "Continue with OAuth provider");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-init-mock-auth.png` });
    await expect(page.locator('input[type="submit"][value="Sign-in"]')).toBeVisible({ timeout: 10000 });
  });
}

export async function fillInMockAuth(page, testAuthUsername, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enters a username and identity claims for the session", async () => {
    // <input class="u-full-width" required="" type="text" name="username" placeholder="Enter any user/subject" autofocus="on">
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-fill-in-mock.png` });
    await loggedFill(page, 'input[name="username"]', `${testAuthUsername}`, "Entering username");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-fill-in-mock-filled-username.png` });
    await page.waitForTimeout(100);

    // <textarea class="u-full-width claims" name="claims" rows="15" placeholder="Optional claims JSON" autofocus="on"></textarea>
    // { "email": "user@example.com" }
    const identityToken = {
      email: `${testAuthUsername}@example.com`,
    };
    await loggedFill(page, 'textarea[name="claims"]', JSON.stringify(identityToken), "Entering identity claims");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-fill-in-moc-filled-claims.png` });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-fill-in-mock.png` });
  });
}

export async function submitMockAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the sign-in form and returns to the app as an authenticated user", async () => {
    // Home page has logged in user email
    // <input class="button-primary" type="submit" value="Sign-in">
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submit-mock.png` });
    await loggedClick(page, 'input[type="submit"][value="Sign-in"]', "Submitting sign-in form");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-mock-signed-in.png` });
  });
}
