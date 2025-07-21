// tests/behaviour/submitVat.behaviour.test.js
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout } from "timers/promises";

import "dotenv/config";

let serverProcess;

// Generate timestamp for file naming
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}

test.beforeAll(async () => {
  // Start the server
  serverProcess = spawn("node", ["src/lib/server.js"], {
    env: { ...process.env, PORT: process.env.TEST_SERVER_HTTP_PORT },
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
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

test.afterEach(async ({}, testInfo) => {
  console.log(`afterEach called, testInfo.video exists: ${!!testInfo.video}`);

  // Handle video file renaming and moving
  if (testInfo.video) {
    const fs = await import("fs");
    const path = await import("path");

    // const timestamp = getTimestamp();
    // const videoName = `behaviour-video_${timestamp}.mp4`;
    // const targetPath = path.join('behaviour-test-results', videoName);

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
    mode: "retain-on-failure", // 'on', 'retain-on-failure', or 'off'
    size: { width: 1280, height: 720 },
  },
});

test.outputDir = "behaviour-test-results";

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
  await page.goto("http://127.0.0.1:3000");

  // Wait for page to load completely
  await setTimeout(500);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `behaviour-000-test-results/behaviour-initial_${timestamp}.png` });
  await setTimeout(500);

  // 2) Verify the form is present and fill it out with correct field IDs
  await expect(page.locator("#vatSubmissionForm")).toBeVisible();

  // Fill out the VAT form using the correct field IDs from index.html
  await page.fill("#vatNumber", "193054661");
  await setTimeout(100);
  await page.fill("#periodKey", "24A1");
  await setTimeout(100);
  await page.fill("#vatDue", "1000.00");
  await setTimeout(100);

  await page.screenshot({ path: `behaviour-test-010-results/behaviour-form-filled_${timestamp}.png` });
  await setTimeout(500);

  // 3) Mock the token exchange endpoint
  await page.route("**/api/exchange-token", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hmrcAccessToken: "test-access-token" }),
    });
  });

  // Mock the VAT submission endpoint
  await page.route("**/api/submit-vat", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        formBundleNumber: "123456789-bundle",
        chargeRefNumber: "123456789-charge",
        processingDate: new Date().toISOString(),
      }),
    });
  });


  await setTimeout(500);

  // 4) Intercept the OAuth redirect and simulate the callback
  let authState;

  // Listen for navigation to HMRC OAuth URL
  page.on("request", async (request) => {
    if (request.url().includes("oauth/authorize")) {
      const url = new URL(request.url());
      authState = url.searchParams.get("state");

      // Simulate OAuth callback by navigating back with code and state
      await setTimeout(1500);
      await page.goto(`http://127.0.0.1:3000/?code=test-code&state=${encodeURIComponent(authState)}`);
    }
  });

  // Submit the form - this will trigger the OAuth flow
  await page.click("#submitBtn");
  await setTimeout(500);

  await page.screenshot({ path: `behaviour-test-020-results/behaviour-after-oauth_${timestamp}.png` });
  await setTimeout(500);

  // 5) Wait for the submission process to complete and receipt to be displayed
  await setTimeout(500);
  await page.waitForSelector("#receiptDisplay", { state: "visible", timeout: 15000 });

  await setTimeout(500);

  // Verify the receipt is displayed with correct content
  const receiptDisplay = page.locator("#receiptDisplay");
  await expect(receiptDisplay).toBeVisible();

  await setTimeout(500);

  // Check for the success message
  const successHeader = receiptDisplay.locator("h3");
  await expect(successHeader).toContainText("VAT Return Submitted Successfully");

  // Verify receipt details are populated
  await expect(page.locator("#formBundleNumber")).toContainText("123456789-bundle");
  await expect(page.locator("#chargeRefNumber")).toContainText("123456789-charge");
  await expect(page.locator("#processingDate")).not.toBeEmpty();

  // Verify the form is hidden after successful submission
  await expect(page.locator("#vatForm")).toBeHidden();
  await setTimeout(500);
  await page.screenshot({ path: `behaviour-test-030-results/behaviour-receipt_${timestamp}.png`, fullPage: true });
  await setTimeout(500);

  console.log("VAT submission flow completed successfully");
});
