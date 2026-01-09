// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/behaviour-hmrc-vat-steps.js

import { expect, test } from "@playwright/test";
import {
  loggedClick,
  loggedFill,
  loggedGoto,
  loggedFocus,
  loggedSelectOption,
  timestamp,
  isSandboxMode,
} from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-hmrc-vat-steps";

export async function initSubmitVat(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = isSandboxMode() ? "Submit VAT (HMRC Sandbox)" : "Submit VAT (HMRC)";
  await test.step(`The user begins a VAT return and sees the ${activityButtonText} form`, async () => {
    // Click "VAT Return Submission" on activities page
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-start-submission.png` });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting VAT return submission", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-start-submission.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-start-submission.png` });
    await expect(page.locator("#vatSubmissionForm")).toBeVisible();
  });
}

export async function fillInVat(
  page,
  hmrcVatNumber,
  hmrcVatPeriodKey,
  hmrcVatDueAmount,
  testScenario = null,
  runFraudPreventionHeaderValidation = false,
  screenshotPath = defaultScreenshotPath,
) {
  await test.step("The user completes the VAT form with valid values and sees the Submit button", async () => {
    // Check if we're in sandbox mode and can use test data link
    const testDataLink = page.locator("#testDataLink.visible");
    const isTestDataLinkVisible = await testDataLink.isVisible().catch(() => false);

    if (isSandboxMode() && isTestDataLinkVisible) {
      // Use the "add test data" link in sandbox mode
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-fill-in-vat-click-test-data.png` });
      await loggedClick(page, "#testDataLink a", "Clicking add test data link", { screenshotPath });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-fill-in-vat-test-data-added.png` });

      // Verify fields are populated
      await expect(page.locator("#vatNumber")).not.toHaveValue("");
      await expect(page.locator("#periodKey")).not.toHaveValue("");
      await expect(page.locator("#vatDue")).not.toHaveValue("");
    }

    // Fill out the VAT form manually using the correct field IDs from submitVat.html
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-fill-in-vat-submission.png` });
    await page.waitForTimeout(100);
    await loggedFill(page, "#vatNumber", hmrcVatNumber, "Entering VAT number", { screenshotPath });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-fill-in-vat-filled.png` });
    await loggedFill(page, "#periodKey", hmrcVatPeriodKey, "Entering period key", { screenshotPath });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-fill-in-vat-filled.png` });
    await loggedFill(page, "#vatDue", hmrcVatDueAmount, "Entering VAT due amount", { screenshotPath });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-fill-in-vat-filled.png` });

    if (testScenario || runFraudPreventionHeaderValidation) {
      await loggedClick(page, "button:has-text('Show Developer Options')", "Show Developer Options", {
        screenshotPath,
      });
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-fill-in-vat-clicked-options.png` });
      if (testScenario) {
        await loggedSelectOption(page, "#testScenario", String(testScenario), "a developer test scenario", {
          screenshotPath,
        });
      }
      if (runFraudPreventionHeaderValidation) {
        await page.locator("#runFraudPreventionHeaderValidation").check();
        console.log("Checked runFraudPreventionHeaderValidation checkbox");
      }
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-fill-in-vat-selected-scenario.png` });
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-fill-in-vat-options-shown.png` });
    }
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-fill-in-vat-submission.png` });
    await expect(page.locator("#submitBtn")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-10-fill-in-submission-pagedown.png` });
  });
}

export async function submitFormVat(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the VAT form and reviews the HMRC permission page", async () => {
    // Focus change before submit
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submission-submit.png` });
    await loggedFocus(page, "#submitBtn", "the Submit button", { screenshotPath });
    // Expect the HMRC permission page to be visible
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-submission-submit-focused.png` });
    await loggedClick(page, "#submitBtn", "Submitting VAT form", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-submission-submit.png` });
    const applicationName = "DIY Accounting Submit";
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-submission-submit.png` });
    await expect(page.locator("#appNameParagraph")).toContainText(applicationName, { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Continue" })).toContainText("Continue");
  });
}

export async function completeVat(page, baseUrl, testScenario = null, screenshotPath = defaultScreenshotPath) {
  if (testScenario && testScenario !== "SUBMIT_HMRC_API_HTTP_SLOW_10S") {
    await test.step("The user sees a submission error message for sandbox scenario", async () => {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-verify-vat-error.png` });
      const statusContainer = page.locator("#statusMessagesContainer");
      // Increase timeout and wait for terminal status (failed or error)
      await expect(statusContainer).toContainText(/failed|error/i, { timeout: 1_000_000 });
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-verify-vat-error.png` });
      await expect(page.locator("#receiptDisplay")).toBeHidden();
    });
  } else {
    await test.step(
      "The user waits for the VAT submission to complete and for the receipt to appear",
      async () => {
        // Wait for the submission process to complete and receipt to be displayed
        console.log("Waiting for VAT submission to complete and receipt to be displayed...");
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-complete-vat-waiting.png` });

        // Check current page URL and elements
        console.log(`Current URL: ${page.url()}`);

        // Check if page has loaded correctly
        const pageTitle = await page.title();
        console.log(`Page title: ${pageTitle}`);

        // Wait for the page to be fully loaded
        await page.waitForLoadState("networkidle");

        // Check if basic DOM elements exist
        const bodyExists = await page.locator("body").count();
        console.log(`Body element exists: ${bodyExists > 0}`);

        const mainContentExists = await page.locator("#mainContent").count();
        console.log(`Main content element exists: ${mainContentExists > 0}`);

        const receiptExists = await page.locator("#receiptDisplay").count();
        console.log(`Receipt element exists: ${receiptExists > 0}`);

        if (receiptExists > 0) {
          await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-complete-vat-receipt.png` });
          const receiptStyle = await page.locator("#receiptDisplay").getAttribute("style");
          console.log(`Receipt element style: ${receiptStyle}`);
        }

        const formExists = await page.locator("#vatForm").count();
        console.log(`Form element exists: ${formExists > 0}`);

        if (formExists > 0) {
          await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-complete-vat-form.png` });
          const formStyle = await page.locator("#vatForm").getAttribute("style");
          console.log(`Form element style: ${formStyle}`);
          const receiptVisible = await page.locator("#receiptDisplay").isVisible();
          console.log(`Receipt element visible: ${receiptVisible}`);
        }

        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-complete-vat-waiting.png` });

        // Scroll, capture a pagedown
        await page.keyboard.press("PageDown");
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-complete-vat-pagedown.png` });

        // if (checkServersAreRunning) {
        //  await checkServersAreRunning();
        // }

        // If elements don't exist, try to navigate back to the correct page
        if (receiptExists === 0 && formExists === 0) {
          console.log("DOM elements missing, checking if we need to reload the page...");
          const currentUrl = page.url();
          const maybeSlash = baseUrl.endsWith("/") ? "" : "/";
          if (!currentUrl.includes("submitVat.html") && !currentUrl.includes("chrome-error://")) {
            await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-complete-vat-going-back.png` });
            console.log(`Navigating back to submitVat.html from ${currentUrl}`);
            await loggedGoto(page, `${baseUrl}${maybeSlash}activities/submitVat.html`, "back to Submit VAT page", screenshotPath);
            await page.waitForLoadState("networkidle");
          } else if (currentUrl.includes("chrome-error://")) {
            console.log("Chrome error page detected, navigating directly to submitVat.html");
            await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-complete-vat-error.png` });
            await loggedGoto(
              page,
              `${baseUrl}${maybeSlash}activities/submitVat.html`,
              "back to Submit VAT page (from error)",
              screenshotPath,
            );
            await page.waitForLoadState("networkidle");
          }
        }

        await page.waitForSelector("#receiptDisplay", { state: "visible", timeout: 1_000_000 });
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-receipt.png` });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-complete-vat-receipt.png` });
        // Scroll, capture a pagedown
        await page.keyboard.press("PageDown");
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-10-complete-vat-pagedown.png` });
      },
      { timeout: 1_000_000 },
    );
  }
}

export async function verifyVatSubmission(page, testScenario = null, screenshotPath = defaultScreenshotPath) {
  if (testScenario && testScenario !== "SUBMIT_HMRC_API_HTTP_SLOW_10S") {
    await test.step("The user sees a submission error message for sandbox scenario", async () => {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-verify-vat-error.png` });
      const statusContainer = page.locator("#statusMessagesContainer");
      // Increase timeout and wait for terminal status (failed or error)
      await expect(statusContainer).toContainText(/failed|error/i, { timeout: 1_000_000 });
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-verify-vat-error.png` });
      await expect(page.locator("#receiptDisplay")).toBeHidden();
    });
  } else {
    await test.step("The user sees a successful VAT submission receipt and the VAT form is hidden", async () => {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-verify-vat.png` });
      const receiptDisplay = page.locator("#receiptDisplay");
      await expect(receiptDisplay).toBeVisible();

      // Check for the success message
      const successHeader = receiptDisplay.locator("h3");
      await expect(successHeader).toContainText("VAT Return Submitted Successfully");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-verify-vat-submitted.png` });

      // Verify receipt details are populated
      // await expect(page.locator("#formBundleNumber")).toContainText("123456789-bundle");
      // await expect(page.locator("#chargeRefNumber")).toContainText("123456789-charge");
      await expect(page.locator("#processingDate")).not.toBeEmpty();

      // Verify the form is hidden after successful submission
      await expect(page.locator("#vatForm")).toBeHidden();
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-verify-vat.png` });

      // Scroll, capture a pagedown
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-verify-vat-pagedown.png` });

      console.log("VAT submission flow completed successfully");
    });
  }
}

/* VAT Obligations Journey Steps */

export async function initVatObligations(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = isSandboxMode() ? "VAT Obligations (HMRC Sandbox)" : "VAT Obligations (HMRC)";
  await test.step(`The user navigates to ${activityButtonText} and sees the obligations form`, async () => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-obligations.png` });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting VAT Obligations", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-obligations.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-obligations.png` });
    await expect(page.locator("#vatObligationsForm")).toBeVisible();
  });
}

