// tests/behaviour/submitVatWithAuth.behaviour.test.js
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout } from "timers/promises";

import "dotenv/config";

let serverProcess;
let ngrokProcess;

// Generate timestamp for file naming
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");
  const originalEnv = { ...process.env };

  // Add these to run against the proxy server
  // TEST_SERVER_HTTP_PORT=3000
  // TEST_SERVER_HTTP=run
  // TEST_PROXY_URL=https://wanted-finally-anteater.ngrok-free.app
  // TEST_PROXY=run

  // Also this to run against an existing proxy server
  // TEST_SERVER_HTTP_PORT=
  // TEST_SERVER_HTTP=use-existing
  // TEST_PROXY_URL=https://wanted-finally-anteater.ngrok-free.app
  // TEST_PROXY=use-existing

  process.env = {
    ...originalEnv,
    TEST_SERVER_HTTP_PORT: "3000",
    TEST_SERVER_HTTP: "run",
    TEST_PROXY_URL: "https://wanted-finally-anteater.ngrok-free.app",
    TEST_PROXY: "run",
    RECEIPTS_BUCKET_NAME: "none",
    HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
    HMRC_CLIENT_ID: "uqMHA6RsDGGa7h8EG2VqfqAmv4tV",
    HMRC_REDIRECT_URI: "https://wanted-finally-anteater.ngrok-free.app/",
    // TODO: HMRC_CLIENT_SECRET: read from .env file: .env.hmrc-test-api
    TEST_REDIRECT_URI: "http://127.0.0.1:3000/",
    TEST_ACCESS_TOKEN: "test access token",
    TEST_RECEIPT: JSON.stringify({
      formBundleNumber: "test-123456789012",
      chargeRefNumber: "test-XM002610011594",
      processingDate: "2023-01-01T12:00:00.000Z",
    }),
  };
  
  // Start the server
  console.log("Starting server process...");
  serverProcess = spawn("node", ["src/lib/server.js"], {
    env: { ...process.env, PORT: process.env.TEST_SERVER_HTTP_PORT },
    stdio: "pipe",
  });

  // Wait for server to start
  console.log("Waiting for server to initialize...");
  await setTimeout(2000);

  // Check if server is running
  let serverReady = false;
  let attempts = 0;
  console.log("Checking server readiness...");
  while (!serverReady && attempts < 15) {
    try {
      const response = await fetch("http://127.0.0.1:3000");
      if (response.ok) {
        serverReady = true;
        console.log("Server is ready!");
      }
    } catch (error) {
      attempts++;
      console.log(`Server check attempt ${attempts}/15 failed: ${error.message}`);
      await setTimeout(1000);
    }
  }

  if (!serverReady) {
    throw new Error(`Server failed to start after ${attempts} attempts`);
  }

  // Start ngrok process (same as npm run proxy)
  console.log("Starting ngrok process...");
  ngrokProcess = spawn("npx", ["ngrok", "http", "--url", "wanted-finally-anteater.ngrok-free.app", "3000"], {
    stdio: "pipe",
  });

  // Wait for ngrok to start
  console.log("Waiting for ngrok to initialize...");
  await setTimeout(5000);

  // Check if the default document is accessible via ngrok
  const ngrokUrl = process.env.TEST_PROXY_URL;
  let ngrokReady = false;
  let ngrokAttempts = 0;
  console.log("Checking ngrok readiness...");
  while (!ngrokReady && ngrokAttempts < 15) {
    try {
      const response = await fetch(ngrokUrl);
      if (response.ok) {
        ngrokReady = true;
        console.log(`ngrok is accessible at ${ngrokUrl}`);
      }
    } catch (error) {
      ngrokAttempts++;
      console.log(`ngrok check attempt ${ngrokAttempts}/15 failed: ${error.message}`);
      await setTimeout(2000);
    }
  }

  if (!ngrokReady) {
    console.log(`Warning: ngrok may not be accessible at ${ngrokUrl} after ${ngrokAttempts} attempts`);
  }

  console.log("beforeAll hook completed successfully");
}, 60000); // Set timeout to 60 seconds for beforeAll hook

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
    const fs = await import("fs");
    const path = await import("path");

    // const timestamp = getTimestamp();
    // const videoName = `auth-behaviour-video_${timestamp}.mp4`;
    // const targetPath = path.join('auth-behaviour-test-results', videoName);

    console.log(`Attempting to get video path...`);

    // Get video path from testInfo
    try {
      const videoPath = await testInfo.video.path();
      console.log(`Video path: ${videoPath}`);

      // if (videoPath && await fs.promises.access(videoPath).then(() => true).catch(() => false)) {
      //  await fs.promises.copyFile(videoPath, targetPath);
      //  console.log(`Video saved to: ${targetPath}`);
      // } else {
      //  console.log(`Video file not accessible at: ${videoPath}`);
      // }
    } catch (error) {
      console.log(`Failed to copy video: ${error.message}`);
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

test.outputDir = "behaviour-with-auth-test-results";

test("Submit VAT return end-to-end flow with browser emulation", async ({ page }) => {
  const timestamp = getTimestamp();
  const testUrl = process.env.TEST_PROXY_URL || process.env.TEST_REDIRECT_URI || "http://127.0.1:3000/";

  // Mock the API endpoints that the server will call
  await page.route("**/oauth/token", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hmrcAccessToken: "test-access-token" }),
    });
  });

  await page.route("**/organisations/vat/*/returns", (route) => {
    const url = new URL(route.request().url());
    const vrn = url.pathname.split("/")[3]; // Extract VRN from path
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        formBundleNumber: `${vrn}-bundle`,
        chargeRefNumber: `${vrn}-charge`,
        processingDate: new Date().toISOString(),
      }),
    });
  });

  // Mock S3 endpoints for receipt logging
  await page.route("**/test-receipts/**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "success" }),
    });
  });

  // 1) Navigate to the application served by server.js
  await page.setExtraHTTPHeaders({
    "ngrok-skip-browser-warning": "any value"
  });
  await page.goto(testUrl);

  // Wait for page to load completely
  await setTimeout(500);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `behaviour-with-auth-test-results/auth-behaviour-000-initial_${timestamp}.png` });
  await setTimeout(500);

  // 2) Verify the form is present and fill it out with correct field IDs
  await expect(page.locator("#vatSubmissionForm")).toBeVisible();

  // Fill out the VAT form using the correct field IDs from index.html
  const randomFourCharacters = Math.random().toString(36).substring(2, 6);
  await page.fill("#vatNumber", "193054661");
  await setTimeout(100);
  await page.fill("#periodKey", randomFourCharacters);
  await setTimeout(100);
  await page.fill("#vatDue", "1000.00");
  await setTimeout(100);
  await page.screenshot({ path: `behaviour-with-auth-test-results/auth-behaviour-010-form-filled_${timestamp}.png` });
  await setTimeout(500);

  // Submit the form - this will trigger the OAuth flow
  await setTimeout(100);
  await page.click("#submitBtn");

  // Expect the HMRC permission page to be visible
  const applicationName = "DIY Accounting Submit";
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-with-auth-test-results/auth-behaviour-020-hmrc-permission_${timestamp}.png` });
  await expect(page.locator("#appNameParagraph")).toContainText(applicationName);
  await expect(page.getByRole('button', { name: 'Continue' })).toContainText("Continue");
  
  //  Submit the permission form
  await setTimeout(100);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Expect the sign in option to be visible
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-with-auth-test-results/auth-behaviour-030-hmrc-sign-in_${timestamp}.png` });
  await expect(page.getByRole('button', { name: 'Sign in to the HMRC online service' })).toContainText("Sign in to the HMRC online service");

  // Submit the sign in
  await setTimeout(100);
  await page.getByRole('button', { name: 'Sign in to the HMRC online service' }).click();

  // Expect the credentials form to be visible
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-with-auth-test-results/auth-behaviour-040-hmrc-credentials_${timestamp}.png` });
  await expect(page.locator('#userId')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();

  // Fill in credentials and submit
  await page.fill("#userId", "888772612756");
  await setTimeout(100);
  await page.fill("#password", "dE9SRyKeA30M");
  await setTimeout(100);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Expect the HMRC give permission page to be visible
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-with-auth-test-results/auth-behaviour-050-hmrc-give-permission_${timestamp}.png` });
  await expect(page.locator("#givePermission")).toBeVisible();


  //  Submit the give permission form
  await setTimeout(100);
  await page.click("#givePermission");

  // Display the state after OAuth redirection
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `behaviour-with-auth-test-results/auth-behaviour-055-after-oauth_${timestamp}.png` });
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-with-auth-test-results/auth-behaviour-060-after-oauth_${timestamp}.png` });

  // 5) Wait for the submission process to complete and receipt to be displayed
  await setTimeout(500);
  await page.waitForSelector("#receiptDisplay", { state: "visible", timeout: 15000 });

  // Verify the receipt is displayed with correct content
  const receiptDisplay = page.locator("#receiptDisplay");
  await expect(receiptDisplay).toBeVisible();

  // Check for the success message
  const successHeader = receiptDisplay.locator("h3");
  await expect(successHeader).toContainText("VAT Return Submitted Successfully");

  // Verify receipt details are populated
  //await expect(page.locator("#formBundleNumber")).toContainText("123456789-bundle");
  //await expect(page.locator("#chargeRefNumber")).toContainText("123456789-charge");
  await expect(page.locator("#processingDate")).not.toBeEmpty();

  // Verify the form is hidden after successful submission
  await expect(page.locator("#vatForm")).toBeHidden();
  await page.screenshot({ path: `behaviour-with-auth-test-results/auth-behaviour-070-receipt_${timestamp}.png`, fullPage: true });
  await setTimeout(1000);

  console.log("VAT submission flow completed successfully");
});
