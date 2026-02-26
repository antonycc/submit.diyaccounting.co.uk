# Payment Lifecycle Plan

**Created**: 17 February 2026
**Updated**: 26 February 2026
**Status**: In progress — Phase 1 handlers implemented, Phases 3 and 4.1 complete, gaps remain in tests and hardening
**Supersedes**: Phases 2, 4-7 of PLAN_PAYMENT_GOLIVE.md (Phase 1 and 3 are COMPLETE)

---

## User Assertions (verbatim)

> I can cancel the subscription but a month was bought already so I can't tell if the lifecycle events are working but I don't think we implemented that.

> Also done enough for this (I generated passes using the workflow): Pass Generation Activity in the main UI will be a later task while the tests run.

> I have just manually subscribed to the resident pro bundle and submitted VAT: request-id 84120054-197a-4ce1-8f60-9f36a3a62614

---

## Current State (26 Feb 2026)

### What Works

- **Checkout flow**: User subscribes via Stripe Checkout, `checkout.session.completed` webhook grants bundle with subscription fields
- **Renewal handling**: `invoice.paid` webhook resets tokens, updates `currentPeriodEnd`, updates subscription record, sends Telegram "subscription-renewed"
- **Cancellation intent**: `customer.subscription.updated` webhook writes `cancelAtPeriodEnd` and `subscriptionStatus` to both bundle and subscription records
- **Cancellation complete**: `customer.subscription.deleted` webhook marks `subscriptionStatus = "canceled"`, sends Telegram "subscription-canceled"
- **Payment failure**: `invoice.payment_failed` webhook sends Telegram "payment-failed" notification
- **Audit events**: `charge.refunded` and `charge.dispute.created` logged in handler code
- **Bundle persistence**: Bundles stored in DynamoDB with `subscriptionId`, `subscriptionStatus`, `currentPeriodEnd`, `tokensGranted`, `tokenResetAt`
- **Stripe portal**: "Manage Subscription" navigates to Stripe billing portal for cancellation/payment method update
- **Salt versioning**: Multi-version salt registry, read-path fallback, 5-minute TTL cache (Scenario K fix)
- **Telegram alerting**: Test and live channels correctly routed by bundle qualifier
- **Behaviour tests**: `paymentBehaviour` covers full funnel including portal cancellation (proxy + CI passing)
- **Synthetic tests**: `paymentBehaviour` in `synthetic-test.yml` choices and `deploy.yml` post-deployment matrix

### Manual Test Results (17 Feb 2026, prod)

- User `f6e2c2a4-50b1-70ea-fbd2-fa5b43edca7d` (Google-federated, prod Cognito)
- Active `resident-pro` subscription: `sub_1T1cF2FdFHdRoTOj6E7qXDye`
- 100 tokens granted, period ends 2026-03-17
- Successfully submitted VAT to sandbox HMRC (request-id `84120054-197a-4ce1-8f60-9f36a3a62614`)
- First renewal due **17 March 2026** — will validate `invoice.paid` handler on real renewal

### Stripe Webhook Delivery Issue (25 Feb 2026)

Stripe emailed about delivery failures to `https://ci-submit.diyaccounting.co.uk/api/v1/billing/webhook`:
- 21 "could not connect" + 1 "other error" since 22 Feb 2026 22:07 UTC
- Stripe will stop attempting by 3 March 2026

**Root cause**: CI is ephemeral. On 22 Feb there were 9+ commits/deploys. Between teardown of old CI deployments (SelfDestruct/sweeper) and `set-origins` completing for new ones, the custom domain mapping points to a deleted API Gateway — causing TCP connection refused.

**Impact on CI**: Expected — CI goes up and down with every push. No real subscriptions exist in CI.

**Impact on prod**: None — prod uses a separate, stable endpoint and account (`acct_1SyN2kFdFHdRoTOj`). The failing account is `acct_1SyN2kCD0Ld2ukzI` (CI/proxy Stripe account).

**Resolution options**:
1. Accept CI failures as expected — disable Stripe alerting for the CI webhook endpoint (configure in Stripe Dashboard → Webhooks → CI endpoint → disable failure emails)
2. Remove the CI webhook from `stripe-setup.js` entirely and rely on behaviour tests for CI verification
3. Keep as-is and treat the emails as informational

**Recommendation**: Option 1 — suppress alerts for the CI endpoint. The `paymentBehaviour-ci` synthetic test validates the webhook path on every CI deployment; Stripe's own retry mechanism is redundant for CI.

