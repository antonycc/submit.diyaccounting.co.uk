// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/behaviour-bundle-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, timestamp, isSandboxMode } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-bundle-steps";

export async function goToBundlesPage(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user navigates to Bundles via main navigation", async () => {
    // Go to bundles via main navigation
    console.log("Navigating to Bundles via main navigation...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-bundles-page-nav.png` });
    await expect(page.locator("nav.main-nav a:has-text('Bundles')")).toBeVisible({ timeout: 10000 });
    await Promise.all([
      page.waitForURL(/bundles\.html/, { waitUntil: "domcontentloaded", timeout: 30000 }),
      loggedClick(page, "nav.main-nav a:has-text('Bundles')", "Clicking Bundles in main navigation", { screenshotPath }),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-goto-bundles-page-nav.png` });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-goto-bundles-page.png` });
  });
}

export async function clearBundles(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user clears any existing bundles via API call", async () => {
    // Remove all bundles via API call (idempotent operation)
    console.log("Removing all bundles via API...");
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-01-removing-all-bundles.png`,
    });

    // Check if any "Added ✓" buttons exist — if none, bundles are already cleared
    const addedButtons = page.locator("button:has-text('Added ✓')");
    const addedCount = await addedButtons.count().catch(() => 0);
    if (addedCount === 0) {
      console.log("No 'Added ✓' buttons found, bundles already cleared.");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-clear-bundles-skipping.png` });
      return;
    }

    // Call the API to remove all bundles
    console.log("Calling DELETE /api/v1/bundle with removeAll: true...");
    const result = await page.evaluate(async () => {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) {
        return { ok: false, error: "No auth token" };
      }
      try {
        const response = await fetch("/api/v1/bundle", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({ removeAll: true }),
        });
        return { ok: response.ok, status: response.status };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    console.log(`API remove all bundles result: ${JSON.stringify(result)}`);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-03-removing-all-bundles-api-called.png`,
    });

    // Reload the page to reflect the changes
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-page-reloaded.png` });

    // Verify bundles are cleared by checking the API response (no allocated bundles)
    const tries = 10;
    for (let i = 0; i < tries; i++) {
      const apiCheck = await page.evaluate(async () => {
        const idToken = localStorage.getItem("cognitoIdToken");
        if (!idToken) return { allocated: 0 };
        try {
          const response = await fetch("/api/v1/bundle", {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          const data = await response.json();
          const allocated = (data.bundles || []).filter((b) => b.allocated).length;
          return { allocated };
        } catch {
          return { allocated: -1 };
        }
      });

      if (apiCheck.allocated === 0) {
        console.log(`[polling for removal]: API confirms no allocated bundles.`);
        break;
      }
      console.log(`[polling for removal]: ${apiCheck.allocated} bundles still allocated, waiting 1000ms (${i + 1}/${tries})`);
      await page.waitForTimeout(1000);
      if (i === tries - 1) {
        // Reload once more on final attempt
        await page.reload();
        await page.waitForLoadState("networkidle");
      }
    }

    // Also verify no "Added ✓" buttons remain on the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    const remainingAdded = await page
      .locator("button:has-text('Added ✓')")
      .count()
      .catch(() => 0);
    console.log(`[clear-bundles]: Remaining 'Added ✓' buttons after clear: ${remainingAdded}`);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-07-removed-all-bundles.png`,
    });
  });
}

export async function ensureBundlePresent(page, bundleName = "Test", screenshotPath = defaultScreenshotPath) {
  await test.step(`Ensure ${bundleName} bundle is present (idempotent)`, async () => {
    console.log(`Ensuring ${bundleName} bundle is present...`);
    // If the confirmation text for an added bundle is already visible, do nothing.
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-ensure-bundle.png` });
    let addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
    // const isAddedVisible = await page.getByText("Added ✓").isVisible({ timeout: 16000 });
    // If the "Added ✓" button is not visible, wait 1000ms and try again.
    if (!(await addedLocator.isVisible({ timeout: 1000 }))) {
      const tries = 5;
      for (let i = 0; i < tries; i++) {
        console.log(
          `[polling to ensure present]: "Added ✓ ${bundleName}" button not visible, waiting 1000ms and trying again (${i + 1}/${tries})`,
        );
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-ensure-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-ensure-bundle-waited.png` });
        if (await addedLocator.isVisible({ timeout: 1000 })) {
          console.log(`[polling to ensure present]: ${bundleName} bundle present.`);
          break;
        } else {
          console.log(`[polling to ensure present]: ${bundleName} bundle still not present.`);
        }
      }
    } else {
      console.log(`[polling to ensure present]: ${bundleName} bundle already present.`);
    }
    // Fallback: look for the specific test bundle button by data attribute in case role+name fails (e.g., due to special characters)
    //const bundleId = bundleName.toLowerCase().replace(/\s+/g, "-");
    //if (!(await addedLocator.isVisible())) {
    //  const specificAdded = page.locator(`button.service-btn[data-bundle-id='${bundleId}']:has-text('Added ✓ ${bundleName}')`);
    //  if (await specificAdded.isVisible()) {
    //    addedLocator = specificAdded;
    //  }
    //}
    // Check if the "Request" button exists (it won't for on-pass bundles).
    const requestBtnLocator = page.getByRole("button", { name: `Request ${bundleName}`, exact: false });
    const isRequestVisible = await requestBtnLocator.first().isVisible({ timeout: 2000 }).catch(() => false);
    const isRequestEnabled = isRequestVisible && !(await requestBtnLocator.first().isDisabled().catch(() => true));

    if (isRequestEnabled) {
      // Requestable and enabled bundles: skip if already present
      if (await addedLocator.isVisible({ timeout: 32000 })) {
        console.log(`${bundleName} bundle already present, skipping request.`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-ensure-bundle-skipping.png` });
        return;
      }
      console.log(`${bundleName} bundle not present, requesting via UI...`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-bundle-adding.png` });
      await requestBundle(page, bundleName, screenshotPath);
    } else {
      // On-pass bundles (visible but disabled) or not visible: re-grant via pass API to ensure fresh tokens
      console.log(`"Request ${bundleName}" button not enabled (on-pass bundle), using pass API for fresh grant...`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-bundle-adding.png` });
      const bundleId = bundleName.toLowerCase().replace(/\s+/g, "-");
      await ensureBundleViaPassApi(page, bundleId, screenshotPath);
    }
  });
}

