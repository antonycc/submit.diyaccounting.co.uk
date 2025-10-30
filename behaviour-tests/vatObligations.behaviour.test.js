// behaviour-tests/vatObligations.behaviour.test.js

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
  fillInVatObligations,
  initVatObligations,
  submitVatObligationsForm,
  verifyVatObligationsResults,
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
  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {});

test("Log in, retrieve VAT obligations, log out", async ({ page }) => {
  // Run servers needed for the test
  await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, null, serverPort);
  ngrokProcess = await runLocalSslProxy(runProxy, serverPort, baseUrl);

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
  /*  VAT OBLIGATIONS    */
  /* ******************* */

  await initVatObligations(page);
  await fillInVatObligations(page, hmrcTestVatNumber);
  await submitVatObligationsForm(page);

  // Note: In a real test, we might need to handle HMRC auth here if not already authenticated
  // For now, we assume the test API returns stubbed data without requiring full OAuth flow

  await verifyVatObligationsResults(page);

  await goToHomePageUsingHamburgerMenu(page);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page);

  // Shutdown local servers at end of test
  if (serverProcess) {
    serverProcess.kill();
  }
  if (ngrokProcess) {
    ngrokProcess.kill();
  }
});
