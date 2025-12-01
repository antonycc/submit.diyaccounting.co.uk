// behaviour-tests/submitVat.behaviour.test.js

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
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  runLocalSslProxy,
  saveHmrcTestUserToFiles,
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
import { goToReceiptsPageUsingHamburgerMenu, verifyAtLeastOneClickableReceipt } from "./steps/behaviour-hmrc-receipts-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import { assertHmrcApiRequestExists, assertHmrcApiRequestValues, assertConsistentHashedSub } from "./helpers/dynamodb-assertions.js";
import {
  completeVat,
  fillInVat,
  fillInViewVatReturn,
  initSubmitVat,
  initViewVatReturn,
  submitFormVat,
  submitViewVatReturnForm,
  verifyVatSubmission,
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
import {
  appendTraceparentTxt,
  appendUserSubTxt,
  appendHashedUserSubTxt,
  deleteTraceparentTxt,
  deleteUserSubTxt,
  deleteHashedUserSubTxt,
  extractUserSubFromLocalStorage,
} from "./helpers/fileHelper.js";

if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
  dotenvConfigIfNotBlank({ path: ".env.test" });
} else {
  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/submitVat-behaviour-test";

const originalEnv = { ...process.env };

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

// eslint-disable-next-line sonarjs/pseudo-random
const hmrcVatPeriodKey = Math.random().toString(36).substring(2, 6);
const hmrcVatDueAmount = "1000.00";

let mockOAuth2Process;
let s3Endpoint;
let serverProcess;
let ngrokProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(300_000);

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");
  process.env = {
    ...originalEnv,
  };

  // Run servers needed for the test
  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);
  ngrokProcess = await runLocalSslProxy(runProxy, httpServerPort, baseUrl);

  // Clean up any existing artefacts from previous test runs
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  deleteUserSubTxt(outputDir);
  deleteHashedUserSubTxt(outputDir);
  deleteTraceparentTxt(outputDir);

  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {
  // Shutdown local servers at end of test
  if (ngrokProcess) {
    ngrokProcess.kill();
  }
  if (serverProcess) {
    serverProcess.kill();
  }
  if (mockOAuth2Process) {
    mockOAuth2Process.kill();
  }
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

test.afterEach(async ({ page }, testInfo) => {
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  appendUserSubTxt(outputDir, testInfo, userSub);
  appendHashedUserSubTxt(outputDir, testInfo, userSub);
  appendTraceparentTxt(outputDir, testInfo, observedTraceparent);
});

test("Click through: Submit a VAT return to HMRC", async ({ page }, testInfo) => {
  // Compute test URL based on which servers are running§
  const testUrl =
    (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
      ? `http://127.0.0.1:${httpServerPort}/`
      : baseUrl;

  // Add console logging to capture browser messages
  addOnPageLogging(page, screenshotPath);

  // ---------- Test artefacts (video-adjacent) ----------
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  // Capture the first traceparent header observed in any API response
  page.on("response", (response) => {
    try {
      if (observedTraceparent) return;
      const headers = response.headers?.() ?? response.headers?.() ?? {};
      const h = typeof headers === "function" ? headers() : headers;
      const tp = (h && (h["traceparent"] || h["Traceparent"])) || null;
      if (tp) {
        observedTraceparent = tp;
      }
    } catch (_e) {
      // ignore header parsing errors
    }
  });

  /* ************************* */
  /* HMRC TEST USER CREATION   */
  /* ************************* */

  // Variables to hold test credentials (either from env or generated)
  let testUsername = hmrcTestUsername;
  let testPassword = hmrcTestPassword;
  let testVatNumber = hmrcTestVatNumber;

  // If in sandbox mode and credentials are not provided, create a test user
  if (!hmrcTestUsername) {
    console.log("[HMRC Test User] Sandbox mode detected without full credentials - creating test user");

    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;

    if (!hmrcClientId) {
      console.error("[HMRC Test User] No HMRC client ID found in environment. Cannot create test user.");
      throw new Error("HMRC_SANDBOX_CLIENT_ID or HMRC_CLIENT_ID is required to create test users");
    }

    if (!hmrcClientSecret) {
      console.error("[HMRC Test User] No HMRC client secret found in environment. Cannot create test user.");
      throw new Error("HMRC_SANDBOX_CLIENT_SECRET or HMRC_CLIENT_SECRET is required to create test users");
    }

    console.log("[HMRC Test User] Creating HMRC sandbox test user with VAT enrolment using client credentials");

    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, {
      serviceNames: ["mtd-vat"],
    });

    // Extract credentials from the created test user
    testUsername = testUser.userId;
    testPassword = testUser.password;
    testVatNumber = testUser.vrn;

    console.log("[HMRC Test User] Successfully created test user:");
    console.log(`  User ID: ${testUser.userId}`);
    console.log(`  User Full Name: ${testUser.userFullName}`);
    console.log(`  VAT Registration Number: ${testUser.vrn}`);
    console.log(`  Organisation: ${testUser.organisationDetails?.name || "N/A"}`);

    // Save test user details to files
    const repoRoot = path.resolve(process.cwd());

    saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);

    // Update environment variables for this test run
    process.env.TEST_HMRC_USERNAME = testUsername;
    process.env.TEST_HMRC_PASSWORD = testPassword;
    process.env.TEST_HMRC_VAT_NUMBER = testVatNumber;

    console.log("[HMRC Test User] Updated environment variables with generated credentials");
  }

  /* ****** */
  /*  HOME  */
  /* ****** */

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  /* ******* */
  /*  LOGIN  */
  /* ******* */

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  /* ********* */
  /*  BUNDLES  */
  /* ********* */

  await goToBundlesPage(page, screenshotPath);
  if (isSandboxMode()) {
    await ensureBundlePresent(page, "Test", screenshotPath);
  }
  // TODO: Support testing in non-sandbox mode with production credentials
  if (envName !== "prod") {
    await ensureBundlePresent(page, "Guest", screenshotPath);
    await goToHomePage(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);
  }
  await goToHomePage(page, screenshotPath);

  /* ************ */
  /* `SUBMIT VAT  */
  /* ************ */

  await initSubmitVat(page, screenshotPath);
  await fillInVat(page, testVatNumber, hmrcVatPeriodKey, hmrcVatDueAmount, screenshotPath);
  await submitFormVat(page, screenshotPath);

  /* ************ */
  /* `HMRC AUTH   */
  /* ************ */

  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  /* ************** */
  /* `COMPLETE VAT  */
  /* ************** */

  await completeVat(page, baseUrl, screenshotPath);
  await verifyVatSubmission(page, screenshotPath);

  /* ********** */
  /*  RECEIPTS  */
  /* ********** */

  await goToReceiptsPageUsingHamburgerMenu(page, screenshotPath);
  await verifyAtLeastOneClickableReceipt(page, screenshotPath);
  await goToHomePageUsingHamburgerMenu(page, screenshotPath);

  /* ******************* */
  /*  VIEW VAT RETURN    */
  /* ******************* */

  // Now attempt to view the VAT return that was just submitted
  await initViewVatReturn(page, screenshotPath);
  await fillInViewVatReturn(page, testVatNumber, hmrcVatPeriodKey, screenshotPath);
  await submitViewVatReturnForm(page, screenshotPath);

  // TODO: When in sandbox mode, trigger each submit vat test scenario in turn, going back to home page each time

  /* ******************* */
  /*  VIEW VAT RESULTS   */
  /* ******************* */

  await verifyViewVatReturnResults(page, screenshotPath);
  await goToHomePageUsingHamburgerMenu(page, screenshotPath);

  // TODO: When in sandbox mode, trigger each view vat test scenario in turn, going back to home page each time

  /* ****************** */
  /*  Extract user sub  */
  /* ****************** */

  userSub = await extractUserSubFromLocalStorage(page, testInfo);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);

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
  if (runDynamoDb === "run") {
    const hmrcApiRequestsFile = path.join(outputDir, "hmrc-api-requests.jsonl");

    // Assert OAuth token exchange request exists
    const oauthRequests = assertHmrcApiRequestExists(hmrcApiRequestsFile, "POST", "/oauth/token", "OAuth token exchange");
    console.log(`[DynamoDB Assertions]: Found ${oauthRequests.length} OAuth token exchange request(s)`);

    // Assert VAT return POST request exists and validate key fields
    const vatPostRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "POST",
      `/organisations/vat/${testVatNumber}/returns`,
      "VAT return submission",
    );
    console.log(`[DynamoDB Assertions]: Found ${vatPostRequests.length} VAT return POST request(s)`);

    if (vatPostRequests.length > 0) {
      const vatPostRequest = vatPostRequests[0];
      // Assert that the request body contains the submitted data
      assertHmrcApiRequestValues(vatPostRequest, {
        "httpRequest.method": "POST",
        "httpResponse.statusCode": 201,
      });

      // Check that request body contains the period key and VAT due amount
      const requestBody = JSON.parse(vatPostRequest.httpRequest.body);
      expect(requestBody.periodKey).toBe(hmrcVatPeriodKey.toUpperCase());
      expect(requestBody.vatDueSales).toBe(parseFloat(hmrcVatDueAmount));
      console.log("[DynamoDB Assertions]: VAT POST request body validated successfully");
    }

    // Assert VAT return GET request exists and validate key fields
    const vatGetRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "GET",
      `/organisations/vat/${testVatNumber}/returns/${hmrcVatPeriodKey.toUpperCase()}`,
      "VAT return retrieval",
    );
    console.log(`[DynamoDB Assertions]: Found ${vatGetRequests.length} VAT return GET request(s)`);

    if (vatGetRequests.length > 0) {
      const vatGetRequest = vatGetRequests[0];
      // Assert that the response contains the submitted data
      assertHmrcApiRequestValues(vatGetRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 200,
      });

      // Check that response body contains the expected data
      const responseBody = vatGetRequest.httpResponse.body;
      expect(responseBody.periodKey).toBe(hmrcVatPeriodKey.toUpperCase());
      expect(responseBody.vatDueSales).toBe(parseFloat(hmrcVatDueAmount));
      console.log("[DynamoDB Assertions]: VAT GET response body validated successfully");
    }

    // Assert consistent hashedSub across authenticated requests
    const hashedSubs = assertConsistentHashedSub(hmrcApiRequestsFile, "Submit VAT test");
    console.log(`[DynamoDB Assertions]: Found ${hashedSubs.length} unique hashedSub value(s): ${hashedSubs.join(", ")}`);
  }

  /* ****************** */
  /*  FIGURES (SCREENSHOTS) */
  /* ****************** */

  // Select and copy key screenshots, then generate figures.json
  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  const keyScreenshotPatterns = [
    "submit.*vat.*form", // VAT form submission
    "complete.*vat", // VAT submission completion
    "hmrc.*auth", // HMRC authorization screen
    "receipt", // Receipt display
    "view.*vat.*return.*result", // VAT return results
  ];

  const screenshotDescriptions = {
    "submit.*vat.*form": "VAT return form filled out with test data including VAT number, period key, and amount due",
    "complete.*vat": "Successful VAT return submission confirmation showing receipt details from HMRC",
    "hmrc.*auth": "HMRC authorization page where user grants permission to access VAT data",
    "receipt": "Receipt page displaying submitted VAT returns and their confirmation details",
    "view.*vat.*return.*result": "Retrieved VAT return data showing previously submitted values",
  };

  const selectedScreenshots = selectKeyScreenshots(screenshotPath, keyScreenshotPatterns, 5);
  console.log(`[Figures]: Selected ${selectedScreenshots.length} key screenshots from ${screenshotPath}`);

  const copiedScreenshots = copyScreenshots(screenshotPath, outputDir, selectedScreenshots);
  console.log(`[Figures]: Copied ${copiedScreenshots.length} screenshots to ${outputDir}`);

  const figures = generateFiguresMetadata(copiedScreenshots, screenshotDescriptions);
  writeFiguresJson(outputDir, figures);

  /* ****************** */
  /*  TEST CONTEXT JSON */
  /* ****************** */

  // Build test context metadata and write testContext.json next to the video
  const testContext = {
    name: testInfo.title,
    title: "Submit VAT Return (HMRC: VAT Return POST)",
    description: "Clicks through the app to submit a VAT return to HMRC MTD VAT API, then verifies receipt visibility and navigation.",
    hmrcApis: [
      { url: "/api/v1/hmrc/vat/return", method: "POST" },
      { url: "/api/v1/hmrc/vat/return/:periodKey", method: "GET" },
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
      hmrcTestUsername: testUsername,
      hmrcTestPassword: testPassword ? "***MASKED***" : "<not provided>", // Mask password in test context
      hmrcTestVatNumber: testVatNumber,
      hmrcVatPeriodKey,
      hmrcVatDueAmount,
      s3Endpoint,
      testUserGenerated: isSandboxMode() && (!hmrcTestUsername || !hmrcTestPassword || !hmrcTestVatNumber),
      userSub,
      observedTraceparent,
      testUrl,
      isSandboxMode: isSandboxMode(),
    },
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}
});