export async function fillInVatObligations(page, obligationsQuery = {}, screenshotPath = defaultScreenshotPath) {
  await test.step("The user fills in the VAT obligations form with VRN and date range", async () => {
    const { hmrcVatNumber, hmrcVatPeriodFromDate, hmrcVatPeriodToDate, status, testScenario, runFraudPreventionHeaderValidation } =
      obligationsQuery || {};
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-obligations-fill-in.png` });

    // Compute a wide date range with likely hits if not provided
    const from = hmrcVatPeriodFromDate || "2018-01-01";
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const to = hmrcVatPeriodToDate || `${yyyy}-${mm}-${dd}`;

    // Check if we're in sandbox mode and can use test data link
    const testDataLink = page.locator("#testDataLink.visible");
    const isTestDataLinkVisible = await testDataLink.isVisible().catch(() => false);

    if (isSandboxMode() && isTestDataLinkVisible) {
      // Use the "add test data" link in sandbox mode
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-obligations-click-test-data.png` });
      await loggedClick(page, "#testDataLink a", "Clicking add test data link", { screenshotPath });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-obligations-test-data-added.png` });

      // Verify fields are populated
      await expect(page.locator("#vrn")).not.toHaveValue("");
      await expect(page.locator("#fromDate")).not.toHaveValue("");
      await expect(page.locator("#toDate")).not.toHaveValue("");
    }

    // Fill out the form manually
    await page.waitForTimeout(100);
    await loggedFill(page, "#vrn", hmrcVatNumber, "Entering VAT registration number", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-obligations-fill-in.png` });
    await page.waitForTimeout(50);
    // Fill optional filters (map to actual form field IDs)
    await loggedFill(page, "#fromDate", from, "Entering from date", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-obligations-fill-in.png` });
    await page.waitForTimeout(50);
    await loggedFill(page, "#toDate", to, "Entering to date", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-obligations-fill-in.png` });
    await page.waitForTimeout(50);

    await loggedFocus(page, "#status", "the obligations status filter", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-obligations-pre-status-fill-in.png` });
    if (status) {
      console.log(`Filling in status filter ${status}`);
      // Accept both label ("Open"/"Fulfilled") and value ("O"/"F")
      const statusValue = String(status) === "Open" ? "O" : String(status) === "Fulfilled" ? "F" : String(status);
      // Scroll, capture a pagedown
      await page.keyboard.press("PageDown");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-obligations-fill-in.png` });
      await loggedSelectOption(page, "#status", statusValue, "obligations status", { screenshotPath });
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-obligations-filled-in.png` });
    }
    if (testScenario || runFraudPreventionHeaderValidation) {
      await loggedClick(page, "button:has-text('Show Developer Options')", "Show Developer Options", {
        screenshotPath,
      });
      // Scroll, capture a pagedown
      await page.keyboard.press("PageDown");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-10-obligations-fill-in.png` });
      if (testScenario) {
        await loggedSelectOption(page, "#testScenario", String(testScenario), "a developer test scenario", {
          screenshotPath,
        });
      }
      if (runFraudPreventionHeaderValidation) {
        await page.locator("#runFraudPreventionHeaderValidation").check();
        console.log("Checked runFraudPreventionHeaderValidation checkbox");
      }
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-11-obligations-filled-in.png` });
    }

    await page.waitForTimeout(300);
    // Scroll, capture a pagedown
    await page.keyboard.press("PageUp");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-12-obligations-fill-in.png` });
    // Scroll, capture a pagedown
    await page.keyboard.press("PageDown");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-13-obligations-fill-in-pagedown.png` });
    await expect(page.locator("#retrieveBtn")).toBeVisible();
  });
}

export async function submitVatObligationsForm(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the VAT obligations form", async () => {
    // Take a focus change screenshot between last cell entry and submit
    await loggedFocus(page, "#retrieveBtn", "Retrieve button", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-obligations-submit.png` });
    await loggedClick(page, "#retrieveBtn", "Submitting VAT obligations form", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-obligations-submit.png` });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-obligations-submit.png` });
    // Scroll, capture a pagedown
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-obligations-submit-pagedown.png` });
  });
}

export async function verifyVatObligationsResults(page, obligationsQuery, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees VAT obligations results displayed", async () => {
    // Back-compat: support verifyVatObligationsResults(page, screenshotPath)
    if (arguments.length === 2 && typeof obligationsQuery === "string") {
      screenshotPath = obligationsQuery;
      obligationsQuery = {};
    }
    const { status, testScenario } = obligationsQuery || {};
    const hasScenario = !!testScenario;

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-obligations-results.png` });
    if (hasScenario) {
      switch (testScenario) {
        case "INSOLVENT_TRADER":
        case "NOT_FOUND":
          await page.waitForTimeout(500);
          const obligationsResults = page.locator("#obligationsResults");
          await expect(obligationsResults).toBeHidden();
          break;
      }
      return;
    }
    await page.waitForSelector("#obligationsResults", { state: "visible", timeout: 450_000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-obligations-results.png` });
    const resultsContainer = page.locator("#obligationsResults");
    await expect(resultsContainer).toBeVisible();

    // Verify the table is displayed
    const obligationsTable = page.locator("#obligationsTable");
    await expect(obligationsTable).toBeVisible();

    // Parse table rows into structured data for assertions
    const rowLocator = page.locator("#obligationsTable table tbody tr");
    const rowCount = await rowLocator.count();
    expect(rowCount).toBeGreaterThan(0);

    const rows = [];
    for (let i = 0; i < rowCount; i++) {
      const r = rowLocator.nth(i);
      const periodKey = (await r.locator("td").nth(0).innerText()).trim();
      const start = (await r.locator("td").nth(1).innerText()).trim();
      const end = (await r.locator("td").nth(2).innerText()).trim();
      const due = (await r.locator("td").nth(3).innerText()).trim();
      const statusText = (await r.locator("td").nth(4).innerText()).trim();
      const statusCode = statusText.includes("Open") ? "O" : statusText.includes("Fulfilled") ? "F" : statusText;
      const received = (await r.locator("td").nth(5).innerText()).trim();
      const actionText = (await r.locator("td").nth(6).innerText()).trim();
      rows.push({ periodKey, start, end, due, statusText, statusCode, received, actionText });
    }

    // Generic assertions
    // - periodKey must be present
    for (const r of rows) {
      expect(r.periodKey).toBeTruthy();
    }

    // - If a status filter was provided, all rows should match it
    if (status) {
      const statusValue = String(status) === "Open" ? "O" : String(status) === "Fulfilled" ? "F" : String(status);
      for (const r of rows) {
        expect(r.statusCode, `Expected all rows to have status ${statusValue} but found ${r.statusCode} for ${r.periodKey}`).toBe(
          statusValue,
        );
      }
    }

    // - Action button should reflect status
    for (const r of rows) {
      if (r.statusCode === "F") {
        await expect(rowLocator.nth(rows.indexOf(r)).locator("td").nth(6).getByRole("button")).toHaveText(/View Return/);
        expect(r.actionText).toContain("View Return");
      } else if (r.statusCode === "O") {
        await expect(rowLocator.nth(rows.indexOf(r)).locator("td").nth(6).getByRole("button")).toHaveText(/Submit Return/);
        expect(r.actionText).toContain("Submit Return");
      }
    }

    // Scenario-specific expectations based on Gov-Test-Scenario
    const fulfilledCount = rows.filter((r) => r.statusCode === "F").length;
    const openCount = rows.filter((r) => r.statusCode === "O").length;

    if (!hasScenario) {
      console.log(`No test scenario ${fulfilledCount} fulfilled obligations and ${openCount} open obligations`);
      // Only check default scenario shape when no explicit status filter was applied
      if (!status) {
        expect(fulfilledCount + openCount).toBeGreaterThanOrEqual(1);
      }
    } else {
      console.log(`Scenario ${testScenario} expected ${fulfilledCount} fulfilled obligations and ${openCount} open obligations`);
      switch (testScenario) {
        case "QUARTERLY_NONE_MET":
          expect(fulfilledCount).toBe(0);
          break;
        case "QUARTERLY_ONE_MET":
          expect(fulfilledCount).toBe(1);
          break;
        case "QUARTERLY_TWO_MET":
          expect(fulfilledCount).toBe(2);
          break;
        case "QUARTERLY_THREE_MET":
          expect(fulfilledCount).toBe(3);
          break;
        case "QUARTERLY_FOUR_MET":
          expect(fulfilledCount).toBe(4);
          break;
        case "MONTHLY_NONE_MET":
          expect(fulfilledCount).toBe(0);
          break;
        case "MONTHLY_ONE_MET":
          expect(fulfilledCount).toBe(1);
          break;
        case "MONTHLY_TWO_MET":
          expect(fulfilledCount).toBe(2);
          break;
        case "MONTHLY_THREE_MET":
          expect(fulfilledCount).toBe(3);
          break;
        case "MONTHLY_OBS_01_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(0);
          break;
        case "MONTHLY_OBS_02_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(1);
          break;
        case "MONTHLY_OBS_03_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(2);
          break;
        case "MONTHLY_OBS_04_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(3);
          break;
        case "MONTHLY_OBS_05_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(4);
          break;
        case "MONTHLY_OBS_06_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(5);
          break;
        case "MONTHLY_OBS_07_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(6);
          break;
        case "MONTHLY_OBS_08_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(7);
          break;
        case "MONTHLY_OBS_09_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(8);
          break;
        case "MONTHLY_OBS_10_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(9);
          break;
        case "MONTHLY_OBS_11_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(10);
          break;
        case "MONTHLY_OBS_12_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(12);
          break;
        case "MONTHLY_OBS_12_FULFILLED":
          expect(fulfilledCount).toBe(12);
          break;
        case "QUARTERLY_OBS_01_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(0);
          break;
        case "QUARTERLY_OBS_02_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(1);
          break;
        case "QUARTERLY_OBS_03_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(2);
          break;
        case "QUARTERLY_OBS_04_OPEN":
          expect(openCount).toBe(1);
          expect(fulfilledCount).toBe(3);
          break;
        case "QUARTERLY_OBS_04_FULFILLED":
          expect(openCount).toBe(0);
          expect(fulfilledCount).toBe(4);
          break;
        case "MULTIPLE_OPEN_MONTHLY":
          expect(openCount).toBe(2);
          break;
        case "MULTIPLE_OPEN_QUARTERLY":
          expect(openCount).toBe(2);
          break;
        case "OBS_SPANS_MULTIPLE_YEARS":
          expect(openCount).toBeGreaterThanOrEqual(1);
          break;
        case "INSOLVENT_TRADER":
          break;
        case "NOT_FOUND":
          expect(openCount).toBe(0);
          expect(fulfilledCount).toBe(0);
          break;
        default:
          // Unknown scenario: rely on generic checks only
          break;
      }
    }

    console.log("VAT obligations retrieval completed successfully");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-obligations-success.png` });

    // Scroll, capture a pagedown
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-obligations-results-pagedown.png` });
  });
}

/* View VAT Return Journey Steps */

export async function initViewVatReturn(page, screenshotPath = defaultScreenshotPath, hmrcAccount = null) {
  const activityButtonText = isSandboxMode() ? "View VAT Return (HMRC Sandbox)" : "View VAT Return (HMRC)";
  await test.step(`The user navigates to ${activityButtonText} and sees the return form`, async () => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-view-vat-init.png` });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting View VAT Return", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-view-vat-init.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-view-vat-init.png` });
    await expect(page.locator("#vatReturnForm")).toBeVisible();
  });
}

