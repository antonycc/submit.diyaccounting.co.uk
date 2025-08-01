// behaviour-tests/submitVatWithAuth.behaviour.test.js

import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout } from "timers/promises";
import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import {GenericContainer} from "testcontainers";

dotenv.config({ path: '.env' }); // e.g. Not checked in, HMRC API credentials
// TODO: remove the override and ensure the tests pass with .env.test, then change the pipeline tests to copy over .env.test.
dotenv.config({ path: '.env.proxy' });

const originalEnv = { ...process.env };

// Test specific dedicated server port
const serverPort = 3500;

// S3 credentials for the test MinIO instance
const optionalTestS3AccessKey = process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY;
const optionalTestS3SecretKey = process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY;

// Environment variables for the test server and proxy
const runTestServer = process.env.DIY_SUBMIT_TEST_SERVER_HTTP === "run";
const runProxy = process.env.DIY_SUBMIT_TEST_PROXY === "run";
console.log(`runTestServer: ${runTestServer}, runProxy: ${runProxy}`);

const bucketNamePostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
const homeUrl = process.env.DIY_SUBMIT_HOME_URL;
const {hostname} = new URL(homeUrl);
const dashedDomain = hostname.split('.').join('-');
const receiptsBucketFullName = `${dashedDomain}-${bucketNamePostfix}`;

let serverProcess;
let ngrokProcess;

// Generate timestamp for file naming
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}