export async function removeBundle(page, bundleName = "Test", screenshotPath = defaultScreenshotPath) {
  await test.step(`Remove ${bundleName} bundle via UI`, async () => {
    console.log(`Removing ${bundleName} bundle...`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-remove-bundle.png` });

    // Look for the remove button in the current bundles section
    const bundleId = bundleName.toLowerCase().replace(/\s+/g, "-");
    const removeLocator = page.locator(`button[data-remove-bundle-id="${bundleId}"]`);
    if (await removeLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
      await removeLocator.click();
      console.log(`Clicked remove button for ${bundleName}`);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-remove-bundle-clicked.png` });
    } else {
      // Fallback: remove via API
      console.log(`Remove button for ${bundleName} not found in UI, removing via API...`);
      const result = await page.evaluate(async (bid) => {
        const idToken = localStorage.getItem("cognitoIdToken");
        if (!idToken) return { ok: false, error: "No auth token" };
        try {
          const response = await fetch(`/api/v1/bundle/${bid}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
          });
          return { ok: response.ok, status: response.status };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }, bundleId);
      console.log(`API remove ${bundleName} result: ${JSON.stringify(result)}`);
      await page.reload();
      await page.waitForLoadState("networkidle");
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-remove-bundle-done.png` });

    // Verify the bundle is removed: "Request <bundle>" should reappear (may include token label)
    await expect(page.locator(`button.service-btn:has-text("Request ${bundleName}")`)).toBeVisible({ timeout: 16000 });
    console.log(`${bundleName} bundle removed successfully`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-remove-bundle-confirmed.png` });
  });
}

export async function verifyBundleApiResponse(page, screenshotPath = defaultScreenshotPath) {
  return await test.step("Verify bundle API response structure", async () => {
    const apiResponse = await page.evaluate(async () => {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return { error: "No auth token" };
      try {
        const response = await fetch("/api/v1/bundle", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        return await response.json();
      } catch (err) {
        return { error: err.message };
      }
    });
    console.log(`Bundle API response: ${JSON.stringify(apiResponse)}`);
    return apiResponse;
  });
}

export async function ensureBundleViaPassApi(page, bundleId, screenshotPath = defaultScreenshotPath) {
  return await test.step(`Ensure ${bundleId} bundle via pass API`, async () => {
    console.log(`Creating and redeeming pass for bundle ${bundleId}...`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-01-creating.png` });

    // Step 1: Create a pass via admin API (no auth required)
    const createResult = await page.evaluate(async (bid) => {
      try {
        const response = await fetch("/api/v1/pass/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passTypeId: bid,
            bundleId: bid,
            validityPeriod: "P1D",
            maxUses: 1,
            createdBy: "behaviour-test",
          }),
        });
        const body = await response.json();
        return { ok: response.ok, code: body?.data?.code || body?.code, body };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }, bundleId);

    console.log(`Pass creation result: ${JSON.stringify(createResult)}`);
    if (!createResult.ok || !createResult.code) {
      throw new Error(`Failed to create pass for ${bundleId}: ${JSON.stringify(createResult)}`);
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-02-created.png` });

    // Step 2: Redeem the pass (authenticated)
    const redeemResult = await page.evaluate(async (code) => {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return { ok: false, error: "No auth token" };
      try {
        const response = await fetch("/api/v1/pass", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({ code }),
        });
        return await response.json();
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }, createResult.code);

    console.log(`Pass redemption result: ${JSON.stringify(redeemResult)}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-03-redeemed.png` });

    // Reload page to reflect bundle changes
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-04-reloaded.png` });

    return redeemResult;
  });
}

