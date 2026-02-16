# PLAN: Fix paymentBehaviour-ci Stripe Checkout Redirect Timeout

## User Assertion
> Investigate and fix "The paymentBehaviour-ci failure (Stripe checkout redirect timeout) needs separate investigation — it's not related to the salt migration."

## Key Finding: This Test Has NEVER Passed in CI

The test was **always failing** but was hidden by missing `pipefail` in the npm test scripts. Commit `27eb5bbf` ("fix: update test scripts to use bash for improved error handling") added `set -o pipefail` to all test scripts, which exposed the pre-existing failure.

### Evidence
- **Run 22044130350** (last "successful" deploy, 2026-02-15): paymentBehaviour-ci job reported `conclusion: success` but logs show `✘ 1 failed` with `(0ms)` — failed instantly because salt was raw string (pre-migration). The `tee` pipe without `pipefail` masked the exit code.
- **Run 22047106611** (fresh deploy with salt migrated, 2026-02-16): paymentBehaviour-ci fails at Stripe checkout redirect timeout. Salt works now, test gets further but Stripe never redirects.

## Current Failure: Stripe Checkout Redirect Timeout

### What Works
1. Login + Cognito auth — OK
2. Day-guest pass creation and redemption — OK
3. Token drain (3 tokens consumed) — OK
4. Activities disabled verification — OK
5. Upsell link to bundles — OK
6. Checkout session creation — OK (`cs_test_...` session, `testPass=true`)
7. Navigate to `checkout.stripe.com` — OK
8. Stripe form renders (submit button visible) — OK
9. Card accordion expanded ("Clicked Card label text" — fallback path) — OK
10. All 4 fields filled: card `4242 4242 4242 4242`, expiry `12 / 30`, CVC `123`, name `Test User` — OK
11. Submit button clicked — OK (no error thrown)

### Where It Fails
12. **`page.waitForURL(/bundles\.html/, { timeout: 120_000 })` at line 622** — Stripe never redirects back. 120 seconds of silence, then timeout.

### CI Logs (run 22047106611, job 63698863902)
```
01:53:39 Checkout URL: https://checkout.stripe.com/c/pay/cs_test_... (simulator=false, stripe=true)
01:53:40 Stripe test checkout: waiting for Stripe form to render...
01:53:41 Stripe checkout form rendered (submit button visible)
01:53:45 Clicked Card label text
01:53:46 Stripe checkout: filled fields: [card, expiry, cvc, name]
01:53:46 Stripe checkout: payment submitted, waiting for redirect...
01:55:47 [afterEach] ... (timeout, 2 minutes later)
```

Also: `[BROWSER CONSOLE error]: Failed to load resource: the server responded with a status of 403 ()` — appears on initial page load, before Stripe. Likely a static resource (CSS/JS) returning 403 from CloudFront. May be unrelated but worth investigating.

## Root Cause Analysis

### Probable Cause: Submit Button Click Not Registering

**File:** `behaviour-tests/steps/behaviour-bundle-steps.js:618`

```javascript
// Click the submit/pay button
await submitButton.first().click();  // ← NO force: true!
```

All other clicks in the Stripe checkout flow use `force: true` because Stripe overlays (Link, express checkout) can obscure elements:
- Line 542: `await cardRadio.click({ force: true });`
- Line 548: `await cardLabel.click({ force: true });`
- Line 562: `await cardNumberInput.first().click({ force: true });`
- Line 575: `await expiryInput.first().click({ force: true });`
- Line 589: `await cvcInput.first().click({ force: true });`
- Line 603: `await nameInput.first().click({ force: true });`

But the submit button click at line 618 does NOT use `force: true`. If a Stripe overlay (Link popup, express checkout button) covers the submit button, the click is absorbed by the overlay instead.

From MEMORY.md:
> Must use `force: true` on all clicks — Stripe overlays (Link, express checkout) obscure elements

### Secondary Issue: No Error Detection After Submit

After clicking submit, the test immediately waits 120s for a URL change. If Stripe shows a validation error (e.g., invalid card format, payment declined), the test wouldn't detect it. It should check for error messages before the long timeout.

### Environment Variables
- `DIY_SUBMIT_BASE_URL=https://ci-submit.diyaccounting.co.uk/` (in `.env.ci`) — correct
- `success_url` in checkout session: `${baseUrl}bundles.html?checkout=success` — correct for CI
- Stripe test mode: using `cs_test_*` sessions — correct

### Proxy vs CI Behavior
- **Proxy** (`-proxy`): Uses real Stripe test mode with ngrok webhook. Test outcome unknown — was also likely hidden by `pipefail`.
- **Simulator** (`-simulator`): Uses simulator checkout that auto-completes. Always passes.
- **CI** (`-ci`): Uses real Stripe test mode against deployed Lambda. Fails at redirect.

## Proposed Fix

### Step 1: Add `force: true` to submit button click

**File:** `behaviour-tests/steps/behaviour-bundle-steps.js:618`

```javascript
// Before:
await submitButton.first().click();

// After:
await submitButton.first().click({ force: true });
```

### Step 2: Add error detection after submit

After clicking submit, check for Stripe error messages before waiting for the long redirect timeout:

```javascript
await submitButton.first().click({ force: true });
console.log("Stripe checkout: payment submitted, waiting for redirect...");

// Check for Stripe error messages (payment declined, validation errors)
await page.waitForTimeout(5000);
const stripeError = page.locator('.StripeError, [data-testid="error-message"], .p-FieldError');
if (await stripeError.isVisible({ timeout: 2000 }).catch(() => false)) {
  const errorText = await stripeError.textContent().catch(() => "unknown");
  throw new Error(`Stripe payment error: ${errorText}`);
}
```

### Step 3: Add screenshot after submit click

```javascript
await submitButton.first().click({ force: true });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-05b-after-submit.png`, fullPage: true });
```

### Step 4: Investigate the 403 error

Check what resource returns 403 on initial page load. May be CloudFront serving a cached error for a static asset. Add network logging to identify the URL.

## Verification

1. Run `npm run test:paymentBehaviour-proxy` locally to see if proxy passes with the fix
2. Push and monitor CI run for paymentBehaviour-ci
3. Check the diagnostic screenshots from CI artifacts

## Files to Change

| File | Change |
|------|--------|
| `behaviour-tests/steps/behaviour-bundle-steps.js` | Add `force: true` to submit click (line 618), add error detection, add post-submit screenshot |

## Related Code

- **Checkout session creation:** `app/functions/billing/billingCheckoutPost.js` — creates Stripe session with `success_url` and `hashedSub` metadata
- **Webhook handler:** `app/functions/billing/billingWebhookPost.js` — processes `checkout.session.completed` event (async, doesn't affect redirect)
- **Test steps:** `behaviour-tests/steps/behaviour-bundle-steps.js:460-640` — full checkout flow
- **Test spec:** `behaviour-tests/payment.behaviour.test.js:170` — payment funnel test

## Status
- [x] Root cause identified: submit button click missing `force: true`
- [x] Pre-existing failure confirmed (never passed in CI, hidden by `pipefail`)
- [x] Fix implemented: `force: true` on submit click + error detection + post-submit screenshot
- [x] Proxy test verified locally: **PASSED** (1 passed, 2.3m)
- [x] CI test: Stripe redirect now works (fix confirmed), but **webhook activation times out** — `checkout.session.completed` webhook never fires within 45s. This is a separate issue (webhook endpoint configuration in CI, not the Stripe form interaction).
- [ ] Investigate CI webhook failure (separate issue)
