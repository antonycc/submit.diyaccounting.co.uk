// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/help.behaviour.test.js

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
  loggedFill,
  loggedGoto,
  timestamp,
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
const baseUrlRaw = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const testDynamoDb = getEnvVarAndLog("testDynamoDb", "TEST_DYNAMODB", null);
const dynamoDbPort = getEnvVarAndLog("dynamoDbPort", "TEST_DYNAMODB_PORT", 8000);

// Normalize baseUrl - remove trailing slash to prevent double slashes in URL construction
const baseUrl = baseUrlRaw ? baseUrlRaw.replace(/\/+$/, "") : "";

// Screenshot path for help page tests
const screenshotPath = "target/behaviour-test-results/screenshots/help-behaviour-test";

let httpServer, proxyProcess, mockOAuth2Process, dynamoDbProcess;

/**
 * Help Page Behaviour Tests
 *
 * These tests verify that the Help & FAQ page functions correctly:
 * 1. FAQs are loaded and displayed
 * 2. Search functionality works
 * 3. FAQ accordion expands/collapses
 * 4. Support modal opens and closes
 * 5. Support form can be filled out
 */

test.describe("Help Page - FAQs and Support Form", () => {
  test.beforeAll(async () => {
    console.log("\n Setting up test environment for help page tests...\n");
    console.log(` Base URL (raw): ${baseUrlRaw}`);
    console.log(` Base URL (normalized): ${baseUrl}`);
    console.log(` Environment: ${envName}`);
    console.log(` Screenshot path: ${screenshotPath}`);

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

    console.log("\n Test environment ready\n");
  });

  test.afterAll(async () => {
    console.log("\n Cleaning up test environment...\n");

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
    console.log(" Cleanup complete\n");
  });

  test("Navigate to help page and verify FAQ functionality", async ({ page }) => {
    // Add comprehensive page logging
    addOnPageLogging(page);

    // Additional response logging for debugging
    page.on("response", async (response) => {
      const status = response.status();
      const url = response.url();
      if (status >= 400) {
        console.log(`[HTTP ERROR] Status ${status} for ${url}`);
      }
    });

    // ============================================================
    // STEP 1: Navigate to Help Page
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Navigate to Help Page");
    console.log("=".repeat(60));

    // Set header to bypass ngrok browser warning page (for local proxy testing)
    await page.setExtraHTTPHeaders({
      "ngrok-skip-browser-warning": "any value",
    });

    const helpUrl = `${baseUrl}/help/index.html`;
    console.log(` Navigating to help page: ${helpUrl}`);
    await page.goto(helpUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-help-page.png` });

    // Check page loaded
    const helpTitle = await page.title();
    console.log(` Help page title: "${helpTitle}"`);
    expect(helpTitle).toMatch(/Help.*FAQ/i);
    console.log(" Help page loaded successfully");

    // ============================================================
    // STEP 2: Verify FAQs are loaded
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Verify FAQs are loaded");
    console.log("=".repeat(60));

    // Wait for FAQ list to be populated
    const faqList = page.locator("#faq-list");
    await expect(faqList).toBeVisible({ timeout: 10000 });

    // Wait for at least one FAQ item to appear
    const faqItems = page.locator(".faq-item");
    await expect(faqItems.first()).toBeVisible({ timeout: 10000 });

    const faqCount = await faqItems.count();
    console.log(` Found ${faqCount} FAQ items`);
    expect(faqCount).toBeGreaterThan(0);
    console.log(" FAQs loaded successfully");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-faqs-loaded.png` });

    // ============================================================
    // STEP 3: Test FAQ accordion expand/collapse
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Test FAQ accordion expand/collapse");
    console.log("=".repeat(60));

    // Click first FAQ question to expand
    const firstFaqQuestion = page.locator(".faq-question").first();
    await expect(firstFaqQuestion).toBeVisible();
    console.log(" Clicking first FAQ to expand...");

    await firstFaqQuestion.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-faq-expanded.png` });

    // Verify the answer is now visible
    const firstFaqAnswer = page.locator(".faq-answer").first();
    await expect(firstFaqAnswer).toBeVisible({ timeout: 5000 });
    console.log(" First FAQ expanded - answer is visible");

    // Verify aria-expanded is true
    const ariaExpanded = await firstFaqQuestion.getAttribute("aria-expanded");
    expect(ariaExpanded).toBe("true");
    console.log(" aria-expanded attribute is 'true'");

    // Click again to collapse
    console.log(" Clicking first FAQ to collapse...");
    await firstFaqQuestion.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-faq-collapsed.png` });

    // Verify the answer is now hidden
    await expect(firstFaqAnswer).toBeHidden({ timeout: 5000 });
    console.log(" First FAQ collapsed - answer is hidden");

    // ============================================================
    // STEP 4: Test search functionality
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: Test search functionality");
    console.log("=".repeat(60));

    const searchInput = page.locator("#faq-search");
    await expect(searchInput).toBeVisible();

    // Search for a specific term that should match some FAQs
    console.log(" Searching for 'VAT'...");
    await searchInput.fill("VAT");
    await page.waitForTimeout(300); // Wait for debounce
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-search-vat.png` });

    // Check that results are filtered
    const searchHint = page.locator("#search-hint");
    const hintText = await searchHint.textContent();
    console.log(` Search hint: "${hintText}"`);
    expect(hintText).toMatch(/\d+ result|Showing top FAQs/);
    console.log(" Search functionality works");

    // Clear search
    console.log(" Clearing search...");
    await searchInput.fill("");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-search-cleared.png` });

    const clearedHint = await searchHint.textContent();
    expect(clearedHint).toMatch(/Showing top FAQs/);
    console.log(" Search cleared - showing all FAQs again");

    // ============================================================
    // STEP 5: Test support modal
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 5: Test support modal open/close");
    console.log("=".repeat(60));

    const supportModal = page.locator("#support-modal");
    const openSupportBtn = page.locator("#open-support-form");

    // Verify modal is initially hidden
    await expect(supportModal).toBeHidden();
    console.log(" Support modal is initially hidden");

    // Click to open modal
    console.log(" Opening support modal...");
    await expect(openSupportBtn).toBeVisible();
    await openSupportBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-modal-opened.png` });

    // Verify modal is now visible
    await expect(supportModal).toBeVisible({ timeout: 5000 });
    console.log(" Support modal is now visible");

    // Verify form elements are present
    const subjectInput = page.locator("#support-subject");
    const descriptionTextarea = page.locator("#support-description");
    const categorySelect = page.locator("#support-category");
    const submitBtn = page.locator('#support-form button[type="submit"]');
    const cancelBtn = page.locator("#cancel-support");

    await expect(subjectInput).toBeVisible();
    await expect(descriptionTextarea).toBeVisible();
    await expect(categorySelect).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();
    console.log(" All form elements are visible");

    // Test cancel button
    console.log(" Clicking cancel to close modal...");
    await cancelBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-modal-closed.png` });

    // Verify modal is hidden again
    await expect(supportModal).toBeHidden({ timeout: 5000 });
    console.log(" Modal closed successfully via cancel button");

    // ============================================================
    // STEP 6: Test support form fill
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 6: Test support form fill");
    console.log("=".repeat(60));

    // Reopen modal
    console.log(" Reopening support modal...");
    await openSupportBtn.click();
    await page.waitForTimeout(300);
    await expect(supportModal).toBeVisible({ timeout: 5000 });

    // Fill form fields
    console.log(" Filling form fields...");
    await subjectInput.fill("Test support request");
    await descriptionTextarea.fill("This is a test description for the support form behavior test.");
    await categorySelect.selectOption("other");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-form-filled.png` });

    // Verify fields are filled
    const subjectValue = await subjectInput.inputValue();
    const descriptionValue = await descriptionTextarea.inputValue();
    const categoryValue = await categorySelect.inputValue();

    expect(subjectValue).toBe("Test support request");
    expect(descriptionValue).toContain("test description");
    expect(categoryValue).toBe("other");
    console.log(" Form fields filled correctly");

    // Test Escape key closes modal
    console.log(" Testing Escape key closes modal...");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-10-modal-closed-escape.png` });

    await expect(supportModal).toBeHidden({ timeout: 5000 });
    console.log(" Modal closed successfully via Escape key");

    // ============================================================
    // STEP 7: Final summary
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("TEST COMPLETE - All help page functionality verified");
    console.log("=".repeat(60));

    console.log("\n Summary:");
    console.log("   Help page accessible and loads FAQs");
    console.log("   FAQ accordion expand/collapse works");
    console.log("   FAQ search functionality works");
    console.log("   Support modal opens and closes correctly");
    console.log("   Support form fields can be filled");
    console.log("   Escape key closes the modal\n");
  });
});
