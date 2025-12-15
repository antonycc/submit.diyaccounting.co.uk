// behaviour-tests/getVatObligations.behaviour.test.js

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
  fillInVatObligations,
  initVatObligations,
  submitVatObligationsForm,
  verifyVatObligationsResults,
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
import { assertHmrcApiRequestExists, assertHmrcApiRequestValues, assertConsistentHashedSub } from "./helpers/dynamodb-assertions.js";
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

//if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
//  dotenvConfigIfNotBlank({ path: ".env.test" });
//} else {
//  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
//}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

let wiremockMode;
let wiremockPort;

const screenshotPath = "target/behaviour-test-results/screenshots/vat-obligations-behaviour-test";

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
const hmrcTestVatNumber = getEnvVarAndLog("hmrcTestVatNumber", "TEST_HMRC_VAT_NUMBER", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const hmrcVatPeriodFromDate = "2025-01-01";
const hmrcVatPeriodToDate = "2025-12-01";
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);

let mockOAuth2Process;
let serverProcess;
let ngrokProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(900_000);

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

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

  wiremockMode = process.env.TEST_WIREMOCK || "off";
  wiremockPort = process.env.WIREMOCK_PORT || 9090;

  if (wiremockMode === "record" || wiremockMode === "mock") {
    const targets = [];
    if (process.env.HMRC_BASE_URI) targets.push(process.env.HMRC_BASE_URI);
    if (process.env.HMRC_SANDBOX_BASE_URI) targets.push(process.env.HMRC_SANDBOX_BASE_URI);
    await startWiremock({
      mode: wiremockMode,
      port: wiremockPort,
      outputDir: process.env.WIREMOCK_RECORD_OUTPUT_DIR || "",
      targets,
    });
    // override HMRC endpoints so the app uses WireMock
    process.env.HMRC_BASE_URI = `http://localhost:${wiremockPort}`;
    process.env.HMRC_SANDBOX_BASE_URI = `http://localhost:${wiremockPort}`;
  }

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
  // stop local servers...
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

async function requestAndVerifyObligations(page, obligationsQuery) {
  // Fulfilled obligations
  await initVatObligations(page, screenshotPath);
  await fillInVatObligations(page, obligationsQuery, screenshotPath);
  await submitVatObligationsForm(page, screenshotPath);
  await verifyVatObligationsResults(page, obligationsQuery, screenshotPath);
  await goToHomePageUsingHamburgerMenu(page, screenshotPath);
}

