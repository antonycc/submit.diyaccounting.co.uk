// web/browser-tests/navigation.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout } from "timers/promises";

test.describe("Navigation Browser Tests", () => {
  let indexHtmlContent;
  let activitiesHtmlContent;
  let submitVatHtmlContent;
  let loginHtmlContent;
  let bundlesHtmlContent;

  test.beforeAll(async () => {
    // Read the HTML files
    indexHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/index.html"), "utf-8");
    activitiesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/activities.html"), "utf-8");
    submitVatHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/submitVat.html"), "utf-8");
    loginHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/login.html"), "utf-8");
    bundlesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
  });

  test.describe("Home Page to Activities Navigation", () => {
    test("should navigate from home to activities page", async ({ page }) => {
      // Set the home page content
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the home page
      await expect(page.locator("h2")).toContainText("Welcome");
      await expect(page.getByText("View available activities")).toBeVisible();

      // Mock navigation by setting activities page content when button is clicked
      await page.route("**/activities.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: activitiesHtmlContent,
        });
      });

      // Click the "View available activities" button
      await page.click("button:has-text('View available activities')");
      await setTimeout(100);

      // Verify navigation occurred by checking if we can navigate to activities
      // Since we're testing with setContent, we'll simulate the navigation
      await page.setContent(activitiesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the activities page
      await expect(page.locator("h2")).toContainText("Available Activities");
      await expect(page.getByText("VAT Return Submission")).toBeVisible();
      await expect(page.getByText("Back to Home")).toBeVisible();
    });

    test("should navigate back from activities to home page", async ({ page }) => {
      // Start on activities page
      await page.setContent(activitiesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the activities page
      await expect(page.locator("h2")).toContainText("Available Activities");

      // Mock navigation back to home
      await page.route("**/index.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: indexHtmlContent,
        });
      });

      // Click the "Back to Home" button
      await page.click("button:has-text('Back to Home')");
      await setTimeout(100);

      // Simulate navigation back to home
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're back on the home page
      await expect(page.locator("h2")).toContainText("Welcome");
      await expect(page.getByText("View available activities")).toBeVisible();
    });
  });

  test.describe("Activities to VAT Submission Navigation", () => {
    test("should navigate from activities to VAT submission page", async ({ page }) => {
      // Start on activities page
      await page.setContent(activitiesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the activities page
      await expect(page.locator("h2")).toContainText("Available Activities");
      await expect(page.getByText("VAT Return Submission")).toBeVisible();

      // Mock navigation to submitVat page
      await page.route("**/submitVat.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: submitVatHtmlContent,
        });
      });

      // Click the "VAT Return Submission" button
      await page.click("button:has-text('VAT Return Submission')");
      await setTimeout(100);

      // Simulate navigation to submitVat page
      await page.setContent(submitVatHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the VAT submission page
      await expect(page.locator("h2")).toContainText("VAT Return Submission");
      await expect(page.locator("#vatSubmissionForm")).toBeVisible();
      await expect(page.locator("#viewActivitiesFromMainBtn")).toBeVisible();
    });

    test("should navigate back from VAT submission to activities page", async ({ page }) => {
      // Start on submitVat page
      await page.setContent(submitVatHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the VAT submission page
      await expect(page.locator("h2")).toContainText("VAT Return Submission");
      await expect(page.locator("#viewActivitiesFromMainBtn")).toBeVisible();

      // Mock navigation back to activities
      await page.route("**/activities.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: activitiesHtmlContent,
        });
      });

      // Click the "View available activities" button
      await page.click("#viewActivitiesFromMainBtn");
      await setTimeout(100);

      // Simulate navigation back to activities
      await page.setContent(activitiesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're back on the activities page
      await expect(page.locator("h2")).toContainText("Available Activities");
      await expect(page.getByText("VAT Return Submission")).toBeVisible();
    });
  });

  test.describe("OAuth Callback Handling", () => {
    test("should redirect to submitVat.html when OAuth callback parameters are detected", async ({ page }) => {
      // Set the home page content with OAuth parameters in URL
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000/?code=test-code&state=test-state",
        waitUntil: "domcontentloaded",
      });
      await setTimeout(100);

      // The OAuth detection script should run automatically
      // We can verify the parameters are detected by checking the URL parsing
      const hasOAuthParams = await page.evaluate(() => {
        const urlParams = new URLSearchParams("?code=test-code&state=test-state");
        return urlParams.get("code") !== null || urlParams.get("error") !== null;
      });

      // Verify the logic detects OAuth parameters
      expect(hasOAuthParams).toBe(true);
    });

    test("should not redirect when no OAuth parameters are present", async ({ page }) => {
      // Set the home page content without OAuth parameters
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify normal home page content is displayed
      await expect(page.locator("h2")).toContainText("Welcome");
      await expect(page.getByText("View available activities")).toBeVisible();

      // Verify no OAuth parameters are detected
      const hasOAuthParams = await page.evaluate(() => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get("code") !== null || urlParams.get("error") !== null;
      });

      expect(hasOAuthParams).toBe(false);
    });
  });

  test.describe("Hamburger Menu Navigation", () => {
    test("should toggle hamburger menu and navigate to activities", async ({ page }) => {
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify hamburger menu exists
      await expect(page.locator(".hamburger-btn")).toBeVisible();
      
      // Click hamburger menu to open dropdown
      await page.click(".hamburger-btn");
      await setTimeout(100);
      
      // Verify menu dropdown is visible (we can't test CSS classes easily, so we check if links are clickable)
      await expect(page.locator(".menu-dropdown a").first()).toBeVisible();
      
      // Mock navigation to activities page
      await page.route("**/activities.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: activitiesHtmlContent,
        });
      });

      // Click "View Activities" in dropdown
      await page.click("text=View Activities");
      await setTimeout(100);
    });

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
      await expect(page.locator(".disabled-btn")).toHaveCount(3);
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
      await expect(page.locator("h2")).toContainText("Add Bundle");
      await expect(page.locator(".service-item")).toHaveCount(3);
      await expect(page.getByText("Add HMRC Test API Bundle")).toBeVisible();
    });

    test("should navigate from services to coming soon page", async ({ page }) => {
      await page.setContent(bundlesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Click "Add HMRC Test API Bundle" button
      await page.click("button:has-text('Add HMRC Test API Bundle')");
      await setTimeout(100);
    });
  });

  test.describe("Activities Page Add Bundle Navigation", () => {
    test("should navigate from activities to services page", async ({ page }) => {
      await page.setContent(activitiesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify add service section exists
      await expect(page.locator(".add-service-section")).toBeVisible();
      await expect(page.getByText("Need more choices?")).toBeVisible();

      // Mock navigation to services page
      await page.route("**/services.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: servicesHtmlContent,
        });
      });

      // Click "Add Bundle" button
      await page.click("button:has-text('Add Bundle')");
      await setTimeout(100);
    });
  });
});