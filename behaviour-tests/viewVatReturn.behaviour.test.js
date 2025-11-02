// behaviour-tests/viewVatReturn.behaviour.test.js

import { test } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalSslProxy,
} from "./helpers/behaviour-helpers.js";
import { goToHomePageExpectNotLoggedIn, goToHomePageUsingHamburgerMenu } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { clearBundles, goToBundlesPage, requestTestBundle } from "./steps/behaviour-bundle-steps.js";
import {
  fillInViewVatReturn,
  initViewVatReturn,
  submitViewVatReturnForm,
  verifyViewVatReturnResults,
} from "./steps/behaviour-hmrc-vat-steps.js";

if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
  dotenvConfigIfNotBlank({ path: ".env.test" });
} else {
  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const originalEnv = { ...process.env };

const serverPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const hmrcTestVatNumber = getEnvVarAndLog("hmrcTestVatNumber", "TEST_HMRC_VAT_NUMBER", null);

let serverProcess;
let ngrokProcess;

test.setTimeout(300_000);

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");
  process.env = {
    ...originalEnv,
  };

  // Run servers needed for the test
  await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, null, serverPort);
  ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);

  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {
  // Shutdown local servers at end of test
  if (serverProcess) {
    serverProcess.kill();
  }
  if (ngrokProcess) {
    ngrokProcess.kill();
  }
});

test("Log in, view VAT return, log out", async ({ page }) => {
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
  await goToHomePageUsingHamburgerMenu(page);

  /* ******************* */
  /*  VIEW VAT RETURN    */
  /* ******************* */

  await initViewVatReturn(page);
  await fillInViewVatReturn(page, hmrcTestVatNumber);
  await submitViewVatReturnForm(page);

  // Note: This test uses stubbed data from the test API and does not require HMRC OAuth flow.
  // The test bundle provides access to sandbox APIs which return test data without real authentication.

  await verifyViewVatReturnResults(page);

  await goToHomePageUsingHamburgerMenu(page);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page);

  // // Shutdown local servers at end of test
  // if (serverProcess) {
  //   serverProcess.kill();
  // }
  // if (ngrokProcess) {
  //   ngrokProcess.kill();
  // }
});
