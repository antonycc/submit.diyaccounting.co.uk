// behaviour-tests/submitVat.behaviour.test.js

import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { ensureMinioBucketExists, startMinio } from "@app/bin/minio.js";

import { checkIfServerIsRunning } from "@app/lib/serverHelper.js";
import { gotoWithRetries } from "@app/lib/gotoWithRetries.js";

dotenvConfigIfNotBlank({ path: ".env.test" });
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const originalEnv = { ...process.env };

// Test specific dedicated server port
const serverPort = 3500;
console.log(`serverPort: ${serverPort}`);

// Read HMRC credentials from environment variables
const hmrcTestUsername = process.env.DIY_SUBMIT_HMRC_TEST_USERNAME;
const hmrcTestPassword = process.env.DIY_SUBMIT_HMRC_TEST_PASSWORD;
const hmrcTestVatNumber = process.env.DIY_SUBMIT_HMRC_TEST_VAT_NUMBER;
console.log(`hmrcTestUsername: ${hmrcTestUsername}`);
console.log(`hmrcTestPassword: ${hmrcTestPassword.trim().length} chars`);
console.log(`hmrcTestVatNumber: ${hmrcTestVatNumber}`);

// S3 credentials for the test MinIO instance
const optionalTestS3AccessKey = process.env.TEST_S3_ACCESS_KEY;
const optionalTestS3SecretKey = process.env.TEST_S3_SECRET_KEY;
console.log(`optionalTestS3AccessKey: ${optionalTestS3AccessKey}`);
console.log(`optionalTestS3SecretKey: ${optionalTestS3SecretKey.trim().length} chars`);

// Environment variables for the test server and proxy
const runTestServer = process.env.TEST_SERVER_HTTP;
const runProxy = process.env.TEST_PROXY;
const runMockOAuth2 = process.env.TEST_MOCK_OAUTH2;
const runMinioS3 = process.env.TEST_MINIO_S3;
const testAuthProvider = process.env.TEST_AUTH_PROVIDER;
const testAuthUsername = process.env.TEST_AUTH_USERNAME;
const testAuthPassword = process.env.TEST_AUTH_PASSWORD;
console.log(`runTestServer: ${runTestServer} (TEST_SERVER_HTTP: ${process.env.TEST_SERVER_HTTP})`);
console.log(`runProxy: ${runProxy} (TEST_PROXY: ${process.env.TEST_PROXY})`);
console.log(`runMockOAuth2: ${runMockOAuth2} (TEST_MOCK_OAUTH2: ${process.env.TEST_MOCK_OAUTH2})`);
console.log(`runMinioS3: ${runMinioS3} (TEST_MINIO_S3: ${process.env.TEST_MINIO_S3})`);
console.log(`testAuthProvider: ${testAuthProvider} (TEST_AUTH_PROVIDER: ${process.env.TEST_AUTH_PROVIDER})`);
console.log(`testAuthUsername: ${testAuthUsername} (TEST_AUTH_USERNAME: ${process.env.TEST_AUTH_USERNAME})`);
console.log(`testAuthPassword: ${testAuthPassword} (TEST_AUTH_PASSWORD: ${process.env.TEST_AUTH_PASSWORD})`);

const receiptsBucketFullName = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_FULL_NAME;
const baseUrl = process.env.DIY_SUBMIT_BASE_URL;
console.log(`receiptsBucketFullName: ${receiptsBucketFullName}`);
console.log(`baseUrl: ${baseUrl}`);

let serverProcess;
let ngrokProcess;

// Generate timestamp for file naming
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}

