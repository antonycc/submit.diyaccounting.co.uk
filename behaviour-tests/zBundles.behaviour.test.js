// behaviour-tests/zBundles.behaviour.test.js

import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout as delay } from "timers/promises";
import dotenv from "dotenv";
import { checkIfServerIsRunning } from "@app/bin/server.js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.proxy" });

const originalEnv = { ...process.env };
const serverPort = 3501;

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(payloadClaims = {}) {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    sub: "test-user-1",
    email: "user@example.com",
    given_name: "Test",
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

test.describe("Bundles behaviour flow (mock auth -> add bundle -> activities)", () => {
  test.setTimeout(60000);

  test.beforeAll(async () => {
    process.env = { ...originalEnv };

    // Start the local server with a fixed port and ensure mock bundle mode is on
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

  test("login via mock callback, request HMRC Test API bundle, verify activities", async ({ page }) => {
    // Intercept token exchange with mock-oauth2 server
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

    // Visit the mock callback page to populate localStorage with tokens
    await page.goto(`http://127.0.0.1:${serverPort}/loginWithMockCallback.html?code=abc&state=xyz`);

    // The page should redirect to index.html on success
    await expect(page).toHaveURL(new RegExp(`http://127.0.0.1:${serverPort}/(index.html)?$`));

    // Go to bundles page
    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });

    await page.goto(`http://127.0.0.1:${serverPort}/bundles.html`);
    const addBtn = page.getByRole("button", { name: "Add HMRC Test API Bundle" });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Button should change to added or already added
    await expect(page.getByRole("button", { name: /Added ✓|Already Added ✓/ })).toBeVisible();

    // Go to activities and verify sections
    await page.goto(`http://127.0.0.1:${serverPort}/activities.html`);
    await expect(page.getByText("Default bundle")).toBeVisible();
    await expect(page.getByText("HMRC Test API bundle")).toBeVisible();
    await expect(page.getByText("Submit VAT (Sandbox API)")).toBeVisible();
  });
});
