// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/tokenEnforcement.behaviour.test.js

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
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn, goToHomePage, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, getTokensRemaining, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
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

  // initializeSalt needs AWS Secrets Manager access and is only required for
  // direct DynamoDB token consumption (Step 6). Skip when table name is not set.
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
      const outputDir = testInfo.outputPath("");
      const repoRoot = path.resolve(process.cwd());
      saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);
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

    await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
    await clickLogIn(page, screenshotPath);
    await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
    await verifyLoggedInStatus(page, screenshotPath);
    await consentToDataCollection(page, screenshotPath);
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
  // STEP 3: Verify initial token count (10 — from catalogue)
  // ============================================================
  await test.step("Verify initial token count is 10", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Verify initial tokens = 10");
    console.log("=".repeat(60));

    const initialTokens = await getTokensRemaining(page, "test");
    console.log(`Initial tokens remaining: ${initialTokens}`);
    expect(initialTokens).toBe(10);

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

    // Verify submission succeeded
    const receiptVisible = await page
      .locator("#receiptDisplay")
      .isVisible()
      .catch(() => false);
    expect(receiptVisible).toBeTruthy();
    console.log("VAT return submitted successfully");

    await page.screenshot({ path: `${screenshotPath}/04-vat-submitted.png` });
  });

  // ============================================================
  // STEP 5: Verify token consumed (9 remaining)
  // ============================================================
  await test.step("Verify token consumed - 9 remaining", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 5: Verify tokens = 9");
    console.log("=".repeat(60));

    await goToHomePageUsingMainNav(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);

    const tokensAfterSubmission = await getTokensRemaining(page, "test");
    console.log(`Tokens remaining after submission: ${tokensAfterSubmission}`);
    expect(tokensAfterSubmission).toBe(9);

    // UI token display may be stale due to ~5 min bundleCache TTL; log but don't assert
    const bundleInfo = page.locator("#currentBundles");
    const uiText = await bundleInfo.textContent().catch(() => "");
    console.log(`UI currentBundles text: ${uiText}`);

    await page.screenshot({ path: `${screenshotPath}/05-tokens-after-submission.png` });
  });

  // ============================================================
  // STEP 6: Exhaust remaining tokens via direct DynamoDB call
  // ============================================================
  await test.step("Exhaust remaining tokens", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 6: Exhaust remaining tokens");
    console.log("=".repeat(60));

    if (!bundleTableName) {
      console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping direct token exhaustion (Steps 6-8 require DynamoDB access)");
      return;
    }

    // Consume all remaining tokens directly via the repository
    let remaining = 9; // 10 initial minus 1 consumed by VAT submission
    let consumed = 0;
    while (remaining > 0) {
      const result = await consumeToken(userSub, "test");
      consumed++;
      remaining = result.tokensRemaining;
      console.log(`Consumed token ${consumed + 1}: remaining=${remaining}`);
      expect(result.consumed).toBe(true);
    }
    console.log(`Exhausted all tokens (consumed ${consumed} directly)`);

    // Verify 0 tokens remaining via API
    const tokensAfterExhaust = await getTokensRemaining(page, "test");
    console.log(`Tokens remaining after exhaustion: ${tokensAfterExhaust}`);
    expect(tokensAfterExhaust).toBe(0);
  });

  // ============================================================
  // STEP 7: Verify activity button is disabled with exhausted tokens
  // ============================================================
  await test.step("Verify activity button disabled when tokens exhausted", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 7: Verify button disabled with exhausted tokens");
    console.log("=".repeat(60));

    if (!bundleTableName) {
      console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping exhaustion verification (requires DynamoDB access in Step 6)");
      return;
    }

    await goToHomePageUsingMainNav(page, screenshotPath);

    // Wait for the page to render activity buttons (needs bundle API response)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotPath}/07-token-exhaustion-home.png` });

    // The Submit VAT button should now be disabled with "Insufficient tokens" in its text
    const activityButtonText = isSandboxMode() ? "Submit VAT (HMRC Sandbox)" : "Submit VAT (HMRC)";
    const submitButton = page.locator(`button:has-text('${activityButtonText}')`);
    await expect(submitButton).toBeVisible({ timeout: 10_000 });
    await expect(submitButton).toBeDisabled({ timeout: 10_000 });
    // Verify the button itself states the reason for being disabled
    const buttonText = await submitButton.textContent();
    console.log(`Submit VAT button text: "${buttonText.trim()}"`);
    expect(buttonText).toContain("Insufficient tokens");
    console.log("Submit VAT button correctly shows 'Insufficient tokens' reason on the button");

    // Verify the annotation paragraph below the button
    const annotation = page.locator(`p:has-text("Insufficient tokens")`);
    await expect(annotation).toBeVisible({ timeout: 5_000 });
    console.log("Insufficient tokens annotation displayed correctly");

    await page.screenshot({ path: `${screenshotPath}/07-token-exhaustion-disabled.png` });
  });

  // ============================================================
  // STEP 8: Verify token info on bundles page
  // ============================================================
  await test.step("Verify bundles page shows 0 tokens", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 8: Verify bundles page shows 0 tokens");
    console.log("=".repeat(60));

    if (!bundleTableName) {
      console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping zero-token verification (requires DynamoDB access in Step 6)");
      return;
    }

    await goToHomePageUsingMainNav(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);

    // UI token display may be stale due to ~5 min bundleCache TTL; verify via API instead
    const tokensAfterExhaust = await getTokensRemaining(page, "test");
    console.log(`Tokens remaining via API: ${tokensAfterExhaust}`);
    expect(tokensAfterExhaust).toBe(0);

    const bundleInfo = page.locator("#currentBundles");
    const uiText = await bundleInfo.textContent().catch(() => "");
    console.log(`UI currentBundles text: ${uiText}`);

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