// Default period key for Q1 2024 (Jan-Mar)
// const DEFAULT_PERIOD_KEY = "24A1";
const DEFAULT_PERIOD_KEY = "18A1";

export async function fillInViewVatReturn(
  page,
  hmrcTestVatNumber,
  periodKey = DEFAULT_PERIOD_KEY,
  testScenario = null,
  runFraudPreventionHeaderValidation = false,
  screenshotPath = defaultScreenshotPath,
) {
  await test.step("The user fills in the view VAT return form with VRN and period key", async () => {
    // Check if we're in sandbox mode and can use test data link
    const testDataLink = page.locator("#testDataLink.visible");
    const isTestDataLinkVisible = await testDataLink.isVisible().catch(() => false);

    if (isSandboxMode() && isTestDataLinkVisible) {
      // Use the "add test data" link in sandbox mode
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-view-vat-click-test-data.png` });
      await loggedClick(page, "#testDataLink a", "Clicking add test data link", { screenshotPath });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-view-vat-test-data-added.png` });

      // Verify fields are populated
      await expect(page.locator("#vrn")).not.toHaveValue("");
      await expect(page.locator("#periodKey")).not.toHaveValue("");
    }

    // Fill out the form manually
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-view-vat-fill-in.png` });
    await page.waitForTimeout(100);
    await loggedFill(page, "#vrn", hmrcTestVatNumber, "Entering VAT registration number", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-view-vat-fill-in.png` });
    await page.waitForTimeout(100);
    await loggedFill(page, "#periodKey", periodKey, "Entering period key", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-view-vat-fill-in.png` });

    if (testScenario || runFraudPreventionHeaderValidation) {
      await loggedClick(page, "button:has-text('Show Developer Options')", "Show Developer Options", {
        screenshotPath,
      });
      // Scroll, capture a pagedown
      await page.keyboard.press("PageDown");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-view-vat-fill-in.png` });
      // Prefer selecting by value; if the caller provided a label, fall back to selecting by label
      if (testScenario) {
        try {
          await page.selectOption("#testScenario", String(testScenario));
        } catch (error) {
          console.log(`Failed to select test scenario ${testScenario} error: ${JSON.stringify(error)}`);
          await page.selectOption("#testScenario", { label: String(testScenario) });
        }
      }
      if (runFraudPreventionHeaderValidation) {
        await page.locator("#runFraudPreventionHeaderValidation").check();
        console.log("Checked runFraudPreventionHeaderValidation checkbox");
      }
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-view-vat-filled-in.png` });
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-view-vat-fill-in-filled.png` });
    await expect(page.locator("#retrieveBtn")).toBeVisible();
  });
}

