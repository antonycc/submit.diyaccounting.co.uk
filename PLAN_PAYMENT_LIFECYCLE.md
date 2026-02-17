# Payment Lifecycle Plan

**Created**: 17 February 2026
**Status**: New — consolidates all remaining payment work from PLAN_PAYMENT_GOLIVE.md, PLAN_SUB_HASH_VERSIONING.md, and PLAN_PAYMENT_BEHAVIOUR_CI_FIX.md
**Supersedes**: Phases 2, 4-7 of PLAN_PAYMENT_GOLIVE.md (Phase 1 and 3 are COMPLETE)

---

## User Assertions (verbatim)

> I can cancel the subscription but a month was bought already so I can't tell if the lifecycle events are working but I don't think we implemented that.

> Also done enough for this (I generated passes using the workflow): Pass Generation Activity in the main UI will be a later task while the tests run.

> I have just manually subscribed to the resident pro bundle and submitted VAT: request-id 84120054-197a-4ce1-8f60-9f36a3a62614

---

## Current State (17 Feb 2026)

### What Works

- **Checkout flow**: User subscribes via Stripe Checkout, `checkout.session.completed` webhook grants bundle with subscription fields
- **Bundle persistence**: Bundles stored in DynamoDB with `subscriptionId`, `subscriptionStatus`, `currentPeriodEnd`, `tokensGranted`, `tokenResetAt`
- **Stripe portal**: "Manage Subscription" navigates to Stripe billing portal for cancellation/payment method update
- **Salt versioning**: Multi-version salt registry, read-path fallback, 5-minute TTL cache (Scenario K fix)
- **Telegram alerting**: Test and live channels correctly routed by bundle qualifier
- **Behaviour tests**: `paymentBehaviour` covers full funnel (proxy + CI passing)

### Manual Test Results (17 Feb 2026, prod)

- User `f6e2c2a4-50b1-70ea-fbd2-fa5b43edca7d` (Google-federated, prod Cognito)
- Active `resident-pro` subscription: `sub_1T1cF2FdFHdRoTOj6E7qXDye`
- 100 tokens granted, period ends 2026-03-17
- Successfully submitted VAT to sandbox HMRC (request-id `84120054-197a-4ce1-8f60-9f36a3a62614`)
- First renewal due **17 March 2026** — will test `invoice.paid` handler if implemented by then

### What's Missing

The webhook handler (`app/functions/billing/billingWebhookPost.js`) only processes `checkout.session.completed`. All other Stripe events are logged and ignored. This means:

| Event | Current behaviour | Required behaviour |
|-------|-------------------|-------------------|
| `invoice.paid` (renewal) | Ignored | Reset tokens, update period end |
| `customer.subscription.updated` | Ignored | Write `cancelAtPeriodEnd`, handle `past_due` |
| `customer.subscription.deleted` | Ignored | Mark `subscriptionStatus = "canceled"` |
| `invoice.payment_failed` | Ignored | Update status to `past_due`, emit metric |
| `charge.refunded` | Ignored | Log for audit |
| `charge.dispute.created` | Ignored | Log, emit CloudWatch alarm |

---

## Phase 1: Subscription Lifecycle Handlers

**Goal**: Handle Stripe renewal, cancellation, and payment failure events so subscriptions work beyond the first billing cycle.

### 1.1 handleInvoicePaid (renewal)

On `invoice.paid` (for subscription invoices, not one-off):
- Extract `hashedSub` from subscription metadata (set during checkout)
- Reset tokens: `tokensConsumed = 0`, `tokenResetAt = now`
- Update `currentPeriodEnd` from invoice's `period_end`
- Update `subscriptionStatus = "active"` (in case it was `past_due`)
- Send Telegram notification (live or test channel based on bundle qualifier)

**Key file**: `app/functions/billing/billingWebhookPost.js`
**Data layer**: `dynamoDbBundleRepository.js` — `resetTokensByHashedSub()` already exists

### 1.2 handleSubscriptionUpdated

On `customer.subscription.updated`:
- Update `cancelAtPeriodEnd` on bundle record (user requested cancellation via portal)
- Update `subscriptionStatus` if changed (e.g., `active` → `past_due`)
- Send Telegram notification for cancellation intent

### 1.3 handleSubscriptionDeleted

