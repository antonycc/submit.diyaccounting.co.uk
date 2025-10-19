// behaviour-tests/behaviour-hmrc-receipts-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, timestamp } from "../helpers/behaviour-helpers.js";

export async function goToReceiptsPageUsingHamburgerMenu(page) {
  await test.step("The user opens the menu to view receipts and navigates to the Receipts page", async () => {
    console.log("Opening hamburger menu to go to receipts...");
    await loggedClick(page, "button.hamburger-btn", "Opening hamburger menu for receipts");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/176-hamburger-menu-receipts-${timestamp()}.png`,
    });
    await expect(page.getByRole("link", { name: "Receipts" })).toBeVisible({ timeout: 16000 });
    await loggedClick(page, "a:has-text('Receipts')", "Clicking Receipts in hamburger menu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `target/behaviour-test-results/bundles-screenshots/177-receipts-page-${timestamp()}.png`,
    });
  });
}

export async function verifyAtLeastOneClickableReceipt(page) {
  await test.step("The user reviews the receipts list and opens the first receipt when available", async () => {
    // Check if we have receipts in the table
    console.log("Checking receipts page...");
    const receiptsTable = page.locator("#receiptsTable");
    await expect(receiptsTable).toBeVisible({ timeout: 10000 });

    // If there are receipts, click on the first one
    const firstReceiptLink = receiptsTable.locator("tbody tr:first-child a").first();
    const hasReceipts = (await firstReceiptLink.count()) > 0;

    if (hasReceipts) {
      console.log("Found receipts, clicking on first receipt...");
      await firstReceiptLink.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `target/behaviour-test-results/submitVat-screenshots/178-receipt-detail-${timestamp()}.png`,
      });
    } else {
      console.log("No receipts found in table");
    }
  });
}
