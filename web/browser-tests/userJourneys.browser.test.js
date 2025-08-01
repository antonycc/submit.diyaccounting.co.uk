// web/browser-tests/userJourneys.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout } from "timers/promises";

test.describe("User Journeys Browser Tests", () => {
  let indexHtmlContent;
  let loginHtmlContent;
  let bundlesHtmlContent;
  let comingSoonHtmlContent;
  let activitiesHtmlContent;

  test.beforeAll(async () => {
    // Read the HTML files
    indexHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/index.html"), "utf-8");
    loginHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/login.html"), "utf-8");
    bundlesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
    comingSoonHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/coming-soon.html"), "utf-8");
    activitiesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/activities.html"), "utf-8");
  });

  test.describe("Login Journey Flow", () => {
    test("should complete login journey from home to login to coming soon", async ({ page }) => {
      // Start on home page
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the home page
      await expect(page.locator("h2")).toContainText("Welcome");
      await expect(page.getByText("Log in")).toBeVisible();

      // Mock navigation to login page
      await page.route("**/login.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: loginHtmlContent,
        });
      });

      // Click the login link
      await page.click("a:has-text('Log in')");
      await setTimeout(100);

      // Simulate navigation to login page
      await page.setContent(loginHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the login page
      await expect(page.locator("h2")).toContainText("Login");
      await expect(page.getByText("Continue with Google")).toBeVisible();
      await expect(page.getByText("Continue with Microsoft")).toBeVisible();
      await expect(page.getByText("Continue with Apple")).toBeVisible();
      await expect(page.getByText("Continue with Facebook")).toBeVisible();

      // Verify disabled providers show "Coming soon"
      const microsoftProvider = page.locator(".auth-provider").filter({ hasText: "Continue with Microsoft" });
      await expect(microsoftProvider.locator(".coming-soon-text")).toContainText("Coming soon");

      // Mock navigation to coming soon page
      await page.route("**/coming-soon.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: comingSoonHtmlContent,
        });
      });

      // Click Google auth button (which goes to coming soon)
      await page.click("button:has-text('Continue with Google')");
      await setTimeout(100);

      // Simulate navigation to coming soon page
      await page.setContent(comingSoonHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the coming soon page
      await expect(page.locator("h2")).toContainText("Coming Soon");
      await expect(page.getByText("This feature is currently under development")).toBeVisible();
      await expect(page.getByText("Go Home Now")).toBeVisible();
    });

    test("should navigate back to home from login page", async ({ page }) => {
      // Start on login page
      await page.setContent(loginHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the login page
      await expect(page.locator("h2")).toContainText("Login");
      await expect(page.getByText("Back to Home")).toBeVisible();

      // Mock navigation back to home
      await page.route("**/index.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: indexHtmlContent,
        });
      });

      // Click back to home button
      await page.click("button:has-text('Back to Home')");
      await setTimeout(100);

      // Simulate navigation back to home
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're back on the home page
      await expect(page.locator("h2")).toContainText("Welcome");
    });
  });

  test.describe("Service Selection Journey Flow", () => {
    test("should complete service selection journey via hamburger menu", async ({ page }) => {
      // Start on home page
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify hamburger menu exists
      await expect(page.locator(".hamburger-btn")).toBeVisible();
      await expect(page.locator(".hamburger-btn")).toContainText("☰");

      // Click hamburger menu
      await page.click(".hamburger-btn");
      await setTimeout(100);

      // Verify menu dropdown is visible
      await expect(page.locator(".menu-dropdown")).toBeVisible();
      await expect(page.locator(".menu-dropdown a[href='bundles.html']")).toContainText("Add Bundle");

      // Mock navigation to bundles page
      await page.route("**/bundles.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: bundlesHtmlContent,
        });
      });

      // Click Add Bundle link
      await page.click("a:has-text('Add Bundle')");
      await setTimeout(100);

      // Simulate navigation to bundles page
      await page.setContent(bundlesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the bundles page
      await expect(page.locator("h2")).toContainText("Add Bundle");
      await expect(page.locator("h3").filter({ hasText: "HMRC Test API Bundle" })).toBeVisible();
      await expect(page.locator("h3").filter({ hasText: "HMRC Production API Bundle" })).toBeVisible();
      await expect(page.locator("h3").filter({ hasText: "Companies House API Bundle" })).toBeVisible();

      // Verify enabled and disabled services
      const hmrcTestBtn = page.locator("button").filter({ hasText: "Add HMRC Test API Bundle" });
      await expect(hmrcTestBtn).toBeEnabled();

      const hmrcProdBtn = page.locator("button").filter({ hasText: "Add HMRC Production API Bundle" });
      await expect(hmrcProdBtn).toBeDisabled();

      // Mock navigation to coming soon page
      await page.route("**/coming-soon.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: comingSoonHtmlContent,
        });
      });

      // Click HMRC Test API Bundle button
      await page.click("button:has-text('Add HMRC Test API Bundle')");
      await setTimeout(100);

      // Simulate navigation to coming soon page
      await page.setContent(comingSoonHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the coming soon page
      await expect(page.locator("h2")).toContainText("Coming Soon");
      await expect(page.getByText("🚧")).toBeVisible();
    });

    test("should navigate back to home from bundles page", async ({ page }) => {
      // Start on bundles page
      await page.setContent(bundlesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the bundles page
      await expect(page.locator("h2")).toContainText("Add Bundle");
      await expect(page.getByText("Back to Home")).toBeVisible();

      // Mock navigation back to home
      await page.route("**/index.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: indexHtmlContent,
        });
      });

      // Click back to home button
      await page.click("button:has-text('Back to Home')");
      await setTimeout(100);

      // Simulate navigation back to home
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're back on the home page
      await expect(page.locator("h2")).toContainText("Welcome");
    });
  });

  test.describe("Coming Soon Page Functionality", () => {
    test("should display coming soon message with countdown", async ({ page }) => {
      // Start on coming soon page
      await page.setContent(comingSoonHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify coming soon elements
      await expect(page.locator("h2")).toContainText("Coming Soon");
      await expect(page.locator(".coming-soon-icon")).toContainText("🚧");
      await expect(page.getByText("This feature is currently under development")).toBeVisible();
      await expect(page.getByText("You will be redirected to the home page shortly")).toBeVisible();
      
      // Verify countdown element exists
      await expect(page.locator("#countdown")).toBeVisible();
      await expect(page.locator("#countdown")).toContainText("2");
    });

    test("should have manual navigation back to home", async ({ page }) => {
      // Start on coming soon page
      await page.setContent(comingSoonHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify go home button exists
      await expect(page.getByText("Go Home Now")).toBeVisible();

      // Mock navigation back to home
      await page.route("**/index.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: indexHtmlContent,
        });
      });

      // Click go home button
      await page.click("button:has-text('Go Home Now')");
      await setTimeout(100);

      // Simulate navigation back to home
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're back on the home page
      await expect(page.locator("h2")).toContainText("Welcome");
    });
  });

  test.describe("Hamburger Menu Cross-Page Navigation", () => {
    test("should navigate from activities to services page", async ({ page }) => {
      // Start on activities page
      await page.setContent(activitiesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on activities page
      await expect(page.locator("h2")).toContainText("Available Activities");

      // Click hamburger menu
      await page.click(".hamburger-btn");
      await setTimeout(100);

      // Verify menu dropdown is visible
      await expect(page.locator(".menu-dropdown")).toBeVisible();

      // Mock navigation to bundles page
      await page.route("**/bundles.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: bundlesHtmlContent,
        });
      });

      // Click Add Bundle link from hamburger menu
      await page.click(".menu-dropdown a:has-text('Add Bundle')");
      await setTimeout(100);

      // Simulate navigation to bundles page
      await page.setContent(bundlesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify we're on the bundles page
      await expect(page.locator("h2")).toContainText("Add Bundle");
    });

    test("should maintain hamburger menu functionality across all pages", async ({ page }) => {
      const pages = [
        { content: indexHtmlContent, title: "Welcome" },
        { content: loginHtmlContent, title: "Login" },
        { content: bundlesHtmlContent, title: "Add Bundle" },
        { content: comingSoonHtmlContent, title: "Coming Soon" },
        { content: activitiesHtmlContent, title: "Available Activities" }
      ];

      for (const pageData of pages) {
        // Load the page
        await page.setContent(pageData.content, {
          baseURL: "http://localhost:3000",
          waitUntil: "domcontentloaded",
        });

        // Verify page loaded correctly
        await expect(page.locator("h2")).toContainText(pageData.title);

        // Verify hamburger menu exists and works
        await expect(page.locator(".hamburger-btn")).toBeVisible();
        await page.click(".hamburger-btn");
        await setTimeout(100);

        // Verify menu dropdown appears
        await expect(page.locator(".menu-dropdown")).toBeVisible();
        await expect(page.locator(".menu-dropdown a[href='index.html']")).toContainText("Home");
        await expect(page.locator(".menu-dropdown a[href='activities.html']")).toContainText("View Activities");
        await expect(page.locator(".menu-dropdown a[href='bundles.html']")).toContainText("Add Bundle");

        // Close menu by clicking hamburger again
        await page.click(".hamburger-btn");
        await setTimeout(100);
      }
    });
  });
});