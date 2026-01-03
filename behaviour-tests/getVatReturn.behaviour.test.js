// behaviour-tests/getVatReturn.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  getEnvVarAndLog,
  isSandboxMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalSslProxy,
  saveHmrcTestUserToFiles,
  checkFraudPreventionHeadersFeedback,
  generatePeriodKey,
} from "./helpers/behaviour-helpers.js";
import {
  consentToDataCollection,
  goToHomePage,
  goToHomePageExpectNotLoggedIn,
  goToHomePageUsingHamburgerMenu,
} from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import {
  completeVat,
  fillInVat,
  initSubmitVat,
  submitFormVat,
  verifyVatSubmission,
  fillInViewVatReturn,
  initViewVatReturn,
  submitViewVatReturnForm,
  verifyViewVatReturnResults,
} from "./steps/behaviour-hmrc-vat-steps.js";
import {
  acceptCookiesHmrc,
  fillInHmrcAuth,
  goToHmrcAuth,
  grantPermissionHmrcAuth,
  initHmrcAuth,
  submitHmrcAuth,
} from "./steps/behaviour-hmrc-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import {
  assertConsistentHashedSub,
  assertFraudPreventionHeaders,
  assertHmrcApiRequestExists,
  assertHmrcApiRequestValues,
  intentionallyNotSuppliedHeaders,
  readDynamoDbExport,
} from "./helpers/dynamodb-assertions.js";
import {
  appendTraceparentTxt,
  appendUserSubTxt,
  appendHashedUserSubTxt,
  deleteTraceparentTxt,
  deleteUserSubTxt,
  deleteHashedUserSubTxt,
  extractUserSubFromLocalStorage,
} from "./helpers/fileHelper.js";
import { startWiremock, stopWiremock } from "./helpers/wiremock-helper.js";

dotenvConfigIfNotBlank({ path: ".env" });

let wiremockMode;
let wiremockPort;

const screenshotPath = "target/behaviour-test-results/screenshots/view-vat-return-get-behaviour-test";

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
const runFraudPreventionHeaderValidation = false;

// eslint-disable-next-line sonarjs/pseudo-random
const hmrcVatPeriodKey = generatePeriodKey();
const hmrcVatDueAmount = "1000.00";

let mockOAuth2Process;
let serverProcess;
let ngrokProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;
let currentTestUsername;
let currentTestPassword;

test.setTimeout(1200_000);

// Explicit, stable test ID for reporting
test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "get-vat-return-sandbox" });
});

test.beforeAll(async ({ page }, testInfo) => {
  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  // WireMock first so server sees overrides
  wiremockMode = process.env.TEST_WIREMOCK || "off";
  wiremockPort = process.env.WIREMOCK_PORT || 9090;
  if (wiremockMode === "record" || wiremockMode === "mock") {
    const targets = [];
    if (process.env.HMRC_BASE_URI) targets.push(process.env.HMRC_BASE_URI);
    if (process.env.HMRC_SANDBOX_BASE_URI) targets.push(process.env.HMRC_SANDBOX_BASE_URI);
    await startWiremock({ mode: wiremockMode, port: wiremockPort, outputDir: process.env.WIREMOCK_RECORD_OUTPUT_DIR || "", targets });
    process.env.HMRC_BASE_URI = `http://localhost:${wiremockPort}`;
    process.env.HMRC_SANDBOX_BASE_URI = `http://localhost:${wiremockPort}`;
  }

  // Start services after env overrides
  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);
  ngrokProcess = await runLocalSslProxy(runProxy, httpServerPort, baseUrl);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  deleteUserSubTxt(outputDir);
  deleteHashedUserSubTxt(outputDir);
  deleteTraceparentTxt(outputDir);
});

test.afterAll(async () => {
  if (ngrokProcess) ngrokProcess.kill();
  if (serverProcess) serverProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
  if (wiremockMode && wiremockMode !== "off") {
    await stopWiremock({ mode: wiremockMode, port: wiremockPort });
  }
});

test.afterEach(async ({ page }, testInfo) => {
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  appendUserSubTxt(outputDir, testInfo, userSub);
  appendHashedUserSubTxt(outputDir, testInfo, userSub);
  appendTraceparentTxt(outputDir, testInfo, observedTraceparent);
});

async function requestAndVerifyViewReturn(page, { vrn, periodKey, testScenario }) {
  await initViewVatReturn(page, screenshotPath);
  await fillInViewVatReturn(page, vrn, periodKey, testScenario, screenshotPath);
  await submitViewVatReturnForm(page, screenshotPath);
  await verifyViewVatReturnResults(page, testScenario, screenshotPath);
  await goToHomePageUsingHamburgerMenu(page, screenshotPath);
}

