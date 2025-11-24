// behaviour-tests/submitVat.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  isSandboxMode,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  runLocalS3,
  runLocalSslProxy,
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
import { completeVat, fillInVat, initSubmitVat, submitFormVat, verifyVatSubmission } from "./steps/behaviour-hmrc-vat-steps.js";
import {
  acceptCookiesHmrc,
  fillInHmrcAuth,
  goToHmrcAuth,
  grantPermissionHmrcAuth,
  initHmrcAuth,
  submitHmrcAuth,
} from "./steps/behaviour-hmrc-steps.js";

if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
  dotenvConfigIfNotBlank({ path: ".env.test" });
} else {
  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/submitVat-behaviour-test";

const originalEnv = { ...process.env };

const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const serverPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const optionalTestS3AccessKey = getEnvVarAndLog("optionalTestS3AccessKey", "TEST_S3_ACCESS_KEY", null);
const optionalTestS3SecretKey = getEnvVarAndLog("optionalTestS3Secret_KEY", "TEST_S3_SECRET_KEY", null);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const runMinioS3 = getEnvVarAndLog("runMinioS3", "TEST_MINIO_S3", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const receiptsBucketName = getEnvVarAndLog("receiptsBucketName", "DIY_SUBMIT_RECEIPTS_BUCKET_NAME", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const hmrcTestVatNumber = getEnvVarAndLog("hmrcTestVatNumber", "TEST_HMRC_VAT_NUMBER", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog(
  "hmrcApiRequestsTableName",
  "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
  null,
);
// eslint-disable-next-line sonarjs/pseudo-random
const hmrcVatPeriodKey = Math.random().toString(36).substring(2, 6);
const hmrcVatDueAmount = "1000.00";

let mockOAuth2Process;
let s3Endpoint;
let serverProcess;
let ngrokProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");
  process.env = {
    ...originalEnv,
  };

  // Run servers needed for the test
  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  s3Endpoint = await runLocalS3(runMinioS3, receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey);
  serverProcess = await runLocalHttpServer(runTestServer, s3Endpoint, serverPort);
  ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);

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

test("Click through: Submit a VAT return to HMRC", async ({ page }, testInfo) => {
  // Compute test URL based on which servers are running§
  const testUrl =
    (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
      ? `http://127.0.0.1:${serverPort}/`
      : baseUrl;

  // Add console logging to capture browser messages
  addOnPageLogging(page, screenshotPath);

  // ---------- Test artefacts (video-adjacent) ----------
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  let observedTraceparent = null;

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
  await fillInVat(page, hmrcTestVatNumber, hmrcVatPeriodKey, hmrcVatDueAmount, screenshotPath);
  await submitFormVat(page, screenshotPath);

  /* ************ */
  /* `HMRC AUTH   */
  /* ************ */

  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, hmrcTestUsername, hmrcTestPassword, screenshotPath);
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

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);

  // Extract user sub (from localStorage.userInfo) and write artefacts
  let userSub = null;
  try {
    const userInfoStr = await page.evaluate(() => localStorage.getItem("userInfo"));
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr);
      userSub = userInfo?.sub || null;
    }
  } catch (_e) {}

  try {
    fs.writeFileSync(path.join(outputDir, "traceparent.txt"), observedTraceparent || "", "utf-8");
  } catch (_e) {}
  try {
    fs.writeFileSync(path.join(outputDir, "userSub.txt"), userSub || "", "utf-8");
  } catch (_e) {}

  // Build test context metadata and write testContext.json next to the video
  const testContext = {
    name: testInfo.title,
    title: "Submit VAT Return (HMRC: VAT Return POST)",
    description:
      "Clicks through the app to submit a VAT return to HMRC MTD VAT API, then verifies receipt visibility and navigation.",
    hmrcApi: { url: "/api/v1/hmrc/vat/return", method: "POST" },
    env: {
      envName,
      baseUrl,
      serverPort,
      runTestServer,
      runProxy,
      runMockOAuth2,
      runMinioS3,
      testAuthProvider,
      testAuthUsername,
    },
    testData: {
      hmrcTestUsername,
      hmrcTestPassword,
      hmrcTestVatNumber,
      hmrcVatPeriodKey,
      hmrcVatDueAmount,
      receiptsBucketName,
      s3Endpoint,
    },
    artefactsDir: outputDir,
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}
});
