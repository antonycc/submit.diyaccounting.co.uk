// behaviour-tests/receipts.behaviour.test.js
import { test, expect } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.proxy" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This test uses a file:// URL so it does not require a running server
test("receipts page renders and shows unauthenticated hint", async ({ page }) => {
  const receiptsPath = path.resolve(__dirname, "../web/public/account/receipts.html");
  const receiptsUrl = `file://${receiptsPath}`;
  await page.goto(receiptsUrl);

  // Menu contains Receipts
  const menuBtn = page.locator(".hamburger-btn");
  await menuBtn.click();
  await expect(page.locator("#menuDropdown a", { hasText: "Receipts" })).toHaveCount(1);

  // Shows unauthenticated hint when not logged in
  await expect(page.locator("#unauthenticatedHint")).toBeVisible();
});