export async function getTokensRemaining(page, bundleId) {
  return page.evaluate(async (bid) => {
    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) return null;
    const response = await fetch("/api/v1/bundle", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await response.json();
    const bundle = (data.bundles || []).find((b) => b.bundleId === bid && b.allocated);
    return bundle?.tokensRemaining ?? null;
  }, bundleId);
}

export async function requestBundleViaApi(page, bundleId) {
  return await page.evaluate(async (bid) => {
    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) return { error: "No auth token" };
    try {
      const response = await fetch("/api/v1/bundle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({ bundleId: bid, qualifiers: {} }),
      });
      const body = await response.json();
      return { statusCode: response.status, ...body };
    } catch (err) {
      return { error: err.message };
    }
  }, bundleId);
}

export async function verifyAlreadyGranted(page, bundleId, screenshotPath = defaultScreenshotPath) {
  return await test.step(`Verify ${bundleId} returns already_granted on re-request`, async () => {
    const result = await requestBundleViaApi(page, bundleId);
    console.log(`[already-granted]: ${bundleId} - status: ${result.status}, statusCode: ${result.statusCode}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-already-granted-${bundleId}.png` });
    return result;
  });
}

export async function requestBundle(page, bundleName = "Test", screenshotPath = defaultScreenshotPath) {
  await test.step(`The user requests a ${bundleName} bundle and sees a confirmation message`, async () => {
    console.log(`Requesting ${bundleName} bundle...`);
    // Use substring matching for button text (may include token label like "(3 tokens)")
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-request-bundle.png` });
    let requestBtnLocator = page.locator(`button.service-btn:has-text("Request ${bundleName}")`);
    if (!(await requestBtnLocator.first().isVisible({ timeout: 1000 }))) {
      const tries = 5;
      for (let i = 0; i < tries; i++) {
        console.log(
          `[polling be ready to request]: "Request ${bundleName}" button not visible, waiting 1000ms and trying again (${i + 1}/${tries})`,
        );
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-request-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-request-bundle-waited.png` });
        requestBtnLocator = page.locator(`button.service-btn:has-text("Request ${bundleName}")`);
        if (await requestBtnLocator.first().isVisible({ timeout: 1000 })) {
          console.log(`[polling be ready to request]: ${bundleName} bundle request button visible.`);
          break;
        } else {
          console.log(`[polling be ready to request]: ${bundleName} bundle request button still not visible.`);
        }
      }
    } else {
      console.log(`[polling be ready to request]: ${bundleName} bundle request button already visible.`);
    }

    // If the button is not visible, check if "Added ✓" is visible instead and if so, skip the request.
    if (!(await requestBtnLocator.first().isVisible({ timeout: 1000 }))) {
      const addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
      if (await addedLocator.isVisible({ timeout: 1000 })) {
        console.log(`${bundleName} bundle already present, skipping request.`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-request-bundle-skipping.png` });
        return;
      } else {
        console.log(`${bundleName} bundle request button still not visible, assuming it's a different error.`);
      }
    }

    // Request the bundle (has-text does substring match, works with token labels)
    await loggedClick(page, `button:has-text('Request ${bundleName}')`, `Request ${bundleName}`, { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-request-bundle-clicked.png` });

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-ensure-bundle.png` });
    let addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
    if (!(await addedLocator.isVisible({ timeout: 1000 }))) {
      const tries = 20;
      for (let i = 0; i < tries; i++) {
        console.log(
          `[polling to ensure request completed]: "Added ✓ ${bundleName}" button not visible, waiting 1000ms and trying again (${i + 1}/${tries})`,
        );
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-ensure-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-ensure-bundle-waited.png` });
        if (await addedLocator.isVisible({ timeout: 1000 })) {
          console.log(`[polling to ensure request completed]: ${bundleName} bundle present.`);
          break;
        } else {
          console.log(`[polling to ensure request completed]: ${bundleName} bundle still not present.`);
        }
      }
    } else {
      console.log(`[polling to ensure request completed]: ${bundleName} bundle already present.`);
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-request-bundle.png` });
    await expect(page.getByRole("button", { name: `Added ✓ ${bundleName}` })).toBeVisible({ timeout: 32000 });
  });
}
