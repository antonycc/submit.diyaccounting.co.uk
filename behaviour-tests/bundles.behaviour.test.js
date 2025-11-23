// behaviour-tests/bundles.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  runLocalDynamoDb,
  getEnvVarAndLog,
  isSandboxMode,
  runLocalHttpServer,
  runLocalOAuth2Server,
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
import { clearBundles, goToBundlesPage, ensureBundlePresent } from "./steps/behaviour-bundle-steps.js";

if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
  dotenvConfigIfNotBlank({ path: ".env.test" });
} else {
  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/bundles-behaviour-test";

const originalEnv = { ...process.env };

const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const serverPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3500);
// const optionalTestS3AccessKey = getEnvVarAndLog("optionalTestS3AccessKey", "TEST_S3_ACCESS_KEY", null);
// const optionalTestS3SecretKey = getEnvVarAndLog("optionalTestS3Secret_KEY", "TEST_S3_SECRET_KEY", null);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
// const runMinioS3 = getEnvVarAndLog("runMinioS3", "TEST_MINIO_S3", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
// const receiptsBucketName = getEnvVarAndLog("receiptsBucketName", "DIY_SUBMIT_RECEIPTS_BUCKET_NAME", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog(
  "hmrcApiRequestsTableName",
  "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
  null,
);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);

let mockOAuth2Process;
let serverProcess;
let ngrokProcess;
let dynamo;

test.setTimeout(120_000);

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");
  process.env = {
    ...originalEnv,
  };
  // Run local servers as needed for the tests
  // 1) DynamoDB Local (before starting HTTP server)
  dynamo = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, null, serverPort);
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
    if (typeof dynamo?.stop === "function") {
      await dynamo.stop();
    }
  } catch (_e) {}
  if (dynamo?.container) {
    try {
      await dynamo.container.stop();
    } catch (_e) {}
  }
});

test("Click through: Adding and removing bundles", async ({ page }, testInfo) => {
  // Compute test URL based on which servers are running§
  // Prefer local HTTP server when it's running to avoid HTTPS->HTTP mixed content and localhost access issues
  const testUrl =
    runTestServer === "run" || runTestServer === "useExisting"
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

  // Build and write testContext.json (no HMRC API directly exercised here)
  const testContext = {
    name: testInfo.title,
    title: "Bundles management (App UI)",
    description: "Adds and removes bundles via the UI while authenticated; ensures flows behave as expected.",
    hmrcApi: null,
    env: {
      envName,
      baseUrl,
      serverPort,
      runTestServer,
      runProxy,
      runMockOAuth2,
      testAuthProvider,
      testAuthUsername,
    },
    testData: {},
    artefactsDir: outputDir,
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}
});
