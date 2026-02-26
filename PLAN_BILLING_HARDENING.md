# Billing Hardening Plan

**Created**: 26 February 2026
**Status**: Not started — pre-implementation planning
**Depends on**: PLAN_PAYMENT_LIFECYCLE.md Phase 1 (DONE)

---

## User Assertions (verbatim)

> For 7 and 8 check the current scripts both in package.json and ./scripts these may exist if not create in both and similarly both should be executed by a github actions workflow but there shouldn't be a lambda for GDPR delete, we'll get a request, then run the workflow.

---

## Summary

Eight hardening items identified from billing maturity assessment. Prioritised by risk to customers and legal compliance. Some items already partially exist.

---

## H1: Webhook Idempotency — HIGH

**Problem**: Stripe replays webhooks on retries (network timeout, 5xx response). If `checkout.session.completed` replays, `putBundleByHashedSub` overwrites the bundle — resetting `tokensConsumed` to 0. A user who consumed 95/100 tokens gets a free reset.

Similarly, `invoice.paid` replays call `resetTokensByHashedSub` which resets `tokensConsumed` unconditionally.

**Files**: `app/functions/billing/billingWebhookPost.js`

**Fix**:
- `handleCheckoutComplete`: Use conditional put — only create bundle if no active bundle exists for this hashedSub+bundleId, or if existing bundle has a different subscriptionId
- `handleInvoicePaid`: Only reset tokens if `tokenResetAt` has actually advanced (compare incoming `currentPeriodEnd` with stored `tokenResetAt`)
- Both: Store `lastProcessedEventId` on the subscription record and skip if already seen

**Tests**: Add unit tests for replay scenarios (same event ID, same period).

---

## H2: Token Enforcement Checks Subscription Status — HIGH

**Problem**: `app/services/tokenEnforcement.js` only checks `tokensGranted - tokensConsumed`. It ignores `subscriptionStatus` and `expiry`. A user whose subscription is `canceled` or `past_due` can keep consuming tokens until numerically exhausted, even though their subscription ended.

**Files**: `app/services/tokenEnforcement.js`, `app/data/dynamoDbBundleRepository.js`

**Fix**:
- In token enforcement, after finding the bundle record, check:
  - If `subscriptionStatus === "canceled"` AND `expiry < now` → reject (subscription ended and grace period over)
  - If `subscriptionStatus === "past_due"` → allow but log warning (Stripe may recover payment)
  - `cancelAtPeriodEnd === true` with `expiry > now` → allow (paid until period end)
- Do NOT block `past_due` immediately — Stripe Smart Retries may recover the payment within days

**Tests**: Unit tests for each status scenario.

---

## H3: UK Distance Selling Compliance — MEDIUM

**Problem**: No `consent_collection` in Stripe Checkout session creation. UK Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 require explicit consent for digital services and acknowledgement that the 14-day cooling-off right is waived upon immediate access.

**Files**: `app/functions/billing/billingCheckoutPost.js`

**Fix**:
- Add `consent_collection: { terms_of_service: "required" }` to checkout session creation
- Create a Terms of Service page at `/terms.html`
- Add `terms_of_service` URL to Stripe Checkout session config
- Add cancellation policy/refund information to the terms page

**Tests**: Behaviour test verifies checkout still completes with consent step.

---

## H4: Frontend Subscription Status Display — HIGH

**Problem**: The UI doesn't show `subscriptionStatus`, `cancelAtPeriodEnd`, or `past_due` states. Users can't see that their payment failed or that cancellation is pending.

**Files**: `web/public/bundles.html` (or equivalent billing UI), `app/functions/account/bundleGet.js`

**Fix**:
- Return `subscriptionStatus`, `cancelAtPeriodEnd`, `currentPeriodEnd` from the bundle API
- Display in the UI:
  - `active` → "Active" (green)
  - `past_due` → "Payment issue — update your payment method" (amber) with link to Stripe portal
  - `canceled` with `expiry > now` → "Cancels on {date}" (amber)
  - `canceled` with `expiry < now` → "Expired" (grey)
  - `cancelAtPeriodEnd === true` → "Cancelling at period end ({date})"

**Tests**: Unit tests for status rendering logic. Browser tests for UI display.

---

## H5: Duplicate Subscription Prevention — MEDIUM

**Problem**: Nothing stops a user from going through checkout twice. The second `checkout.session.completed` overwrites the bundle record (compounded by H1 idempotency issue).

**Files**: `app/functions/billing/billingCheckoutPost.js`, `app/functions/billing/billingWebhookPost.js`

**Fix**:
- In `billingCheckoutPost` (checkout session creation): check if user already has an active subscription for this bundleId. If so, redirect to Stripe portal instead of creating a new checkout session.
- In `handleCheckoutComplete`: if bundle already exists with a different active subscriptionId, log a warning and don't overwrite.

**Tests**: Unit test for duplicate checkout attempt. Behaviour test for "already subscribed" redirect.

---

## H6: Remove billingRecoverPost.js Stub — MEDIUM

**Problem**: `billingRecoverPost.js` is a 501 stub that was never implemented. It has deep CDK integration — a full Lambda deployment, API Gateway route, IAM policies, and a BillingStack construct. Dead code that deploys infrastructure and confuses developers.

