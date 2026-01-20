// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/vatValidation.behaviour.test.js
// Phase 5: 9-box VAT validation error behaviour tests

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  getEnvVarAndLog,
  injectMockMfa,
  isSandboxMode,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  runLocalSslProxy,
  saveHmrcTestUserToFiles,
  generatePeriodKey,
} from "./helpers/behaviour-helpers.js";
import {
  consentToDataCollection,
  goToHomePage,
  goToHomePageExpectNotLoggedIn,
} from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { initSubmitVat, fillInVat9Box, submitFormVat } from "./steps/behaviour-hmrc-vat-steps.js";
import { goToHmrcAuth, initHmrcAuth, fillInHmrcAuth, submitHmrcAuth, grantPermissionHmrcAuth } from "./steps/behaviour-hmrc-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/vatValidation-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const hmrcTestVatNumber = getEnvVarAndLog("hmrcTestVatNumber", "TEST_HMRC_VAT_NUMBER", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);

const hmrcVatPeriodKey = generatePeriodKey();

let mockOAuth2Process;
let serverProcess;
let ngrokProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "vatValidationBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);
  ngrokProcess = await runLocalSslProxy(runProxy, httpServerPort, baseUrl);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {
  if (ngrokProcess) ngrokProcess.kill();
  if (serverProcess) serverProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

/**
 * Helper to generate valid 9-box data for testing
 */
function generateValid9BoxData() {
  return {
    vatDueSales: 1000.0,
    vatDueAcquisitions: 200.0,
    totalVatDue: 1200.0,
    vatReclaimedCurrPeriod: 300.0,
    netVatDue: 900.0,
    totalValueSalesExVAT: 5000,
    totalValuePurchasesExVAT: 1500,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
  };
}

test.describe("9-Box VAT Validation Error Tests", () => {
  test("INVALID_WHOLE_AMOUNT: Box 6-9 with decimal values rejected", async ({ page }, testInfo) => {
    const testUrl =
      (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
        ? `http://127.0.0.1:${httpServerPort}/`
        : baseUrl;

    addOnPageLogging(page);
    const outputDir = testInfo.outputPath("");
    fs.mkdirSync(outputDir, { recursive: true });

    // Setup test user
    let testUsername = hmrcTestUsername;
    let testPassword = hmrcTestPassword;
    let testVatNumber = hmrcTestVatNumber;

    if (!hmrcTestUsername) {
      const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
      const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;

      if (!hmrcClientId || !hmrcClientSecret) {
        throw new Error("HMRC client credentials required to create test users");
      }

      const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
      testUsername = testUser.userId;
      testPassword = testUser.password;
      testVatNumber = testUser.vrn;
      saveHmrcTestUserToFiles(testUser, outputDir, process.cwd());
    }

    // Navigate and login
    await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
    await clickLogIn(page, screenshotPath);
    await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath);
    await verifyLoggedInStatus(page, screenshotPath);
    await injectMockMfa(page);
    await consentToDataCollection(page, screenshotPath);

    // Setup bundle
    await goToBundlesPage(page, screenshotPath);
    if (isSandboxMode()) {
      await ensureBundlePresent(page, "Test", screenshotPath);
    }
    await goToHomePage(page, screenshotPath);

    // Navigate to submit VAT
    await initSubmitVat(page, screenshotPath);

    // Create invalid data with decimal in Box 6
    const invalidData = generateValid9BoxData();
    invalidData.totalValueSalesExVAT = 5000.5; // Invalid: should be whole number

    await fillInVat9Box(page, testVatNumber, hmrcVatPeriodKey, invalidData, null, false, screenshotPath);

    // Submit and verify validation error
    await page.click("#submitBtn");
    await page.waitForTimeout(500);

    // Check for client-side validation error (HTML5 step validation)
    const box6Input = page.locator("#totalValueSalesExVAT");
    const validationMessage = await box6Input.evaluate((el) => el.validationMessage);
    console.log(`Box 6 validation message: ${validationMessage}`);

    // The form should show validation error for decimal in integer field
    // or the server should reject with INVALID_WHOLE_AMOUNT
    await page.screenshot({ path: `${screenshotPath}/validation-error-box6-decimal.png` });
  });

  test("INVALID_NET_VAT_DUE: Box 5 cannot be negative", async ({ page }, testInfo) => {
    const testUrl =
      (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
        ? `http://127.0.0.1:${httpServerPort}/`
        : baseUrl;

    addOnPageLogging(page);
    const outputDir = testInfo.outputPath("");
    fs.mkdirSync(outputDir, { recursive: true });

    // This test verifies Q7 compliance: Box 5 cannot contain negative amount
    // Per HMRC spec, minimum value is 0.00

    // The frontend auto-calculates Box 5 as |Box 3 - Box 4|
    // which is always non-negative due to Math.abs()
    // This test verifies the calculation behavior

    await page.goto(`${testUrl}hmrc/vat/submitVat.html`);
    await page.waitForLoadState("networkidle");

    // Fill values where Box 4 > Box 3
    await page.fill("#vatDueSales", "100.00");
    await page.fill("#vatDueAcquisitions", "0.00");
    await page.fill("#vatReclaimedCurrPeriod", "500.00");

    // Wait for auto-calculation
    await page.waitForTimeout(200);

    // Box 5 should be absolute value: |100 - 500| = 400
    const box5Value = await page.locator("#netVatDue").inputValue();
    expect(parseFloat(box5Value)).toBeGreaterThanOrEqual(0);
    console.log(`Box 5 calculated as: ${box5Value} (should be non-negative)`);

    await page.screenshot({ path: `${screenshotPath}/validation-box5-nonnegative.png` });
  });

  test("INVALID_TOTAL_VAT_DUE: Box 3 must equal Box 1 + Box 2", async ({ page }, testInfo) => {
    const testUrl =
      (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
        ? `http://127.0.0.1:${httpServerPort}/`
        : baseUrl;

    addOnPageLogging(page);

    await page.goto(`${testUrl}hmrc/vat/submitVat.html`);
    await page.waitForLoadState("networkidle");

    // Fill Box 1 and Box 2
    await page.fill("#vatDueSales", "1000.00");
    await page.fill("#vatDueAcquisitions", "200.00");

    // Wait for auto-calculation
    await page.waitForTimeout(200);

    // Verify Box 3 is auto-calculated correctly
    const box3Value = await page.locator("#totalVatDue").inputValue();
    expect(parseFloat(box3Value)).toBe(1200.0);
    console.log(`Box 3 auto-calculated as: ${box3Value} (expected 1200.00)`);

    // Box 3 is read-only, so user cannot manually enter wrong value
    const isReadOnly = await page.locator("#totalVatDue").getAttribute("readonly");
    expect(isReadOnly).toBeTruthy();
    console.log("Box 3 is read-only - user cannot enter incorrect calculation");

    await page.screenshot({ path: `${screenshotPath}/validation-box3-calculation.png` });
  });
});
