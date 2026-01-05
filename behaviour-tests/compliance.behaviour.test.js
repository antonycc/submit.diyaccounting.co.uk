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
} from "./helpers/behaviour-helpers.js";

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

let httpServer, proxyProcess, mockOAuth2Process, dynamoDbProcess;

/**
 * HMRC MTD Compliance Behaviour Tests
 *
 * These tests verify that the application meets HMRC's production approval requirements
 * for privacy, terms of use, and data handling documentation.
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

  test("Privacy Policy page is accessible and contains required GDPR elements", async ({ page }) => {
    await addOnPageLogging(page);

    console.log("📄 Navigating to Privacy Policy...");
    await page.goto(`${baseUrl}/privacy.html`);

    // Verify page loads
    await expect(page).toHaveTitle(/Privacy Policy/);
    console.log("✅ Privacy Policy page loaded");

    // Check for key GDPR elements
    const pageContent = await page.content();

    // Data retention section
    expect(pageContent).toContain("Data retention");
    console.log("✅ Data retention section present");

    // User rights section
    expect(pageContent).toContain("Your data rights");
    expect(pageContent).toContain("Right of access");
    expect(pageContent).toContain("Right to erasure");
    expect(pageContent).toContain("Right to data portability");
    console.log("✅ GDPR user rights documented");

    // Contact information
    expect(pageContent).toContain("admin@diyaccounting.co.uk");
    console.log("✅ Contact information present");

    // Security incidents
    expect(pageContent).toContain("Security incidents");
    expect(pageContent).toContain("72 hours");
    console.log("✅ Security incident notification process documented");

    // Data processors
    expect(pageContent).toContain("Data processors");
    expect(pageContent).toContain("Amazon Web Services");
    console.log("✅ Data processors disclosed");

    // Specific retention periods
    expect(pageContent).toContain("7 years"); // HMRC receipts
    expect(pageContent).toContain("30 days"); // Bundles deletion
    console.log("✅ Specific retention periods documented");
  });

  test("Terms of Use page is accessible and contains required HMRC compliance elements", async ({ page }) => {
    await addOnPageLogging(page);

    console.log("📄 Navigating to Terms of Use...");
    await page.goto(`${baseUrl}/terms.html`);

    // Verify page loads
    await expect(page).toHaveTitle(/Terms of Use/);
    console.log("✅ Terms of Use page loaded");

    const pageContent = await page.content();

    // Service description
    expect(pageContent).toContain("Service Description");
    expect(pageContent).toContain("Making Tax Digital");
    console.log("✅ Service description present");

    // HMRC integration and OAuth
    expect(pageContent).toContain("HMRC Integration");
    expect(pageContent).toContain("OAuth");
    console.log("✅ HMRC OAuth integration documented");

    // Data processing and privacy
    expect(pageContent).toContain("Data Processing and Privacy");
    expect(pageContent).toContain("UK GDPR");
    expect(pageContent).toContain("encrypted");
    console.log("✅ Data processing and encryption documented");

    // Fraud prevention headers
    expect(pageContent).toContain("Fraud Prevention Headers");
    console.log("✅ Fraud prevention headers explained");

    // Data retention
    expect(pageContent).toContain("Data Retention");
    expect(pageContent).toContain("7 years"); // HMRC receipts
    console.log("✅ Data retention policy documented");

    // Security incidents
    expect(pageContent).toContain("Security Incidents");
    expect(pageContent).toContain("72 hours");
    console.log("✅ Security incident notification in terms");

    // Contact information
    expect(pageContent).toContain("admin@diyaccounting.co.uk");
    console.log("✅ Contact information in terms");

    // Governing law
    expect(pageContent).toContain("Governing Law");
    expect(pageContent).toContain("England and Wales");
    console.log("✅ Governing law specified");

    // Server location (HMRC requirement)
    expect(pageContent).toContain("EU West") || expect(pageContent).toContain("London");
    console.log("✅ Server location disclosed");
  });

  test("Home page contains links to Privacy Policy and Terms of Use", async ({ page }) => {
    await addOnPageLogging(page);

    console.log("🏠 Navigating to home page...");
    await page.goto(`${baseUrl}/`);

    await expect(page).toHaveTitle(/DIY Accounting Submit/);
    console.log("✅ Home page loaded");

    // Check footer for privacy and terms links
    const privacyLink = page.locator('footer a[href="privacy.html"]');
    await expect(privacyLink).toBeVisible();
    console.log("✅ Privacy link visible in footer");

    const termsLink = page.locator('footer a[href="terms.html"]');
    await expect(termsLink).toBeVisible();
    console.log("✅ Terms link visible in footer");

    // Verify links are clickable
    await expect(privacyLink).toHaveAttribute("href", "privacy.html");
    await expect(termsLink).toHaveAttribute("href", "terms.html");
    console.log("✅ Links have correct href attributes");
  });

  test("About page contains links to Privacy Policy and Terms of Use", async ({ page }) => {
    await addOnPageLogging(page);

    console.log("📖 Navigating to about page...");
    await page.goto(`${baseUrl}/about.html`);

    await expect(page).toHaveTitle(/About/);
    console.log("✅ About page loaded");

    // Check footer for privacy and terms links
    const privacyLink = page.locator('footer a[href="privacy.html"]');
    await expect(privacyLink).toBeVisible();
    console.log("✅ Privacy link visible in footer");

    const termsLink = page.locator('footer a[href="terms.html"]');
    await expect(termsLink).toBeVisible();
    console.log("✅ Terms link visible in footer");
  });

  test("Privacy and Terms pages are linked to each other", async ({ page }) => {
    await addOnPageLogging(page);

    console.log("🔗 Checking cross-links between Privacy and Terms...");

    // Start at Privacy Policy
    await page.goto(`${baseUrl}/privacy.html`);
    const termsLinkFromPrivacy = page.locator('a[href="./terms.html"], footer a[href="./terms.html"]');
    await expect(termsLinkFromPrivacy.first()).toBeVisible();
    console.log("✅ Terms link visible from Privacy page");

    // Navigate to Terms of Use
    await page.goto(`${baseUrl}/terms.html`);
    const privacyLinkFromTerms = page.locator('a[href="./privacy.html"], footer a[href="./privacy.html"]');
    await expect(privacyLinkFromTerms.first()).toBeVisible();
    console.log("✅ Privacy link visible from Terms page");
  });

  test("Privacy Policy mentions data export and deletion rights with contact email", async ({ page }) => {
    await addOnPageLogging(page);

    await page.goto(`${baseUrl}/privacy.html`);

    const pageContent = await page.content();

    // Check for data subject rights
    expect(pageContent).toContain("admin@diyaccounting.co.uk");
    expect(pageContent).toContain("export");
    expect(pageContent).toContain("delete");
    expect(pageContent).toContain("30 days"); // Response time

    console.log("✅ Data export/deletion rights documented with contact");
  });

  test("Terms of Use mentions user can request account deletion", async ({ page }) => {
    await addOnPageLogging(page);

    await page.goto(`${baseUrl}/terms.html`);

    const pageContent = await page.content();

    // Check for termination/deletion section
    expect(pageContent).toContain("Termination");
    expect(pageContent).toContain("admin@diyaccounting.co.uk");
    expect(pageContent).toContain("delete");

    console.log("✅ Account deletion process documented in terms");
  });

  test("Privacy and Terms pages have recent 'Last updated' dates", async ({ page }) => {
    await addOnPageLogging(page);

    // Check Privacy Policy
    await page.goto(`${baseUrl}/privacy.html`);
    let pageText = await page.textContent("body");
    expect(pageText).toContain("Last updated:");
    // Should be recent (2024 or later)
    expect(pageText).toMatch(/Last updated:.*202[4-9]/);
    console.log("✅ Privacy Policy has recent last updated date");

    // Check Terms of Use
    await page.goto(`${baseUrl}/terms.html`);
    pageText = await page.textContent("body");
    expect(pageText).toContain("Last updated:");
    expect(pageText).toMatch(/Last updated:.*202[4-9]/);
    console.log("✅ Terms of Use has recent last updated date");
  });
});
