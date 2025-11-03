// behaviour-tests/behaviour-hmrc-vat-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp } from "../helpers/behaviour-helpers.js";

export async function initSubmitVat(page) {
  await test.step("The user begins a VAT return and sees the VAT submission form", async () => {
    // Click "VAT Return Submission" on activities page
    await loggedClick(page, "button:has-text('Submit VAT (Sandbox API)')", "Starting VAT return submission");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/090-start-submission-${timestamp()}.png`,
    });
    await expect(page.locator("#vatSubmissionForm")).toBeVisible();
  });
}

export async function fillInVat(page, hmrcTestVatNumber) {
  await test.step("The user completes the VAT form with valid values and sees the Submit button", async () => {
    // Fill out the VAT form using the correct field IDs from submitVat.html
    // eslint-disable-next-line sonarjs/pseudo-random
    const randomFourCharacters = Math.random().toString(36).substring(2, 6);
    await page.waitForTimeout(100);
    await loggedFill(page, "#vatNumber", hmrcTestVatNumber, "Entering VAT number");
    await page.waitForTimeout(100);
    await loggedFill(page, "#periodKey", randomFourCharacters, "Entering period key");
    await page.waitForTimeout(100);
    await loggedFill(page, "#vatDue", "1000.00", "Entering VAT due amount");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/100-form-filled-${timestamp()}.png`,
    });
    await expect(page.locator("#submitBtn")).toBeVisible();
  });
}

export async function submitFormVat(page) {
  await test.step("The user submits the VAT form and reviews the HMRC permission page", async () => {
    // Expect the HMRC permission page to be visible
    await loggedClick(page, "#submitBtn", "Submitting VAT form");
    const applicationName = "DIY Accounting Submit";
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/submitVat-screenshots/110-hmrc-permission-${timestamp()}.png`,
    });
    await expect(page.locator("#appNameParagraph")).toContainText(applicationName, { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Continue" })).toContainText("Continue");
  });
}

export async function completeVat(page, baseUrl, checkServersAreRunning = undefined) {
  await test.step(
    "The user waits for the VAT submission to complete and for the receipt to appear",
    async () => {
      // Wait for the submission process to complete and receipt to be displayed
      console.log("Waiting for VAT submission to complete and receipt to be displayed...");

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
        const receiptStyle = await page.locator("#receiptDisplay").getAttribute("style");
        console.log(`Receipt element style: ${receiptStyle}`);
      }

      const formExists = await page.locator("#vatForm").count();
      console.log(`Form element exists: ${formExists > 0}`);

      if (formExists > 0) {
        const formStyle = await page.locator("#vatForm").getAttribute("style");
        console.log(`Form element style: ${formStyle}`);
        const receiptVisible = await page.locator("#receiptDisplay").isVisible();
        console.log(`Receipt element visible: ${receiptVisible}`);
      }

      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/160-waiting-for-receipt-${timestamp()}.png`,
      });

      if (checkServersAreRunning) {
        await checkServersAreRunning();
      }

      // If elements don't exist, try to navigate back to the correct page
      if (receiptExists === 0 && formExists === 0) {
        console.log("DOM elements missing, checking if we need to reload the page...");
        const currentUrl = page.url();
        const maybeSlash = baseUrl.endsWith("/") ? "" : "/";
        if (!currentUrl.includes("submitVat.html") && !currentUrl.includes("chrome-error://")) {
          console.log(`Navigating back to submitVat.html from ${currentUrl}`);
          await page.goto(`${baseUrl}${maybeSlash}activities/submitVat.html`);
          await page.waitForLoadState("networkidle");
        } else if (currentUrl.includes("chrome-error://")) {
          console.log("Chrome error page detected, navigating directly to submitVat.html");
          await page.goto(`${baseUrl}${maybeSlash}activities/submitVat.html`);
          await page.waitForLoadState("networkidle");
        }
      }

      await page.waitForSelector("#receiptDisplay", { state: "visible", timeout: 30000 });
      await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/170-receipt-${timestamp()}.png` });
      await page.waitForTimeout(500);
    },
    { timeout: 40000 },
  );
}

export async function verifyVatSubmission(page) {
  await test.step("The user sees a successful VAT submission receipt and the VAT form is hidden", async () => {
    const receiptDisplay = page.locator("#receiptDisplay");
    await expect(receiptDisplay).toBeVisible();

    // Check for the success message
    const successHeader = receiptDisplay.locator("h3");
    await expect(successHeader).toContainText("VAT Return Submitted Successfully");

    // Verify receipt details are populated
    // await expect(page.locator("#formBundleNumber")).toContainText("123456789-bundle");
    // await expect(page.locator("#chargeRefNumber")).toContainText("123456789-charge");
    await expect(page.locator("#processingDate")).not.toBeEmpty();

    // Verify the form is hidden after successful submission
    await expect(page.locator("#vatForm")).toBeHidden();
    await page.screenshot({ path: `target/behaviour-test-results/submitVat-screenshots/180-vat-form-${timestamp()}.png` });

    console.log("VAT submission flow completed successfully");
  });
}

/* VAT Obligations Journey Steps */

export async function initVatObligations(page) {
  await test.step("The user navigates to VAT Obligations and sees the obligations form", async () => {
    await loggedClick(page, "button:has-text('VAT Obligations (Sandbox API)')", "Starting VAT Obligations");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/vatObligations-screenshots/010-obligations-page-${timestamp()}.png`,
    });
    await expect(page.locator("#vatObligationsForm")).toBeVisible();
  });
}