test("Click through: View VAT obligations from HMRC", async ({ page }, testInfo) => {
  // Compute test URL based on which servers are running
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
    // Get HMRC client ID from environment (sandbox or default)
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
  await goToHomePageUsingHamburgerMenu(page, screenshotPath);

  /* ******************* */
  /*  GET OBLIGATIONS    */
  /* ******************* */

  await initVatObligations(page, screenshotPath);
  await fillInVatObligations(
    page,
    {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      /* No test scenario */
    },
    screenshotPath,
  );
  await submitVatObligationsForm(page, screenshotPath);

  /* ************ */
  /* `HMRC AUTH   */
  /* ************ */

  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  /* ******************** */
  /*  VIEW OBLIGATIONS    */
  /* ******************** */

  await verifyVatObligationsResults(page, screenshotPath);
  await goToHomePageUsingHamburgerMenu(page, screenshotPath);

  /* ************************************* */
  /*  GET OBLIGATIONS WITH TEST SCENARIOS  */
  /* ************************************* */
  if (isSandboxMode()) {
    /**
     * HMRC VAT API Sandbox scenarios (excerpt from _developers/reference/hmrc-md-vat-api-1.0.yaml)
     *
     * GET /organisations/vat/{vrn}/obligations
     *  - Default (No header value): Quarterly obligations and one is fulfilled
     *  - QUARTERLY_NONE_MET: Quarterly obligations and none are fulfilled
     *  - QUARTERLY_ONE_MET: Quarterly obligations and one is fulfilled
     *  - QUARTERLY_TWO_MET: Quarterly obligations and two are fulfilled
     *  - QUARTERLY_FOUR_MET: Quarterly obligations and four are fulfilled
     *  - MONTHLY_NONE_MET: Monthly obligations and none are fulfilled
     *  - MONTHLY_ONE_MET: Monthly obligations and one month is fulfilled
     *  - MONTHLY_TWO_MET: Monthly obligations and two months are fulfilled
     *  - MONTHLY_THREE_MET: Monthly obligations and three months are fulfilled
     *  - MONTHLY_OBS_01_OPEN: 2018 monthly obligations, month 01 is open
     *  - MONTHLY_OBS_06_OPEN: 2018 monthly obligations, month 06 is open; previous months fulfilled
     *  - MONTHLY_OBS_12_FULFILLED: 2018 monthly obligations; all fulfilled
     *  - QUARTERLY_OBS_01_OPEN: 2018 quarterly obligations, quarter 01 is open
     *  - QUARTERLY_OBS_02_OPEN: 2018 quarterly obligations, quarter 02 is open; previous quarters fulfilled
     *  - QUARTERLY_OBS_04_FULFILLED: 2018 quarterly obligations; all fulfilled
     *  - MULTIPLE_OPEN_MONTHLY: 2018 monthly obligations; two are open
     *  - MULTIPLE_OPEN_QUARTERLY: 2018 quarterly obligations; two are open
     *  - OBS_SPANS_MULTIPLE_YEARS: One obligation spans 2018-2019
     *  - INSOLVENT_TRADER: Client is an insolvent trader
     *  - NOT_FOUND: No data found
     */
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      /* No test scenario */
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      status: "O",
      /* No test scenario */
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      status: "F",
      /* No test scenario */
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_NONE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_ONE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_TWO_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_FOUR_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_NONE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_ONE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_TWO_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_THREE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_OBS_01_OPEN",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_OBS_06_OPEN",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_OBS_12_FULFILLED",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_OBS_01_OPEN",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_OBS_02_OPEN",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_OBS_04_FULFILLED",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MULTIPLE_OPEN_MONTHLY",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MULTIPLE_OPEN_QUARTERLY",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "OBS_SPANS_MULTIPLE_YEARS",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "INSOLVENT_TRADER",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "NOT_FOUND",
    });
  }

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

    // Assert VAT obligations GET request exists and validate key fields
    const obligationsRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "GET",
      `/organisations/vat/${testVatNumber}/obligations`,
      "VAT obligations retrieval",
    );
    console.log(`[DynamoDB Assertions]: Found ${obligationsRequests.length} VAT obligations GET request(s)`);

    if (obligationsRequests.length > 0) {
      const obligationsRequest = obligationsRequests[0];
      // Assert that the response is successful
      assertHmrcApiRequestValues(obligationsRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 200,
      });

      // Check that response body contains obligations data
      const responseBody = obligationsRequest.httpResponse.body;
      expect(responseBody).toBeDefined();
      expect(responseBody.obligations).toBeDefined();
      console.log("[DynamoDB Assertions]: VAT obligations response validated successfully");
    }

    // Assert consistent hashedSub across authenticated requests
    const hashedSubs = assertConsistentHashedSub(hmrcApiRequestsFile, "VAT Obligations test");
    console.log(`[DynamoDB Assertions]: Found ${hashedSubs.length} unique hashedSub value(s): ${hashedSubs.join(", ")}`);
  }

  /* ****************** */
  /*  FIGURES (SCREENSHOTS) */
  /* ****************** */

  // Select and copy key screenshots, then generate figures.json
  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  // TODO: Pick examples with all then HMRC API form submissions and response data
  const keyScreenshotPatterns = [
    "init.*vat.*obligation", // VAT obligations form
    "fill.*vat.*obligation", // VAT obligations form filled
    "hmrc.*auth", // HMRC authorization screen
    "verify.*vat.*obligation.*result", // VAT obligations results
    "vat.*obligation.*result", // Alternative obligations results pattern
  ];

  const screenshotDescriptions = {
    "init.*vat.*obligation": "VAT obligations form initial state ready for user input",
    "fill.*vat.*obligation": "VAT obligations form filled with VAT number and date range parameters",
    "hmrc.*auth": "HMRC authorization page where user grants permission to access VAT obligations data",
    "verify.*vat.*obligation.*result": "VAT obligations results page displaying retrieved obligation periods and their status",
    "vat.*obligation.*result": "Retrieved VAT obligations showing due dates and submission deadlines",
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

  // Build and write testContext.json
  const testContext = {
    name: testInfo.title,
    title: "View VAT Obligations (HMRC: VAT Obligations GET)",
    description: "Retrieves VAT obligations from HMRC MTD VAT API and verifies the results flow in the UI.",
    hmrcApis: [
      {
        url: "/api/v1/hmrc/vat/obligation",
        method: "GET",
      },
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
      hmrcTestUsername: testUsername,
      hmrcTestPassword: testPassword ? "***MASKED***" : "<not provided>", // Mask password in test context
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      testUserGenerated: isSandboxMode() && !hmrcTestUsername,
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
