// behaviour-tests/zBundles.behaviour.test.js

import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout as delay } from "timers/promises";
import dotenv from "dotenv";

import { checkIfServerIsRunning } from "@app/lib/serverHelper.js";
import { gotoWithRetries } from "../lib/gotoWithRetries.js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.proxy" });

const originalEnv = { ...process.env };
const serverPort = 3501;

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  // eslint-disable-next-line sonarjs/slow-regex
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

// Inject a small timestamp overlay into the page/videos for readability
async function enableVideoTimestampOverlay(page) {
  await page.addInitScript(() => {
    /* eslint-disable no-undef */
    const createOrUpdate = () => {
      let el = document.getElementById("pw-video-overlay-ts");
      if (!el) {
        el = document.createElement("div");
        el.id = "pw-video-overlay-ts";
        el.style.position = "fixed";
        el.style.right = "6px";
        el.style.top = "6px";
        el.style.zIndex = "2147483647";
        el.style.background = "rgba(0,0,0,0.55)";
        el.style.color = "#00ff88";
        el.style.font = "12px/1.2 monospace";
        el.style.padding = "2px 6px";
        el.style.borderRadius = "3px";
        el.style.pointerEvents = "none";
        document.addEventListener("DOMContentLoaded", () => document.body && document.body.appendChild(el));
        if (document.body) document.body.appendChild(el);
      }
      el.textContent = new Date().toISOString();
    };
    setInterval(createOrUpdate, 250);
    /* eslint-enable no-undef */
  });
}

// Convenience wrappers to enforce UX-friendly pacing
async function clickWithPause(locator) {
  await locator.click();
  await delay(100);
}

async function gotoWithPause(page, url) {
  await gotoWithRetries(page, url, { waitUntil: "domcontentloaded" });
  await delay(500);
}

test.describe("Bundles behaviour flow (mock auth -> add bundle -> activities)", () => {
  test.setTimeout(60000);

  test.beforeAll(async () => {
    process.env = { ...originalEnv };

    // Start the local server with a fixed port and ensure mock bundle mode is on
    // eslint-disable-next-line sonarjs/no-os-command-from-path
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
      // eslint-disable-next-line sonarjs/no-ignored-exceptions
    } catch {
      // intentionally ignored during shutdown
    }
  });

  test("login via mock callback, request HMRC Test API bundle, verify activities", async ({ page }) => {
    await enableVideoTimestampOverlay(page);

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
    await gotoWithPause(page, `http://127.0.0.1:${serverPort}/loginWithMockCallback.html?code=abc&state=xyz`);

    // The page should redirect to index.html on success
    await expect(page).toHaveURL(new RegExp(`http://127.0.0.1:${serverPort}/(index.html)?$`));

    // Go to bundles page
    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });

    await gotoWithPause(page, `http://127.0.0.1:${serverPort}/bundles.html`);
    const addBtn = page.getByRole("button", { name: "Add HMRC Test API Bundle" });
    await expect(addBtn).toBeVisible();
    await clickWithPause(addBtn);

    // Button should change to added or already added
    await expect(page.getByRole("button", { name: /Added ✓|Already Added ✓/ })).toBeVisible();

    // Go to activities and verify sections
    await gotoWithPause(page, `http://127.0.0.1:${serverPort}/activities.html`);
    await expect(page.getByText("Default bundle")).toBeVisible();
    await expect(page.getByText("HMRC Test API bundle")).toBeVisible();
    await expect(page.getByText("Submit VAT (Sandbox API)")).toBeVisible();
  });
});
