// behaviour-tests/compliance.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  runLocalSslProxy,
  loggedClick,
  loggedGoto,
} from "./helpers/behaviour-helpers.js";
import { ensureDirSync } from "fs-extra";

dotenvConfigIfNotBlank({ path: ".env" });

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const testDynamoDb = getEnvVarAndLog("testDynamoDb", "TEST_DYNAMODB", null);
const dynamoDbPort = getEnvVarAndLog("dynamoDbPort", "TEST_DYNAMODB_PORT", 8000);

// Screenshot path for compliance tests
const screenshotPath = "target/behaviour-test-results/screenshots/compliance-behaviour-test";

let httpServer, proxyProcess, mockOAuth2Process, dynamoDbProcess;

/**
 * HMRC MTD Compliance Behaviour Tests
 *
 * These tests verify that the application meets HMRC's production approval requirements
 * for privacy, terms of use, and data handling documentation.
 *
 * This is a single navigating test that:
 * 1. Starts at the home page
 * 2. Clicks through to Privacy Policy and Terms of Use pages
 * 3. Verifies all required compliance elements are present
 * 4. Verifies navigation links work correctly
 *
 * Requirements tested:
 * - Privacy policy URL is accessible
 * - Terms of use URL is accessible
 * - Links to privacy and terms are present on all major pages
 * - Privacy policy contains required GDPR elements
 * - Terms of use contains required HMRC compliance elements
 */

