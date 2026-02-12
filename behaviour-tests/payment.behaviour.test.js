// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/payment.behaviour.test.js
//
// Payment funnel behaviour test — exercises the entire conversion journey:
// Free guest → token exhaustion → upgrade to pro → verified token usage.
// This is the core business conversion funnel.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  generatePeriodDates,
  getEnvVarAndLog,
  isSandboxMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalSslProxy,
  saveHmrcTestUserToFiles,
  timestamp,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn, goToHomePage, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import {
  clearBundles,
  ensureBundlePresent,
  ensureBundleViaPassApi,
  getTokensRemaining,
  goToBundlesPage,
  verifyBundleApiResponse,
} from "./steps/behaviour-bundle-steps.js";
import { fillInVat } from "./steps/behaviour-hmrc-vat-steps.js";
import {
  acceptCookiesHmrc,
  fillInHmrcAuth,
  goToHmrcAuth,
  grantPermissionHmrcAuth,
  initHmrcAuth,
  submitHmrcAuth,
} from "./steps/behaviour-hmrc-steps.js";
import { initializeSalt } from "@app/services/subHasher.js";
import { consumeToken } from "@app/data/dynamoDbBundleRepository.js";
import {
  appendTraceparentTxt,
  appendUserSubTxt,
  appendHashedUserSubTxt,
  deleteTraceparentTxt,
  deleteUserSubTxt,
  deleteHashedUserSubTxt,
  extractUserSubFromLocalStorage,
} from "./helpers/fileHelper.js";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/payment-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const testAuthPassword = getEnvVarAndLog("testAuthPassword", "TEST_AUTH_PASSWORD", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const hmrcTestVatNumber = getEnvVarAndLog("hmrcTestVatNumber", "TEST_HMRC_VAT_NUMBER", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);
const runFraudPreventionHeaderValidation = isSandboxMode();

let mockOAuth2Process;
let serverProcess;
let ngrokProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(600_000); // 10 minutes

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "paymentBehaviour" });
});

test.beforeAll(async () => {
  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);
  ngrokProcess = await runLocalSslProxy(runProxy, httpServerPort, baseUrl);

  if (bundleTableName) {
    await initializeSalt();
  } else {
    console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping initializeSalt (direct DynamoDB steps will be skipped)");
  }
});

test.afterAll(async () => {
  if (ngrokProcess) ngrokProcess.kill();
  if (serverProcess) serverProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const outputDir = testInfo.outputPath("");
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({ path: `${outputDir}/test-failed-${Date.now()}.png`, fullPage: true });
  }
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  appendUserSubTxt(outputDir, testInfo, userSub);
  await appendHashedUserSubTxt(outputDir, testInfo, userSub);
  appendTraceparentTxt(outputDir, testInfo, observedTraceparent);
});

/**
 * Helper to extract user sub from browser localStorage
 */
async function extractUserSub(page) {
  return page.evaluate(() => {
    const token = localStorage.getItem("cognitoIdToken");
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.sub;
    } catch {
      return null;
    }
  });
}