**Files to modify**:
- Delete: `app/functions/billing/billingRecoverPost.js`
- Modify: `infra/main/java/co/uk/diyaccounting/submit/stacks/BillingStack.java` (remove ~30 lines of Lambda/API construct)
- Modify: `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` (remove ~20 lines of naming fields)
- Modify: `app/bin/server.js` (remove import + `billingRecoverPostApiEndpoint(app)`)
- Update: `infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java` (adjust Lambda count comment)
- Delete: `app/system-tests/billingInfrastructure.system.test.js` reference (if it only tests recover)

**Risk**: CDK change — requires deployment. The Lambda deletion is safe because it's never called (501 stub). But removal changes the API Gateway resource tree, which needs careful deployment ordering.

**Tests**: Verify `./mvnw clean verify` passes after CDK changes. Verify `npm test` passes.

---

## H7: Stripe↔DynamoDB Subscription Reconciliation — MEDIUM

**Problem**: No mechanism to detect drift between Stripe subscription states and DynamoDB bundle/subscription records. If a webhook is missed (network issue, bug, deployment gap), records diverge silently. The existing `bundleCapacityReconcile.js` Lambda counts active capped bundles — it does NOT compare Stripe subscription status with local records.

**Existing**:
- `app/functions/account/bundleCapacityReconcile.js` — Lambda, hourly, counts capped bundles (unrelated)
- No Stripe reconciliation script exists in `scripts/`
- No npm script or workflow for reconciliation

**Create**:
- `scripts/stripe-reconcile.js` — Script that:
  1. Lists active Stripe subscriptions (via Stripe API)
  2. For each, looks up the corresponding DynamoDB subscription record (`stripe#sub_xxx`)
  3. Compares `status`, `currentPeriodEnd`, `cancelAtPeriodEnd`
  4. Reports mismatches
  5. Optionally fixes mismatches with `--fix` flag (dry-run by default)
- npm script: `"stripe:reconcile"` in package.json
- GitHub Actions workflow: `.github/workflows/stripe-reconcile.yml`
  - Manual trigger (`workflow_dispatch`) with environment selector (ci/prod)
  - Scheduled weekly (e.g., Sundays 06:00 UTC)
  - Uses AWS SSO role for DynamoDB access + Stripe secret from Secrets Manager
  - Reports summary as workflow output

**Tests**: Unit test for comparison logic (extracted to a testable function).

---

## H8: GDPR Deletion — Subscriptions Table Gap — LOW

**Problem**: GDPR deletion scripts and workflows already exist and work well:
- `scripts/delete-user-data.js` — covers 8 DynamoDB tables
- `scripts/export-user-data.js` — GDPR Right of Access
- `.github/workflows/delete-user-data.yml` — manual workflow by hashed-sub
- `.github/workflows/delete-user-data-by-email.yml` — email-based workflow

BUT the `subscriptions` table (`{deployment}-subscriptions`) is NOT covered. It was added after the deletion script was written. The subscriptions table uses `pk` as partition key (format: `stripe#sub_xxx`) with `hashedSub` as an attribute — so it can't be queried by hashedSub without a scan or GSI.

**Files to modify**:
- `scripts/delete-user-data.js` — add subscriptions table handling
- Potentially: CDK to add a GSI on `hashedSub` to the subscriptions table (avoids full table scan)

**Fix options**:
1. **Scan with filter** (simplest): Add a 9th table to TABLE_DEFS with a scan-based approach since deletions are rare and the table will be small
2. **GSI on hashedSub** (scalable): Add a GSI in DataStack.java, then query by hashedSub like the other tables

**Recommendation**: Option 1 for now — GDPR deletion is infrequent, table is small, scan is acceptable. Add GSI later if table grows.

**Tests**: Verify deletion script covers subscriptions table in dry-run mode.

---

## Implementation Order

| Priority | Item | Effort | Risk | Dependencies |
|----------|------|--------|------|-------------|
| 1 | H1: Webhook idempotency | Medium | HIGH — data integrity | None |
| 2 | H2: Token enforcement status | Medium | HIGH — authorization bypass | None |
| 3 | H4: Frontend status display | Medium | HIGH — user experience | H2 (enforcement logic informs display) |
| 4 | H3: UK consent collection | Low | MEDIUM — legal compliance | None |
| 5 | H5: Duplicate subscription prevention | Low | MEDIUM — edge case | H1 (idempotency makes this safer) |
| 6 | H6: Remove billingRecoverPost stub | Medium | MEDIUM — CDK change | None (but needs deployment) |
| 7 | H7: Stripe reconciliation script | Medium | MEDIUM — operational | None |
| 8 | H8: GDPR subscriptions table | Low | LOW — gap in existing coverage | None |

Items H1 and H2 can be implemented in parallel (no file overlap). H3, H7, H8 are independent. H6 is a CDK change that should be deployed on its own.

---

## Relationship to Other Plans

- **PLAN_PAYMENT_LIFECYCLE.md**: This plan is the "Phase 4 hardening" referenced there. Phase 1 (lifecycle handlers) is prerequisite — DONE.
- **PLAN_PAYMENT_LIFECYCLE.md Phase 4.4**: "Stripe hardening" — H3 (consent collection) belongs here.
- **PLAN_PAYMENT_LIFECYCLE.md Phase 4.5**: "CloudWatch billing metrics" — NOT covered in this plan (deferred, lower priority than these items).
- **PLAN_COGNITO_TOTP_MFA.md**: No file overlap. Can be implemented concurrently.

---

*Created 26 February 2026. Captures hardening items from billing maturity assessment.*