export async function fillInVatObligations(page, hmrcTestVatNumber, options = {}) {
  await test.step("The user fills in the VAT obligations form with VRN and date range", async () => {
    const { fromDate, toDate, status, testScenario } = options || {};

    // Compute a wide date range with likely hits if not provided
    const from = fromDate || "2018-01-01";
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const to = toDate || `${yyyy}-${mm}-${dd}`;

    await page.waitForTimeout(100);
    await loggedFill(page, "#vrn", hmrcTestVatNumber, "Entering VAT registration number");
    await page.waitForTimeout(50);
    // Fill optional filters (map to actual form field IDs)
    await loggedFill(page, "#fromDate", from, "Entering from date");
    await page.waitForTimeout(50);
    await loggedFill(page, "#toDate", to, "Entering to date");
    await page.waitForTimeout(50);
    if (status) {
      await page.selectOption("#status", String(status));
    }
    if (testScenario) {
      await page.selectOption("#testScenario", String(testScenario));
    }

    await page.waitForTimeout(300);
    await page.screenshot({
      path: `target/behaviour-test-results/vatObligations-screenshots/020-form-filled-${timestamp()}.png`,
    });
    await expect(page.locator("#retrieveBtn")).toBeVisible();
  });
}

export async function submitVatObligationsForm(page) {
  await test.step("The user submits the VAT obligations form", async () => {
    await loggedClick(page, "#retrieveBtn", "Submitting VAT obligations form");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `target/behaviour-test-results/vatObligations-screenshots/030-after-submit-${timestamp()}.png`,
    });
  });
}

export async function verifyVatObligationsResults(page) {
  await test.step("The user sees VAT obligations results displayed", async () => {
    await page.waitForSelector("#obligationsResults", { state: "visible", timeout: 30000 });
    await page.screenshot({
      path: `target/behaviour-test-results/vatObligations-screenshots/040-results-displayed-${timestamp()}.png`,
    });
    const resultsContainer = page.locator("#obligationsResults");
    await expect(resultsContainer).toBeVisible();

    // Verify the table is displayed
    const obligationsTable = page.locator("#obligationsTable");
    await expect(obligationsTable).toBeVisible();

    console.log("VAT obligations retrieval completed successfully");
  });
}

/* View VAT Return Journey Steps */

export async function initViewVatReturn(page) {
  await test.step("The user navigates to View VAT Return and sees the return form", async () => {
    await loggedClick(page, "button:has-text('View VAT Return (Sandbox API)')", "Starting View VAT Return");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/viewVatReturn-screenshots/010-view-return-page-${timestamp()}.png`,
    });
    await expect(page.locator("#vatReturnForm")).toBeVisible();
  });
}

// Default period key for Q1 2024 (Jan-Mar)
// const DEFAULT_PERIOD_KEY = "24A1";
const DEFAULT_PERIOD_KEY = "18A1";

export async function fillInViewVatReturn(page, hmrcTestVatNumber, periodKey = DEFAULT_PERIOD_KEY) {
  await test.step("The user fills in the view VAT return form with VRN and period key", async () => {
    await page.waitForTimeout(100);
    await loggedFill(page, "#vrn", hmrcTestVatNumber, "Entering VAT registration number");
    await page.waitForTimeout(100);
    await loggedFill(page, "#periodKey", periodKey, "Entering period key");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/viewVatReturn-screenshots/020-form-filled-${timestamp()}.png`,
    });
    await expect(page.locator("#retrieveBtn")).toBeVisible();
  });
}

export async function submitViewVatReturnForm(page) {
  await test.step("The user submits the view VAT return form", async () => {
    await loggedClick(page, "#retrieveBtn", "Submitting view VAT return form");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `target/behaviour-test-results/viewVatReturn-screenshots/030-after-submit-${timestamp()}.png`,
    });
  });
}

export async function verifyViewVatReturnResults(page) {
  await test.step("The user sees VAT return details displayed", async () => {
    await page.waitForSelector("#returnResults", { state: "visible", timeout: 30000 });
    await page.screenshot({
      path: `target/behaviour-test-results/viewVatReturn-screenshots/040-results-displayed-${timestamp()}.png`,
    });
    const resultsContainer = page.locator("#returnResults");
    await expect(resultsContainer).toBeVisible();

    // Verify the details are displayed
    const returnDetails = page.locator("#returnDetails");
    await expect(returnDetails).toBeVisible();

    console.log("View VAT return completed successfully");
  });
}
