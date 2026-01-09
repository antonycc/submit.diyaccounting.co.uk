// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/helpers/gotoWithRetries.js
// ESM module providing a resilient navigation helper for Playwright pages.
// Designed to be framework-agnostic and easy to unit test with mocked Page-like objects.

import { timestamp } from "./behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/gotoWithRetries";

/**
 * Determine if a navigation error is likely transient and worth retrying.
 * @param {unknown} err
 * @returns {boolean}
 */
export function transientNavigationError(err) {
  const msg = String(err?.message || err || "");
  const candidates = [
    "net::ERR_NETWORK_CHANGED",
    "net::ERR_INTERNET_DISCONNECTED",
    "net::ERR_NAME_NOT_RESOLVED",
    "NS_ERROR_NET_RESET",
    "ECONNRESET",
    "ENOTFOUND",
    "EAI_AGAIN",
    // Playwright timeout phrasing variants
    "Timeout 30000ms exceeded",
    "Timeout 45000ms exceeded",
    "Timeout 60000ms exceeded",
    "Navigation timeout of",
  ];
  return candidates.some((s) => msg.includes(s));
}

/**
 * Wait helper for backoff delays to make unit testing replaceable/mocked.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Navigate with retries and optional readiness check.
 * @param {import('@playwright/test').Page} page - Playwright Page (or mock with goto/waitForSelector)
 * @param {string} url - URL to navigate to
 * @param {object} [options]
 * @param {string} [options.description]
 * @param {number} [options.maxRetries=4]
 * @param {number} [options.baseDelayMs=500]
 * @param {number} [options.maxDelayMs=5000]
 * @param {"load"|"domcontentloaded"|"networkidle"} [options.waitUntil="domcontentloaded"]
 * @param {string} [options.readySelector]
 * @param {number} [options.readySelectorTimeout=15000]
 * @param {screenshotPath} [screenshotPath]
 */
export async function gotoWithRetries(page, url, options = {}, screenshotPath = defaultScreenshotPath) {
  const {
    description = "",
    maxRetries = 4,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    waitUntil = "domcontentloaded",
    readySelector,
    readySelectorTimeout = 15000,
    sleepFn = delay,
  } = options;

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[NAVIGATION] (${attempt}/${maxRetries}) Going to: ${url} ${description ? "- " + description : ""}`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-before-go.png` });
      await page.goto(url, { waitUntil });

      if (readySelector) {
        // Wait until a reliable element is visible to confirm readiness
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-goto-waiting.png` });
        if (typeof page.waitForSelector === "function") {
          await page.waitForSelector(readySelector, { state: "visible", timeout: readySelectorTimeout });
        }
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-goto-waited.png` });
      }

      return; // success
    } catch (err) {
      lastErr = err;
      // await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-goto-error.png` });
      const isTransient = transientNavigationError(err);
      console.log(`[NAVIGATION] attempt ${attempt} failed${isTransient ? " (transient)" : ""}: ${err}`);

      if (attempt === maxRetries || !isTransient) {
        throw err;
      }

      const backoff = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      console.log(`[NAVIGATION] retrying in ${backoff}ms...`);
      // await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-goto-backing-off.png` });
      await sleepFn(backoff);
    }
  }
  throw lastErr; // Exhausted attempts
}

/**
 * A small adapter to preserve legacy signature `loggedGoto(url, description)`
 * while delegating to gotoWithRetries with sensible defaults.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} description
 * @param {object} [options]
 */
export async function loggedGotoWithRetries(page, url, description = "", options = {}, screenshotPath = defaultScreenshotPath) {
  return gotoWithRetries(page, url, {
    description,
    waitUntil: "domcontentloaded",
    ...options,
    screenshotPath,
  });
}
