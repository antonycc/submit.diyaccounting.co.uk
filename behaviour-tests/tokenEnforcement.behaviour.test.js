// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/tokenEnforcement.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
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
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { fillInVat, initSubmitVat, submitFormVat } from "./steps/behaviour-hmrc-vat-steps.js";
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

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/token-enforcement-behaviour-test";

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

test.setTimeout(600_000); // 10 minutes

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "tokenEnforcementBehaviour" });
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

  await initializeSalt();
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
});

/**
 * Helper to get token count from the bundle API
 */
async function getTokensRemaining(page, bundleId) {
  return page.evaluate(async (bid) => {
    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) return null;
    const response = await fetch("/api/v1/bundle", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await response.json();
    const bundle = (data.bundles || []).find((b) => b.bundleId === bid && b.allocated);
    return bundle?.tokensRemaining ?? null;
  }, bundleId);
}

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

test("Token consumption and exhaustion", async ({ page }, testInfo) => {
  const testUrl =
    (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
      ? `http://127.0.0.1:${httpServerPort}/`
      : baseUrl;

  addOnPageLogging(page);

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
      saveHmrcTestUserToFiles(testInfo, testUser);
    }
  }

  const hmrcVatNumber = testVatNumber || "123456789";
  const hmrcVatDueAmount = "500.00";
  const { periodStart, periodEnd } = generatePeriodDates();

  // ============================================================
  // STEP 1: Login
  // ============================================================
  await test.step("Login and navigate to home", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Login");
    console.log("=".repeat(60));

    await goToHomePage(page, testUrl, screenshotPath);
    await consentToDataCollection(page, screenshotPath);
    await clickLogIn(page, screenshotPath);
    await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, testAuthPassword, screenshotPath);
    await verifyLoggedInStatus(page, screenshotPath);
  });

  // ============================================================
  // STEP 2: Ensure Test bundle is present (3 tokens)
  // ============================================================
  await test.step("Ensure Test bundle is present", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Ensure Test bundle");
    console.log("=".repeat(60));

    await goToBundlesPage(page, screenshotPath);
    await ensureBundlePresent(page, "Test", screenshotPath);
  });

  // ============================================================
  // STEP 3: Verify initial token count (3)
  // ============================================================
  await test.step("Verify initial token count is 3", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Verify initial tokens = 3");
    console.log("=".repeat(60));

    const initialTokens = await getTokensRemaining(page, "test");
    console.log(`Initial tokens remaining: ${initialTokens}`);
    expect(initialTokens).toBe(3);

    // Also extract userSub for later use
    userSub = await extractUserSub(page);
    console.log(`User sub: ${userSub}`);
    expect(userSub).toBeTruthy();
  });

  // ============================================================
  // STEP 4: Submit VAT return via sandbox
  // ============================================================
  await test.step("Submit VAT return (consumes 1 token)", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: Submit VAT return");
    console.log("=".repeat(60));

    await goToHomePageUsingMainNav(page, screenshotPath);
    await initSubmitVat(page, screenshotPath);
    await fillInVat(page, hmrcVatNumber, { periodStart, periodEnd }, hmrcVatDueAmount, undefined, runFraudPreventionHeaderValidation, screenshotPath);

    // Submit the form
    await page.locator("#submitBtn").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Handle HMRC OAuth if redirected
    const isHmrcAuthPage = await page.locator("#appNameParagraph").isVisible().catch(() => false);
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

    // Verify submission succeeded
    const receiptVisible = await page.locator("#receiptDisplay").isVisible().catch(() => false);
    expect(receiptVisible).toBeTruthy();
    console.log("VAT return submitted successfully");

    await page.screenshot({ path: `${screenshotPath}/04-vat-submitted.png` });
  });

  // ============================================================
  // STEP 5: Verify token consumed (2 remaining)
  // ============================================================
  await test.step("Verify token consumed - 2 remaining", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 5: Verify tokens = 2");
    console.log("=".repeat(60));

    await goToHomePageUsingMainNav(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);

    const tokensAfterSubmission = await getTokensRemaining(page, "test");
    console.log(`Tokens remaining after submission: ${tokensAfterSubmission}`);
    expect(tokensAfterSubmission).toBe(2);

    // Verify UI shows token count
    const bundleInfo = page.locator("#currentBundles");
    await expect(bundleInfo).toContainText("2 tokens remaining");
    console.log("UI correctly shows '2 tokens remaining'");

    await page.screenshot({ path: `${screenshotPath}/05-tokens-after-submission.png` });
  });

  // ============================================================
  // STEP 6: Exhaust remaining tokens via direct DynamoDB call
  // ============================================================
  await test.step("Exhaust remaining tokens", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 6: Exhaust remaining tokens");
    console.log("=".repeat(60));

    // Consume remaining 2 tokens directly via the repository
    const result1 = await consumeToken(userSub, "test");
    console.log(`Consumed token 2: remaining=${result1.tokensRemaining}`);
    expect(result1.consumed).toBe(true);

    const result2 = await consumeToken(userSub, "test");
    console.log(`Consumed token 3: remaining=${result2.tokensRemaining}`);
    expect(result2.consumed).toBe(true);

    // Verify 0 tokens remaining via API
    const tokensAfterExhaust = await getTokensRemaining(page, "test");
    console.log(`Tokens remaining after exhaustion: ${tokensAfterExhaust}`);
    expect(tokensAfterExhaust).toBe(0);
  });

  // ============================================================
  // STEP 7: Attempt submission with exhausted tokens
  // ============================================================
  await test.step("Verify exhaustion error on VAT submission", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 7: Submit with exhausted tokens");
    console.log("=".repeat(60));

    await goToHomePageUsingMainNav(page, screenshotPath);
    await initSubmitVat(page, screenshotPath);
    await fillInVat(page, hmrcVatNumber, { periodStart, periodEnd }, hmrcVatDueAmount, undefined, runFraudPreventionHeaderValidation, screenshotPath);

    // Submit the form
    await page.locator("#submitBtn").click();
    await page.waitForLoadState("networkidle");

    // Handle HMRC OAuth if redirected (cached token may still be valid)
    const isHmrcAuthPage = await page.locator("#appNameParagraph").isVisible({ timeout: 3000 }).catch(() => false);
    if (isHmrcAuthPage) {
      await acceptCookiesHmrc(page, screenshotPath);
      await goToHmrcAuth(page, screenshotPath);
      await initHmrcAuth(page, screenshotPath);
      await fillInHmrcAuth(page, currentTestUsername, currentTestPassword, screenshotPath);
      await submitHmrcAuth(page, screenshotPath);
      await grantPermissionHmrcAuth(page, screenshotPath);
    }

    // Wait for the error message to appear
    const statusContainer = page.locator("#statusMessagesContainer");
    await expect(statusContainer).toContainText(/Token limit reached|Submission failed/i, { timeout: 30_000 });
    console.log("Token exhaustion error displayed correctly");

    // Verify no receipt is shown
    const receiptVisible = await page.locator("#receiptDisplay").isVisible().catch(() => false);
    expect(receiptVisible).toBeFalsy();

    await page.screenshot({ path: `${screenshotPath}/07-token-exhaustion-error.png` });
  });

  // ============================================================
  // STEP 8: Verify token info on bundles page
  // ============================================================
  await test.step("Verify bundles page shows 0 tokens", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 8: Verify bundles page shows 0 tokens");
    console.log("=".repeat(60));

    await goToHomePageUsingMainNav(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);

    const bundleInfo = page.locator("#currentBundles");
    await expect(bundleInfo).toContainText("0 tokens remaining");
    console.log("UI correctly shows '0 tokens remaining'");

    await page.screenshot({ path: `${screenshotPath}/08-zero-tokens.png` });
  });

  // ============================================================
  // STEP 9: Logout
  // ============================================================
  await test.step("Logout", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 9: Logout");
    console.log("=".repeat(60));

    await logOutAndExpectToBeLoggedOut(page, screenshotPath);
  });
});
