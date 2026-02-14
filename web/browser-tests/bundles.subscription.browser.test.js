// web/browser-tests/bundles.subscription.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Bundles page subscription UI", () => {
  let bundlesHtmlContent;

  test.beforeAll(async () => {
    bundlesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
  });

  function setupPage(page) {
    page.on("console", (msg) => {
      // eslint-disable-next-line no-console
      console.log(`[PAGE_CONSOLE:${msg.type()}]`, msg.text());
    });
    page.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });
  }

  async function setupRoutes(page, { bundles = [], passValidation = null, loggedIn = true } = {}) {
    await page.addInitScript(
      ({ loggedIn: li, passValidation: pv }) => {
        window.showStatus = window.showStatus || (() => {});
        window.checkAuthStatus = window.checkAuthStatus || (() => {});
        window.toggleMenu = window.toggleMenu || (() => {});
        if (li) {
          try {
            localStorage.setItem("cognitoIdToken", "mock-id-token");
          } catch {}
        }
        if (pv) {
          try {
            sessionStorage.setItem("passValidation", JSON.stringify(pv));
          } catch {}
        }
      },
      { loggedIn, passValidation },
    );

    await page.route("**/*.js", async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      if (resourceType === "script" && !url.includes("toml-parser.js")) {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else if (url.includes("toml-parser.js")) {
        const tomlParserPath = path.join(process.cwd(), "web/public/lib/toml-parser.js");
        const tomlParserContent = fs.readFileSync(tomlParserPath, "utf-8");
        await route.fulfill({ status: 200, contentType: "application/javascript", body: tomlParserContent });
      } else {
        await route.continue();
      }
    });

    await page.route("**/submit.catalogue.toml", async (route) => {
      const tomlBody = `
[[bundles]]
id = "day-guest"
name = "Day Guest"
enable = "on-pass"
allocation = "on-request"
tokensGranted = 3

[[bundles]]
id = "resident-pro"
name = "Resident Pro"
enable = "on-pass"
hidden = false
allocation = "on-pass-on-subscription"
tokensGranted = 100
`;
      await route.fulfill({ status: 200, contentType: "text/x-toml", body: tomlBody });
    });

    await page.route("**/submit.environment-name.txt", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "test\n" });
    });

    await page.route("**/api/v1/bundle", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bundles }),
      });
    });
  }

  async function loadPage(page) {
    const modifiedHtml = bundlesHtmlContent
      .replace("<head>", '<head><base href="http://localhost:3000/">')
      .replace(
        "<body>",
        `<body><script>\nwindow.showStatus = window.showStatus || function(){};\nwindow.checkAuthStatus = window.checkAuthStatus || function(){};\nwindow.toggleMenu = window.toggleMenu || function(){};\n</script>`,
      );

    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/bundles.html",
      waitUntil: "domcontentloaded",
    });

    await delay(400);
  }

  test("shows Subscribe button for on-pass-on-subscription bundle with valid pass", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      passValidation: { code: "test-code", bundleId: "resident-pro", valid: true },
      bundles: [],
    });
    await loadPage(page);

    // resident-pro should have Subscribe button
    const subscribeBtn = page.locator('button[data-subscribe="true"]');
    await expect(subscribeBtn).toHaveCount(1);
    await expect(subscribeBtn).toContainText("Subscribe");
    await expect(subscribeBtn).toContainText("9.99");
  });

  test("shows Manage Subscription button when user has active subscription", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      passValidation: { code: "test-code", bundleId: "resident-pro", valid: true },
      bundles: [
        {
          bundleId: "resident-pro",
          allocated: true,
          stripeSubscriptionId: "sub_test_123",
          stripeCustomerId: "cus_test_456",
        },
      ],
    });
    await loadPage(page);

    const manageBtn = page.locator('button[data-manage-subscription="true"]');
    await expect(manageBtn).toHaveCount(1);
    await expect(manageBtn).toContainText("Manage Subscription");
  });

  test("shows Pass required for on-pass-on-subscription bundle without valid pass", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { bundles: [] });
    await loadPage(page);

    // resident-pro should show Pass required since no pass validation
    const passRequiredBtn = page.locator('button[data-disabled-reason="on-pass"]');
    await expect(passRequiredBtn).toHaveCount(1);
    await expect(passRequiredBtn).toContainText("Pass required");
  });
});
