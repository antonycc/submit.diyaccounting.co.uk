// behaviour-tests/bundles.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalSslProxy,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { clearBundles, goToBundlesPage, ensureBundlePresent } from "./steps/behaviour-bundle-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import {
  appendTraceparentTxt,
  appendUserSubTxt,
  appendHashedUserSubTxt,
  deleteTraceparentTxt,
  deleteUserSubTxt,
  deleteHashedUserSubTxt,
  extractUserSubFromLocalStorage,
} from "./helpers/fileHelper.js";

// if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
//   dotenvConfigIfNotBlank({ path: ".env.test" });
// } else {
//   console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
// }
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/bundles-behaviour-test";

const originalEnv = { ...process.env };

const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3500);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
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

test.setTimeout(120_000);

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  process.env = {
    ...originalEnv,
  };

  // Run local servers as needed for the tests
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

test("Click through: Adding and removing bundles", async ({ page }, testInfo) => {
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
  await clearBundles(page, screenshotPath);
  await ensureBundlePresent(page, "Test", screenshotPath);
  await goToHomePage(page, screenshotPath);
  await goToBundlesPage(page, screenshotPath);
  // TODO: Support testing in non-sandbox mode with production credentials
  if (envName !== "prod") {
    await ensureBundlePresent(page, "Guest", screenshotPath);
    await goToHomePage(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);
  }
  await goToHomePage(page, screenshotPath);

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
  if (runDynamoDb === "run" && dynamoControl?.endpoint) {
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

  /* ****************** */
  /*  FIGURES (SCREENSHOTS) */
  /* ****************** */

  // Select and copy key screenshots, then generate figures.json
  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  const keyScreenshotPatterns = [
    "goto.*bundles.*page", // Bundles page navigation
    "clear.*bundle", // Clearing bundles
    "request.*bundle", // Requesting a bundle
    "ensure.*bundle", // Bundle present/added
    "added.*test", // Test bundle added confirmation
  ];

  const screenshotDescriptions = {
    "goto.*bundles.*page": "Bundles management page showing available bundle types and current selections",
    "clear.*bundle": "Bundles page after clearing all bundles showing empty state",
    "request.*bundle": "Bundle request in progress with Test bundle being added",
    "ensure.*bundle": "Bundle successfully added showing confirmation with checkmark",
    "added.*test": "Test bundle successfully added and visible in the bundles list",
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

  // Build and write testContext.json (no HMRC API directly exercised here)
  const testContext = {
    name: testInfo.title,
    title: "Bundles management (App UI)",
    description: "Adds and removes bundles via the UI while authenticated; ensures flows behave as expected.",
    hmrcApi: null,
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
      bundlesTested: envName === "prod" ? ["Test"] : ["Test", "Guest"],
    },
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}
});
