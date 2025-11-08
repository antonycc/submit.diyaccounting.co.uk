// behaviour-tests/submitVat.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalS3,
  runLocalSslProxy,
} from "./helpers/behaviour-helpers.js";
import { goToHomePage, goToHomePageExpectNotLoggedIn, goToHomePageUsingHamburgerMenu } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureTestBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
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
import { checkIfServerIsRunning } from "./helpers/serverHelper.js";
import { ensureMinioBucketExists } from "@app/bin/minio.js";

if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
  dotenvConfigIfNotBlank({ path: ".env.test" });
} else {
  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/submitVat-behaviour-test";

const originalEnv = { ...process.env };

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

let mockOAuth2Process;
let s3Endpoint;
let serverProcess;
let ngrokProcess;

test.setTimeout(300_000);

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");
  process.env = {
    ...originalEnv,
  };

  // Run servers needed for the test
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  s3Endpoint = await runLocalS3(runMinioS3, receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey);
  serverProcess = await runLocalHttpServer(runTestServer, s3Endpoint, serverPort);
  ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);

  // const runLocalOAuth2ServerPromise = runLocalOAuth2Server(runMockOAuth2);
  //
  // s3Endpoint = await runLocalS3(runMinioS3, receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey);
  // serverProcess = await runLocalHttpServer(runTestServer, s3Endpoint, serverPort);
  // ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);
  //
  // await runLocalOAuth2ServerPromise;

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

  // if (serverProcess) {
  //   serverProcess.kill();
  // }
  // if (ngrokProcess) {
  //   ngrokProcess.kill();
  // }
});

// test.use({
//   video: {
//     mode: "on",
//     size: { width: 1280, height: 720 },
//   },
// });

test("Click through: Submit a VAT return to HMRC", async ({ page }) => {
  // // Run servers needed for the test
  // await runLocalOAuth2Server(runMockOAuth2);
  // s3Endpoint = await runLocalS3(runMinioS3, receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey);
  // serverProcess = await runLocalHttpServer(runTestServer, s3Endpoint, serverPort);
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

  /* ********* */
  /*  BUNDLES  */
  /* ********* */

  await goToBundlesPage(page, screenshotPath);
  await ensureTestBundlePresent(page, screenshotPath);
  await goToHomePage(page, screenshotPath);

  /* ************ */
  /* `SUBMIT VAT  */
  /* ************ */

  await initSubmitVat(page, screenshotPath);
  await fillInVat(page, hmrcTestVatNumber, screenshotPath);
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
  // await completeVat(page, baseUrl, checkServersAreRunning);
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

  // // Shutdown local servers at end of test
  // if (serverProcess) {
  //   serverProcess.kill();
  // }
  // if (ngrokProcess) {
  //   ngrokProcess.kill();
  // }
});

// async function checkServersAreRunning() {
//   if (runMinioS3) {
//     try {
//       await ensureMinioBucketExists(receiptsBucketName, s3Endpoint, optionalTestS3AccessKey, optionalTestS3SecretKey);
//     } catch (error) {
//       console.log("S3 endpoint not responding, restarting local S3 server...", error);
//       s3Endpoint = await runLocalS3(runMinioS3, receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey);
//     }
//   } else {
//     console.log("Skipping local-s3-server process as runMinioS3 is not set to 'run'");
//   }
//
//   if (runTestServer) {
//     await checkIfServerIsRunning(
//       `http://127.0.0.1:${serverPort}`,
//       1000,
//       async function () {
//         serverProcess = await runLocalHttpServer(runTestServer, s3Endpoint, serverPort);
//       },
//       "http",
//     );
//   } else {
//     console.log("Skipping server process as runTestServer is not set to 'run'");
//   }
//
//   if (runProxy) {
//     await checkIfServerIsRunning(
//       baseUrl,
//       1000,
//       async function () {
//         ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);
//       },
//       "proxy",
//     );
//   } else {
//     console.log("Skipping ngrok process as runProxy is not set to 'run'");
//   }
// }
