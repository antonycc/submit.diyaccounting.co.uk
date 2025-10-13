// behaviour-tests/submitVat.behaviour.test.js

import { test } from "@playwright/test";
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
import { clearBundles, goToBundlesPage, requestTestBundle } from "./steps/behaviour-bundle-steps.js";
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

dotenvConfigIfNotBlank({ path: ".env.test" });
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const originalEnv = { ...process.env };

const serverPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3500);
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

let s3Endpoint;
let serverProcess;
let ngrokProcess;

test.setTimeout(360000);

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");
  process.env = {
    ...originalEnv,
  };

  const runLocalOAuth2ServerPromise = runLocalOAuth2Server(runMockOAuth2);

  s3Endpoint = await runLocalS3(runMinioS3, receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey);
  serverProcess = await runLocalHttpServer(runTestServer, s3Endpoint, serverPort);
  ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);

  await runLocalOAuth2ServerPromise;

  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (ngrokProcess) {
    ngrokProcess.kill();
  }
});

test.use({
  video: {
    mode: "on",
    size: { width: 1280, height: 720 },
  },
});

test("Log in, add test bundle, submit VAT return, log out", async ({ page }) => {
  const testUrl = runTestServer === "run" && runProxy !== "run" ? `http://127.0.0.1:${serverPort}` : baseUrl;

  // Add console logging to capture browser messages
  addOnPageLogging(page);

  /* ****** */
  /*  HOME  */
  /* ****** */

  await goToHomePageExpectNotLoggedIn(page, testUrl);

  /* ******* */
  /*  LOGIN  */
  /* ******* */

  await clickLogIn(page);

  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername);

  await verifyLoggedInStatus(page);

  /* ********* */
  /*  BUNDLES  */
  /* ********* */

  await goToBundlesPage(page);
  await clearBundles(page);
  await requestTestBundle(page);
  await goToHomePage(page);

  /* ************ */
  /* `SUBMIT VAT  */
  /* ************ */

  await initSubmitVat(page);
  await fillInVat(page, hmrcTestVatNumber);
  await submitFormVat(page);

  await acceptCookiesHmrc(page);
  await goToHmrcAuth(page);
  await initHmrcAuth(page);
  await fillInHmrcAuth(page, hmrcTestUsername, hmrcTestPassword);
  await submitHmrcAuth(page);
  await grantPermissionHmrcAuth(page);

  await completeVat(page, checkServersAreRunning);
  await verifyVatSubmission(page);

  /* ********** */
  /*  RECEIPTS  */
  /* ********** */

  await goToReceiptsPageUsingHamburgerMenu(page);

  await verifyAtLeastOneClickableReceipt(page);

  await goToHomePageUsingHamburgerMenu(page);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page);
});

async function checkServersAreRunning() {
  if (runTestServer) {
    await checkIfServerIsRunning(`http://127.0.0.1:${serverPort}`, 1000, async function () {
      serverProcess = await runLocalHttpServer(runTestServer, s3Endpoint, serverPort);
    });
  } else {
    console.log("Skipping server process as runTestServer is not set to 'run'");
  }

  if (runProxy) {
    await checkIfServerIsRunning(baseUrl, 1000, async function () {
      ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);
    });
  } else {
    console.log("Skipping ngrok process as runProxy is not set to 'run'");
  }

  if (runMockOAuth2) {
    await checkIfServerIsRunning("http://localhost:8080/default/debugger", 2000, async function () {
      await runLocalOAuth2Server(runMockOAuth2);
    });
  } else {
    console.log("Skipping mock-oauth2-server process as runMockOAuth2 is not set to 'run'");
  }
}
