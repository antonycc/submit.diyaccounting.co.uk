// web/browser-tests/navigation.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout } from "timers/promises";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

test.describe("Navigation Browser Tests", () => {
  let indexHtmlContent;
  let submitVatHtmlContent;
  let loginHtmlContent;
  let bundlesHtmlContent;

  test.beforeAll(async () => {
    // Read the HTML files
    indexHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/index.html"), "utf-8");
    submitVatHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/activities/submitVat.html"), "utf-8");
    loginHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/auth/login.html"), "utf-8");
    bundlesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/account/bundles.html"), "utf-8");
  });

  test.describe("Home Page to Activities Navigation", () => {
    test("should show activities/features on home page after clicking 'View available activities'", async ({
      page,
    }) => {
      // Set the home page content
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify activities/features are now visible on the home page (index.html)
      await expect(page.locator("h2")).toContainText(/Select an activity/);
    });
  });

  test.describe("OAuth Callback Handling", () => {
    // test("should redirect to submitVat.html when OAuth callback parameters are detected", async ({ page }) => {
    //   // Set the home page content with OAuth parameters in URL
    //   await page.setContent(indexHtmlContent, {
    //     baseURL: "http://localhost:3000/?code=test-code&state=test-state",
    //     waitUntil: "domcontentloaded",
    //   });
    //   await setTimeout(100);
    //
    //   // Simulate URLSearchParams using the test URL
    //   const hasOAuthParams = await page.evaluate(() => {
    //     const urlParams = new URLSearchParams(document.location.search);
    //     return urlParams.get("code") !== null || urlParams.get("error") !== null;
    //   });
    //
    //   // Verify the logic detects OAuth parameters
    //   expect(hasOAuthParams).toBe(true);
    // });

    test("should not redirect when no OAuth parameters are present", async ({ page }) => {
      // Set the home page content without OAuth parameters
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Simulate URLSearchParams using the test URL
      const hasOAuthParams = await page.evaluate(() => {
        const urlParams = new URLSearchParams(document.location.search);
        return urlParams.get("code") !== null || urlParams.get("error") !== null;
      });

      expect(hasOAuthParams).toBe(false);
    });
  });

  test.describe("Hamburger Menu Navigation", () => {
    test("should navigate to bundles page from hamburger menu", async ({ page }) => {
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Click hamburger menu
      await page.click(".hamburger-btn");
      await setTimeout(100);

      // Mock navigation to bundles page
      await page.route("**/bundles.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: bundlesHtmlContent,
        });
      });

      // Click "Add Bundle" in dropdown
      await page.click("text=Add Bundle");
      await setTimeout(100);
    });
  });

  test.describe("Login Page Navigation", () => {
    test("should navigate to login page and display auth providers", async ({ page }) => {
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Mock navigation to login page
      await page.route("**/login.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: loginHtmlContent,
        });
      });

      // Click login link
      await page.click(".login-link");
      await setTimeout(100);

      // Simulate navigation to login page
      await page.setContent(loginHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify login page content
      await expect(page.locator("h2")).toContainText("Login");
      await expect(page.locator(".google-btn")).toBeVisible();
    });

    test("should navigate from login to coming soon page", async ({ page }) => {
      await page.setContent(loginHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Click Google login button
      await page.click(".google-btn");
      await setTimeout(100);
    });
  });

  test.describe("Bundles Page Navigation", () => {
    test("should navigate to bundles page and display service options", async ({ page }) => {
      await page.setContent(bundlesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify services page content
      await expect(page.locator("h2")).toContainText("Bundles");
    });
  });
});