### Gaps and Risks

| # | Gap | Severity | Detail |
|---|-----|----------|--------|
| G1 | `handlePaymentFailed` doesn't update bundle status | Medium | Plan spec says set `subscriptionStatus = "past_due"` on bundle record; code only sends Telegram |
| G2 | `handleSubscriptionUpdated` has no Telegram notification | Low | Plan spec says send notification for cancellation intent; code updates DynamoDB silently |
| G3 | `charge.dispute.created` has no CloudWatch alarm or Telegram | Medium | Code only logs; plan spec says emit `BillingDisputeCreated` alarm and Telegram ops alert |
| G4 | No unit tests for lifecycle handlers | Medium | Plan spec lists `billingWebhookLifecycle.test.js` — file does not exist |
| G5 | No system tests for lifecycle handlers | Medium | Plan spec lists `billingLifecycle.system.test.js` — file does not exist |
| G6 | Stripe event name mismatch in `stripe-setup.js` | High | Registers `invoice.payment_succeeded` (old name) but handler checks `invoice.paid` (new name). On API version `2024-12-18.acacia` Stripe sends `invoice.paid`, so the registration should use the current name. Works today because Stripe maps old→new, but fragile. |
| G7 | `charge.refunded` and `charge.dispute.created` not registered | Medium | Handler code exists but `stripe-setup.js` does not include these in `enabled_events`, so Stripe never delivers them |
| G8 | No CloudWatch EMF billing metrics | Low | Plan Phase 4.5 — none implemented yet |
| G9 | CI Stripe webhook delivery failures | Low | CI is ephemeral — Stripe can't reach it during deploys. Suppress alerts or remove CI endpoint. No prod impact. |

---

## Phase 1: Subscription Lifecycle Handlers — MOSTLY DONE

**Goal**: Handle Stripe renewal, cancellation, and payment failure events so subscriptions work beyond the first billing cycle.

### 1.1 handleInvoicePaid (renewal) — DONE

Implemented in `billingWebhookPost.js:169-223`. On `invoice.paid`:
- Looks up subscription record by `stripe#${subscriptionId}`
- Resets tokens via `resetTokensByHashedSub()`
- Updates `currentPeriodEnd` and `expiry` on bundle
- Updates subscription record status to `active`
- Sends Telegram "subscription-renewed"

### 1.2 handleSubscriptionUpdated — DONE (partial)

Implemented in `billingWebhookPost.js:225-253`. On `customer.subscription.updated`:
- Updates `subscriptionStatus` and `cancelAtPeriodEnd` on bundle record
- Updates subscription record

**Gap G2**: No Telegram notification for cancellation intent. Low priority — user already sees the change in Stripe portal.

### 1.3 handleSubscriptionDeleted — DONE

Implemented in `billingWebhookPost.js:255-290`. On `customer.subscription.deleted`:
- Marks bundle `subscriptionStatus = "canceled"`
- Updates subscription record with `canceledAt` timestamp
- Sends Telegram "subscription-canceled"
- Bundle remains usable until `currentPeriodEnd` (Stripe grace behaviour)

### 1.4 handlePaymentFailed — DONE (partial)

Implemented in `billingWebhookPost.js:292-315`. On `invoice.payment_failed`:
- Sends Telegram "payment-failed" notification
- Stripe handles retry automatically (Smart Retries)

**Gap G1**: Does NOT update `subscriptionStatus = "past_due"` on bundle record. If Stripe retries fail, `customer.subscription.updated` with `status: "past_due"` will arrive separately (handled by 1.2), so the gap is partially mitigated. However, there's a window between payment failure and subscription status update where the bundle status is stale.

### 1.5 handleRefund and handleDispute — DONE (code only, not wired)

Code exists in `billingWebhookPost.js:372-377`:
- `charge.refunded`: Audit log only (correct — subscription status drives access)
- `charge.dispute.created`: Warning log only

**Gap G7**: These events are NOT registered in `stripe-setup.js` `enabled_events`, so Stripe will never deliver them. Dead code until registration is added.

**Gap G3**: `charge.dispute.created` should emit CloudWatch alarm and Telegram ops alert per plan spec.

### 1.6 Tests — NOT DONE

No unit tests or system tests exist for lifecycle handlers.