test.describe("HMRC MTD Compliance - Privacy and Terms", () => {
  test.beforeAll(async () => {
    console.log("\n🧪 Setting up test environment for compliance tests...\n");
    console.log(`📍 Base URL: ${baseUrl}`);
    console.log(`📍 Environment: ${envName}`);
    console.log(`📍 Screenshot path: ${screenshotPath}`);

    // Ensure screenshot directory exists
    ensureDirSync(screenshotPath);

    if (testAuthProvider === "mock" && runMockOAuth2 === "run") {
      mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
    }

    if (testDynamoDb === "run") {
      dynamoDbProcess = await runLocalDynamoDb(testDynamoDb);
    }

    if (runTestServer === "run") {
      httpServer = await runLocalHttpServer(runTestServer, httpServerPort);
    }

    if (runProxy === "run") {
      proxyProcess = await runLocalSslProxy(runProxy, httpServerPort, baseUrl);
    }

    console.log("\n✅ Test environment ready\n");
  });

  test.afterAll(async () => {
    console.log("\n🧹 Cleaning up test environment...\n");

    if (httpServer) {
      httpServer.kill();
    }
    if (proxyProcess) {
      proxyProcess.kill();
    }
    if (mockOAuth2Process) {
      mockOAuth2Process.kill();
    }
    if (dynamoDbProcess && dynamoDbProcess.stop) {
      await dynamoDbProcess.stop();
    }

    Object.assign(process.env, originalEnv);
    console.log("✅ Cleanup complete\n");
  });

  test("Navigate through compliance pages from home and verify all HMRC requirements", async ({ page }) => {
    // Enable verbose HTTP logging for diagnosing 403 errors
    const originalVerboseHttp = process.env.TEST_VERBOSE_HTTP_LOGS;
    process.env.TEST_VERBOSE_HTTP_LOGS = "true";

    // Add comprehensive page logging
    addOnPageLogging(page);

    // Additional response logging to catch 403 errors with details
    page.on("response", async (response) => {
      const status = response.status();
      const url = response.url();
      console.log(`[HTTP RESPONSE] ${status} ${url}`);
      if (status >= 400) {
        console.log(`[HTTP ERROR] Status ${status} for ${url}`);
        try {
          const body = await response.text();
          console.log(`[HTTP ERROR BODY] ${body.substring(0, 500)}`);
        } catch (e) {
          console.log(`[HTTP ERROR BODY] Could not read body: ${e.message}`);
        }
      }
    });

    // ============================================================
    // STEP 1: Navigate to Home Page
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Navigate to Home Page");
    console.log("=".repeat(60));

    const homeUrl = `${baseUrl}/`;
    console.log(`🏠 Navigating to home page: ${homeUrl}`);
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.screenshot({ path: `${screenshotPath}/01-home-page.png` });

    // Check page loaded
    const homeTitle = await page.title();
    console.log(`📄 Home page title: "${homeTitle}"`);
    expect(homeTitle).toMatch(/DIY Accounting Submit/i);
    console.log("✅ Home page loaded successfully");

    // Verify privacy and terms links exist in footer
    console.log("\n📋 Checking footer links on home page...");
    const privacyLinkHome = page.locator('footer a[href="privacy.html"]');
    const termsLinkHome = page.locator('footer a[href="terms.html"]');

    await expect(privacyLinkHome).toBeVisible({ timeout: 5000 });
    console.log("✅ Privacy link visible in home page footer");

    await expect(termsLinkHome).toBeVisible({ timeout: 5000 });
    console.log("✅ Terms link visible in home page footer");

    // ============================================================
    // STEP 2: Click to Privacy Policy page
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Navigate to Privacy Policy via footer link");
    console.log("=".repeat(60));

    console.log("🖱️ Clicking Privacy Policy link in footer...");
    await privacyLinkHome.click();
    await page.waitForLoadState("domcontentloaded");
    await page.screenshot({ path: `${screenshotPath}/02-privacy-page.png` });

    // Verify Privacy Policy page loaded
    const privacyTitle = await page.title();
    console.log(`📄 Privacy page title: "${privacyTitle}"`);
    expect(privacyTitle).toMatch(/Privacy Policy/i);
    console.log("✅ Privacy Policy page loaded successfully");

    // Check Privacy Policy content for GDPR requirements
    console.log("\n📋 Checking Privacy Policy GDPR requirements...");
    const privacyContent = await page.content();

    expect(privacyContent).toContain("Data retention");
    console.log("✅ Data retention section present");

    expect(privacyContent).toContain("Your data rights");
    expect(privacyContent).toContain("Right of access");
    expect(privacyContent).toContain("Right to erasure");
    expect(privacyContent).toContain("Right to data portability");
    console.log("✅ GDPR user rights documented");

    expect(privacyContent).toContain("admin@diyaccounting.co.uk");
    console.log("✅ Contact information present");

    expect(privacyContent).toContain("Security incidents");
    expect(privacyContent).toContain("72 hours");
    console.log("✅ Security incident notification process documented");

    expect(privacyContent).toContain("Data processors");
    expect(privacyContent).toContain("Amazon Web Services");
    console.log("✅ Data processors disclosed");

    expect(privacyContent).toContain("7 years");
    expect(privacyContent).toContain("30 days");
    console.log("✅ Specific retention periods documented");

    expect(privacyContent).toContain("export");
    expect(privacyContent).toContain("delete");
    console.log("✅ Data export/deletion rights documented");

    // Check Last Updated date
    const privacyText = await page.textContent("body");
    expect(privacyText).toContain("Last updated:");
    expect(privacyText).toMatch(/Last updated:.*202[4-9]/);
    console.log("✅ Privacy Policy has recent last updated date");

    // Check link to Terms from Privacy page
    const termsLinkFromPrivacy = page.locator('a[href="./terms.html"], footer a[href="terms.html"]').first();
    await expect(termsLinkFromPrivacy).toBeVisible({ timeout: 5000 });
    console.log("✅ Terms link visible from Privacy page");

    // ============================================================
    // STEP 3: Navigate to Terms of Use page
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Navigate to Terms of Use via link");
    console.log("=".repeat(60));

    console.log("🖱️ Clicking Terms of Use link...");
    await termsLinkFromPrivacy.click();
    await page.waitForLoadState("domcontentloaded");
    await page.screenshot({ path: `${screenshotPath}/03-terms-page.png` });

    // Verify Terms page loaded
    const termsTitle = await page.title();
    console.log(`📄 Terms page title: "${termsTitle}"`);
    expect(termsTitle).toMatch(/Terms of Use/i);
    console.log("✅ Terms of Use page loaded successfully");

    // Check Terms of Use content for HMRC requirements
    console.log("\n📋 Checking Terms of Use HMRC requirements...");
    const termsContent = await page.content();

    expect(termsContent).toContain("Service Description");
    expect(termsContent).toContain("Making Tax Digital");
    console.log("✅ Service description present");

    expect(termsContent).toContain("HMRC Integration");
    expect(termsContent).toContain("OAuth");
    console.log("✅ HMRC OAuth integration documented");

    expect(termsContent).toContain("Data Processing and Privacy");
    expect(termsContent).toContain("UK GDPR");
    expect(termsContent).toContain("encrypted");
    console.log("✅ Data processing and encryption documented");

    expect(termsContent).toContain("Fraud Prevention Headers");
    console.log("✅ Fraud prevention headers explained");

    expect(termsContent).toContain("Data Retention");
    expect(termsContent).toContain("7 years");
    console.log("✅ Data retention policy documented");

    expect(termsContent).toContain("Security Incidents");
    expect(termsContent).toContain("72 hours");
    console.log("✅ Security incident notification in terms");

    expect(termsContent).toContain("admin@diyaccounting.co.uk");
    console.log("✅ Contact information in terms");

    expect(termsContent).toContain("Governing Law");
    expect(termsContent).toContain("England and Wales");
    console.log("✅ Governing law specified");

    expect(termsContent).toContain("Termination");
    expect(termsContent).toContain("delete");
    console.log("✅ Account deletion process documented in terms");

    // Check Last Updated date
    const termsText = await page.textContent("body");
    expect(termsText).toContain("Last updated:");
    expect(termsText).toMatch(/Last updated:.*202[4-9]/);
    console.log("✅ Terms of Use has recent last updated date");

    // Check link back to Privacy from Terms page
    const privacyLinkFromTerms = page.locator('a[href="./privacy.html"], footer a[href="privacy.html"]').first();
    await expect(privacyLinkFromTerms).toBeVisible({ timeout: 5000 });
    console.log("✅ Privacy link visible from Terms page");

    // ============================================================
    // STEP 4: Navigate to About page and verify footer links
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: Navigate to About page");
    console.log("=".repeat(60));

    const aboutUrl = `${baseUrl}/about.html`;
    console.log(`📖 Navigating to about page: ${aboutUrl}`);
    await page.goto(aboutUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.screenshot({ path: `${screenshotPath}/04-about-page.png` });

    const aboutTitle = await page.title();
    console.log(`📄 About page title: "${aboutTitle}"`);
    expect(aboutTitle).toMatch(/About/i);
    console.log("✅ About page loaded successfully");

    // Verify footer links on About page
    console.log("\n📋 Checking footer links on About page...");
    const privacyLinkAbout = page.locator('footer a[href="privacy.html"]');
    const termsLinkAbout = page.locator('footer a[href="terms.html"]');

    await expect(privacyLinkAbout).toBeVisible({ timeout: 5000 });
    console.log("✅ Privacy link visible in About page footer");

    await expect(termsLinkAbout).toBeVisible({ timeout: 5000 });
    console.log("✅ Terms link visible in About page footer");

    // ============================================================
    // STEP 5: Final summary
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("TEST COMPLETE - All HMRC compliance requirements verified");
    console.log("=".repeat(60));

    console.log("\n📊 Summary:");
    console.log("  ✅ Home page accessible with footer links");
    console.log("  ✅ Privacy Policy page accessible with all GDPR elements");
    console.log("  ✅ Terms of Use page accessible with all HMRC elements");
    console.log("  ✅ About page accessible with footer links");
    console.log("  ✅ Cross-navigation between pages works");
    console.log("  ✅ All 'Last updated' dates are recent\n");

    // Restore original env
    process.env.TEST_VERBOSE_HTTP_LOGS = originalVerboseHttp;
  });
});
