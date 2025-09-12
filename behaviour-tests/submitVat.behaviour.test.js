// behaviour-tests/submitVat.behaviour.test.js

import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout } from "timers/promises";
import dotenv from "dotenv";
import { ensureMinioBucketExists, startMinio } from "@app/bin/minio.js";

import { checkIfServerIsRunning } from "@app/lib/serverHelper.js";
import { gotoWithRetries } from "@app/lib/gotoWithRetries.js";

dotenv.config({ path: ".env" }); // e.g. Not checked in, HMRC API credentials
// TODO: remove the override and ensure the tests pass with .env.test, then change the pipeline tests to copy over .env.test.
dotenv.config({ path: ".env.proxy" });
const envFilepath = process.env.DIY_SUBMIT_ENV_FILEPATH;
if (envFilepath) {
  console.log(`Loaded configuration from env file: ${envFilepath}`);
} else {
  console.log(`No configuration loaded from an env file.`);
}

const originalEnv = { ...process.env };

// Test specific dedicated server port
const serverPort = 3500;

// S3 credentials for the test MinIO instance
const optionalTestS3AccessKey = process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY;
const optionalTestS3SecretKey = process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY;

// Environment variables for the test server and proxy
const runTestServer = process.env.DIY_SUBMIT_TEST_SERVER_HTTP === "run";
const runProxy = process.env.DIY_SUBMIT_TEST_PROXY === "run";
const runMockOAuth2 = process.env.DIY_SUBMIT_TEST_MOCK_OAUTH2 === "run";
const runMinioS3 = process.env.DIY_SUBMIT_TEST_MINIO_S3 === "run";
const testAuthProvider = process.env.DIY_SUBMIT_TEST_AUTH_PROVIDER || "mock";
const testAuthUsername = process.env.DIY_SUBMIT_TEST_AUTH_USERNAME || "user";
const testAuthPassword = process.env.DIY_SUBMIT_TEST_AUTH_PASSWORD || "";
console.log(
  `runTestServer: ${runTestServer} (DIY_SUBMIT_TEST_SERVER_HTTP: ${process.env.DIY_SUBMIT_TEST_SERVER_HTTP})`,
);
console.log(`runProxy: ${runProxy} (DIY_SUBMIT_TEST_PROXY: ${process.env.DIY_SUBMIT_TEST_PROXY})`);
console.log(
  `runMockOAuth2: ${runMockOAuth2} (DIY_SUBMIT_TEST_MOCK_OAUTH2: ${process.env.DIY_SUBMIT_TEST_MOCK_OAUTH2})`,
);
console.log(`runMinioS3: ${runMinioS3} (DIY_SUBMIT_TEST_MINIO_S3: ${process.env.DIY_SUBMIT_TEST_MINIO_S3})`);
console.log(
  `testAuthProvider: ${testAuthProvider} (DIY_SUBMIT_TEST_AUTH_PROVIDER: ${process.env.DIY_SUBMIT_TEST_AUTH_PROVIDER})`,
);
console.log(
  `testAuthUsername: ${testAuthUsername} (DIY_SUBMIT_TEST_AUTH_USERNAME: ${process.env.DIY_SUBMIT_TEST_AUTH_USERNAME})`,
);
console.log(
  `testAuthPassword: ${testAuthPassword} (DIY_SUBMIT_TEST_AUTH_PASSWORD: ${process.env.DIY_SUBMIT_TEST_AUTH_PASSWORD})`,
);

const bucketNamePostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
const homeUrl = process.env.DIY_SUBMIT_HOME_URL;
const { hostname } = new URL(homeUrl);
const dashedDomain = hostname.split(".").join("-");
const receiptsBucketFullName = `${dashedDomain}-${bucketNamePostfix}`;

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
    // serverProcess = spawn("npm", ["run", "storage"], {
    //  env: {
    //    ...process.env,
    //  },
    //  stdio: ["pipe", "pipe", "pipe"],
    // });
    endpoint = await startMinio(receiptsBucketFullName, optionalTestS3AccessKey, optionalTestS3SecretKey);
    console.log("Waiting for server to initialize...");
    await setTimeout(2000);
    await ensureMinioBucketExists(receiptsBucketFullName, endpoint, optionalTestS3AccessKey, optionalTestS3SecretKey);
  } else {
    console.log("Skipping Minio container creation because DIY_SUBMIT_TEST_MINIO_S3 is not set to 'run'");
  }

  if (runTestServer) {
    console.log("Starting server process...");
    serverProcess = spawn("npm", ["run", "start"], {
      env: {
        ...process.env,
        DIY_SUBMIT_TEST_S3_ENDPOINT: endpoint,
        DIY_SUBMIT_TEST_SERVER_HTTP_PORT: serverPort.toString(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning(`http://127.0.0.1:${serverPort}`, 1000);
  } else {
    console.log("Skipping server process as runTestServer is not set to 'run'");
  }

  if (runProxy) {
    console.log("Starting ngrok process...");
    ngrokProcess = spawn("npm", ["run", "proxy", serverPort.toString()], {
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning(homeUrl, 1000);
  } else {
    console.log("Skipping ngrok process as runProxy is not set to 'run'");
  }

  if (runMockOAuth2) {
    console.log("Starting mock-oauth2-server process...");
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
}, 120000); // Set timeout to 60 seconds for beforeAll hook

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (ngrokProcess) {
    ngrokProcess.kill();
  }
});

test.afterEach(async ({}, testInfo) => {
  console.log(`afterEach called, testInfo.video exists: ${!!testInfo.video}`);

  // Handle video file renaming and moving
  if (testInfo.video) {
    try {
      const videoPath = await testInfo.video.path();
      console.log(`Video path: ${videoPath}`);
    } catch (error) {
      console.log(`Failed to locate video: ${error.message}`);
    }
  } else {
    console.log(`No video in testInfo`);
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
  const testUrl = runTestServer ? `http://127.0.0.1:${serverPort}` : homeUrl;

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

  // Create helper functions for logging user interactions
  const loggedClick = async (selector, description = "") => {
    console.log(`[USER INTERACTION] Clicking: ${selector} ${description ? "- " + description : ""}`);
    await page.click(selector);
  };

  const loggedFill = async (selector, value, description = "") => {
    console.log(
      `[USER INTERACTION] Filling: ${selector} with value: "${value}" ${description ? "- " + description : ""}`,
    );
    await page.fill(selector, value);
  };

  const loggedGoto = async (url, description = "") => {
    await gotoWithRetries(page, url, {
      description,
      waitUntil: "domcontentloaded",
      readySelector: "#activitiesByBundle",
    });
  };

  // Journey 1: Existing user submits VAT
  // ====================================

  /* ****** */
  /*  HOME  */
  /* ****** */

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
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/010-home-${timestamp}.png` });
  await expect(page.getByText("Log in")).toBeVisible();
  await loggedClick("a:has-text('Log in')", "Clicking login link");

  /* ****** */
  /* LOGIN  */
  /* ****** */

  // Login
  console.log("Logging in...");

  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/020-login-${timestamp}.png` });

  if (testAuthProvider === "mock") {
    await expect(page.getByText("Continue with mock-oauth2-server")).toBeVisible();
    await loggedClick("button:has-text('Continue with mock-oauth2-server')", "Continue with OAuth provider");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    // await page.screenshot({
    //  path: `target/behaviour-test-results/submitVat-screenshots/030-hand-off-to-provider-auth-${timestamp}.png`,
    // });
    // await expect(page.getByText("Hand off to mock-oauth2-server")).toBeVisible();

    // await loggedClick("button:has-text('Hand off to mock-oauth2-server')", "Hand off to OAuth provider");
    // await page.waitForLoadState("networkidle");
    // await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/040-mock-provider-auth-${timestamp}.png`,
    });
    // await expect(page.getByText("SIGN-IN")).toBeVisible();
    await expect(page.locator('input[type="submit"][value="Sign-in"]')).toBeVisible({ timeout: 10000 });

    // <input class="u-full-width" required="" type="text" name="username" placeholder="Enter any user/subject" autofocus="on">
    await loggedFill('input[name="username"]', `${testAuthUsername}`, "Entering username");
    await setTimeout(100);

    // <textarea class="u-full-width claims" name="claims" rows="15" placeholder="Optional claims JSON" autofocus="on"></textarea>
    // { "email": "user@example.com" }
    const identityToken = {
      email: `${testAuthUsername}@example.com`,
    };
    await loggedFill('textarea[name="claims"]', JSON.stringify(identityToken), "Entering identity claims");
    await setTimeout(100);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/050-mock-auth-form-filled-${timestamp}.png`,
    });

    // Home page has logged in user email
    // <input class="button-primary" type="submit" value="Sign-in">
    await loggedClick('input[type="submit"][value="Sign-in"]', "Submitting sign-in form");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/060-mock-signed-in-${timestamp}.png`,
    });
  } else if (testAuthProvider === "cognito") {
    await expect(page.getByText("Continue with Google via Amazon Cognito")).toBeVisible();
    await loggedClick(
      "button:has-text('Continue with Google via Amazon Cognito')",
      "Continue with Google via Amazon Cognito",
    );
    await page.waitForLoadState("networkidle");
    await setTimeout(2500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/040-cognito-provider-auth-${timestamp}.png`,
    });

    // Make cognito selection
    const cognitoBtn = page.getByRole("button", { name: "cognito" });
    // const cognitoBtn = page.locator(
    //  'input[type="button"][value="cognito"][aria-label="cognito"].idpButton-customizable',
    // );
    await expect(cognitoBtn).toBeVisible({ timeout: 10000 });
    await cognitoBtn.click();
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/045-cognito-button-${timestamp}.png`,
    });

    await page.getByRole("heading", { name: "OIDC - Direct Login" }).waitFor();
    await page.getByLabel("Username").fill(testAuthUsername);
    await page.getByLabel("Password").fill(testAuthPassword);
    await setTimeout(100);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/050-cognito-auth-form-filled-${timestamp}.png`,
    });

    // Home page has logged in user email
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/060-cognito-signed-in-${timestamp}.png`,
    });
  }

  // Page has logged in user email
  console.log("Checking home page...");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/070-home-${timestamp}.png` });
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15000 });

  // Add bundle
  await expect(page.getByText("Add Bundle")).toBeVisible();
  await loggedClick("button:has-text('Add Bundle')", "Add Bundle");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/072-home-${timestamp}.png` });

  // Request test
  await expect(page.getByText("Request test")).toBeVisible();
  await loggedClick("button:has-text('Request test')", "Request test");
  await page.waitForLoadState("networkidle");
  await setTimeout(1500);
  await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/075-bundles-${timestamp}.png` });
  // TODO: Reinstate when we are generating unique new test users.
  // await expect(page.getByText("Bundle Added")).toBeVisible();
  await expect(page.getByText("Back to Home")).toBeVisible();
  await loggedClick("button:has-text('Back to Home')", "Back to Home");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/077-home-${timestamp}.png` });

  // await expect(page.getByText("Submit VAT")).toBeVisible();

  /* ************ */
  /* `SUBMIT VAT  */
  /* ************ */

  // Click "VAT Return Submission" on activities page
  await loggedClick("button:has-text('Submit VAT (Sandbox API)')", "Starting VAT return submission");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({
    path: `target/behaviour-test-results/submitVat-screenshots/090-start-submission-${timestamp}.png`,
  });
  await expect(page.locator("#vatSubmissionForm")).toBeVisible();

  // Fill out the VAT form using the correct field IDs from submitVat.html
  const randomFourCharacters = Math.random().toString(36).substring(2, 6);
  await loggedFill("#vatNumber", "193054661", "Entering VAT number");
  await setTimeout(100);
  await loggedFill("#periodKey", randomFourCharacters, "Entering period key");
  await setTimeout(100);
  await loggedFill("#vatDue", "1000.00", "Entering VAT due amount");
  await setTimeout(500);
  await page.screenshot({
    path: `target/behaviour-test-results/submitVat-screenshots/100-form-filled-${timestamp}.png`,
  });
  await expect(page.locator("#submitBtn")).toBeVisible();

  // Expect the HMRC permission page to be visible
  await loggedClick("#submitBtn", "Submitting VAT form");
  const applicationName = "DIY Accounting Submit";
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({
    path: `target/behaviour-test-results/submitVat-screenshots/110-hmrc-permission-${timestamp}.png`,
  });
  await expect(page.locator("#appNameParagraph")).toContainText(applicationName, { timeout: 10000 });
  await expect(page.getByRole("button", { name: "Continue" })).toContainText("Continue");

  //  Submit the permission form and expect the sign in option to be visible
  await setTimeout(100);
  console.log(`[USER INTERACTION] Clicking: Continue button - Continuing with HMRC permission`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({
    path: `target/behaviour-test-results/submitVat-screenshots/120-submit-permission-${timestamp}.png`,
  });
  await expect(page.getByRole("button", { name: "Sign in to the HMRC online service" })).toContainText(
    "Sign in to the HMRC online service",
  );

  // Submit the sign in and expect the credentials form to be visible
  console.log(`[USER INTERACTION] Clicking: Sign in to HMRC button - Starting HMRC authentication`);
  await page.getByRole("button", { name: "Sign in to the HMRC online service" }).click();
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/130-hmrc-auth-${timestamp}.png` });
  await expect(page.locator("#userId")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();

  // Fill in credentials and submit expecting this to initiate the HMRC sign in process
  await loggedFill("#userId", "888772612756", "Entering HMRC user ID");
  await setTimeout(100);
  await loggedFill("#password", "dE9SRyKeA30M", "Entering HMRC password");
  await setTimeout(100);
  console.log(`[USER INTERACTION] Clicking: Sign in button - Submitting HMRC credentials`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({
    path: `target/behaviour-test-results/submitVat-screenshots/140-hmrc-credentials-${timestamp}.png`,
  });
  await expect(page.locator("#givePermission")).toBeVisible();

  //  Submit the give permission form
  await page.click("#givePermission");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({
    path: `target/behaviour-test-results/submitVat-screenshots/150-give-permission-${timestamp}.png`,
  });

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
  await page.waitForSelector("#receiptDisplay", { state: "visible", timeout: 60000 });
  await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/170-receipt-${timestamp}.png` });
  await setTimeout(500);
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

  /* ******* */
  /* LOG OUT */
  /* ******* */

  // Go back home and log out
  console.log("Main button to go home");
  await page.click("#homePageFromMainBtn");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({
    path: `target/behaviour-test-results/submitVat-screenshots/180-home-button-clicked-${timestamp}.png`,
  });
  await expect(page.locator("a:has-text('Logout')")).toBeVisible();

  await page.click("a:has-text('Logout')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/190-home-${timestamp}.png` });

  // Home page has a welcome message and clickable login link
  // console.log("Checking home page...");
  // await page.waitForLoadState("networkidle");
  // await setTimeout(500);
  // await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/200-home-${timestamp}.png` });
  // await expect(page.getByText("Log in")).toBeVisible();
}, 60000);

// Resolve ngrok host from HOME_URL (DIY_SUBMIT_HOME_URL)
// Examples:
//  https://example.ngrok-free.app/         -> example.ngrok-free.app
//  https://example.ngrok-free.app/index.html -> example.ngrok-free.app
//  http://localhost:3000/path              -> localhost (omit port for external host usage)
// If you actually need the port for a local tunnel, use url.host instead of url.hostname.
function resolveProxyHost(homeUrlValue) {
  if (!homeUrlValue) {
    throw new Error("DIY_SUBMIT_HOME_URL is not defined");
  }
  try {
    const url = new URL(homeUrlValue);
    return url.hostname; // change to url.host if you want to keep :port
  } catch {
    // Fallback: strip protocol, then take up to first / ? or #
    return homeUrlValue
      .replace(/^[a-z]+:\/\//i, "")
      .split(/[/?#]/)[0]
      .replace(/:\d+$/, ""); // drop port if present
  }
}