test("Click through: View VAT Return (single API focus: GET)", async ({ page }, testInfo) => {
  const testUrl =
    (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
      ? `http://127.0.0.1:${httpServerPort}/`
      : baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");

  page.on("response", (response) => {
    try {
      if (observedTraceparent) return;
      const headers = response.headers?.() ?? {};
      const h = typeof headers === "function" ? headers() : headers;
      const tp = (h && (h["traceparent"] || h["Traceparent"])) || null;
      if (tp) observedTraceparent = tp;
    } catch {}
  });

  // HMRC TEST USER CREATION
  currentTestUsername = hmrcTestUsername;
  currentTestPassword = hmrcTestPassword;
  let testVatNumber = hmrcTestVatNumber;
  if (!hmrcTestUsername) {
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    if (!hmrcClientId || !hmrcClientSecret) {
      throw new Error("HMRC_SANDBOX_CLIENT_ID/SECRET (or HMRC_CLIENT_ID/SECRET) required to create test users");
    }
    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
    currentTestUsername = testUser.userId;
    currentTestPassword = testUser.password;
    testVatNumber = testUser.vrn;
    const repoRoot = path.resolve(process.cwd());
    const outputDir = testInfo.outputPath("");
    saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);
    process.env.TEST_HMRC_USERNAME = currentTestUsername;
    process.env.TEST_HMRC_PASSWORD = currentTestPassword;
    process.env.TEST_HMRC_VAT_NUMBER = testVatNumber;
  }

  // HOME + LOGIN + BUNDLES
  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);
  await goToBundlesPage(page, screenshotPath);
  if (isSandboxMode()) await ensureBundlePresent(page, "Test", screenshotPath);
  if (envName !== "prod") {
    await ensureBundlePresent(page, "Guest", screenshotPath);
    await goToHomePage(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);
  }
  await goToHomePageUsingHamburgerMenu(page, screenshotPath);

  /* ********************************************** */
  /*  ENSURE A VAT RETURN EXISTS (single submission) */
  /* ********************************************** */

  await initSubmitVat(page, screenshotPath);
  await fillInVat(page, testVatNumber, hmrcVatPeriodKey, hmrcVatDueAmount, null, screenshotPath);
  await submitFormVat(page, screenshotPath);
  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, currentTestUsername, currentTestPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);
  await completeVat(page, baseUrl, null, screenshotPath);
  await verifyVatSubmission(page, null, screenshotPath);
  await goToHomePageUsingHamburgerMenu(page, screenshotPath);

  /* **************** */
  /*  VIEW VAT RETURN */
  /* **************** */

  await requestAndVerifyViewReturn(page, { vrn: testVatNumber, periodKey: hmrcVatPeriodKey });

  /* ************************************* */
  /*  VIEW VAT RETURN: TEST SCENARIOS      */
  /* ************************************* */

  if (isSandboxMode()) {
    /**
     * HMRC VAT API Sandbox scenarios (excerpt from _developers/reference/hmrc-mtd-vat-api-1.0.yaml)
     *
     * GET /organisations/vat/{vrn}/returns/{periodKey}
     *  - DATE_RANGE_TOO_LARGE: The date of the requested return cannot be further than four years from the current date.
     *  - INSOLVENT_TRADER: Client is an insolvent trader.
     */
    await requestAndVerifyViewReturn(page, { vrn: testVatNumber, periodKey: hmrcVatPeriodKey, testScenario: "DATE_RANGE_TOO_LARGE" });
    // await requestAndVerifyViewReturn(page, { vrn: testVatNumber, periodKey: hmrcVatPeriodKey, testScenario: "INSOLVENT_TRADER" });
    //
    // // Custom forced error scenarios (mirrors POST tests)
    // await requestAndVerifyViewReturn(page, {
    //   vrn: testVatNumber,
    //   periodKey: hmrcVatPeriodKey,
    //   testScenario: "SUBMIT_API_HTTP_500",
    // });
    // await requestAndVerifyViewReturn(page, {
    //   vrn: testVatNumber,
    //   periodKey: hmrcVatPeriodKey,
    //   testScenario: "SUBMIT_HMRC_API_HTTP_500",
    // });
    // await requestAndVerifyViewReturn(page, {
    //   vrn: testVatNumber,
    //   periodKey: hmrcVatPeriodKey,
    //   testScenario: "SUBMIT_HMRC_API_HTTP_503",
    // });
    //
    // // Slow scenario should take >= 10s but < 30s end-to-end
    // const slowStartMs = Date.now();
    // await requestAndVerifyViewReturn(page, {
    //   vrn: testVatNumber,
    //   periodKey: hmrcVatPeriodKey,
    //   testScenario: "SUBMIT_HMRC_API_HTTP_SLOW_10S",
    // });
    // const slowElapsedMs = Date.now() - slowStartMs;
    // expect(
    //   slowElapsedMs,
    //   `Expected SUBMIT_HMRC_API_HTTP_SLOW_10S to take at least 5s but less than 60s, actual: ${slowElapsedMs}ms`,
    // ).toBeGreaterThanOrEqual(5_000);
    // expect(slowElapsedMs).toBeLessThan(60_000);
  }

  /* ****************** */
  /*  Extract user sub  */
  /* ****************** */

  userSub = await extractUserSubFromLocalStorage(page, testInfo);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);

  // Build testContext.json
  const testContext = {
    testId: "get-vat-return-sandbox",
    name: testInfo.title,
    title: "View VAT Return (Single API Focus: GET)",
    description: "Retrieves VAT return data from HMRC with default and sandbox Gov-Test-Scenario variations.",
    hmrcApis: [
      { url: "/api/v1/hmrc/vat/return", method: "POST" },
      { url: "/api/v1/hmrc/vat/return/:periodKey", method: "GET" },
      { url: "/test/fraud-prevention-headers/validate", method: "GET" },
    ],
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
      hmrcTestVatNumber: testVatNumber,
      hmrcVatPeriodKey,
      hmrcVatDueAmount,
      testUserGenerated: isSandboxMode() && !hmrcTestUsername,
      userSub,
      observedTraceparent,
      testUrl,
      isSandboxMode: isSandboxMode(),
      intentionallyNotSuppliedHeaders,
    },
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch {}

  /* ****************** */
  /*  FIGURES (SCREENSHOTS) */
  /* ****************** */

  // Select and copy key screenshots, then generate figures.json
  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  const keyScreenshotPatterns = [
    "10.*fill.*in.*submission.*pagedown",
    "02.*complete.*vat.*receipt",
    "01.*submit.*hmrc.*auth",
    "06.*view.*vat.*fill.*in.*filled",
    "04.*view.*vat.*return.*results",
  ];

  const screenshotDescriptions = {
    "10.*fill.*in.*submission.*pagedown": "VAT return form filled out with test data including VAT number, period key, and amount due",
    "02.*complete.*vat.*receipt": "Successful VAT return submission confirmation showing receipt details from HMRC",
    "01.*submit.*hmrc.*auth": "HMRC authorization page where user authenticates with HMRC",
    "06.*view.*vat.*fill.*in.*filled": "VAT query form filled out with test data including VAT number and period key",
    "04.*view.*vat.*return.*results": "Retrieved VAT return data showing previously submitted values",
  };

  const selectedScreenshots = selectKeyScreenshots(screenshotPath, keyScreenshotPatterns, 5);
  console.log(`[Figures]: Selected ${selectedScreenshots.length} key screenshots from ${screenshotPath}`);

  const copiedScreenshots = copyScreenshots(screenshotPath, outputDir, selectedScreenshots);
  console.log(`[Figures]: Copied ${copiedScreenshots.length} screenshots to ${outputDir}`);

  const figures = generateFiguresMetadata(copiedScreenshots, screenshotDescriptions);
  writeFiguresJson(outputDir, figures);

  /* **************** */
  /*  EXPORT DYNAMODB */
  /* **************** */

  // Export DynamoDB tables if dynalite was used
  if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
    console.log("[DynamoDB Export]: Starting export of all tables...");
    try {
      const exportResults = await exportAllTables(outputDir, dynamoControl.endpoint, {
        bundleTableName,
        hmrcApiRequestsTableName,
        receiptsTableName,
      });
      console.log("[DynamoDB Export]: Export completed:", exportResults);
    } catch (error) {
      console.error("[DynamoDB Export]: Failed to export tables:", error);
    }
  }

  /* ********************************** */
  /*  ASSERT DYNAMODB HMRC API REQUESTS */
  /* ********************************** */

  // Assert that HMRC API requests were logged correctly
  if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
    const hmrcApiRequestsFile = path.join(outputDir, "hmrc-api-requests.jsonl");
    const vatGetRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "GET",
      `/organisations/vat/${testVatNumber}/returns/${hmrcVatPeriodKey}`,
      "VAT return retrieval",
    );
    expect(vatGetRequests.length).toBeGreaterThan(0);
    vatGetRequests.forEach((vatGetRequest) => {
      assertHmrcApiRequestValues(vatGetRequest, { "httpRequest.method": "GET" });
      // TODO: Deeper inspection of expected responses based on getVatObligations.behaviour.test.js
    });

    // Assert Fraud prevention headers validation feedback GET request exists and validate key fields
    assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false);

    const hashedSubs = assertConsistentHashedSub(hmrcApiRequestsFile, "View VAT GET test");
    expect(hashedSubs.length).toBeGreaterThan(0);

    // When WireMock is enabled, ensure all outbound HMRC calls used WireMock base URL
    if (wiremockMode && wiremockMode !== "off") {
      const records = readDynamoDbExport(hmrcApiRequestsFile);
      expect(records.length).toBeGreaterThan(0);
      for (const r of records) {
        expect(
          r.url?.startsWith(`http://localhost:${wiremockPort}`),
          `Expected HMRC request to use WireMock at http://localhost:${wiremockPort}, but got: ${r.url}`,
        ).toBe(true);
      }
    }
  }
});