test.setTimeout(240000);

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");
  process.env = {
    ...originalEnv,
  }

  let container;
  let endpoint;

  // Only start Docker container if S3 endpoint is not set to "off"
  if (process.env.DIY_SUBMIT_TEST_S3_ENDPOINT !== "off") {
    container = await new GenericContainer("minio/minio")
        .withExposedPorts(9000)
        .withEnvironment({
          MINIO_ROOT_USER: optionalTestS3AccessKey,
          MINIO_ROOT_PASSWORD: optionalTestS3SecretKey,
        })
        .withCommand(["server", "/data"])
        .start();

    endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
  } else {
    console.log("Skipping Docker container creation as S3 endpoint is set to 'off'");
    endpoint = "off";
  }

  // Start or connect to MinIO S3 server or any S3 compatible server
  async function ensureBucketExists() {
    console.log(`Ensuring bucket: ${receiptsBucketFullName} exists on endpoint '${endpoint}' for access key '${optionalTestS3AccessKey}'`);
    let clientConfig ;
    if (process.env.DIY_SUBMIT_TEST_S3_ENDPOINT !== "off") {
      clientConfig = {
        endpoint,
        forcePathStyle: true,
        region: "us-east-1",
        credentials: {
          accessKeyId: optionalTestS3AccessKey,
          secretAccessKey: optionalTestS3SecretKey,
        }
      }
    } else {
      clientConfig = {};
    }
    const s3 = new S3Client(clientConfig);

    try {
      await s3.send(new HeadBucketCommand({ Bucket: receiptsBucketFullName }));
      console.log(`✅ Bucket '${receiptsBucketFullName}' already exists on endpoint '${endpoint}'`);
    } catch (err) {
      if (err.name === "NotFound") {
        if(process.env.DIY_SUBMIT_TEST_S3_ENDPOINT !== "off") {
          console.log(`ℹ️ Bucket '${receiptsBucketFullName}' not found on endpoint '${endpoint}', creating...`);
          await s3.send(new CreateBucketCommand({Bucket: receiptsBucketFullName}));
          console.log(`✅ Created bucket '${receiptsBucketFullName}' on endpoint '${endpoint}'`);
        } else {
          console.log(`ℹ️ Skipping bucket creation as endpoint is set to 'off'`);
        }
      } else {
        throw new Error(`Failed to check/create bucket: ${err.message} on endpoint '${endpoint}' for access key '${optionalTestS3AccessKey}'`);
      }
    }
  }

  await ensureBucketExists();

  // Start the server
  if (runTestServer) {
    console.log("Starting server process...");
    serverProcess = spawn("npm", ["run", "start"], {
      // serverProcess = spawn("node", ["app/lib/server.js"], {
      env: {
        ...process.env,
        DIY_SUBMIT_TEST_S3_ENDPOINT: endpoint,
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

  if(runProxy) {
    // Start ngrok process (same as npm run proxy)
    console.log("Starting ngrok process...");
    //ngrokProcess = spawn("npm", ["run", "proxy"], {
    ngrokProcess = spawn("npx", ["ngrok", "http", "--url", "wanted-finally-anteater.ngrok-free.app", serverPort.toString()], {
      env: {
        ...process.env,
        DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT: serverPort.toString(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for ngrok to start
    console.log("Waiting for ngrok to initialize...");
    await setTimeout(5000);
  } else {
    console.log("Skipping ngrok process as runProxy is not set to 'run'");
  }

  // Check if the default document is accessible
  let homeReady = false;
  let homeAttempts = 0;
  console.log("Checking home readiness...");
  while (!homeReady && homeAttempts < 15) {
    try {
      console.log(`trying home at ${homeUrl}`);
      const response = await fetch(homeUrl);
      if (response.ok) {
        homeReady = true;
        console.log(`home is accessible at ${homeUrl}`);
      }
    } catch (error) {
      homeAttempts++;
      console.log(`home check attempt ${homeAttempts}/15 failed: ${error.message}`);
      await setTimeout(2000);
    }

    if (!homeReady) {
      console.log(`Warning: home may not be accessible at ${ngrokUrl} after ${homeAttempts} attempts`);
    }
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

test.outputDir = "target/behaviour-with-auth-test-results";

test("Submit VAT return end-to-end flow with browser emulation", async ({ page }) => {
  const timestamp = getTimestamp();
  const testUrl = homeUrl;

  // Add console logging to capture browser messages
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]: ${msg.text()}`);
  });
  
  page.on('pageerror', error => {
    console.log(`[BROWSER ERROR]: ${error.message}`);
  });

  // 1) Navigate to the application served by server.js
  await page.setExtraHTTPHeaders({
    "ngrok-skip-browser-warning": "any value"
  });
  await page.goto(testUrl);

  // Wait for page to load completely
  await setTimeout(500);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-000-initial_${timestamp}.png` });
  await setTimeout(500);

  // 2) EXTENDED JOURNEY - Start with login flow
  console.log("Starting extended site tour - Login flow");
  await expect(page.getByText("Log in")).toBeVisible();
  await page.click("a:has-text('Log in')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-001-login-page_${timestamp}.png` });

  // Click on Google auth (which now goes to actual Cognito login)
  await expect(page.getByText("Continue with Google")).toBeVisible();
  await page.click("button:has-text('Continue with Google')");
  await page.waitForLoadState("networkidle");
  await setTimeout(2000); // Wait longer for Cognito redirect
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-002-cognito-redirect_${timestamp}.png` });

  // Check if we're redirected to Cognito (or handle test environment)
  const currentUrl = page.url();
  console.log(`Current URL after Google login attempt: ${currentUrl}`);
  
  /*if (currentUrl.includes('amazoncognito.com') || currentUrl.includes('google.com')) {
    console.log('Redirected to actual OAuth provider - this is expected in real environment');
    // In a real test environment, we would handle the OAuth flow
    // For now, we'll simulate going back to continue the test
    await page.goBack();
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
  } else if (currentUrl.includes('coming-soon.html')) {
    // Fallback for development environment that still uses coming soon
    await expect(page.getByText("Coming Soon")).toBeVisible();
    await page.click("button:has-text('Go Home Now')");
    await page.waitForLoadState("networkidle");
    await setTimeout(500);
  } else {
    // We might be back on the login page or home page
    console.log('OAuth flow completed or redirected back');
  }
  */
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-003-after-auth-attempt_${timestamp}.png` });
  await setTimeout(500);
  await page.goBack();
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-003b-after-auth-attempt-back_${timestamp}.png` });

  // 3) Navigate through hamburger menu to bundles (Add Bundle)
  console.log("Testing hamburger menu navigation");
  await page.click(".hamburger-btn");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-004-hamburger-menu_${timestamp}.png` });
  
  await page.click("a:has-text('Add Bundle')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-004b-bundles-page_${timestamp}.png` });

  // Click on HMRC Test API Bundle (which goes to coming soon)
  await expect(page.getByText("Add HMRC Test API Bundle")).toBeVisible();
  await page.click("button:has-text('Add HMRC Test API Bundle')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-004c-coming-soon-bundle_${timestamp}.png` });

  // Go back home from coming soon
  //await page.click("button:has-text('Go Home Now')");
  //await page.waitForLoadState("networkidle");
  //await setTimeout(500);

  // Go back home
  console.log("Testing hamburger menu navigation to go home");
  await page.click(".hamburger-btn");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-004d-hamburger-menu_${timestamp}.png` });

  await page.click("a:has-text('Home')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-004e-home-page_${timestamp}.png` });

  // 4) Navigate through the main navigation structure to VAT submission
  // Click "View available activities" on home page
  await expect(page.getByText("View available activities")).toBeVisible();
  await page.click("button:has-text('View available activities')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-005-activities_${timestamp}.png` });

  // Click "VAT Return Submission" on activities page
  await expect(page.getByText("VAT Return Submission")).toBeVisible();
  await page.click("button:has-text('VAT Return Submission')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-007-vat-form_${timestamp}.png` });

  // 3) Verify the form is present and fill it out with correct field IDs
  await expect(page.locator("#vatSubmissionForm")).toBeVisible();

  // Fill out the VAT form using the correct field IDs from submitVat.html
  const randomFourCharacters = Math.random().toString(36).substring(2, 6);
  await page.fill("#vatNumber", "193054661");
  await setTimeout(100);
  await page.fill("#periodKey", randomFourCharacters);
  await setTimeout(100);
  await page.fill("#vatDue", "1000.00");
  await setTimeout(100);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-010-form-filled_${timestamp}.png` });
  await setTimeout(500);

  // Submit the form - this will trigger the OAuth flow
  await setTimeout(100);
  await page.click("#submitBtn");

  // Expect the HMRC permission page to be visible
  const applicationName = "DIY Accounting Submit";
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-020-hmrc-permission_${timestamp}.png` });
  await expect(page.locator("#appNameParagraph")).toContainText(applicationName);
  await expect(page.getByRole('button', { name: 'Continue' })).toContainText("Continue");
  
  //  Submit the permission form
  await setTimeout(100);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Expect the sign in option to be visible
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-030-hmrc-sign-in_${timestamp}.png` });
  await expect(page.getByRole('button', { name: 'Sign in to the HMRC online service' })).toContainText("Sign in to the HMRC online service");

  // Submit the sign in
  await setTimeout(100);
  await page.getByRole('button', { name: 'Sign in to the HMRC online service' }).click();

  // Expect the credentials form to be visible
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-040-hmrc-credentials_${timestamp}.png` });
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
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-050-hmrc-give-permission_${timestamp}.png` });
  await expect(page.locator("#givePermission")).toBeVisible();


  //  Submit the give permission form
  await setTimeout(100);
  await page.click("#givePermission");

  // Display the state after OAuth redirection
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-055-after-oauth_${timestamp}.png` });
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-060-after-oauth_${timestamp}.png` });

  // 5) Wait for the submission process to complete and receipt to be displayed
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
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-070-receipt_${timestamp}.png`, fullPage: true });
  await setTimeout(1000);

  console.log("VAT submission flow completed successfully");

  // 6) POST-VAT SUBMISSION JOURNEY - Extended site tour continues
  console.log("Starting post-VAT submission site tour");
  
  // Test hamburger menu navigation again
  await page.click(".hamburger-btn");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-071-post-vat-hamburger_${timestamp}.png` });
  
  // Navigate to View Activities via hamburger menu
  await page.click("a:has-text('View Activities')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-072-activities-via-hamburger_${timestamp}.png` });

  // Go back to home via hamburger menu
  await page.click(".hamburger-btn");
  await setTimeout(500);
  await page.click("a:has-text('Home')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-073-home-via-hamburger_${timestamp}.png` });

  // Navigate to login page again (another coming soon journey)
  await page.click("a:has-text('Log in')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-074-login-again_${timestamp}.png` });

  // Try a different auth provider (Microsoft - disabled, shows coming soon)
  await expect(page.getByText("Continue with Microsoft")).toBeVisible();
  // Note: Microsoft button is disabled, so we'll go back to home
  await page.click("button:has-text('Back to Home')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-with-auth-test-results/auth-behaviour-075-final-home_${timestamp}.png` });

  console.log("Extended site tour completed successfully");
}, 180000);
