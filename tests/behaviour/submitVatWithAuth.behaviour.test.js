// tests/behaviour/submitVatWithAuth.behaviour.test.js
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout } from "timers/promises";

let serverProcess;
let ngrokProcess;

// Generate timestamp for file naming
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}

test.beforeAll(async () => {
  // Start the server
  serverProcess = spawn("node", ["src/lib/server.js"], {
    env: { ...process.env, PORT: "3000" },
    stdio: "pipe",
  });

  // Wait for server to start
  await setTimeout(2000);

  // Check if server is running
  let serverReady = false;
  let attempts = 0;
  while (!serverReady && attempts < 10) {
    try {
      const response = await fetch("http://127.0.0.1:3000");
      if (response.ok) {
        serverReady = true;
      }
    } catch (error) {
      attempts++;
      await setTimeout(1000);
    }
  }

  if (!serverReady) {
    throw new Error("Server failed to start");
  }

  // Start ngrok process (same as npm run proxy)
  ngrokProcess = spawn("npx", ["ngrok", "http", "--url", "wanted-finally-anteater.ngrok-free.app", "3000"], {
    stdio: "pipe",
  });

  // Wait for ngrok to start
  await setTimeout(3000);

  // Check if the default document is accessible via ngrok
  const ngrokUrl = "https://wanted-finally-anteater.ngrok-free.app";
  let ngrokReady = false;
  let ngrokAttempts = 0;
  while (!ngrokReady && ngrokAttempts < 10) {
    try {
      const response = await fetch(ngrokUrl);
      if (response.ok) {
        ngrokReady = true;
        console.log(`[DEBUG_LOG] ngrok is accessible at ${ngrokUrl}`);
      }
    } catch (error) {
      ngrokAttempts++;
      await setTimeout(2000);
    }
  }

  if (!ngrokReady) {
    console.log(`[DEBUG_LOG] Warning: ngrok may not be accessible at ${ngrokUrl}`);
  }

});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (ngrokProcess) {
    ngrokProcess.kill();
  }
});

test.afterEach(async ({}, testInfo) => {
  console.log(`[DEBUG_LOG] afterEach called, testInfo.video exists: ${!!testInfo.video}`);

  // Handle video file renaming and moving
  if (testInfo.video) {
    const fs = await import("fs");
    const path = await import("path");

    // const timestamp = getTimestamp();
    // const videoName = `auth-behaviour-video_${timestamp}.mp4`;
    // const targetPath = path.join('auth-behaviour-test-results', videoName);

    console.log(`[DEBUG_LOG] Attempting to get video path...`);

    // Get video path from testInfo
    try {
      const videoPath = await testInfo.video.path();
      console.log(`[DEBUG_LOG] Video path: ${videoPath}`);

      // if (videoPath && await fs.promises.access(videoPath).then(() => true).catch(() => false)) {
      //  await fs.promises.copyFile(videoPath, targetPath);
      //  console.log(`[DEBUG_LOG] Video saved to: ${targetPath}`);
      // } else {
      //  console.log(`[DEBUG_LOG] Video file not accessible at: ${videoPath}`);
      // }
    } catch (error) {
      console.log(`[DEBUG_LOG] Failed to copy video: ${error.message}`);
    }
  } else {
    console.log(`[DEBUG_LOG] No video in testInfo`);
  }
});

test.use({
  video: {
    mode: "on",
    size: { width: 1280, height: 720 },
  },
});

test("Submit VAT return end-to-end flow with browser emulation", async ({ page }) => {
  const timestamp = getTimestamp();
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
  await page.goto("https://wanted-finally-anteater.ngrok-free.app");

  // Wait for page to load completely
  await setTimeout(500);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `behaviour-test-results/auth-behaviour-000-initial_${timestamp}.png` });
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
  await page.screenshot({ path: `behaviour-test-results/auth-behaviour-010-form-filled_${timestamp}.png` });
  await setTimeout(500);

  // Submit the form - this will trigger the OAuth flow
  await setTimeout(100);
  await page.click("#submitBtn");

  // Expect the HMRC permission page to be visible
  const applicationName = "DIY Accounting Submit";
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-test-results/auth-behaviour-020-hmrc-permission_${timestamp}.png` });
  await expect(page.locator("#appNameParagraph")).toContainText(applicationName);
  await expect(page.getByRole('button', { name: 'Continue' })).toContainText("Continue");
  
  //  Submit the permission form
  await setTimeout(100);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Expect the sign in option to be visible
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-test-results/auth-behaviour-030-hmrc-sign-in_${timestamp}.png` });
  await expect(page.getByRole('button', { name: 'Sign in to the HMRC online service' })).toContainText("Sign in to the HMRC online service");

  // Submit the sign in
  await setTimeout(100);
  await page.getByRole('button', { name: 'Sign in to the HMRC online service' }).click();

  // Expect the credentials form to be visible
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-test-results/auth-behaviour-040-hmrc-credentials_${timestamp}.png` });
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
  await page.screenshot({ path: `behaviour-test-results/auth-behaviour-050-hmrc-give-permission_${timestamp}.png` });
  await expect(page.locator("#givePermission")).toBeVisible();

  // Mock the receipt logging endpoint
  await page.route("**/api/log-receipt", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "receipt logged" }),
    });
  });

  //  Submit the give permission form
  await setTimeout(100);
  await page.click("#givePermission");

  // Display the state after OAuth redirection
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `behaviour-test-results/auth-behaviour-055-after-oauth_${timestamp}.png` });
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-test-results/auth-behaviour-060-after-oauth_${timestamp}.png` });

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
  await page.screenshot({ path: `behaviour-test-results/auth-behaviour-070-receipt_${timestamp}.png`, fullPage: true });
  await setTimeout(1000);

  console.log("[DEBUG_LOG] VAT submission flow completed successfully");
});