**Planned files** (not yet created):
- `app/unit-tests/functions/billing/billingWebhookLifecycle.test.js`
- `app/system-tests/billing/billingLifecycle.system.test.js`

**Behaviour test coverage**: `payment.behaviour.test.js` Step 10 exercises portal cancellation and waits for `customer.subscription.updated` webhook via `waitForCancellationWebhook()`. This provides integration-level validation of the cancellation path but does not cover `invoice.paid`, `payment_failed`, refund, or dispute.

### 1.7 Fix stripe-setup.js event registration — NOT DONE

**Gap G6**: Update `scripts/stripe-setup.js` enabled_events:
- Change `invoice.payment_succeeded` → `invoice.paid` (match current API version)
- Add `charge.refunded` and `charge.dispute.created` (Gap G7)

**Note**: Existing webhook endpoints in Stripe need to be updated (delete + recreate or use update API). This affects proxy, CI, and prod endpoints.

### Validation

Deploy to CI. All lifecycle events handled correctly. Token refresh on renewal verified. Cancellation preserves access until period end. `npm test` and `./mvnw clean verify` pass. `paymentBehaviour` tests still pass.

**Remaining before Phase 1 is fully complete**:
- [ ] Fix G1: Add `subscriptionStatus = "past_due"` update to `handlePaymentFailed`
- [ ] Fix G6/G7: Update `stripe-setup.js` event registration
- [ ] Create unit tests (1.6)
- [ ] Create system tests (1.6)
- [ ] Fix G3: Add CloudWatch alarm + Telegram to `charge.dispute.created` (can defer to Phase 4)

---

## Phase 2: Human Test in Prod

**Status**: Partially done. User manually subscribed, submitted VAT, verified Telegram.

**Timeline**: First renewal due **17 March 2026** (19 days from now). Lifecycle handlers are deployed but untested against a real Stripe renewal.

**Remaining**:
- Observe Telegram notification on 17 March renewal (`invoice.paid` → "subscription-renewed")
- Verify tokens reset to 100 and `currentPeriodEnd` advances by 1 month
- Walk through cancellation flow via Stripe portal, verify `cancelAtPeriodEnd = true` in DynamoDB
- After cancellation: verify bundle remains usable until `currentPeriodEnd`
- After `currentPeriodEnd`: verify bundle expires and access is revoked

### Validation

Human tester completes full lifecycle: subscribe → use → cancel → verify access until period end → verify no access after expiry. Telegram channels show correct activity.

---

## Phase 3: Synthetic Tests in Prod — DONE

`paymentBehaviour` is already configured in both workflows:

- `synthetic-test.yml:48` — available as a manual choice
- `deploy.yml:1709-1725` — runs automatically post-deployment

Cognito native auth enable/disable scripts (`npm run test:enableCognitoNative`, `npm run test:disableCognitoNative`) are available for prod.

### Validation

`npm run test:paymentBehaviour-prod` passes. Runs automatically on prod deployment. ✅

---

## Phase 4: Compliance and Abuse Protection

### 4.1 Accessibility scanning — DONE

`/usage.html` and `/bundles.html` are already in:
- `.pa11yci.prod.json` (lines 18-19)
- `.pa11yci.proxy.json` (lines 18-19)
- `.pa11yci.ci.json` (lines 18-19)

### 4.2 Security scanning

- Verify OWASP ZAP baseline covers `/api/v1/billing/*` paths
- Verify ESLint security scan covers billing Lambdas

### 4.3 Documentation updates

- FAQ entries in `faqs.toml`: subscription lifecycle, cancellation, token refresh
  - Current `faqs.toml` has entries for HMRC payment but NOT for Stripe subscription lifecycle
  - Need: "How do I cancel my subscription?", "What happens when my subscription renews?", "What if my payment fails?"
- Update guide page with subscription section
- Update about page with Resident Pro pricing
- Update accessibility statement

### 4.4 Stripe hardening

- Verify Stripe Radar enabled
- Configure 3D Secure
- Set weekly payout schedule (7-10 day chargeback buffer)
- UK Distance Selling compliance: consent collection on Checkout (14-day cooling-off period)

### 4.5 CloudWatch billing metrics — NOT DONE (Gap G8)

Emit EMF metrics from billing Lambdas:
- `BillingCheckoutCreated`, `BillingBundleGranted`, `BillingPaymentFailed`, `BillingSubscriptionCanceled`, `BillingDisputeCreated`