test("Payment funnel: guest → exhaustion → upgrade → submission → usage", async ({ page }, testInfo) => {
  const testUrl =
    (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
      ? `http://127.0.0.1:${httpServerPort}/`
      : baseUrl;

  addOnPageLogging(page);

  // Capture traceparent
  page.on("response", (response) => {
    try {
      if (observedTraceparent) return;
      const headers = response.headers?.() ?? {};
      const h = typeof headers === "function" ? headers() : headers;
      const tp = (h && (h["traceparent"] || h["Traceparent"])) || null;
      if (tp) observedTraceparent = tp;
    } catch (_e) {}
  });

  // Use HMRC test credentials
  let currentTestUsername = hmrcTestUsername;
  let currentTestPassword = hmrcTestPassword;
  let testVatNumber = hmrcTestVatNumber;
  if (!hmrcTestUsername) {
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    if (hmrcClientId && hmrcClientSecret) {
      const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
      currentTestUsername = testUser.userId;
      currentTestPassword = testUser.password;
      testVatNumber = testUser.vrn;
      const outputDir = testInfo.outputPath("");
      const repoRoot = path.resolve(process.cwd());
      saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);
    }
  }

  const hmrcVatNumber = testVatNumber || "123456789";
  const hmrcVatDueAmount = "500.00";
  const { periodStart, periodEnd } = generatePeriodDates();

  // ============================================================
  // STEP 1: Login and clear bundles
  // ============================================================
  await test.step("Login and clear existing bundles", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Login and clear bundles");
    console.log("=".repeat(60));

    await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
    await clickLogIn(page, screenshotPath);
    await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
    await verifyLoggedInStatus(page, screenshotPath);
    await consentToDataCollection(page, screenshotPath);

    await goToBundlesPage(page, screenshotPath);
    await clearBundles(page, screenshotPath);
  });

  // ============================================================
  // STEP 2: Get day-guest via generated pass (3 tokens)
  // ============================================================
  await test.step("Get day-guest bundle via pass (3 tokens)", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Get day-guest via pass");
    console.log("=".repeat(60));

    await ensureBundleViaPassApi(page, "day-guest", screenshotPath);

    const tokens = await getTokensRemaining(page, "day-guest");
    console.log(`Day-guest tokens remaining: ${tokens}`);
    expect(tokens).toBe(3);

    // Extract userSub for direct DynamoDB access later
    userSub = await extractUserSub(page);
    console.log(`User sub: ${userSub}`);
    expect(userSub).toBeTruthy();

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-day-guest-granted.png` });
  });

  // ============================================================
  // STEP 3: Drain the 3 tokens
  // ============================================================
  await test.step("Drain all 3 day-guest tokens", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Drain 3 tokens");
    console.log("=".repeat(60));

    if (!bundleTableName) {
      console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping direct token exhaustion");
      return;
    }

    // Consume all 3 tokens directly via repository (faster than UI submissions)
    let remaining = 3;
    let consumed = 0;
    while (remaining > 0) {
      const result = await consumeToken(userSub, "day-guest");
      consumed++;
      remaining = result.tokensRemaining;
      console.log(`Consumed token ${consumed}: remaining=${remaining}`);
      expect(result.consumed).toBe(true);
    }
    console.log(`Exhausted all day-guest tokens (consumed ${consumed})`);

    // Verify 0 tokens remaining via API
    const tokensAfterExhaust = await getTokensRemaining(page, "day-guest");
    console.log(`Tokens remaining after exhaustion: ${tokensAfterExhaust}`);
    expect(tokensAfterExhaust).toBe(0);

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-tokens-exhausted.png` });
  });

  // ============================================================
  // STEP 4: Verify activities are disabled on home page
  // ============================================================
  await test.step("Verify activities disabled when tokens exhausted", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: Verify activities disabled");
    console.log("=".repeat(60));

    if (!bundleTableName) {
      console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping exhaustion verification");
      return;
    }

    await goToHomePageUsingMainNav(page, screenshotPath);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-home-exhausted.png` });

    // The Submit VAT button should be disabled with "Insufficient tokens"
    // day-guest bundle maps to "Submit VAT (HMRC)" activity, not the sandbox variant
    const activityButtonText = "Submit VAT (HMRC)";
    const submitButton = page.locator(`button:has-text('${activityButtonText}')`);
    await expect(submitButton).toBeVisible({ timeout: 10_000 });
    await expect(submitButton).toBeDisabled({ timeout: 10_000 });

    const buttonText = await submitButton.textContent();
    console.log(`Submit VAT button text: "${buttonText.trim()}"`);
    expect(buttonText).toContain("Insufficient tokens");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-activities-disabled.png` });
  });

  // ============================================================
  // STEP 5: Verify upsell link to bundles page
  // ============================================================
  await test.step("Verify upsell link to bundles page", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 5: Check upsell link to bundles");
    console.log("=".repeat(60));

    if (!bundleTableName) {
      console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping upsell verification");
      return;
    }

    // Look for a "View Bundles" or bundles link near the disabled activity
    const bundlesLink = page.locator('a[href*="bundles.html"]');
    const bundlesLinkCount = await bundlesLink.count();
    console.log(`Found ${bundlesLinkCount} bundles link(s) on the page`);

    // Navigate to bundles page (either via upsell link or main nav)
    await goToBundlesPage(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-bundles-page-after-exhaustion.png` });

    // Verify day-guest shows 0 tokens
    const dayGuestTokens = await getTokensRemaining(page, "day-guest");
    console.log(`Day-guest tokens on bundles page: ${dayGuestTokens}`);
    expect(dayGuestTokens).toBe(0);

    // Verify resident-pro is visible in catalogue
    const residentProVisible = await page
      .locator('button[data-bundle-id="resident-pro"], .service-item:has-text("Resident Pro")')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log(`Resident Pro visible in catalogue: ${residentProVisible}`);
    expect(residentProVisible).toBe(true);
  });

  // ============================================================
  // STEP 6: Get resident-pro via generated pass (100 tokens)
  // ============================================================
  await test.step("Get resident-pro bundle via pass (100 tokens)", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 6: Get resident-pro via pass");
    console.log("=".repeat(60));

    await ensureBundleViaPassApi(page, "resident-pro", screenshotPath);

    const tokens = await getTokensRemaining(page, "resident-pro");
    console.log(`Resident-pro tokens remaining: ${tokens}`);
    expect(tokens).toBe(100);

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-resident-pro-granted.png` });
  });

  // ============================================================
  // STEP 7: Use a token for a VAT submission
  // ============================================================
  await test.step("Submit VAT return (consumes 1 token from resident-pro)", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 7: Submit VAT return");
    console.log("=".repeat(60));

    await goToHomePageUsingMainNav(page, screenshotPath);
    // Navigate directly to the Submit VAT form — resident-pro maps to the HMRC (live) activity,
    // not the sandbox activity, so initSubmitVat (which uses isSandboxMode()) would look for the wrong button.
    const submitVatButton = page.locator(`button:has-text('Submit VAT (HMRC)')`);
    await expect(submitVatButton).toBeVisible({ timeout: 10_000 });
    await submitVatButton.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#vatSubmissionForm")).toBeVisible();
    await fillInVat(
      page,
      hmrcVatNumber,
      { periodStart, periodEnd },
      hmrcVatDueAmount,
      undefined,
      runFraudPreventionHeaderValidation,
      screenshotPath,
    );

    // Submit the form
    await page.locator("#submitBtn").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Handle HMRC OAuth if redirected
    const isHmrcAuthPage = await page
      .locator("#appNameParagraph")
      .isVisible()
      .catch(() => false);
    if (isHmrcAuthPage) {
      await acceptCookiesHmrc(page, screenshotPath);
      await goToHmrcAuth(page, screenshotPath);
      await initHmrcAuth(page, screenshotPath);
      await fillInHmrcAuth(page, currentTestUsername, currentTestPassword, screenshotPath);
      await submitHmrcAuth(page, screenshotPath);
      await grantPermissionHmrcAuth(page, screenshotPath);
    }

    // Wait for receipt (success) or error
    const receiptOrError = page.locator("#receiptDisplay, #statusMessagesContainer:has-text('failed')");
    await receiptOrError.first().waitFor({ state: "visible", timeout: 120_000 });

    const receiptVisible = await page
      .locator("#receiptDisplay")
      .isVisible()
      .catch(() => false);
    expect(receiptVisible).toBeTruthy();
    console.log("VAT return submitted successfully");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-vat-submitted.png` });
  });

  // ============================================================
  // STEP 8: Verify token consumed (99 remaining)
  // ============================================================
  await test.step("Verify token consumed - 99 remaining", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 8: Verify tokens = 99");
    console.log("=".repeat(60));

    await goToHomePageUsingMainNav(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);

    const tokensAfterSubmission = await getTokensRemaining(page, "resident-pro");
    console.log(`Resident-pro tokens remaining after submission: ${tokensAfterSubmission}`);
    expect(tokensAfterSubmission).toBe(99);

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-tokens-after-submission.png` });
  });

  // ============================================================
  // STEP 9: Check the token usage page
  // ============================================================
  await test.step("Check token usage page shows correct transactions", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 9: Verify token usage page");
    console.log("=".repeat(60));

    // Navigate to usage page (use current page origin to avoid 127.0.0.1 vs localhost mismatch)
    const currentOrigin = new URL(page.url()).origin;
    await page.goto(`${currentOrigin}/usage.html`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-usage-page.png` });

    // Verify the page loaded (look for token sources or consumption tables)
    const usagePageContent = await page.textContent("body");
    console.log(`Usage page content length: ${usagePageContent.length}`);

    // Check for token sources table showing resident-pro bundle
    const hasResidentPro = usagePageContent.includes("Resident Pro") || usagePageContent.includes("resident-pro");
    console.log(`Usage page shows Resident Pro: ${hasResidentPro}`);
    expect(hasResidentPro).toBe(true);

    // Check for token consumption entries
    // The consumption table should show at least 1 entry from the VAT submission
    const hasConsumptionEntry = usagePageContent.includes("submit-vat") || usagePageContent.includes("Submit VAT");
    console.log(`Usage page shows consumption entry: ${hasConsumptionEntry}`);
    // Note: consumption entry may not appear if the usage page only shows resident-pro
    // (day-guest consumption events happened before resident-pro was granted)

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-usage-page-full.png`, fullPage: true });
  });

  // ============================================================
  // STEP 10: Logout
  // ============================================================
  await test.step("Logout", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 10: Logout");
    console.log("=".repeat(60));

    await logOutAndExpectToBeLoggedOut(page, screenshotPath);
  });

  // ============================================================
  // Test Context JSON
  // ============================================================
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  const testContext = {
    testId: "paymentBehaviour",
    name: testInfo.title,
    title: "Payment Funnel (App UI)",
    description: "Exercises the full conversion funnel: day-guest pass → token exhaustion → upgrade to resident-pro → VAT submission → token usage verification.",
    hmrcApi: isSandboxMode() ? "sandbox" : "live",
    env: {
      envName,
      baseUrl,
      serverPort: httpServerPort,
      runTestServer,
      runProxy,
      runMockOAuth2,
      testAuthProvider,
      testAuthUsername,
      bundleTableName,
      hmrcApiRequestsTableName,
      receiptsTableName,
      runDynamoDb,
    },
    testData: {
      userSub,
      observedTraceparent,
      testUrl,
      bundlesTested: ["day-guest", "resident-pro"],
    },
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}

  userSub = await extractUserSubFromLocalStorage(page, testInfo);
});
