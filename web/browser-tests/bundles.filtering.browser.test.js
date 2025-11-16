// web/browser-tests/bundles.filtering.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Bundles page client-side filtering by listedInEnvironments", () => {
  let bundlesHtmlContent;

  test.beforeAll(async () => {
    bundlesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/account/bundles.html"), "utf-8");
  });

  test("shows only bundles allowed in current environment or with no restriction", async ({ page }) => {
    // Stub globals used by inline script to avoid ReferenceErrors
    await page.addInitScript(() => {
      window.showStatus = window.showStatus || (() => {});
      window.checkAuthStatus = window.checkAuthStatus || (() => {});
      window.toggleMenu = window.toggleMenu || (() => {});
      // Ensure localStorage APIs exist
      try {
        localStorage.setItem("__test__", "1");
        localStorage.removeItem("__test__");
      } catch {}
    });

    // Prevent external script files referenced by bundles.html from executing/failing
    // We only want the inline script inside bundles.html to run for this test
    await page.route("**/*.js", async (route) => {
      // Allow our API mocks below to proceed; only intercept script resources
      const request = route.request();
      const resourceType = request.resourceType();
      if (resourceType === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    // Mock the catalog API to return a mixture of bundles
    await page.route("**/api/v1/catalog", async (route) => {
      const body = {
        bundles: [
          { id: "restrictedTest", name: "Restricted", allocation: "on-request", listedInEnvironments: ["test"] },
          { id: "unrestricted", name: "Unrestricted", allocation: "on-request" },
          { id: "prodOnly", name: "Prod Only", allocation: "on-request", listedInEnvironments: ["prod"] },
          { id: "auto", name: "Automatic", allocation: "automatic" },
        ],
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    // Mock submit.env to indicate we are in the 'test' environment
    await page.route("**/submit.env", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "test\n" });
    });

    // Load the bundles page HTML; baseURL ensures relative URLs resolve as in real site
    await page.setContent(bundlesHtmlContent, {
      baseURL: "http://localhost:3000/account/",
      waitUntil: "domcontentloaded",
    });

    // Wait a moment for the inline script to fetch and render
    await delay(400);

    // Debug: capture container HTML if nothing rendered
    const container = page.locator("#catalogBundles");
    const debugHtml = await container.evaluate((el) => el?.innerHTML || "");
    if (!debugHtml || debugHtml.trim() === "") {
      console.log("[DEBUG_LOG] #catalogBundles innerHTML (empty?):", debugHtml);
    }

    // Expect only the allowed buttons to be present: restrictedTest and unrestricted
    const buttons = page.locator("button[data-bundle-id]");
    await expect(buttons).toHaveCount(2);

    // Collect bundle IDs rendered
    const ids = await buttons.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-bundle-id")));
    expect(ids.sort()).toEqual(["restrictedTest", "unrestricted"]);

    // Ensure the "Prod Only" and "automatic" bundles are not shown
    await expect(page.locator('button[data-bundle-id="prodOnly"]')).toHaveCount(0);
    await expect(page.locator('button[data-bundle-id="auto"]')).toHaveCount(0);
  });
});
