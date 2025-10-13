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

    console.log("VAT submission flow completed successfully");
  });
}
