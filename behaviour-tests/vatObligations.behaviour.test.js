// behaviour-tests/vatObligations.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalSslProxy,
  timestamp,
} from "./helpers/behaviour-helpers.js";
import { goToHomePageExpectNotLoggedIn, goToHomePageUsingHamburgerMenu } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureTestBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
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
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);

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

test("Click through: View VAT obligations from HMRC", async ({ page }) => {
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
  await page.waitForTimeout(200);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/005-start-${timestamp()}.png` });

  /* ******* */
  /*  LOGIN  */
  /* ******* */

  await clickLogIn(page);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/012-login-clicked-${timestamp()}.png` });

  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/015-logged-in-${timestamp()}.png` });

  await verifyLoggedInStatus(page);

  /* ********* */
  /*  BUNDLES  */
  /* ********* */

  await goToBundlesPage(page);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/018-bundles-page-${timestamp()}.png` });
  await ensureTestBundlePresent(page);
  await goToHomePageUsingHamburgerMenu(page);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/019-back-home-${timestamp()}.png` });

  /* ******************* */
  /*  GET OBLIGATIONS    */
  /* ******************* */

  await initVatObligations(page);
  const fromDate = "2025-01-07";
  const toDate = "2025-11-01";
  await fillInVatObligations(page, hmrcTestVatNumber, { fromDate, toDate });
  // Take a focus change screenshot between last cell entry and submit
  await page.focus('#retrieveBtn');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/025-ready-to-submit-${timestamp()}.png` });
  await submitVatObligationsForm(page);

  /* ************ */
  /* `HMRC AUTH   */
  /* ************ */

  await acceptCookiesHmrc(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/032-accepted-cookies-${timestamp()}.png` });
  await goToHmrcAuth(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/034-hmrc-auth-${timestamp()}.png` });
  await initHmrcAuth(page);
  await fillInHmrcAuth(page, hmrcTestUsername, hmrcTestPassword);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/036-hmrc-credentials-${timestamp()}.png` });
  await submitHmrcAuth(page);
  await grantPermissionHmrcAuth(page);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/038-hmrc-permission-${timestamp()}.png` });

  /* ******************** */
  /*  VIEW OBLIGATIONS    */
  /* ******************** */

  await verifyVatObligationsResults(page);
  // If results likely scroll, capture a pagedown
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/045-results-pagedown-${timestamp()}.png` });

  await goToHomePageUsingHamburgerMenu(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/090-back-home-${timestamp()}.png` });

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `target/behaviour-test-results/vatObligations-screenshots/095-logged-out-${timestamp()}.png` });

  // // Shutdown local servers at end of test
  // if (serverProcess) {
  //   serverProcess.kill();
  // }
  // if (ngrokProcess) {
  //   ngrokProcess.kill();
  // }
});
