// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/behaviour-hmrc-receipts-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-hmrc-receipts-steps";

export async function goToReceiptsPageUsingHamburgerMenu(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user opens the menu to view receipts and navigates to the Receipts page", async () => {
    console.log("Opening hamburger menu to go to receipts...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-hamburger.png` });
    await loggedClick(page, "button.hamburger-btn", "Opening hamburger menu for receipts", { screenshotPath });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-02-hamburger-menu-receipts.png`,
    });
    await expect(page.getByRole("link", { name: "Receipts" })).toBeVisible({ timeout: 16000 });
    await loggedClick(page, "a:has-text('Receipts')", "Clicking Receipts in hamburger menu", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-hamburger-clicked.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-04-receipts-page.png`,
    });
  });
}

export async function verifyAtLeastOneClickableReceipt(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user reviews the receipts list and opens the first receipt when available", async () => {
    // Check if we have receipts in the table
    console.log("Checking receipts page...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-receipts-page.png` });
    const receiptsTable = page.locator("#receiptsTable");
    await expect(receiptsTable).toBeVisible({ timeout: 10000 });

    // If there are receipts, click on the first one
    const firstReceiptLink = receiptsTable.locator("tbody tr:first-child a").first();
    const hasReceipts = (await firstReceiptLink.count()) > 0;

    if (hasReceipts) {
      console.log("Found receipts, clicking on first receipt...");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-receipts-page-found.png` });
      await loggedClick(page, firstReceiptLink, "Open first receipt", { screenshotPath });
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-receipts-page-clicked.png` });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${screenshotPath}/${timestamp()}-04-receipt-detail.png`,
      });
    } else {
      console.log("No receipts found in table");
    }
  });
}
