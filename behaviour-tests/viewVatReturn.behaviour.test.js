// behaviour-tests/viewVatReturn.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalSslProxy,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn, goToHomePageUsingHamburgerMenu } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureBundlesForEnvironment, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import {
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

if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
  dotenvConfigIfNotBlank({ path: ".env.test" });
} else {
  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/view-vat-return-behaviour-test";

const originalEnv = { ...process.env };

const serverPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const hmrcAccount = getEnvVarAndLog("hmrcAccount", "HMRC_ACCOUNT", null);
const hmrcTestVatNumber = getEnvVarAndLog("hmrcTestVatNumber", "TEST_HMRC_VAT_NUMBER", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const periodKey = "24A1"; // "18A1";

let mockOAuth2Process;
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

test("Click through: Get VAT return from HMRC", async ({ page }) => {
  // // Run servers needed for the test
  // await runLocalOAuth2Server(runMockOAuth2);
  // serverProcess = await runLocalHttpServer(runTestServer, null, serverPort);
  // ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);

  // Compute test URL based on which servers are running
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
  await ensureBundlesForEnvironment(page, screenshotPath);
  await goToHomePageUsingHamburgerMenu(page, screenshotPath);

  /* ******************* */
  /*  GET VAT RETURN     */
  /* ******************* */

  await initViewVatReturn(page, screenshotPath, hmrcAccount);
  await fillInViewVatReturn(page, hmrcTestVatNumber, periodKey, screenshotPath);
  await submitViewVatReturnForm(page, screenshotPath);

  /* ************ */
  /* `HMRC AUTH   */
  /* ************ */

  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, hmrcTestUsername, hmrcTestPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  /* ******************* */
  /*  VIEW VAT RETURN    */
  /* ******************* */

  await verifyViewVatReturnResults(page, screenshotPath);
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
