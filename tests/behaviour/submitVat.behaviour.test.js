// tests/behaviour/submitVat.behaviour.test.js
import { test, expect } from "@playwright/test";

test.use({
  // record video of the test
  video: "on",
});

test("Submit VAT return end-to-end flow", async ({ page }) => {
  // Stub the backend endpoints
  await page.route("**/api/auth-url*", (route) => {
    const url = new URL(route.request().url());
    const state = url.searchParams.get("state");
    // Redirect immediately back into the app callback
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authUrl: `http://127.0.0.1:3000/callback?code=test-code&state=${encodeURIComponent(state)}`,
      }),
    });
  });
  await page.route("**/api/exchange-token", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessToken: "test-token" }),
    }),
  );
  await page.route("**/api/submit-vat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        formBundleNumber: "TESTFB123",
        chargeRefNumber: "TESTCR456",
        processingDate: new Date().toISOString(),
      }),
    }),
  );
  await page.route("**/api/log-receipt", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "receipt logged" }),
    }),
  );

  // 1) Navigate to the app
  await page.goto("http://127.0.0.1:3000");
  await page.screenshot({ path: "tests/behaviour/screenshots/initial.png" });

  // 2) Fill out the VAT form
  await page.fill("#vrn", "123456789");
  await page.fill("#periodKey", "24A1");
  await page.fill("#vatDue", "1000.00");
  await page.screenshot({ path: "tests/behaviour/screenshots/form-filled.png" });

  // 3) Submit the form and follow the OAuth redirect back in-app
  await Promise.all([page.waitForNavigation({ url: /\/callback\?code=test-code&state=/ }), page.click("#submitBtn")]);
  await page.screenshot({ path: "tests/behaviour/screenshots/after-callback.png" });

  // 4) Wait for and verify the receipt display
  const header = page.locator(".receipt-header");
  await expect(header).toHaveText(/VAT Return Submitted Successfully/);
  await page.screenshot({ path: "tests/behaviour/screenshots/receipt.png", fullPage: true });
});