On `customer.subscription.deleted`:
- Mark bundle `subscriptionStatus = "canceled"`
- Bundle remains usable until `currentPeriodEnd` (Stripe's standard grace behaviour)
- After `currentPeriodEnd`, standard expiry logic handles removal
- Send Telegram notification

### 1.4 handlePaymentFailed

On `invoice.payment_failed`:
- Update `subscriptionStatus = "past_due"` on bundle record
- Emit CloudWatch EMF metric `BillingPaymentFailed`
- Send Telegram notification to ops channel
- Stripe handles retry automatically (Smart Retries)

### 1.5 handleRefund and handleDispute

- On `charge.refunded`: Log for audit trail, don't revoke access (subscription status drives access)
- On `charge.dispute.created`: Log, emit CloudWatch alarm metric `BillingDisputeCreated`, Telegram ops alert

### 1.6 Tests

- **Unit tests**: `app/unit-tests/functions/billing/billingWebhookLifecycle.test.js`
  - Token refresh on invoice.paid (reset tokensConsumed, update currentPeriodEnd)
  - Status transitions (active → past_due → canceled)
  - Payment failure logging
  - Cancellation intent (cancelAtPeriodEnd)
  - Refund/dispute audit logging
- **System tests**: `app/system-tests/billing/billingLifecycle.system.test.js`
  - Full lifecycle against dynalite: checkout → invoice.paid → subscription.updated → subscription.deleted

### Validation

Deploy to CI. All lifecycle events handled correctly. Token refresh on renewal verified. Cancellation preserves access until period end. `npm test` and `./mvnw clean verify` pass. `paymentBehaviour` tests still pass.

---

## Phase 2: Human Test in Prod

**Status**: Partially done. User manually subscribed, submitted VAT, verified Telegram.

**Remaining**:
- Walk through cancellation flow via Stripe portal (requires Phase 1 handlers)
- Verify `cancelAtPeriodEnd` written to bundle
- Wait for renewal on 17 March to verify `invoice.paid` handler
- Complete PLAN_HUMAN_TEST.md Sections 7-8 (pass generation via workflow already done)

### Validation

Human tester completes full lifecycle: subscribe → use → cancel → verify access until period end → verify no access after expiry. Telegram channels show correct activity.

---

## Phase 3: Synthetic Tests in Prod

**Goal**: Automate the payment journey as a synthetic test running on every prod deployment.

### 3.1 Add paymentBehaviour to prod workflows

Add to `synthetic-test.yml` choices and `deploy.yml` post-deployment test matrix:

```yaml
web-test-payment:
  uses: ./.github/workflows/synthetic-test.yml
  with:
    behaviour-test-suite: 'paymentBehaviour'
    environment-name: ${{ needs.names.outputs.environment-name }}
```

### 3.2 Cognito native auth for prod synthetic tests

Same pattern as CI: enable before test, disable after.

### 3.3 Monitoring

- Synthetic test results visible in GitHub Actions
- Failed tests → Telegram ops channel alert
- Test passes create no live side effects (sandbox HMRC, test Stripe)

### Validation

`npm run test:paymentBehaviour-prod` passes. Runs automatically on prod deployment.

---

## Phase 4: Compliance and Abuse Protection

### 4.1 Accessibility scanning

- Add `/usage.html` and `/bundles.html` to `.pa11yci.prod.json`
- Run: `npm run accessibility:pa11y-prod`

### 4.2 Security scanning

- Verify OWASP ZAP baseline covers `/api/v1/billing/*` paths
- Verify ESLint security scan covers billing Lambdas

### 4.3 Documentation updates

- FAQ entries in `faqs.toml`: subscription, cancellation, payment failure, token lifecycle
- Update guide page with subscription section
- Update about page with Resident Pro pricing
- Update accessibility statement

### 4.4 Stripe hardening

- Verify Stripe Radar enabled
- Configure 3D Secure
- Set weekly payout schedule (7-10 day chargeback buffer)
- UK Distance Selling compliance: consent collection on Checkout

### 4.5 CloudWatch billing metrics

Emit EMF metrics from billing Lambdas:
- `BillingCheckoutCreated`, `BillingBundleGranted`, `BillingPaymentFailed`, `BillingSubscriptionCanceled`, `BillingDisputeCreated`

CloudWatch alarms: payment failure rate spike, any dispute, webhook delivery failures.

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

### 5.4 Synthetic test coexistence

Test and live passes coexist. Synthetic tests never create live side effects.

### 5.5 Monitor first real transactions

CloudWatch dashboard, Stripe dashboard, Telegram live channel, Stripe Radar scoring.

### Validation

One real charge processed and refunded. Live HMRC submission succeeds. Subscription lifecycle works end-to-end. Synthetic tests pass alongside live traffic.

---

## Cleanup Items (from PLAN_SUB_HASH_VERSIONING.md)

| Item | Priority | Notes |
|------|----------|-------|
| Delete GitHub Actions run 22079622301 | High | Contains prod v2 passphrase in logs |
| Clean up unused prod Cognito GitHub variables | Low | COGNITO_CLIENT_ID, COGNITO_USER_POOL_ARN, COGNITO_USER_POOL_ID |
| Path 3: KMS-encrypted salt in DynamoDB | Low | Script needed to encrypt and write item; Path 1+2 already available |
| CI behaviour tests post-migration | Medium | Need fresh deploy to verify |

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

---

## Phase Dependencies

```
Phase 1: Subscription Lifecycle Handlers
    |
    v
Phase 2: Human Test in Prod (complete lifecycle including cancellation + renewal)
    |
    v
Phase 3: Synthetic Tests in Prod
    |
    v
Phase 4: Compliance & Abuse Protection
    |
    v
Phase 5: Production Go-Live (live passes, real HMRC, real Stripe)
```

Phases are strictly sequential. Each validates before proceeding.

---

*Created 17 February 2026. Consolidates remaining work from PLAN_PAYMENT_GOLIVE.md (Phases 2, 4-7), cleanup items from PLAN_SUB_HASH_VERSIONING.md, and verified status from PLAN_PAYMENT_BEHAVIOUR_CI_FIX.md (archived).*
