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
| Per-user bundle uniqueness (one of each type per user) | Implemented |
| Bundle `cap` field (global capacity limit) | Placeholder (per-user no-op); Phase 2.9 |
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

## Phase 2: Pass Validation API & Token Tracking (Backend + System Tests)

**Goal**: Passes can be validated and redeemed via API. Token balances are tracked on bundle records and returned in the bundle API. System tests verify pass flows and token tracking.

**Risk mitigated**: Does the atomic redeem-and-grant-bundle flow work under concurrency? Are token balances correctly initialised, refreshed, and returned?

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

### 2.4 Token balance tracking

Token balances are tracked alongside bundles so the data layer is ready before enforcement is turned on. This avoids a later migration and lets the UI show token info immediately.

- [ ] Extend bundle record in DynamoDB with token fields:
  ```
  tokensGranted      Number   Tokens allocated for this bundle period
  tokensConsumed     Number   Tokens used so far
  tokenResetAt       String   ISO8601 when tokens next replenish
  ```
- [ ] Update `dynamoDbBundleRepository.js`
  - `getTokenBalance(userId)` - aggregate remaining across all bundles
  - `resetTokens(userId, bundleId, tokensGranted, nextResetAt)` - replenish on interval
- [ ] Update `bundlePost.js` - when granting a bundle, set `tokensGranted` from catalogue `tokens` or `tokensGranted` field, set `tokensConsumed = 0`, calculate `tokenResetAt` from `tokenRefreshInterval`

### 2.5 Token refresh (lazy evaluation)

- [ ] On each token balance check, if `now >= tokenResetAt`:
  - Reset `tokensConsumed = 0`
  - Calculate next `tokenResetAt` from `tokenRefreshInterval`
  - This is lazy evaluation - no background job needed
- [ ] Handle bundles without `tokenRefreshInterval` (e.g., `day-guest`): tokens expire with the bundle, no refresh

### 2.6 Token balance in bundle API

- [ ] Update `GET /api/v1/bundle` response to include token info:
  ```json
  {
    "bundles": [{
      "bundleId": "day-guest",
      "expiry": "2026-02-01T00:00:00.000Z",
      "tokensGranted": 3,
      "tokensConsumed": 0,
      "tokensRemaining": 3,
      "tokenResetAt": null
    }],
    "tokensRemaining": 3
  }
  ```
- [ ] Aggregate `tokensRemaining` across all active bundles for the top-level field
- [ ] Tokens are **tracked but not enforced** — HMRC calls still succeed regardless of token balance (enforcement comes in Phase 4)

### 2.7 System tests

- [ ] `app/system-tests/pass/passCreation.test.js` - create pass via admin endpoint, verify DynamoDB record
- [ ] `app/system-tests/pass/passRedemption.test.js` - redeem pass, verify bundle granted with token fields
- [ ] `app/system-tests/pass/passValidation.test.js` - check expired, exhausted, revoked, wrong-email passes
- [ ] `app/system-tests/pass/passEmailMatch.test.js` - verify email-restricted passes
- [ ] `app/system-tests/tokens/tokenTracking.test.js` - verify tokens initialised on bundle grant, returned in API, lazy refresh works

### 2.8 Express server routes

- [ ] Add `GET /api/v1/pass` route to local Express server
- [ ] Add `POST /api/v1/pass` route to local Express server
- [ ] Add `POST /api/v1/pass/admin` route to local Express server (admin-only)

### 2.9 Bundle capacity (global cap enforcement & availability API)

**Intent**: The `cap` field on a catalogue bundle is a **global** limit — the maximum number of active (non-expired) allocations of that bundle across **all** users at any point in time. When a bundle's timeout expires, that slot returns to the pool for another user.

**Hard-wired rules** (already implemented):
- Each user can hold at most **one** of each bundle type — the `already_granted` check in `bundlePost.js` prevents duplicates
- Bundle renewal refreshes the existing allocation's expiry rather than creating a new record

#### 2.9.1 Global allocation counting

The current cap check in `bundlePost.js` is a per-user placeholder that is effectively a no-op (the already_granted check catches duplicates before the cap check runs). Replace with global counting:

