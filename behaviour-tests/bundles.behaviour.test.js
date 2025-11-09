// behaviour-tests/bundles.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
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
import { clearBundles, goToBundlesPage, requestTestBundle } from "./steps/behaviour-bundle-steps.js";
import { goToReceiptsPageUsingHamburgerMenu } from "./steps/behaviour-hmrc-receipts-steps.js";

if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
  dotenvConfigIfNotBlank({ path: ".env.test" });
} else {
  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/bundles-behaviour-test";

const originalEnv = { ...process.env };

const serverPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3500);
// const optionalTestS3AccessKey = getEnvVarAndLog("optionalTestS3AccessKey", "TEST_S3_ACCESS_KEY", null);
// const optionalTestS3SecretKey = getEnvVarAndLog("optionalTestS3Secret_KEY", "TEST_S3_SECRET_KEY", null);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
// const runMinioS3 = getEnvVarAndLog("runMinioS3", "TEST_MINIO_S3", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
// const receiptsBucketName = getEnvVarAndLog("receiptsBucketName", "DIY_SUBMIT_RECEIPTS_BUCKET_NAME", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);

let mockOAuth2Process;
let serverProcess;
let ngrokProcess;

test.setTimeout(120_000);

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");
  process.env = {
    ...originalEnv,
  };
  // Run local servers as needed for the tests
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
});

// test.use({
//   video: {
//     mode: "on",
//     size: { width: 1280, height: 720 },
//   },
// });

test("Click through: Adding and removing bundles", async ({ page }) => {
  // // Run local servers as needed for the tests
  // await runLocalOAuth2Server(runMockOAuth2);
  // serverProcess = await runLocalHttpServer(runTestServer, null, serverPort);
  // ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);

  // Compute test URL based on which servers are running§
  const testUrl =
    (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
      ? `http://127.0.0.1:${serverPort}/`
      : baseUrl;

  // Add console logging to capture browser messages
  addOnPageLogging(page, screenshotPath);

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
  await requestTestBundle(page, screenshotPath);
  await goToHomePage(page, screenshotPath);

  /* ********** */
  /*  RECEIPTS  */
  /* ********** */

  // await goToReceiptsPageUsingHamburgerMenu(page, screenshotPath);
  // await goToHomePageUsingHamburgerMenu(page, screenshotPath);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);

  // // Shutdown local servers at end of test
  // if (serverProcess) {
  //   serverProcess.kill();
  // }
  // if (ngrokProcess) {
  //   ngrokProcess.kill();
  // }
});