test.setTimeout(360000);

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");
  process.env = {
    ...originalEnv,
  };

  // Retain the custom s3 endpoint for the storage bucket (if there is one) to pass to the HTTP server (if needed).
  let endpoint;

  if (runMinioS3) {
    console.log("Starting minio process...");
    endpoint = await startMinio(receiptsBucketFullName, optionalTestS3AccessKey, optionalTestS3SecretKey);
    console.log("Waiting for server to initialize...");
    await setTimeout(2000);
    await ensureMinioBucketExists(receiptsBucketFullName, endpoint, optionalTestS3AccessKey, optionalTestS3SecretKey);
  } else {
    console.log("Skipping Minio container creation because TEST_MINIO_S3 is not set to 'run'");
  }

  if (runTestServer) {
    console.log("Starting server process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    serverProcess = spawn("npm", ["run", "start"], {
      env: {
        ...process.env,
        TEST_S3_ENDPOINT: endpoint,
        TEST_SERVER_HTTP_PORT: serverPort.toString(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning(`http://127.0.0.1:${serverPort}`, 1000);
  } else {
    console.log("Skipping server process as runTestServer is not set to 'run'");
  }

  if (runProxy) {
    console.log("Starting ngrok process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    ngrokProcess = spawn("npm", ["run", "proxy", serverPort.toString()], {
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning(baseUrl, 1000);
  } else {
    console.log("Skipping ngrok process as runProxy is not set to 'run'");
  }

  if (runMockOAuth2) {
    console.log("Starting mock-oauth2-server process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    serverProcess = spawn("npm", ["run", "auth"], {
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning("http://localhost:8080/default/debugger", 2000);
  } else {
    console.log("Skipping mock-oauth2-server process as runMockOAuth2 is not set to 'run'");
  }

  console.log("beforeAll hook completed successfully");
}, 180000); // Set timeout to 3 minutes for beforeAll hook

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (ngrokProcess) {
    ngrokProcess.kill();
  }
});

test.use({
  video: {
    mode: "on",
    size: { width: 1280, height: 720 },
  },
});

test.outputDir = "target/behaviour-with-auth-test-results";

test("Submit VAT return end-to-end flow with browser emulation", async ({ page }) => {
  const timestamp = getTimestamp();
  const testUrl = runTestServer ? `http://127.0.0.1:${serverPort}` : baseUrl;

  // Add console logging to capture browser messages
  page.on("console", (msg) => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]: ${msg.text()}`);
  });

  page.on("pageerror", (error) => {
    console.log(`[BROWSER ERROR]: ${error.message}`);
  });

  // Add comprehensive HTTP request/response logging
  page.on("request", (request) => {
    console.log(`[HTTP REQUEST] ${request.method()} ${request.url()}`);
    console.log(`[HTTP REQUEST HEADERS] ${JSON.stringify(request.headers(), null, 2)}`);
    if (request.postData()) {
      console.log(`[HTTP REQUEST BODY] ${request.postData()}`);
    }
  });

  page.on("response", (response) => {
    console.log(`[HTTP RESPONSE] ${response.status()} ${response.url()}`);
    console.log(`[HTTP RESPONSE HEADERS] ${JSON.stringify(response.headers(), null, 2)}`);
  });

  // Add request failure logging
  page.on("requestfailed", (request) => {
    console.log(`[HTTP REQUEST FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
  });

  // Create helper functions for logging user interactions (narrative steps)
  const loggedClick = async (selector, description = "") =>
    await test.step(
      description ? `The user clicks ${description}` : `The user clicks selector ${selector}`,
      async () => {
        console.log(`[USER INTERACTION] Clicking: ${selector} ${description ? "- " + description : ""}`);
        await page.click(selector);
      },
    );

  const loggedFill = async (selector, value, description = "") =>
    await test.step(
      description
        ? `The user fills ${description} with "${value}"`
        : `The user fills selector ${selector} with "${value}"`,
      async () => {
        console.log(
          `[USER INTERACTION] Filling: ${selector} with value: "${value}" ${description ? "- " + description : ""}`,
        );
        await page.fill(selector, value);
      },
    );

  const loggedGoto = async (url, description = "") =>
    await test.step(description ? `The user navigates to ${description}` : `The user navigates to ${url}`, async () => {
      await gotoWithRetries(page, url, {
        description,
        waitUntil: "domcontentloaded",
        readySelector: "#dynamicActivities",
      });
    });

  // Journey 1: Existing user submits VAT
  // ====================================

  /* ****** */
  /*  HOME  */
  /* ****** */

  await test.step("The user opens the home page expecting the log in link to be visible", async () => {
    // Load default document with warning message bypass
    console.log("Loading document...");
    await page.setExtraHTTPHeaders({
      "ngrok-skip-browser-warning": "any value",
    });
    await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/000-start-${timestamp}.png` });
    await loggedGoto(testUrl, "Loading home page");

    // Home page has a welcome message and clickable login link
    console.log("Checking home page...");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/010-home-${timestamp}.png` });
    await expect(page.getByText("Log in")).toBeVisible();
  });
  await test.step("The user chooses to log in from the home page and arrives at the sign-in options", async () => {
    await loggedClick("a:has-text('Log in')", "Clicking login link");

    /* ****** */
    /* LOGIN  */
    /* ****** */

    // Login
    console.log("Logging in...");

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/020-login-${timestamp}.png` });
  });

  if (testAuthProvider === "mock") {
    await test.step("The user continues with the mock identity provider and sees the sign-in form", async () => {
      await expect(page.getByText("Continue with mock-oauth2-server")).toBeVisible();
      await loggedClick("button:has-text('Continue with mock-oauth2-server')", "Continue with OAuth provider");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/040-mock-provider-auth-${timestamp}.png`,
      });
      await expect(page.locator('input[type="submit"][value="Sign-in"]')).toBeVisible({ timeout: 10000 });
    });

    await test.step("The user enters a username and identity claims for the session", async () => {
      // <input class="u-full-width" required="" type="text" name="username" placeholder="Enter any user/subject" autofocus="on">
      await loggedFill('input[name="username"]', `${testAuthUsername}`, "Entering username");
      await page.waitForTimeout(100);

      // <textarea class="u-full-width claims" name="claims" rows="15" placeholder="Optional claims JSON" autofocus="on"></textarea>
      // { "email": "user@example.com" }
      const identityToken = {
        email: `${testAuthUsername}@example.com`,
      };
      await loggedFill('textarea[name="claims"]', JSON.stringify(identityToken), "Entering identity claims");
      await page.waitForTimeout(100);
      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/050-mock-auth-form-filled-${timestamp}.png`,
      });
    });

    await test.step("The user submits the sign-in form and returns to the app as an authenticated user", async () => {
      // Home page has logged in user email
      // <input class="button-primary" type="submit" value="Sign-in">
      await loggedClick('input[type="submit"][value="Sign-in"]', "Submitting sign-in form");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/060-mock-signed-in-${timestamp}.png`,
      });
    });
  } else if (testAuthProvider === "cognito") {
    await expect(page.getByText("Continue with Google via Amazon Cognito")).toBeVisible();
    await loggedClick(
      "button:has-text('Continue with Google via Amazon Cognito')",
      "Continue with Google via Amazon Cognito",
    );
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/040-cognito-provider-auth-clicked-${timestamp}.png`,
    });

    // Make cognito selection
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    // Retry logic for Cognito button and OIDC login heading
    let retries = 0;
    const maxRetries = 5;
    let cognitoBtn;
    while (retries < maxRetries) {
      try {
        cognitoBtn = await page.getByRole("button", { name: "cognito" });
        await expect(cognitoBtn).toBeVisible({ timeout: 2000 });
        await page.screenshot({
          path: `target/behaviour-test-results/submitVat-screenshots/043-cognito-button-${timestamp}.png`,
        });

        await cognitoBtn.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `target/behaviour-test-results/submitVat-screenshots/045-cognito-button-clicked-${timestamp}.png`,
        });

        // Wait for OIDC login heading, retry if not found
        await page.getByRole("heading", { name: "OIDC - Direct Login" }).waitFor({ timeout: 2000 });
        break; // Success, exit loop
      } catch (err) {
        retries++;
        if (retries === maxRetries) throw err;
        await page.waitForTimeout(500);
      }
    }
    // await page.getByLabel("Username").fill(testAuthUsername);
    // await page.getByLabel("Username").fill(testAuthUsername);
    // await page.getByLabel("Password").fill(testAuthPassword);
    await page.waitForTimeout(100);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/050-cognito-auth-form-empty-${timestamp}.png`,
    });

    // Fill in some login details
    await page.getByRole("button", { name: "Fill Form" }).click();
    // await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/055-cognito-auth-form-filled-${timestamp}.png`,
    });

    // Home page has logged in user email
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/060-cognito-signed-in-${timestamp}.png`,
    });
  }

  await test.step("The user returns to the home page and sees their logged-in status", async () => {
    // Page has logged in user email
    console.log("Checking home page...");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/070-home-${timestamp}.png` });
    await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 16000 });
  });

  await test.step("The user opens the menu and navigates to Bundles", async () => {
    // Go to bundles via hamburger menu
    console.log("Opening hamburger menu...");
    await loggedClick("button.hamburger-btn", "Opening hamburger menu");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/071-hamburger-menu-${timestamp}.png`,
    });
    await expect(page.getByRole("link", { name: "Bundles" })).toBeVisible();
    await loggedClick("a:has-text('Bundles')", "Clicking Bundles in hamburger menu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/072-bundles-page-${timestamp}.png`,
    });
  });

  await test.step("The user clears any existing bundles before requesting a new one", async () => {
    // Remove all bundles first (idempotent operation)
    console.log("Removing all bundles first...");
    await loggedClick("#removeAllBtn", "Remove All Bundles");
    await page.waitForTimeout(500);
    // Accept the confirmation dialog
    await page.on("dialog", (dialog) => dialog.accept());
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/073-removed-all-bundles-${timestamp}.png`,
    });
  });

  await test.step("The user requests a test bundle and sees a confirmation message", async () => {
    // Request test bundle
    await expect(page.getByText("Request test")).toBeVisible();
    await loggedClick("button:has-text('Request test')", "Request test");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/075-bundles-${timestamp}.png` });
    await expect(page.getByText("Added ✓")).toBeVisible({ timeout: 16000 });
  });

  await test.step("The user returns to the home page from the Bundles screen", async () => {
    // Return to home
    await expect(page.getByText("Back to Home")).toBeVisible();
    await loggedClick("button:has-text('Back to Home')", "Back to Home");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/077-home-${timestamp}.png` });
  });

  // await expect(page.getByText("Submit VAT")).toBeVisible();

  /* ************ */
  /* `SUBMIT VAT  */
  /* ************ */

  await test.step("The user begins a VAT return and sees the VAT submission form", async () => {
    // Click "VAT Return Submission" on activities page
    await loggedClick("button:has-text('Submit VAT (Sandbox API)')", "Starting VAT return submission");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/090-start-submission-${timestamp}.png`,
    });
    await expect(page.locator("#vatSubmissionForm")).toBeVisible();
  });

  await test.step("The user completes the VAT form with valid values and sees the Submit button", async () => {
    // Fill out the VAT form using the correct field IDs from submitVat.html
    // eslint-disable-next-line sonarjs/pseudo-random
    const randomFourCharacters = Math.random().toString(36).substring(2, 6);
    await loggedFill("#vatNumber", hmrcTestVatNumber, "Entering VAT number");
    await page.waitForTimeout(100);
    await loggedFill("#periodKey", randomFourCharacters, "Entering period key");
    await page.waitForTimeout(100);
    await loggedFill("#vatDue", "1000.00", "Entering VAT due amount");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/100-form-filled-${timestamp}.png`,
    });
    await expect(page.locator("#submitBtn")).toBeVisible();
  });

  await test.step("The user submits the VAT form and reviews the HMRC permission page", async () => {
    // Expect the HMRC permission page to be visible
    await loggedClick("#submitBtn", "Submitting VAT form");
    const applicationName = "DIY Accounting Submit";
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/110-hmrc-permission-${timestamp}.png`,
    });
    await expect(page.locator("#appNameParagraph")).toContainText(applicationName, { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Continue" })).toContainText("Continue");
  });

  await test.step("Accept additional cookies and hide banner if presented", async () => {
    // Accept cookies if the banner is present
    const acceptCookiesButton = page.getByRole("button", { name: "Accept additional cookies" });
    if (await acceptCookiesButton.isVisible()) {
      console.log("[USER INTERACTION] Clicking: Accept additional cookies button - Accepting cookies");
      await acceptCookiesButton.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/115-accepted-cookies-${timestamp}.png`,
      });
    }
    // Hide the cookies message if it's still visible
    const hideCookiesButton = page.getByRole("button", { name: "Hide cookies message" });
    if (await hideCookiesButton.isVisible()) {
      console.log("[USER INTERACTION] Clicking: Hide cookies message button - Hiding cookies message");
      await hideCookiesButton.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/116-hid-cookies-message-${timestamp}.png`,
      });
    }
  });

  await test.step("The user continues and is offered to sign in to the HMRC online service", async () => {
    //  Submit the permission form and expect the sign in option to be visible
    await page.waitForTimeout(100);
    console.log(`[USER INTERACTION] Clicking: Continue button - Continuing with HMRC permission`);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/120-submit-permission-${timestamp}.png`,
    });
    await expect(page.getByRole("button", { name: "Sign in to the HMRC online service" })).toContainText(
      "Sign in to the HMRC online service",
    );
  });

  await test.step("The user chooses to sign in to HMRC and sees the credential fields", async () => {
    // Submit the sign in and expect the credentials form to be visible
    console.log(`[USER INTERACTION] Clicking: Sign in to HMRC button - Starting HMRC authentication`);
    await page.getByRole("button", { name: "Sign in to the HMRC online service" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/130-hmrc-auth-${timestamp}.png`,
    });
    await expect(page.locator("#userId")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  await test.step("The user provides HMRC credentials and submits them, expecting to grant permission", async () => {
    // Fill in credentials and submit expecting this to initiate the HMRC sign in process
    await loggedFill("#userId", hmrcTestUsername, "Entering HMRC user ID");
    await page.waitForTimeout(100);
    await loggedFill("#password", hmrcTestPassword, "Entering HMRC password");
    await page.waitForTimeout(100);
    console.log(`[USER INTERACTION] Clicking: Sign in button - Submitting HMRC credentials`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/140-hmrc-credentials-${timestamp}.png`,
    });
    await expect(page.locator("#givePermission")).toBeVisible();
  });

  await test.step("The user grants permission to HMRC and returns to the application", async () => {
    //  Submit the give permission form
    await page.click("#givePermission");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/150-give-permission-${timestamp}.png`,
    });
  });

  await test.step("The user waits for the VAT submission to complete and for the receipt to appear", async () => {
    // Wait for the submission process to complete and receipt to be displayed
    console.log("Waiting for VAT submission to complete and receipt to be displayed...");

    // Check current page URL and elements
    console.log(`Current URL: ${page.url()}`);
    const receiptExists = await page.locator("#receiptDisplay").count();
    console.log(`Receipt element exists: ${receiptExists > 0}`);

    if (receiptExists > 0) {
      const receiptStyle = await page.locator("#receiptDisplay").getAttribute("style");
      console.log(`Receipt element style: ${receiptStyle}`);
    }

    const formExists = await page.locator("#vatForm").count();
    console.log(`Form element exists: ${formExists > 0}`);

    if (formExists > 0) {
      const formStyle = await page.locator("#vatForm").getAttribute("style");
      console.log(`Form element style: ${formStyle}`);
    }

    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/160-waiting-for-receipt-${timestamp}.png`,
    });

    if (runTestServer) {
      await checkIfServerIsRunning(`http://127.0.0.1:${serverPort}`, 1000);
    } else {
      console.log("Skipping server process as runTestServer is not set to 'run'");
    }

    if (runProxy) {
      await checkIfServerIsRunning(baseUrl, 1000);
    } else {
      console.log("Skipping ngrok process as runProxy is not set to 'run'");
    }

    if (runMockOAuth2) {
      await checkIfServerIsRunning("http://localhost:8080/default/debugger", 2000);
    } else {
      console.log("Skipping mock-oauth2-server process as runMockOAuth2 is not set to 'run'");
    }

    await page.waitForSelector("#receiptDisplay", { state: "visible", timeout: 120000 });
    await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/170-receipt-${timestamp}.png` });
    await page.waitForTimeout(500);
  });
  await test.step("The user sees a successful VAT submission receipt and the VAT form is hidden", async () => {
    const receiptDisplay = page.locator("#receiptDisplay");
    await expect(receiptDisplay).toBeVisible();

    // Check for the success message
    const successHeader = receiptDisplay.locator("h3");
    await expect(successHeader).toContainText("VAT Return Submitted Successfully");

    // Verify receipt details are populated
    // await expect(page.locator("#formBundleNumber")).toContainText("123456789-bundle");
    // await expect(page.locator("#chargeRefNumber")).toContainText("123456789-charge");
    await expect(page.locator("#processingDate")).not.toBeEmpty();

    // Verify the form is hidden after successful submission
    await expect(page.locator("#vatForm")).toBeHidden();

    console.log("VAT submission flow completed successfully");
  });

  /* ********** */
  /* RECEIPTS   */
  /* ********** */

  await test.step("The user returns to the home page after submitting the VAT return", async () => {
    // Go back home first
    console.log("Going back to home page");
    await page.click("#homePageFromMainBtn");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/175-back-to-home-${timestamp}.png`,
    });
  });

  await test.step("The user opens the menu to view receipts and navigates to the Receipts page", async () => {
    // Use hamburger menu to go to receipts
    console.log("Opening hamburger menu to go to receipts...");
    await loggedClick("button.hamburger-btn", "Opening hamburger menu for receipts");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/176-hamburger-menu-receipts-${timestamp}.png`,
    });
    await expect(page.getByRole("link", { name: "Receipts" })).toBeVisible({ timeout: 16000 });
    await loggedClick("a:has-text('Receipts')", "Clicking Receipts in hamburger menu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/177-receipts-page-${timestamp}.png`,
    });
  });

  await test.step("The user reviews the receipts list and opens the first receipt when available", async () => {
    // Check if we have receipts in the table
    console.log("Checking receipts page...");
    const receiptsTable = page.locator("#receiptsTable");
    await expect(receiptsTable).toBeVisible({ timeout: 10000 });

    // If there are receipts, click on the first one
    const firstReceiptLink = receiptsTable.locator("tbody tr:first-child a").first();
    const hasReceipts = (await firstReceiptLink.count()) > 0;

    if (hasReceipts) {
      console.log("Found receipts, clicking on first receipt...");
      await firstReceiptLink.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/178-receipt-detail-${timestamp}.png`,
      });
    } else {
      console.log("No receipts found in table");
    }
  });

  await test.step("The user returns to the home page via the menu", async () => {
    // Return to home via hamburger menu
    console.log("Returning to home via hamburger menu...");
    await loggedClick("button.hamburger-btn", "Opening hamburger menu to go home");
    await page.waitForTimeout(500);
    await loggedClick("a:has-text('Home')", "Clicking Home in hamburger menu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/179-back-home-via-menu-${timestamp}.png`,
    });
  });

  /* ******* */
  /* LOG OUT */
  /* ******* */

  await test.step("The user logs out and sees the public home page with the log in link", async () => {
    // Log out from home page
    console.log("Logging out from home page");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/180-home-before-logout-${timestamp}.png`,
    });
    await expect(page.locator("a:has-text('Logout')")).toBeVisible();

    await page.click("a:has-text('Logout')");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/190-home-${timestamp}.png` });
    // await expect(page.getByText("Log in")).toBeVisible({ timeout: 16000 });
  });

  // Home page has a welcome message and clickable login link
  // console.log("Checking home page...");
  // await page.waitForLoadState("networkidle");
  // await page.waitForTimeout(500);
  // await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/200-home-${timestamp}.png` });
  // await expect(page.getByText("Log in")).toBeVisible();
}, 120000);
