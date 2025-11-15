// behaviour-tests/businessSubscription.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
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
import { clearBundles, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { expect } from "@playwright/test";
import { loggedClick, timestamp } from "./helpers/behaviour-helpers.js";

if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
  dotenvConfigIfNotBlank({ path: ".env.test" });
} else {
  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/business-subscription-behaviour-test";

const originalEnv = { ...process.env };

const serverPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3500);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
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

/**
 * Request Business bundle (subscription-based)
 */
async function requestBusinessBundle(page, screenshotPath) {
  await test.step("The user requests a business bundle (subscription)", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-request-business-bundle.png` });
    let requestBusinessLocator = page.getByRole("button", { name: "Request Business" });
    if (!(await requestBusinessLocator.isVisible())) {
      for (let i = 0; i < 5; i++) {
        console.log(`"Request Business" button not visible, waiting 1000ms and trying again (${i + 1}/5)`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-request-business-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-request-business-bundle-waited.png` });
        requestBusinessLocator = page.getByRole("button", { name: "Request Business" });
        if (await requestBusinessLocator.isVisible()) {
          break;
        }
      }
    }

    // Check if already added
    if (!(await requestBusinessLocator.isVisible())) {
      const addedLocator = page.getByRole("button", { name: "Added ✓ Business" });
      if (await addedLocator.isVisible()) {
        console.log("Business bundle already present, skipping request.");
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-request-business-bundle-skipping.png` });
        return;
      }
    }

    await loggedClick(page, "button:has-text('Request Business')", "Request Business");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-request-business-bundle-clicked.png` });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-request-business-bundle.png` });

    // In test mode without Stripe, the bundle should be granted
    // In production, would need actual Stripe subscription
    await expect(page.getByRole("button", { name: "Added ✓ Business" })).toBeVisible({ timeout: 16000 });
    console.log("Business bundle added successfully");
  });
}

test("Click through: Subscribing to Business bundle", async ({ page }) => {
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
  await clearBundles(page, screenshotPath);

  // Request the business bundle (subscription-based)
  await requestBusinessBundle(page, screenshotPath);

  // Verify the business bundle is listed
  await test.step("Verify business bundle is listed in active bundles", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-verify-business-bundle.png` });
    const addedButton = page.getByRole("button", { name: "Added ✓ Business" });
    await expect(addedButton).toBeVisible({ timeout: 10000 });
    console.log("Business bundle verified in active bundles");
  });

  await goToHomePage(page, screenshotPath);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});