export async function submitViewVatReturnForm(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the view VAT return form", async () => {
    // Focus change before submit
    await loggedFocus(page, "#retrieveBtn", "Retrieve button", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-view-vat-submit.png` });
    await loggedClick(page, "#retrieveBtn", "Submitting view VAT return form", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-view-vat-submit.png` });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-view-vat-submit.png` });
  });
}

export async function verifyViewVatReturnResults(page, testScenario = null, screenshotPath = defaultScreenshotPath) {
  if (testScenario && testScenario !== "SUBMIT_HMRC_API_HTTP_SLOW_10S") {
    await test.step("The user sees a retrieval error message for sandbox scenario", async () => {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-results-waiting.png` });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-results-error.png` });
      const statusContainer = page.locator("#statusMessagesContainer");
      let statusText;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await expect(statusContainer).toBeVisible();
        statusText = (await statusContainer.innerText()).toLowerCase();
        if (/failed|error|not found/.test(statusText)) break;
        if (attempt < 3) await page.waitForTimeout(500);
      }
      expect(statusText).toMatch(/failed|error|not found/);
      console.log("View VAT return expected error for sandbox scenario successfully");
    });
  } else {
    await test.step("The user sees VAT return details displayed", async () => {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-view-vat-return-results-waiting.png` });
      await page.waitForSelector("#returnResults", { state: "visible", timeout: 450_000 });
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-view-vat-return-results.png` });
      const resultsContainer = page.locator("#returnResults");
      await expect(resultsContainer).toBeVisible();

      // Verify the details are displayed
      const returnDetails = page.locator("#returnDetails");
      await expect(returnDetails).toBeVisible();
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-view-vat-return-results.png` });
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-view-vat-return-results.png` });

      console.log("View VAT return completed successfully");
    });
  }
}

/**
 * Fetch and log HMRC fraud prevention header validation feedback for sandbox tests.
 * This calls the HMRC test API to get feedback on all requests made to the vat-mtd API.
 *
 * @param {string} hmrcAccessToken - HMRC OAuth access token
 * @param {string} screenshotPath - Path for screenshots
 * @param {string} auditForUserSub - User sub for auditing to DynamoDB
 * @param {string|null} requestId - Optional request ID to filter feedback
 * @param {string|null} traceparent - Optional traceparent for correlation
 * @param {string|null} correlationId - Optional correlation ID
 */
export async function fetchFraudPreventionHeadersFeedback(
  hmrcAccessToken,
  screenshotPath = defaultScreenshotPath,
  auditForUserSub,
  requestId = undefined,
  traceparent = undefined,
  correlationId = undefined,
) {
  let capturedResult = null;

  await test.step("Fetch fraud prevention headers validation feedback from HMRC", async () => {
    const { getFraudPreventionHeadersFeedback } = await import("@app/services/hmrcApi.js");

    console.log("Fetching fraud prevention headers validation feedback...");
    const result = await getFraudPreventionHeadersFeedback(
      "vat-mtd",
      hmrcAccessToken,
      auditForUserSub,
      requestId,
      traceparent,
      correlationId,
    );

    // Capture the result for return
    capturedResult = result;

    if (result.ok) {
      console.log("Fraud prevention headers validation feedback received:");
      console.log(JSON.stringify(result.feedback, null, 2));

      // Log any errors or warnings
      if (result.feedback.errors && result.feedback.errors.length > 0) {
        console.warn("Validation errors:", result.feedback.errors);
      }
      if (result.feedback.warnings && result.feedback.warnings.length > 0) {
        console.warn("Validation warnings:", result.feedback.warnings);
      }
    } else {
      console.warn("Failed to fetch fraud prevention headers validation feedback:", result.error || result.status);
    }
  });

  return capturedResult;
}
