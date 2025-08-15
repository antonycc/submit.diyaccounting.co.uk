// behaviour-tests/journeys.behaviour.test.js

import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout as delay } from "timers/promises";
import dotenv from "dotenv";

import { checkIfServerIsRunning } from "@app/lib/serverHelper.js";
import { gotoWithRetries } from "../lib/gotoWithRetries.js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.proxy" });

const originalEnv = { ...process.env };
const serverPort = 3502; // dedicated port for these journeys

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  // eslint-disable-next-line sonarjs/slow-regex
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(payloadClaims = {}) {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    sub: "journey-user-1",
    email: "journey.user@example.com",
    given_name: "Journey",
    family_name: "User",
    aud: "debugger",
    iss: "http://localhost:8080/default",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payloadClaims,
  };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`; // unsigned
}

let serverProcess;

test.describe("Backlog journeys", () => {
  test.setTimeout(90000);

  test.beforeAll(async () => {
    process.env = { ...originalEnv };

    serverProcess = spawn("npm", ["run", "start"], {
      env: {
        ...process.env,
        DIY_SUBMIT_BUNDLE_MOCK: "true",
        DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT: String(serverPort),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    await checkIfServerIsRunning(`http://127.0.0.1:${serverPort}`);
  });

  test.afterAll(async () => {
    try {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill("SIGINT");
        await delay(500);
      }
    } catch (_e) {
      // ignore
    }
  });

  test("Journey 2: New customer signing up and adding a bundle", async ({ page }) => {
    // 1) Start unauthenticated on Bundles
    await gotoWithRetries(page, `http://127.0.0.1:${serverPort}/bundles.html`, { waitUntil: "domcontentloaded" });

    // Prepare to dismiss the alert for unauthenticated add attempt
    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });

    // 2) Attempt to add (should prompt to login and redirect to login.html)
    const addBtn = page.getByRole("button", { name: "Add HMRC Test API Bundle" });
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await expect(page).toHaveURL(new RegExp(`/login.html$`));

    // 3) Complete mock login via direct callback and intercepted token exchange
    await page.route("http://localhost:8080/default/token", async (route) => {
      const response = {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "mock-access",
          id_token: makeIdToken(),
          refresh_token: "mock-refresh",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      };
      await route.fulfill(response);
    });

    await gotoWithRetries(
      page,
      `http://127.0.0.1:${serverPort}/loginWithMockCallback.html?code=abc&state=xyz`,
      {
        waitUntil: "domcontentloaded",
      },
    );

    // Should land on home
    await expect(page).toHaveURL(new RegExp(`http://127.0.0.1:${serverPort}/(index.html)?$`));

    // 4) Go back to Bundles and add the bundle (should now succeed without login prompt)
    await gotoWithRetries(page, `http://127.0.0.1:${serverPort}/bundles.html`, { waitUntil: "domcontentloaded" });
    const addBtn2 = page.getByRole("button", { name: "Add HMRC Test API Bundle" });
    await expect(addBtn2).toBeVisible();
    await addBtn2.click();

    // Button should reflect added state
    await expect(page.getByRole("button", { name: /Bundle Added ✓|Already Added ✓/ })).toBeVisible();

    // 5) View activities shows Submit VAT
    await gotoWithRetries(page, `http://127.0.0.1:${serverPort}/activities.html`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("HMRC Test API bundle")).toBeVisible();
    await expect(page.getByText("Submit VAT (Sandbox API)")).toBeVisible();
  });

  test("Journey 4: Hamburger menu and back navigation", async ({ page }) => {
    // Home
    await gotoWithRetries(page, `http://127.0.0.1:${serverPort}/index.html`, { waitUntil: "domcontentloaded" });

    // Bundles via hamburger
    await page.getByRole("button", { name: "☰" }).click();
    await page.getByRole("link", { name: "Add Bundle" }).click();
    await expect(page).toHaveURL(new RegExp(`/bundles.html$`));

    // Back to home via back
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/index.html$`));

    // Activities via hamburger
    await page.getByRole("button", { name: "☰" }).click();
    await page.getByRole("link", { name: "View Activities" }).click();
    await expect(page).toHaveURL(new RegExp(`/activities.html$`));

    // Home via hamburger
    await page.getByRole("button", { name: "☰" }).click();
    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(new RegExp(`/index.html$`));

    // Back to Activities via back
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/activities.html$`));

    // Back to home via back
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/index.html$`));
  });
});