CloudWatch alarms: payment failure rate spike, any dispute, webhook delivery failures.

Currently: no EMF metrics are emitted from any billing handler. All observability is via structured logging and Telegram activity events.

### Validation

Pa11y, axe, Lighthouse pass. ZAP no new issues. FAQ pages complete. Stripe Radar active. CloudWatch metrics visible.

---

## Phase 5: Production Go-Live

### 5.1 Verify dual-credential routing

- Test pass → sandbox HMRC + test Stripe (already verified)
- Live pass → live HMRC + live Stripe (verify this path)

### 5.2 End-to-end live validation

Issue a non-test pass, walk through full journey with real HMRC and real Stripe (GBP 9.99). Refund afterwards.

### 5.3 Catalogue visibility

Add `resident-pro` to `listedInEnvironments` for production.

Currently both `day-guest` and `resident-pro` have `listedInEnvironments` commented out in `submit.catalogue.toml` (closed beta). Uncommenting makes the bundles visible to all users in the given environments.

### 5.4 Synthetic test coexistence

Test and live passes coexist. Synthetic tests never create live side effects.

### 5.5 Monitor first real transactions

CloudWatch dashboard, Stripe dashboard, Telegram live channel, Stripe Radar scoring.

### Validation

One real charge processed and refunded. Live HMRC submission succeeds. Subscription lifecycle works end-to-end. Synthetic tests pass alongside live traffic.

---

## Cleanup Items (from PLAN_SUB_HASH_VERSIONING.md)

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| Delete GitHub Actions run 22079622301 | High | Unknown | Contains prod v2 passphrase in logs — verify if still accessible |
| Clean up unused prod Cognito GitHub variables | Low | Open | COGNITO_CLIENT_ID, COGNITO_USER_POOL_ARN, COGNITO_USER_POOL_ID |
| Path 3: KMS-encrypted salt in DynamoDB | Low | Open | Script needed to encrypt and write item; Path 1+2 already available |
| CI behaviour tests post-migration | Medium | Open | Need fresh deploy to verify |

---

## Completed Work (reference)

These items are DONE and do not need further action:

- **PLAN_PAYMENT_BEHAVIOUR_CI_FIX.md**: Archived. All Stripe checkout CI failures resolved.
- **PLAN_PAYMENT_GOLIVE.md Phase 1**: CI validation complete. paymentBehaviour-ci passing.
- **PLAN_PAYMENT_GOLIVE.md Phase 3**: Frontend subscribe button working. Checkout + webhook + portal.
- **PLAN_SUB_HASH_VERSIONING.md Phases A-I**: All code, migrations, CI+prod migrations done.
- **Salt cache TTL fix**: 5-minute TTL in subHasher.js (commit af2ec076).
- **Lean deploy DEPLOYMENT_NAME fix**: Commented out in .env.prod and .env.ci.
- **Pass generation**: Done via admin workflow (UI-based generation deferred).
- **Phase 1 lifecycle handlers**: All six event types handled in `billingWebhookPost.js` (checkout, invoice.paid, subscription.updated, subscription.deleted, payment_failed, refund, dispute).
- **Phase 3 synthetic tests**: `paymentBehaviour` in `synthetic-test.yml` and `deploy.yml`.
- **Phase 4.1 accessibility**: Pa11y configs include `usage.html` and `bundles.html`.

---

## Phase Dependencies (updated)

```
Phase 1: Subscription Lifecycle Handlers — MOSTLY DONE (gaps: G1, G3, G6, G7, tests)
    |
    v
Phase 2: Human Test in Prod — IN PROGRESS (first renewal 17 March 2026)
    |
    |--- Phase 3: Synthetic Tests in Prod — DONE
    |
    v
Phase 4: Compliance & Abuse Protection (4.1 DONE, rest pending)
    |
    v
Phase 5: Production Go-Live (live passes, real HMRC, real Stripe)
```

Phase 3 no longer blocks Phase 4 (it's complete). Phase 2 observation of the 17 March renewal is a time-gated dependency — code work in Phase 4 can proceed in parallel.

---

*Created 17 February 2026. Updated 26 February 2026. Consolidates remaining work from PLAN_PAYMENT_GOLIVE.md (Phases 2, 4-7), cleanup items from PLAN_SUB_HASH_VERSIONING.md, and verified status from PLAN_PAYMENT_BEHAVIOUR_CI_FIX.md (archived).*