- [ ] Add a **GSI or dedicated counter** for efficient global cap queries without full table scans
  - Option A: GSI on `bundleId` (PK) + `ttl` (SK) — query active allocations where `ttl > now`
  - Option B: Atomic counter record per bundleId (`pk = "cap#day-guest"`, `activeCount: N`) updated on grant/expiry
  - Option A preferred for accuracy (expired records auto-cleaned by DynamoDB TTL);
- [ ] Update `grantBundle()` in `bundlePost.js`: before granting, query active allocation count for the requested bundleId; if `count >= cap`, return `cap_reached` (403)
- [ ] Add `DataStack.java` changes if GSI approach chosen (add GSI to bundles table)
- [ ] Handle race conditions: use `ConditionExpression` on the counter increment or accept eventual consistency on the GSI query (cap is soft — a brief over-allocation during high concurrency is acceptable)

#### 2.9.2 GET /api/v1/bundle response changes

Extend the bundles API response to include **all catalogue bundles** (not just the user's allocations), so the UI can show availability:

- [ ] `bundleGet.js`: load the catalogue (`loadCatalogFromRoot()`) and merge with user's current bundles
- [ ] Response becomes the **union** of user's allocated bundles and catalogue bundles:
  ```json
  {
    "bundles": [
      {
        "bundleId": "test",
        "expiry": "2026-02-01T00:00:00.000Z",
        "hashedSub": "abc...",
        "createdAt": "2026-01-31T20:52:50.772Z",
        "ttl": 1772323200,
        "ttl_datestamp": "2026-03-01T00:00:00.000Z",
        "bundleCapacityAvailable": true
      },
      {
        "bundleId": "day-guest",
        "bundleCapacityAvailable": false
      },
      {
        "bundleId": "invited-guest",
        "bundleCapacityAvailable": true
      }
    ]
  }
  ```
- [ ] User's allocated bundles: full record (createdAt, hashedSub, ttl, expiry, ttl_datestamp) + `bundleCapacityAvailable`
- [ ] Unallocated catalogue bundles: only `bundleId` and `bundleCapacityAvailable: true/false`
- [ ] `bundleCapacityAvailable` is a boolean — no exact count exposed (the catalogue is public so the cap number can be inferred, but real-time take-up should not encourage scraping)
- [ ] Bundles with no `cap` field always have `bundleCapacityAvailable: true`
- [ ] Consumer filtering: existing code that consumes the bundles response and only cares about the user's current bundles should filter on `expiry` being in the future and `hashedSub` matching the logged-in user's session

#### 2.9.3 UI availability messaging

- [ ] `bundles.html`: use `bundleCapacityAvailable` to control button state
  - `true` + not allocated → show "Request {BundleName}" button as normal
  - `false` + not allocated → show "{BundleName}" button disabled with annotation: "Global user limit reached, please try again tomorrow"
  - Already allocated → show "Added ✓ {BundleName}" (existing behaviour)
- [ ] No change needed for activities — they are gated by bundle entitlement, not capacity

#### 2.9.4 DynamoDB table changes

- [ ] If GSI approach: add GSI `bundleId-ttl-index` to bundles table in `DataStack.java`
- [ ] If counter approach: no table change needed (counter records use existing PK)
- [ ] Ensure `SubmitEnvironmentCdkResourceTest.java` resource count is updated if GSI added

#### 2.9.5 System tests

- [ ] `app/system-tests/bundleCapacity.system.test.js`:
  - Allocate bundles to multiple users up to cap, verify next allocation returns `cap_reached`
  - Verify expired allocations don't count against cap (set past expiry, re-query)
  - Verify `bundleCapacityAvailable` is `true`/`false` in GET response based on global count
  - Verify bundles with no cap always show `bundleCapacityAvailable: true`
  - Verify uniqueness: same user requesting same bundle twice gets `already_granted`
  - Verify response includes unallocated catalogue bundles with just `bundleId` and `bundleCapacityAvailable`

#### 2.9.6 Performance considerations

- The GET /api/v1/bundle endpoint has **provisioned concurrency**, so the extra catalogue merge and capacity check are acceptable
- A whole-table count is expensive — the GSI or counter approach avoids scanning the entire bundles table
- Cap enforcement is **soft** — a brief over-allocation during concurrent requests is acceptable; the TTL-based expiry ensures slots eventually free up
- The capacity boolean is computed per-request (not cached) to ensure freshness

#### Files changed

| File | Change |
|------|--------|
| `app/functions/account/bundlePost.js` | Replace per-user cap check with global allocation query |
| `app/functions/account/bundleGet.js` | Merge catalogue bundles into response, add `bundleCapacityAvailable` |
| `app/services/productCatalog.js` | May need helper to get all catalogue bundle IDs with caps |
| `app/data/dynamoDbBundleRepository.js` | Add `getActiveAllocationCount(bundleId)` query (GSI or counter) |
| `web/public/submit.catalogue.toml` | Comments updated (already done) |
| `web/public/bundles.html` | Show capacity availability messaging |
| `infra/.../DataStack.java` | Add GSI if chosen (or no change for counter approach) |
| `infra/.../SubmitEnvironmentCdkResourceTest.java` | Update resource count if GSI added |
| `app/system-tests/bundleCapacity.system.test.js` | New system test file |

### Validation

Run `npm run test:system` - all pass API and token tracking system tests pass against Docker/dynalite. `GET /api/v1/bundle` returns token fields.

---

## Phase 3: Pass Redemption UI, Token Display & Behaviour Tests (Frontend)

**Goal**: Users can enter a pass on bundles.html (typed or from URL). Basic token information is displayed. Behaviour tests validate the end-to-end flow.

**Risk mitigated**: Does the UI correctly handle all pass states (valid, expired, wrong email, exhausted)? Does token info display correctly from the bundle API?

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

### 3.3 Basic token display

Token info is already returned by `GET /api/v1/bundle` from Phase 2. Display it:

- [ ] Show token balance in the "My Bundles" section for each bundle that has tokens:
  - `"N tokens remaining"` (from `tokensRemaining`)
  - `"Tokens refresh on DATE"` (from `tokenResetAt`, if set)
- [ ] Show aggregate token count in a summary line or navigation indicator
- [ ] No enforcement messaging yet — tokens are informational only at this stage

### 3.4 Behaviour tests for passes

- [ ] `behaviour-tests/pass/passRedemption.spec.js`
  - Generate a test pass via admin API
  - Navigate to `bundles.html?pass=test-pass-code`
  - Verify pass auto-populates
  - Verify bundle granted after redemption
  - Verify activity becomes accessible
  - Verify token balance displayed for granted bundle
- [ ] `behaviour-tests/pass/passErrors.spec.js`
  - Attempt to redeem expired pass - verify error message
  - Attempt to redeem exhausted pass - verify error message

### Validation

Run `npm run test:submitVatBehaviour-proxy` - pass redemption behaviour tests pass. Token balance visible on bundles page.

---

## Phase 4: Token Enforcement (Backend)

**Goal**: HMRC API calls consume tokens. Exhausted tokens block further calls.

**Risk mitigated**: Can we atomically enforce per-user token consumption across concurrent requests without disrupting users who already have tracked balances?

### 4.1 Token consumption service

- [ ] Update `dynamoDbBundleRepository.js`
  - `consumeToken(userId, bundleId)` - atomic decrement with condition `tokensConsumed < tokensGranted`
- [ ] Create `app/services/tokenEnforcement.js`
  - `consumeTokenForActivity(userId, activityId, catalog)` - find the user's qualifying bundle, consume 1 token
  - Returns `{ consumed: true, tokensRemaining }` or `{ consumed: false, reason: "tokens_exhausted" }`
  - Activities with `tokens = 0` or no `tokens` field are free (no consumption)

### 4.2 Wire enforcement into HMRC Lambdas

- [ ] `hmrcVatReturnPost.js` - consume 1 token before submitting
- [ ] `hmrcVatObligationsGet.js` - consume 1 token
- [ ] `hmrcVatReturnGet.js` - consume 1 token
- [ ] On `tokens_exhausted`: return JSON error `{ error: "tokens_exhausted", tokensRemaining: 0 }`

### 4.3 Tests

- [ ] `app/unit-tests/services/tokenEnforcement.test.js`
- [ ] `app/system-tests/tokens/tokenConsumption.test.js` - consume tokens, verify decrement
- [ ] `app/system-tests/tokens/tokenExhaustion.test.js` - verify API blocked when tokens exhausted

### Validation

Run `npm run test:system` - token enforcement system tests pass. HMRC API calls correctly consume and enforce token limits.

---

## Phase 5: Token Enforcement UI & Full Pass Enforcement (Frontend + Testing)

**Goal**: UI shows token costs before actions, handles exhaustion errors. All behaviour tests use passes. on-pass enforcement is active.

**Risk mitigated**: Does the full end-to-end pass + token flow work in behaviour tests?

### 5.1 Token enforcement UI

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
Issues campaign pass (3 free/month included, then 10 tokens each)
        │
        ▼
Pass grants invited-guest bundle (1 month, 3 tokens/month)
but must be redeemed within 3 days (urgency)
        │
        ▼
Shares pass via URL, QR code, social media, word-of-mouth
        │
        ▼
Recipient redeems pass → referrer gets 2 tokens back immediately
        │
        ▼
Recipient submits first VAT return → referrer gets 5 tokens
        │
        ▼
Recipient subscribes (resident-pro) → referrer gets 1 free month
```

### Economics & Value Proposition

| Item | Value | Notes |
|------|-------|-------|
| Pro subscription | ~£129/year | £10.75/month |
| Campaign pass gift value | ~£10.75 | Full month of invited-guest access |
| Campaign pass cost (after 3 free) | 10 tokens | ~£1.08 worth |
| Day pass comparison | ~£0.36 | Too small to drive engagement |

**Key insight**: The recipient gets a **full month** of access (£10.75 value) but must redeem within 3 days. The urgency drives redemption; the generous value drives conversion. This is substantially more compelling than a 1-day/£0.36 gift.

**Pass scarcity**: Pro users get 3 free campaign passes per month as part of their subscription. Additional passes cost 10 tokens each. This makes passes feel valuable ("I'm giving you one of my 3 monthly invites") rather than cheap.

**Progressive referrer rewards**:
- **Immediate**: 2 tokens back when pass is redeemed (not just created)
- **Engagement**: +5 tokens when recipient submits first VAT return
- **Conversion**: +1 free month when recipient subscribes
- **Commission**: 20% of first year (~£25) after 3 conversions (see §6.4)

This layered reward structure provides gratification at every stage of the funnel, not just at final conversion.

### Ambassador Tiers

High-volume referrers unlock better rates through a visible progression system:

| Tier | Threshold | Perk |
|------|-----------|------|
| **Starter** | 0 redemptions | 3 free passes/month |
| **Silver** | 5 redemptions | 5 free passes/month |
| **Gold** | 15 redemptions | 8 free passes/month, 20% more tokens per pass |

Tier progress is shown in the UI: "You've had 3 passes redeemed. 2 more to unlock Silver (5 free passes/month)."

### Target Segments

The flywheel spins faster with the right referrers:

| Segment | Why | Volume | Strategy |
|---------|-----|--------|----------|
| **Accountants** | Trusted recommendation, multiple clients | 1 accountant → 10-50 clients | Dedicated `accountant-partner` pass type, bulk issuance |
| **Bookkeeping communities** | Peer recommendation | Moderate | Community passes via forum/group leaders |
| **Small business forums** | Organic discovery | Low but genuine | Campaign passes from enthusiastic users |
| **Social media** | Broad reach | Variable | Standard campaign passes |

An accountant with 50 clients is worth more than 50 individual social media posts. Consider a future `accountant-partner` pass type with higher maxUses and longer validity.

### Product Stickiness Considerations

VAT submission is quarterly (4x/year) — low engagement. To keep the flywheel spinning:

**A. Expand touchpoints** (future phases):
- VAT obligations reminders (monthly touchpoint)
- MTD record keeping (weekly touchpoint)
- Bank feed integration (daily touchpoint)

**B. Make the quarterly moment delightful**:
- "Your VAT return took 47 seconds. The average accountant charges £150 for this."
- Celebration UI after successful submission
- Year-on-year comparisons and savings tracking

**C. Measure the right metric**: Track VAT submissions per referred user, not just pass redemptions. A referral that doesn't submit is a vanity metric.

### Alternative: Affiliate Track (Deferred)

If organic referral velocity is too low, a separate affiliate model could complement campaigns:
- Anyone signs up as an affiliate (free, no subscription needed)
- Affiliates get unique tracking codes
- Affiliates earn 20% of first-year subscription per conversion
- No token cost — they're marketing partners, not users

This separates "users who love the product" from "marketers who want commission". Deferred until referral data shows whether organic growth is sufficient.

### 6.1 Campaign pass issuance (Backend)

- [ ] Create `app/functions/account/passIssuePost.js`
  - Authenticated endpoint (any user with a token-bearing bundle)
  - Input: `{ notes? }` (pass type is always `campaign`)
  - Check free passes remaining this month (3/month for Starter, more for Silver/Gold)
  - If free passes exhausted: validate caller has >= 10 tokens, consume 10 tokens
  - Creates a campaign pass:
    - `passTypeId = "campaign"`
    - `bundleId = "invited-guest"`
    - `maxUses = 1`
    - `validUntil = now + P3D` (3-day redemption window)
    - `issuedBy = callerHashedSub`
  - Returns: `{ code, url, validUntil, tokensRemaining, freePassesRemaining }`
- [ ] Track monthly pass issuance per user (counter with monthly reset, same lazy-eval pattern as token refresh)
- [ ] Add API Gateway route: `POST /api/v1/pass/issue`
- [ ] Add Express server route for local development
- [ ] Wire Lambda in `AccountStack.java`

### 6.2 Referral tracking & progressive rewards (Backend)

- [ ] Add `issuedBy` field to pass record (set when a user issues a campaign pass)
- [ ] On pass redemption, if `issuedBy` is set:
  - Record referral: `{ referrerId: issuedBy, referredUserId: redeemer, passCode, redeemedAt }`
  - Store in bundles table or a dedicated referral GSI
  - **Immediate reward**: Credit referrer with 2 tokens (small gratification for sharing)
- [ ] On referred user's first VAT return submission:
  - **Engagement reward**: Credit referrer with 5 tokens
  - This confirms the referral created real value (someone actually used the product)
- [ ] On subscription purchase (when referred user upgrades to resident-pro):
  - **Conversion reward**: Credit the referrer with 1 free month
  - Cap referral credits at 12 months per referrer
- [ ] Track cumulative redemptions per referrer for ambassador tier progression

### 6.3 Referral rewards (Backend)

- [ ] Implement subscription credit system
  - `referralCreditsEarned` field on user record
  - `referralCreditsApplied` field (tracks what's been used)
  - When processing subscription renewal, apply 1 credit before charging
  - Cap: `referralCreditsEarned <= 12`
- [ ] Referral reward trigger: credited after the referred user's first VAT return submission (not just sign-up)
  - This aligns with campaign.md recommendation to reward real value creation, not just sign-ups

### 6.4 Commission (deferred until payment integration)

Per `_developers/archive/campaign.md`, once there are enough referrals:
- 20% of first year's subscription value (e.g., ~£25 at £129/year)
- Payable only after referrer has >= 3 converted users
- Payable as account credit by default, cash payout above £50 threshold
- **Visible threshold**: "2 of your referrals have converted. 1 more to unlock the Ambassador Commission program (20% of future conversions)."
- This is deferred until subscription payments are implemented
- See "Alternative: Affiliate Track" in the Design section for a complementary model

### 6.5 Campaign pass UI (Frontend)

- [ ] Add "Issue Invitation" section to bundles.html (visible to users with token-bearing bundles)
  - Show free passes remaining: "2 of 3 free invitations remaining this month"
  - If free passes exhausted: "Additional invitations cost 10 tokens (N remaining)"
  - "Issue Pass" button
  - On success: display the pass URL, copy-to-clipboard button, share links
  - Show pass expiry: "Your guest gets a full month of access — they just need to redeem within 3 days"
- [ ] Add "My Issued Passes" section
  - List of passes the user has issued
  - Status: active, expired, redeemed
  - Who redeemed (if applicable, anonymised)
- [ ] Add "Referral Rewards" section
  - Number of successful referrals
  - Free months earned / applied / remaining
  - Ambassador tier progress: "3 passes redeemed — 2 more to Silver (5 free passes/month)"
- [ ] Post-submission delight messaging
  - "Your VAT return took 47 seconds. The average accountant charges £150 for this."
  - "Share a free invitation with someone who would find this useful"

### 6.6 QR code generation

- [ ] Add QR code generation for campaign passes
  - Generate QR code PNG encoding the pass URL
  - Display inline on the "Issue Invitation" result
  - Download button for sharing physically
- [ ] QR code generation for admin-created passes (GitHub Actions workflow output)

### 6.7 Abuse controls

- [ ] Free pass allowance: 3/month (Starter), 5/month (Silver), 8/month (Gold) — tracked with monthly reset
- [ ] Rate limit additional (paid) pass issuance: max 5 passes per user per day beyond free allowance
- [ ] No self-referral: pass issuer cannot redeem their own passes
- [ ] One referrer per account: first referral is immutable
- [ ] Campaign passes cannot be issued with email restriction (they must be shareable)
- [ ] Expired campaign passes are auto-deleted via DynamoDB TTL (validUntil + 30 days)
- [ ] Token rewards only for genuine referrals — tokens credited after confirmed actions (redemption, VAT submission), not pass creation

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
Phase 2: Pass Validation API + Token Tracking + System Tests
    │
    ▼
Phase 3: Pass Redemption UI + Token Display + Behaviour Tests
    │
    ├──────────────────────┐
    ▼                      ▼
Phase 4: Token          Phase 5.2-5.3: Pass
  Enforcement              Enforcement
    │                      │
    ▼                      │
Phase 5.1,5.4:             │
  Enforcement UI           │
    │                      │
    └──────────────────────┘
             │
             ▼
Phase 6: Campaign Passes & Referrals
             │
             ▼
Phase 7: Production Readiness
```

Token tracking and display are built early (Phases 2-3) so the data layer is ready before enforcement. Phases 4 and 5.2-5.3 can run in parallel after Phase 3 completes. Phase 6 requires both token enforcement (Phase 4) and pass enforcement (Phase 5) to be complete.

## Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `app/lib/passphrase.js` | 1 | Four-word passphrase generator |
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
| `app/data/dynamoDbBundleRepository.js` | 2 | Token fields (tracking), getTokenBalance, resetTokens |
| `app/functions/account/bundleGet.js` | 2 | Return tokensRemaining in response |
| `app/functions/account/bundlePost.js` | 2 | Set tokensGranted on bundle creation |
| `app/data/dynamoDbBundleRepository.js` | 4 | consumeToken (atomic enforcement) |
| `app/functions/hmrc/hmrcVatReturnPost.js` | 4 | Token consumption before HMRC call |
| `app/functions/hmrc/hmrcVatObligationsGet.js` | 4 | Token consumption before HMRC call |
| `app/functions/hmrc/hmrcVatReturnGet.js` | 4 | Token consumption before HMRC call |
| `web/public/bundles.html` | 3, 5, 6 | Pass entry form, on-pass filtering, token display, campaign UI |
| `web/public/submit.catalogue.toml` | - | Already configured (source of truth) |

## Resolved Questions

1. **Email hash secret rotation**: Store the secret version on each pass record (`emailHashSecretVersion` field). When rotating secrets, old passes remain validatable by looking up the secret version they were created with.
2. **Token consumption granularity**: All HMRC API activities cost 1 token each (viewing obligations, viewing VAT returns, submitting VAT returns). The model is that getting approved by HMRC has a cost and operating a compliant business has a cost - tokens are applied at every HMRC interaction.
3. **Campaign pass validity period**: 3 days. Short enough to create urgency, long enough to act. Not an open question.
4. **Subscription payment provider**: Defer commission/payout functionality until a payment system (Stripe or similar) is integrated. Referral tracking and free-month credits can proceed without external payments.
5. **DIY legacy bundle**: Existing DIY customers email support, admin sends them an `invited-guest` or `resident-guest` pass manually via the GitHub Actions workflow. No PayPal transaction verification needed.

---

*Last updated: 2026-01-31*
*GitHub Issue: #560*
