// behaviour-tests/userJourneys.behaviour.test.js

import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout } from "timers/promises";
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.proxy' });

const originalEnv = { ...process.env };

// Test specific dedicated server port
const serverPort = 3501; // Different port from main behaviour test

// Environment variables for the test server and proxy
const runTestServer = process.env.DIY_SUBMIT_TEST_SERVER_HTTP === "run";
const runProxy = process.env.DIY_SUBMIT_TEST_PROXY === "run";
console.log(`runTestServer: ${runTestServer}, runProxy: ${runProxy}`);

const homeUrl = process.env.DIY_SUBMIT_HOME_URL;

let serverProcess;
let ngrokProcess;

// Generate timestamp for file naming
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}

test.setTimeout(60000);

test.beforeAll(async () => {
  console.log("Starting beforeAll hook for user journeys...");
  process.env = {
    ...originalEnv,
  }

  // Start the server (no S3 dependency for these tests)
  if (runTestServer) {
    console.log("Starting server process...");
    serverProcess = spawn("npm", ["run", "start"], {
      env: {
        ...process.env,
        DIY_SUBMIT_TEST_S3_ENDPOINT: "off", // Disable S3 for these tests
        DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT: serverPort.toString(),
      },
      stdio: ["pipe", "pipe", "pipe"],
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
        const response = await fetch(`http://127.0.0.1:${serverPort}`);
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
  } else {
    console.log("Skipping server process as runTestServer is not set to 'run'");
  }

  console.log("beforeAll hook completed successfully");
}, 30000);

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

  // Handle video file information
  if (testInfo.video) {
    try {
      const videoPath = await testInfo.video.path();
      console.log(`Video path: ${videoPath}`);
    } catch (error) {
      console.log(`Failed to get video path: ${error.message}`);
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

test.outputDir = "target/user-journeys-test-results";

test.describe("User Journey Tests", () => {
  test("Login and Service Selection Journey", async ({ page }) => {
    const timestamp = getTimestamp();
    const testUrl = `http://127.0.0.1:${serverPort}`;

    // 1) Navigate to the application
    await page.goto(testUrl);
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey1-000-home_${timestamp}.png` });

    // 2) Navigate to login page
    await expect(page.getByText("Log in")).toBeVisible();
    await page.click("a:has-text('Log in')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey1-001-login_${timestamp}.png` });

    // 3) Verify login page content
    await expect(page.locator("h2")).toContainText("Login");
    await expect(page.getByText("Continue with Google")).toBeVisible();
    await expect(page.getByText("Continue with Microsoft")).toBeVisible();

    // 4) Navigate to coming soon via Google auth
    await page.click("button:has-text('Continue with Google')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey1-002-coming-soon_${timestamp}.png` });

    // 5) Verify coming soon page
    //await expect(page.locator("h2")).toContainText("Coming Soon");
    // await expect(page.getByText("🚧")).toBeVisible();
    await setTimeout(500);
    await page.goBack();

    // 6) Go back to home
    //await page.click("button:has-text('Go Home Now')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey1-003-back-home_${timestamp}.png` });

    // 7) Navigate to services via hamburger menu
    await page.click(".hamburger-btn");
    await setTimeout(500);
    await page.click("a:has-text('Add Bundle')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey1-004-services_${timestamp}.png` });

    // 8) Verify services page
    await expect(page.locator("h2")).toContainText("Add Bundle");
    await expect(page.locator("h3").filter({ hasText: "HMRC Test API Bundle" })).toBeVisible();

    // 9) Try to add a service (goes to coming soon)
    await page.click("button:has-text('Add HMRC Test API Bundle')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey1-005-service-coming-soon_${timestamp}.png` });

    // 10) Return to home
    //await page.click("button:has-text('Go Home Now')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.goBack();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `target/user-journeys-test-results/journey1-006-final-home_${timestamp}.png` });
    await setTimeout(500);

    console.log("Login and Service Selection Journey completed successfully");
  });

  test("Activities and Navigation Journey", async ({ page }) => {
    const timestamp = getTimestamp();
    const testUrl = `http://127.0.0.1:${serverPort}`;

    // 1) Navigate to the application
    await page.goto(testUrl);
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey2-000-home_${timestamp}.png` });

    // 2) Navigate to activities page
    await expect(page.getByText("View available activities")).toBeVisible();
    await page.click("button:has-text('View available activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey2-001-activities_${timestamp}.png` });

    // 3) Verify activities page
    await expect(page.locator("h2")).toContainText("Available Activities");
    await expect(page.getByText("VAT Return Submission")).toBeVisible();

    // 4) Navigate to VAT submission page
    await page.click("button:has-text('VAT Return Submission')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey2-002-vat-form_${timestamp}.png` });

    // 5) Verify VAT form page
    await expect(page.locator("#vatSubmissionForm")).toBeVisible();
    await expect(page.locator("#vatNumber")).toBeVisible();
    await expect(page.locator("#periodKey")).toBeVisible();
    await expect(page.locator("#vatDue")).toBeVisible();

    // 6) Navigate back to activities via hamburger menu
    await page.click(".hamburger-btn");
    await setTimeout(500);
    await page.click("a:has-text('View Activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey2-003-back-to-activities_${timestamp}.png` });

    // 7) Navigate to home via hamburger menu
    await page.click(".hamburger-btn");
    await setTimeout(500);
    await page.click("a:has-text('Home')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey2-004-home-via-hamburger_${timestamp}.png` });

    // 8) Test direct navigation to login from home
    await page.click("a:has-text('Log in')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey2-005-login-direct_${timestamp}.png` });

    // 9) Navigate back to home using back button
    await page.click("button:has-text('Back to Home')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey2-006-final-home_${timestamp}.png` });

    console.log("Activities and Navigation Journey completed successfully");
  });

  test("Comprehensive Hamburger Menu Journey", async ({ page }) => {
    const timestamp = getTimestamp();
    const testUrl = `http://127.0.0.1:${serverPort}`;

    // 1) Navigate to the application
    await page.goto(testUrl);
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey3-000-home_${timestamp}.png` });

    // 2) Test hamburger menu from home
    await page.click(".hamburger-btn");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey3-001-hamburger-home_${timestamp}.png` });

    // Verify all menu items are present
    await expect(page.locator(".menu-dropdown a[href='index.html']")).toContainText("Home");
    await expect(page.locator(".menu-dropdown a[href='activities.html']")).toContainText("View Activities");
    await expect(page.locator(".menu-dropdown a[href='bundles.html']")).toContainText("Add Bundle");

    // 3) Navigate to activities via hamburger
    await page.click("a:has-text('View Activities')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey3-002-activities-via-hamburger_${timestamp}.png` });

    // 4) Test hamburger menu from activities page
    await page.click(".hamburger-btn");
    await setTimeout(500);
    await page.click("a:has-text('Add Bundle')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey3-003-bundles-via-hamburger_${timestamp}.png` });

    // 5) Test hamburger menu from bundles page
    await page.click(".hamburger-btn");
    await setTimeout(500);
    await page.click("a:has-text('Home')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey3-004-home-via-hamburger_${timestamp}.png` });

    // 6) Navigate to login and test hamburger there
    await page.click("a:has-text('Log in')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
    await page.click(".hamburger-btn");
    await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey3-005-hamburger-login_${timestamp}.png` });

    // 7) Navigate to coming soon via Google auth
    await page.click("button:has-text('Continue with Google')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);

    // 8) Test hamburger menu from coming soon page
    //await page.click(".hamburger-btn");
    //await setTimeout(500);
    await page.screenshot({ path: `target/user-journeys-test-results/journey3-006-hamburger-coming-soon_${timestamp}.png` });


    // 9) Final navigation back to home via hamburger
    await setTimeout(500);
    await page.goBack();
    await setTimeout(500);

    await page.screenshot({ path: `target/user-journeys-test-results/journey3-007-final-home_${timestamp}.png` });

    console.log("Comprehensive Hamburger Menu Journey completed successfully");
  });
});