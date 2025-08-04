// behaviour-tests/submitVat.behaviour.test.js

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
const runMockOAuth2 = process.env.DIY_SUBMIT_TEST_MOCK_OAUTH2 === "run";
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

test.setTimeout(60000);

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
    await setTimeout(500);

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
        await setTimeout(500);
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
    await setTimeout(2000);
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
      await setTimeout(500);
    }

    if (!homeReady) {
      console.log(`Warning: home may not be accessible at ${ngrokUrl} after ${homeAttempts} attempts`);
    }
  }

  // Start the mock-oauth2-server
  if (runMockOAuth2) {
    console.log("Starting mock-oauth2-server process...");
    serverProcess = spawn("npm", ["run", "mock-oauth2"], {
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for mock-oauth2-server to start
    console.log("Waiting for mock-oauth2-server to initialize...");
    await setTimeout(500);

    // Check if mock-oauth2-server is running
    let mockOAuth2Ready = false;
    let attempts = 0;
    console.log("Checking mock-oauth2-server readiness...");
    while (!mockOAuth2Ready && attempts < 15) {
      try {
        const response = await fetch("http://localhost:8080/default/debugger");
        if (response.ok) {
          mockOAuth2Ready = true;
          console.log("mock-oauth2-server is ready!");
          console.log("mock-oauth2-server configuration:");
          const config = await response.json();
          console.log(`  - Port: ${config.port}`);
          console.log(`  - Client ID: ${config.clientId}`);
          console.log(`  - Client Secret: ${config.clientSecret}`);
          console.log(`  - Authorization URL: ${config.authorizationUrl}`);
        }
      } catch (error) {
        attempts++;
        console.log(`mock-oauth2-server check attempt ${attempts}/15 failed: ${error.message}`);
        await setTimeout(1000);
      }
    }

    if (!mockOAuth2Ready) {
      throw new Error(`mock-oauth2-server failed to start after ${attempts} attempts`);
    }
  } else {
    console.log("Skipping mock-oauth2-server process as runMockOAuth2 is not set to 'run'");
  }

  console.log("beforeAll hook completed successfully");
}, 30000); // Set timeout to 60 seconds for beforeAll hook

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

  //Journey 1: Existing user submits VAT
  //====================================

  /* ****** */
  /*  HOME  */
  /* ****** */

  // Load default document with warning message bypass
  console.log("Loading document...");
  await page.setExtraHTTPHeaders({
    "ngrok-skip-browser-warning": "any value"
  });
  await page.screenshot({ path: `target/behaviour-submitVat/000-start-${timestamp}.png` });
  await page.goto(testUrl);

  // Home page has a welcome message and clickable login link
  console.log("Checking home page...");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/010-home-${timestamp}.png` });
  await expect(page.locator("#welcomeHeading")).toContainText("Welcome");
  await expect(page.getByText("Log in")).toBeVisible();
  await page.click("a:has-text('Log in')");

  /* ****** */
  /* LOGIN  */
  /* ****** */

  // Login
  console.log("Logging in...");

  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/020-login-${timestamp}.png` });
  await expect(page.getByText("Continue with mock-oauth2-server")).toBeVisible();

  await page.click("button:has-text('Continue with mock-oauth2-server')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/030-hand-off-to-provider-auth-${timestamp}.png` });
  await expect(page.getByText("Hand off to mock-oauth2-server")).toBeVisible();

  await page.click("button:has-text('Hand off to mock-oauth2-server')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/040-provider-auth-${timestamp}.png` });
  //await expect(page.getByText("SIGN-IN")).toBeVisible();
  await expect(page.locator('input[type="submit"][value="Sign-in"]')).toBeVisible();

  // <input class="u-full-width" required="" type="text" name="username" placeholder="Enter any user/subject" autofocus="on">
  const username = "user";
  await page.fill('input[name="username"]', `${username}`);
  await setTimeout(100);

  // <textarea class="u-full-width claims" name="claims" rows="15" placeholder="Optional claims JSON" autofocus="on"></textarea>
  // { "email": "user@example.com" }
  const identityToken = {
    "email": `${username}@example.com`,
  }
  await page.fill('textarea[name="claims"]', JSON.stringify(identityToken));
  await setTimeout(100);
  await page.screenshot({ path: `target/behaviour-submitVat/050-auth-form-filled-${timestamp}.png` });

  // Home page has logged in user email
  // <input class="button-primary" type="submit" value="Sign-in">
  await page.click('input[type="submit"][value="Sign-in"]');
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/060-signed-in-${timestamp}.png` });

  // Home page has logged in user email
  console.log("Checking home page...");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/070-home-${timestamp}.png` });
  await expect(page.locator(".login-status")).toContainText("user@example.com");
  await expect(page.getByText("View available activities")).toBeVisible();

  /* ********** */
  /* ACTIVITIES */
  /* ********** */

  // Click "View available activities" on home page
  await page.click("button:has-text('View available activities')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/080-activities-${timestamp}.png` });

  // View available activities
  await expect(page.getByText("VAT Return Submission")).toBeVisible();

  /* ************ */
  /* `SUBMIT VAT  */
  /* ************ */

  // Click "VAT Return Submission" on activities page
  await page.click("button:has-text('VAT Return Submission')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/090-start-submission-${timestamp}.png` });
  await expect(page.locator("#vatSubmissionForm")).toBeVisible();

  // Fill out the VAT form using the correct field IDs from submitVat.html
  const randomFourCharacters = Math.random().toString(36).substring(2, 6);
  await page.fill("#vatNumber", "193054661");
  await setTimeout(100);
  await page.fill("#periodKey", randomFourCharacters);
  await setTimeout(100);
  await page.fill("#vatDue", "1000.00");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/100-form-filled-${timestamp}.png` });
  await expect(page.locator("#submitBtn")).toBeVisible();

  // Expect the HMRC permission page to be visible
  await page.click("#submitBtn");
  const applicationName = "DIY Accounting Submit";
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/110-hmrc-permission-${timestamp}.png` });
  await expect(page.locator("#appNameParagraph")).toContainText(applicationName);
  await expect(page.getByRole('button', { name: 'Continue' })).toContainText("Continue");

  //  Submit the permission form and expect the sign in option to be visible
  await setTimeout(100);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/120-submit-permission-${timestamp}.png` });
  await expect(page.getByRole('button', { name: 'Sign in to the HMRC online service' })).toContainText("Sign in to the HMRC online service");

  // Submit the sign in and expect the credentials form to be visible
  await page.getByRole('button', { name: 'Sign in to the HMRC online service' }).click();
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/130-hmrc-auth-${timestamp}.png` });
  await expect(page.locator('#userId')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();

  // Fill in credentials and submit expecting this to initiate the HMRC sign in process
  await page.fill("#userId", "888772612756");
  await setTimeout(100);
  await page.fill("#password", "dE9SRyKeA30M");
  await setTimeout(100);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/140-hmrc-credentials-${timestamp}.png` });
  await expect(page.locator("#givePermission")).toBeVisible();

  //  Submit the give permission form
  await page.click("#givePermission");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/150-give-permission-${timestamp}.png` });

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

  await page.screenshot({ path: `target/behaviour-submitVat/160-waiting-for-receipt-${timestamp}.png` });
  await page.waitForSelector("#receiptDisplay", { state: "visible", timeout: 15000 });
  await page.screenshot({ path: `target/behaviour-submitVat/170-receipt-${timestamp}.png` });
  await setTimeout(500);
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

  console.log("VAT submission flow completed successfully");

  /* ******* */
  /* LOG OUT */
  /* ******* */

  // Go back home and log out
  console.log("Hamburger menu navigation to go home");
  await page.click(".hamburger-btn");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/180-hamburger-menu-${timestamp}.png` });

  await page.click("a:has-text('Home')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/190-home-${timestamp}.png` });

  await page.click("a:has-text('Logout')");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/210-home-${timestamp}.png` });

  // Home page has a welcome message and clickable login link
  console.log("Checking home page...");
  await page.waitForLoadState("networkidle");
  await setTimeout(500);
  await page.screenshot({ path: `target/behaviour-submitVat/010-home-${timestamp}.png` });
  await expect(page.locator("#welcomeHeading")).toContainText("Welcome");
  await expect(page.getByText("Log in")).toBeVisible();
  await page.click("a:has-text('Log in')");

}, 30000);
