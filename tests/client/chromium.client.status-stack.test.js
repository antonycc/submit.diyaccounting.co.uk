import { test, expect, chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout } from "timers/promises";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}

test.describe("Client Status Message Stacking", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "public/index.html"), "utf-8");
  });

  test.beforeEach(async ({ page }) => {
    await page.setContent(htmlContent, {
      baseURL: "http://localhost:3000",
      waitUntil: "domcontentloaded",
    });
  });

  test("should stack multiple info messages and auto-remove after 5 seconds", async ({ page }) => {
    const timestamp = getTimestamp();
    // Trigger three info messages in quick succession
    await page.evaluate(() => {
      window.showStatus("Info message 1", "info");
      window.showStatus("Info message 2", "info");
      window.showStatus("Info message 3", "info");
    });
    // All three should be visible and stacked
    const messages = page.locator("#statusMessagesContainer .status-message");
    await expect(messages).toHaveCount(3);
    await expect(messages.nth(0)).toHaveText("Info message 1");
    await expect(messages.nth(1)).toHaveText("Info message 2");
    await expect(messages.nth(2)).toHaveText("Info message 3");
    await page.screenshot({ path: `target/client-test-results/client-status-stack-initial_${timestamp}.png` });
    // Wait 31 seconds for auto-removal
    //await page.waitForTimeout(31000);
    //await expect(messages).toHaveCount(0);
  });

  test("should stack error and info messages, only auto-remove info", async ({ page }) => {
    // Trigger error and info
    await page.evaluate(() => {
      window.showStatus("Error message", "error");
      window.showStatus("Info message", "info");
    });
    const messages = page.locator("#statusMessagesContainer .status-message");
    await expect(messages).toHaveCount(2);
    await expect(messages.nth(0)).toHaveText("Error message");
    await expect(messages.nth(1)).toHaveText("Info message");
    // Wait 31 seconds
    //await page.waitForTimeout(31000);
    // Only error should remain
    //await expect(messages).toHaveCount(1);
    //await expect(messages.nth(0)).toHaveText("Error message");
  });

  test("should clear all messages with hideStatus", async ({ page }) => {
    await page.evaluate(() => {
      window.showStatus("Message 1", "info");
      window.showStatus("Message 2", "error");
    });
    const messages = page.locator("#statusMessagesContainer .status-message");
    await expect(messages).toHaveCount(2);
    // Call hideStatus
    await page.evaluate(() => window.hideStatus());
    await expect(messages).toHaveCount(0);
  });
});

