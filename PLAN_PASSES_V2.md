# Passes, Tokens & Campaign - Phased Delivery Plan (V2)

> **GitHub Issue**: [#560](https://github.com/antonycc/submit.diyaccounting.co.uk/issues/560)
> **Source of truth**: `web/public/submit.catalogue.toml`
> **Previous plan**: `PLAN_PASSES.md` (superseded by this document)
> **Campaign analysis**: `_developers/archive/campaign.md`

## Overview

This plan delivers three interrelated features in layered phases, building from the backend outward so each phase provides a testable, deployable increment without breaking changes.

| Feature | Catalogue field | Purpose |
|---------|----------------|---------|
| **Passes** | `display = "on-pass"`, `allocation = "on-email-match"` | Control access via invitation codes (four-word passphrases) |
| **Tokens** | `tokens`, `tokensGranted`, `tokenRefreshInterval` | Metered HMRC API usage per bundle |
| **Campaign** | (new) | User-issued passes, referral tracking, sign-up incentives |

## What Already Exists

| Component | Status |
|-----------|--------|
| Catalogue TOML with bundles, activities, display rules | Implemented |
| `productCatalog.js` - parse catalogue, filter bundles/activities | Implemented |
| `bundleManagement.js` - enforce bundles, path matching | Implemented |
| `bundleGet.js`, `bundlePost.js`, `bundleDelete.js` Lambdas | Implemented |
| `dynamoDbBundleRepository.js` - DynamoDB CRUD for bundles | Implemented |
| `DataStack.java` - Bundles table in DynamoDB | Implemented |
| `bundles.html` - bundle management UI | Implemented |
| `allocation = "on-request"` and `"automatic"` flows | Implemented |
| Token/credit fields in catalogue | Documented but not enforced |
| `display = "on-pass"` in catalogue | Documented but not enforced |
| `allocation = "on-email-match"` in catalogue | Documented but not enforced |
| Passes DynamoDB table | Not started |
| Pass Lambdas (get, post, admin) | Not started |
| Pass redemption UI | Not started |
| Token tracking/consumption | Not started |
| Campaign/referral system | Not started |

## Bundle Hierarchy (from catalogue)

```
                    ALL USERS
                        │
                 ┌──────┴──────┐
                 ▼             ▼
            ┌─────────┐  ┌──────────────┐
            │ default  │  │     help     │
            │(auto)    │  │   about.html │
            └─────────┘  └──────────────┘
                 │
    ┌────────────┼─────────────┬────────────────┐
    ▼            ▼             ▼                ▼
┌────────┐ ┌──────────┐ ┌────────────────┐ ┌─────────────┐
│  test  │ │ day-guest │ │ invited-guest  │ │resident-pro │
│on-pass │ │on-request│ │ on-email-match │ │on-subscript.│
│sandbox │ │ prod API │ │   on-pass      │ │  prod API   │
│  P1D   │ │ P1D, 3tk │ │ P1M, 3tk/mo   │ │ 100tk/mo    │
└────────┘ └──────────┘ ├────────────────┤ └─────────────┘
                        │ resident-guest │
                        │ on-email-match │
                        │   on-pass      │
                        │ no expiry,3/mo │
                        └────────────────┘
```

## Pass Record Schema (DynamoDB)

```
Table: {env}-submit-passes
PK: pk = "pass#correct-horse-battery-staple"

Fields:
  code              String   The passphrase (for convenience)
  bundleId          String   Bundle granted on redemption
  passTypeId        String   Template type (invited-guest, group-invite, campaign, etc.)
  validFrom         String   ISO8601 - when pass becomes redeemable
  validUntil        String   ISO8601 - when pass expires (null = never)
  ttl               Number   Unix timestamp for DynamoDB auto-deletion
  createdAt         String   ISO8601
  updatedAt         String   ISO8601
  maxUses           Number   Maximum redemptions allowed
  useCount          Number   Current redemption count
  revokedAt         String   ISO8601 if revoked, null otherwise
  restrictedToEmailHash  String   HMAC-SHA256 of permitted email (null = unrestricted)
  createdBy         String   Creator identifier (user#hashedSub or github-actions-run#id)
  issuedBy          String   User who spent tokens to issue (null for admin-created)
  notes             String   Optional admin/creator notes
```

## Pass Types

| Type | Bundle Granted | Tokens | Email-locked | Max Uses | Validity | Creator |
|------|---------------|--------|-------------|----------|----------|---------|
| `test-access` | test | - | No | 1 | P7D | Admin (GitHub Actions) |
| `day-trial` | day-guest | 3 | No | 1 | P1D | Admin |
| `invited-guest` | invited-guest | 3/mo | Yes | 1 | P1M | Admin |
| `resident-guest` | resident-guest | 3/mo | Yes | 1 | unlimited | Admin |
| `resident-pro-comp` | resident-pro | 100/mo | Yes | 1 | P1Y | Admin |
| `group-invite` | invited-guest | 3/mo | No | 10 | P1M | Admin |
| `campaign` | invited-guest | 3/mo | No | 1 | P3D | Users (costs 10 tokens) |

## Pass Formats

| Format | Example | Use Case |
|--------|---------|----------|
| **URL** | `https://submit.diyaccounting.co.uk/bundles.html?pass=correct-horse-battery-staple` | Email, social media |
| **Four Words** | `correct-horse-battery-staple` | Verbal sharing, manual entry |
| **QR Code** | PNG image encoding the URL | Merchandise, print materials |

---

## Phase 1: Pass Data & Generation (Backend)

**Goal**: Passes can be created and stored. Admin can generate passes for test users via GitHub Actions.

**Risk mitigated**: Can we generate, store, and retrieve pass records reliably?

### 1.1 Infrastructure

- [ ] Add Passes DynamoDB table to `DataStack.java`
  - Table name: `{env}-submit-passes`
  - Partition key: `pk` (String)
  - TTL attribute: `ttl`
  - PITR enabled
  - RemovalPolicy.DESTROY (data protected by PITR)

### 1.2 Pass generation library

- [ ] Create `app/lib/passphrase.js`
  - Four-word passphrase generator using EFF large wordlist
  - `generatePassphrase(wordCount = 4)` returns `"correct-horse-battery-staple"`
  - Uses `crypto.randomInt()` for secure randomness
- [ ] Create `app/lib/emailHash.js`
  - `hashEmail(email, secret)` returns HMAC-SHA256 base64url hash
  - Secret from `EMAIL_HASH_SECRET` environment variable (AWS Secrets Manager)
- [ ] Bundle EFF wordlist file `app/lib/eff_large_wordlist.txt`

### 1.3 Pass data service

- [ ] Create `app/data/dynamoDbPassRepository.js`
  - `putPass(pass)` - store pass record (with collision check)
  - `getPass(code)` - retrieve by passphrase code
  - `updatePassUseCount(code, now)` - atomic increment with condition expression
  - `revokePass(code, now)` - set revokedAt
- [ ] Create `app/services/passService.js`
  - `createPass(params)` - build pass record from type template + overrides
  - `checkPass(code, userEmail?)` - validate without consuming
  - `redeemPass(code, userEmail)` - validate and atomically increment useCount
  - `diagnoseFailure(code, emailHash)` - return machine-readable reason codes
  - Reason codes: `not_found`, `revoked`, `exhausted`, `not_yet_valid`, `expired`, `wrong_email`, `email_required`

### 1.4 Admin pass creation Lambda

- [ ] Create `app/functions/account/passAdminPost.js`
  - Admin-only endpoint (custom authorizer with admin check)
  - Input: `{ passTypeId, bundleId, email?, maxUses?, validityPeriod?, notes? }`
  - Output: `{ code, bundleId, validFrom, validUntil, maxUses }`

### 1.5 GitHub Actions workflow

- [ ] Create `.github/workflows/generate-pass.yml`
  - Manual dispatch with inputs: passTypeId, email (optional), maxUses (optional), quantity (default 1), notes
  - Assumes deployment role, calls passAdminPost Lambda (or writes directly to DynamoDB)
  - Outputs: pass codes, URLs, stored as workflow artifacts
  - Sends notification to admin

### 1.6 Unit tests

- [ ] `app/unit-tests/lib/passphrase.test.js` - generation, uniqueness, word count
- [ ] `app/unit-tests/lib/emailHash.test.js` - deterministic hashing, case insensitivity
- [ ] `app/unit-tests/services/passService.test.js` - create, check, redeem, diagnose

### Validation

Run `npm test` - all pass generation and validation unit tests pass. Run GitHub Actions workflow - pass record appears in DynamoDB with correct attributes.

---

## Phase 2: Pass Validation API (Backend + System Tests)

**Goal**: Passes can be validated and redeemed via API. System tests verify the full flow.

**Risk mitigated**: Does the atomic redeem-and-grant-bundle flow work under concurrency?

### 2.1 Pass API endpoints

- [ ] Create `app/functions/account/passGet.js`
  - `GET /api/v1/pass?code=correct-horse-battery-staple`
  - Public (no auth required) - returns pass info without sensitive fields
  - Response: `{ valid: true|false, reason?, bundleId?, usesRemaining? }`
  - Does NOT consume the pass (idempotent check)
- [ ] Create `app/functions/account/passPost.js`
  - `POST /api/v1/pass` with body `{ code: "correct-horse-battery-staple" }`
  - Authenticated (requires JWT)
  - Validates pass (email match if restricted, uses remaining, not expired)
  - Atomically increments useCount
  - Grants bundle to user (calls existing `addBundles()`)
  - Response: `{ redeemed: true, bundleId, expiry }` or `{ redeemed: false, reason }`

### 2.2 Infrastructure wiring

- [ ] Add pass Lambdas to `AccountStack.java`
  - passGet Lambda with API Gateway route
  - passPost Lambda with API Gateway route
  - passAdminPost Lambda with API Gateway route (admin-only)
  - Grant DynamoDB read/write permissions on passes table
- [ ] Add `PASSES_DYNAMODB_TABLE_NAME` to environment configuration
- [ ] Add `EMAIL_HASH_SECRET` to Secrets Manager and wire to Lambdas

### 2.3 Catalogue enforcement: `display = "on-pass"`

- [ ] Update `productCatalog.js` to recognise `display = "on-pass"`
  - Bundles with `display = "on-pass"` are hidden from catalogue listing unless the user already holds that bundle
  - This is a UI display filter, not an API enforcement
- [ ] Update `bundleManagement.js` or `bundlePost.js` to recognise `allocation = "on-email-match"`
  - When a pass has `restrictedToEmailHash`, the authenticated user's email hash must match
  - Reuse `hashEmail()` from Phase 1

### 2.4 System tests

- [ ] `app/system-tests/pass/passCreation.test.js` - create pass via admin endpoint, verify DynamoDB record
- [ ] `app/system-tests/pass/passRedemption.test.js` - redeem pass, verify bundle granted
- [ ] `app/system-tests/pass/passValidation.test.js` - check expired, exhausted, revoked, wrong-email passes
- [ ] `app/system-tests/pass/passEmailMatch.test.js` - verify email-restricted passes

### 2.5 Express server routes

- [ ] Add `GET /api/v1/pass` route to local Express server
- [ ] Add `POST /api/v1/pass` route to local Express server
- [ ] Add `POST /api/v1/pass/admin` route to local Express server (admin-only)

### Validation

Run `npm run test:system` - all pass API system tests pass against Docker/dynalite.

---

## Phase 3: Pass Redemption UI & Behaviour Tests (Frontend)

**Goal**: Users can enter a pass on bundles.html (typed or from URL). Behaviour tests validate the end-to-end flow.

**Risk mitigated**: Does the UI correctly handle all pass states (valid, expired, wrong email, exhausted)?

### 3.1 bundles.html pass entry

- [ ] Add pass entry form to `bundles.html`
  - Four text inputs for each word (auto-advance on space/tab)
  - Or a single input accepting `word-word-word-word` format
  - "Redeem Pass" button
  - Status message area showing result (success, error with reason)
- [ ] Read `?pass=correct-horse-battery-staple` URL parameter on page load
  - Auto-populate the pass input
  - Auto-submit if user is authenticated
  - If not authenticated, show the pass and prompt login
- [ ] On submit: `POST /api/v1/pass` with the code
  - On success: refresh bundle list, show success message
  - On failure: show human-readable error from reason code

### 3.2 `display = "on-pass"` UI filtering

- [ ] Update `bundles.html` to filter bundles by display rule
  - `"on-pass"` bundles hidden from the requestable bundle list
  - Once a user holds an on-pass bundle (via redemption), it appears in their "My Bundles" section
  - Pass-only bundles show "Requires an invitation pass" in the upsell prompt

### 3.3 Behaviour tests for passes

- [ ] `behaviour-tests/pass/passRedemption.spec.js`
  - Generate a test pass via admin API
  - Navigate to `bundles.html?pass=test-pass-code`
  - Verify pass auto-populates
  - Verify bundle granted after redemption
  - Verify activity becomes accessible
- [ ] `behaviour-tests/pass/passErrors.spec.js`
  - Attempt to redeem expired pass - verify error message
  - Attempt to redeem exhausted pass - verify error message

### Validation

Run `npm run test:submitVatBehaviour-proxy` - pass redemption behaviour tests pass.

---

## Phase 4: Token Tracking & Enforcement (Backend)

**Goal**: HMRC API calls consume tokens. Users can see their remaining balance. Exhausted tokens block further calls.

**Risk mitigated**: Can we atomically track and enforce per-user token consumption across concurrent requests?

### 4.1 Token balance tracking

- [ ] Extend bundle record in DynamoDB with token fields:
  ```
  tokensGranted      Number   Tokens allocated for this bundle period
  tokensConsumed     Number   Tokens used so far
  tokenResetAt       String   ISO8601 when tokens next replenish
  ```
- [ ] Update `dynamoDbBundleRepository.js`
  - `consumeToken(userId, bundleId)` - atomic decrement with condition `tokensConsumed < tokensGranted`
  - `getTokenBalance(userId)` - aggregate remaining across all bundles
  - `resetTokens(userId, bundleId, tokensGranted, nextResetAt)` - replenish on interval
- [ ] Update `bundlePost.js` - when granting a bundle, set `tokensGranted` from catalogue `tokens` or `tokensGranted` field, set `tokensConsumed = 0`, calculate `tokenResetAt` from `tokenRefreshInterval`

### 4.2 Token consumption in HMRC Lambdas

- [ ] Create `app/services/tokenEnforcement.js`
  - `consumeTokenForActivity(userId, activityId, catalog)` - find the user's qualifying bundle, consume 1 token
  - Returns `{ consumed: true, tokensRemaining }` or `{ consumed: false, reason: "tokens_exhausted" }`
  - Activities with `tokens = 0` or no `tokens` field are free (no consumption)
- [ ] Wire token enforcement into HMRC API Lambdas:
  - `hmrcVatReturnPost.js` - consume 1 token before submitting
  - `hmrcVatObligationsGet.js` - consume 1 token
  - `hmrcVatReturnGet.js` - consume 1 token
  - On `tokens_exhausted`: return JSON error `{ error: "tokens_exhausted", tokensRemaining: 0 }`

### 4.3 Token balance in bundle API

- [ ] Update `GET /api/v1/bundle` response to include token info:
  ```json
  {
    "bundles": [{
      "bundleId": "day-guest",
      "expiry": "2026-02-01T00:00:00.000Z",
      "tokensGranted": 3,
      "tokensConsumed": 1,
      "tokensRemaining": 2,
      "tokenResetAt": "2026-02-01T00:00:00.000Z"
    }],
    "tokensRemaining": 2
  }
  ```
- [ ] Aggregate `tokensRemaining` across all active bundles for the top-level field

### 4.4 Token refresh (lazy evaluation)

- [ ] On each token balance check, if `now >= tokenResetAt`:
  - Reset `tokensConsumed = 0`
  - Calculate next `tokenResetAt` from `tokenRefreshInterval`
  - This is lazy evaluation - no background job needed
- [ ] Handle bundles without `tokenRefreshInterval` (e.g., `day-guest`): tokens expire with the bundle, no refresh

### 4.5 Tests

- [ ] `app/unit-tests/services/tokenEnforcement.test.js`
- [ ] `app/system-tests/tokens/tokenConsumption.test.js` - consume tokens, verify decrement
- [ ] `app/system-tests/tokens/tokenExhaustion.test.js` - verify API blocked when tokens exhausted
- [ ] `app/system-tests/tokens/tokenRefresh.test.js` - verify lazy reset

### Validation

Run `npm run test:system` - token enforcement system tests pass. API calls correctly consume and enforce token limits.

---

## Phase 5: Token UI & Full Pass Enforcement (Frontend + Testing)

**Goal**: Users see their token balance. All behaviour tests use passes. on-pass enforcement is active.

**Risk mitigated**: Does the full end-to-end pass + token flow work in behaviour tests?

### 5.1 Token display in UI

- [ ] Add token counter to navigation bar or activity pages
  - Show `"N tokens remaining"` when user has token-consuming bundles
  - Show `"Tokens refresh on DATE"` for bundles with tokenRefreshInterval
- [ ] Update activity pages (submitVat.html, vatObligations.html, viewVatReturn.html)
  - Show token cost before action: `"This will use 1 token (N remaining)"`
  - On `tokens_exhausted` error: show `"No tokens remaining. Tokens refresh on DATE or upgrade to Pro."`

### 5.2 Migrate behaviour tests to passes

- [ ] Update test setup to generate a test pass before each test suite
  - Call passAdminPost to create a `test-access` pass
  - Redeem pass as part of test user setup
- [ ] Remove direct bundle allocation from behaviour test setup
- [ ] Verify all existing behaviour tests pass with pass-based bundle allocation

### 5.3 Turn on on-pass enforcement

- [ ] The `test` bundle already has `display = "on-pass"` in catalogue
- [ ] Once behaviour tests use passes, verify that:
  - The test bundle no longer appears as requestable on bundles.html
  - Users without a pass cannot request the test bundle
  - Pass redemption is the only way to get the test bundle

### 5.4 Behaviour tests for tokens

- [ ] `behaviour-tests/tokens/tokenCounter.spec.js` - verify token count shown in UI
- [ ] `behaviour-tests/tokens/tokenConsumption.spec.js` - submit VAT, verify count decrements
- [ ] `behaviour-tests/tokens/tokenExhaustion.spec.js` - exhaust tokens, verify error shown

### Validation

Run `npm run test:submitVatBehaviour-proxy` - all tests pass using pass-based bundle allocation and token enforcement. Token counter visible and accurate.

---

## Phase 6: Campaign Passes & Referral System (Backend + Frontend)

**Goal**: Subscribed users can issue short-lived passes to recruit new users. Referrals are tracked. Successful referrals earn rewards.

**Risk mitigated**: Can we create a self-sustaining growth loop where campaigners are incentivised to recruit while the cost is bounded?

### Design

The campaign system turns passes into a commodity that subscribed users spend tokens to create and share. This creates a growth flywheel:

```
Campaigner subscribes (resident-pro, 100 tokens/month)
        │
        ▼
Issues campaign pass (costs 10 tokens, pass valid for 3 days)
        │
        ▼
Shares pass via URL, QR code, social media, word-of-mouth
        │
        ▼
Recipient redeems pass → gets invited-guest bundle (3 tokens/month)
        │
        ▼
Recipient uses the service, finds value
        │
        ▼
Recipient subscribes (resident-pro) ← referral tracked
        │
        ▼
Campaigner earns reward (1 free month, capped at 12)
```

**Economics**: A resident-pro user (100 tokens/month) can issue up to 10 campaign passes per month (10 tokens each = 100 tokens). Each pass is valid for 3 days, so a campaigner can maintain a steady cadence of fresh invitations. If even one referral converts, the free month reward covers the subscription cost.

### 6.1 Campaign pass issuance (Backend)

- [ ] Create `app/functions/account/passIssuePost.js`
  - Authenticated endpoint (any user with a token-bearing bundle)
  - Input: `{ notes? }` (pass type is always `campaign`)
  - Validates caller has >= 10 tokens remaining
  - Consumes 10 tokens from the issuing user
  - Creates a campaign pass:
    - `passTypeId = "campaign"`
    - `bundleId = "invited-guest"`
    - `maxUses = 1`
    - `validUntil = now + P3D` (3-day expiry)
    - `issuedBy = callerHashedSub`
  - Returns: `{ code, url, validUntil, tokensRemaining }`
- [ ] Add API Gateway route: `POST /api/v1/pass/issue`
- [ ] Add Express server route for local development
- [ ] Wire Lambda in `AccountStack.java`

### 6.2 Referral tracking (Backend)

- [ ] Add `issuedBy` field to pass record (set when a user issues a campaign pass)
- [ ] On pass redemption, if `issuedBy` is set:
  - Record referral: `{ referrerId: issuedBy, referredUserId: redeemer, passCode, redeemedAt }`
  - Store in bundles table or a dedicated referral GSI
- [ ] On subscription purchase (when referred user upgrades to resident-pro):
  - Check if user was referred (has a referral record)
  - If so, credit the referrer with 1 free month
  - Cap referral credits at 12 months per referrer

### 6.3 Referral rewards (Backend)

- [ ] Implement subscription credit system
  - `referralCreditsEarned` field on user record
  - `referralCreditsApplied` field (tracks what's been used)
  - When processing subscription renewal, apply 1 credit before charging
  - Cap: `referralCreditsEarned <= 12`
- [ ] Referral reward trigger: credited after the referred user's first VAT return submission (not just sign-up)
  - This aligns with campaign.md recommendation to reward real value creation, not just sign-ups

### 6.4 Commission (deferred)

Per `_developers/archive/campaign.md`, once there are enough referrals:
- 20% of first year's subscription value (e.g., ~£25 at £129/year)
- Payable only after referrer has >= 3 converted users
- Payable as account credit by default, cash payout above £50 threshold
- This is deferred until subscription payments are implemented

### 6.5 Campaign pass UI (Frontend)

- [ ] Add "Issue Invitation" section to bundles.html (visible only if user has >= 10 tokens)
  - "Issue Pass" button
  - Shows cost: "This will use 10 tokens (N remaining)"
  - On success: display the pass URL, copy-to-clipboard button, share links
  - Show pass expiry: "Valid for 3 days"
- [ ] Add "My Issued Passes" section
  - List of passes the user has issued
  - Status: active, expired, redeemed
  - Who redeemed (if applicable, anonymised)
- [ ] Add "Referral Rewards" section
  - Number of successful referrals
  - Free months earned / applied / remaining

### 6.6 QR code generation

- [ ] Add QR code generation for campaign passes
  - Generate QR code PNG encoding the pass URL
  - Display inline on the "Issue Invitation" result
  - Download button for sharing physically
- [ ] QR code generation for admin-created passes (GitHub Actions workflow output)

### 6.7 Abuse controls

- [ ] Rate limit pass issuance: max 3 passes per user per day
- [ ] No self-referral: pass issuer cannot redeem their own passes
- [ ] One referrer per account: first referral is immutable
- [ ] Campaign passes cannot be issued with email restriction (they must be shareable)
- [ ] Expired campaign passes are auto-deleted via DynamoDB TTL (validUntil + 30 days)

### 6.8 Tests

- [ ] `app/unit-tests/services/passService.test.js` - campaign pass creation, token deduction
- [ ] `app/system-tests/campaign/campaignPassIssuance.test.js` - issue pass, verify token deduction
- [ ] `app/system-tests/campaign/referralTracking.test.js` - issue, redeem, verify referral recorded
- [ ] `behaviour-tests/campaign/issuePass.spec.js` - UI flow for issuing and sharing passes

### Validation

A resident-pro user can issue a campaign pass, share the URL, another user redeems it and gets invited-guest access. Referral is tracked. After the referred user subscribes and submits a VAT return, the referrer receives a free month credit.

---

## Phase 7: Production Readiness

**Goal**: All features live in production with monitoring and correct environment gating.

### 7.1 Production credentials gate

- [ ] `day-guest` bundle: remove `listedInEnvironments` restriction once HMRC production credentials are validated
  - Currently hidden in prod: `listedInEnvironments = ["local", "test", "proxy", "proxyRunning", "ci"]`
  - Validation requires: trial user submits real VAT return, HMRC confirms no issues
- [ ] `resident-pro` bundle: remove `listedInEnvironments` restriction once subscription payment flow exists

### 7.2 Monitoring

- [ ] CloudWatch alarms for:
  - Pass redemption failures (spike in `exhausted` or `expired` reasons)
  - Token exhaustion rate (users hitting zero)
  - Campaign pass abuse (unusual issuance volume)
- [ ] Admin dashboard (or CloudWatch dashboard):
  - Total passes created / redeemed / expired
  - Token consumption rate across all users
  - Referral conversion funnel

### 7.3 Documentation

- [ ] Update `about.html` with pass and token information
- [ ] Add pass FAQ to help pages
- [ ] Document GitHub Actions pass generation workflow for admin use

### Validation

Production deployment stable. day-guest available to all users. Passes and tokens enforced. Campaign system operational.

---

## Phase Dependencies

```
Phase 1: Pass Data & Generation
    │
    ▼
Phase 2: Pass Validation API + System Tests
    │
    ▼
Phase 3: Pass Redemption UI + Behaviour Tests
    │
    ├──────────────────┐
    ▼                  ▼
Phase 4: Tokens    Phase 5.2-5.3: Pass Enforcement
    │                  │
    ▼                  │
Phase 5.1,5.4: Token UI│
    │                  │
    └──────────────────┘
             │
             ▼
Phase 6: Campaign Passes & Referrals
             │
             ▼
Phase 7: Production Readiness
```

Phases 4 and 5.2-5.3 can run in parallel after Phase 3 completes. Phase 6 requires both token enforcement (Phase 4) and pass enforcement (Phase 5) to be complete.

## Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `app/lib/passphrase.js` | 1 | Four-word passphrase generator |
| `app/lib/eff_large_wordlist.txt` | 1 | EFF wordlist for passphrase generation |
| `app/lib/emailHash.js` | 1 | HMAC-SHA256 email hashing |
| `app/data/dynamoDbPassRepository.js` | 1 | DynamoDB CRUD for passes |
| `app/services/passService.js` | 1 | Pass creation, validation, redemption logic |
| `app/functions/account/passAdminPost.js` | 1 | Admin pass creation Lambda |
| `app/functions/account/passGet.js` | 2 | Public pass check Lambda |
| `app/functions/account/passPost.js` | 2 | Authenticated pass redemption Lambda |
| `app/services/tokenEnforcement.js` | 4 | Token consumption and enforcement |
| `app/functions/account/passIssuePost.js` | 6 | User-issued campaign passes Lambda |
| `.github/workflows/generate-pass.yml` | 1 | Manual pass generation workflow |

## Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `infra/main/java/.../DataStack.java` | 1 | Add passes DynamoDB table |
| `infra/main/java/.../AccountStack.java` | 2 | Add pass Lambda functions, API routes |
| `app/services/productCatalog.js` | 2 | Recognise `on-pass` display, `on-email-match` allocation |
| `app/services/bundleManagement.js` | 2 | Email-match enforcement |
| `app/data/dynamoDbBundleRepository.js` | 4 | Token fields, consumeToken, resetTokens |
| `app/functions/account/bundleGet.js` | 4 | Return tokensRemaining in response |
| `app/functions/account/bundlePost.js` | 4 | Set tokensGranted on bundle creation |
| `app/functions/hmrc/hmrcVatReturnPost.js` | 4 | Token consumption before HMRC call |
| `app/functions/hmrc/hmrcVatObligationsGet.js` | 4 | Token consumption before HMRC call |
| `app/functions/hmrc/hmrcVatReturnGet.js` | 4 | Token consumption before HMRC call |
| `web/public/bundles.html` | 3, 5, 6 | Pass entry form, on-pass filtering, token display, campaign UI |
| `web/public/submit.catalogue.toml` | - | Already configured (source of truth) |

## Open Questions

1. **Email hash secret rotation**: How to handle secret rotation without invalidating existing email-restricted passes? Consider storing the secret version on each pass record.
2. **Token consumption granularity**: Should viewing obligations cost a token, or only submissions? The catalogue currently assigns `tokens = 1` to all HMRC activities.
3. **Campaign pass validity period**: 3 days is short enough to create urgency but long enough to act. Adjust based on conversion data.
4. **Subscription payment provider**: Campaign referral rewards (Phase 6.3) require a payment system. Defer until Stripe/similar is integrated.
5. **DIY legacy bundle**: How to verify PayPal transaction IDs for existing DIY customers who should get resident-guest access? (Deferred)

---

*Last updated: 2026-01-31*
*GitHub Issue: #560*
