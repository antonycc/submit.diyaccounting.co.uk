# Campaign Passes, Referral System & Commission Plan

> **Source**: Sections 6 & 7 of `_developers/backlog/PLAN_PASSES_V2-PART-2.md`
> **GitHub Issue**: [#560](https://github.com/antonycc/submit.diyaccounting.co.uk/issues/560)
> **Prerequisite**: Pass infrastructure (Phases 1-5) is complete and deployed

## What Already Exists

The pass and token infrastructure is fully implemented:

| Component | Status |
|-----------|--------|
| Pass creation, validation, redemption (5 Lambdas) | Complete |
| Token enforcement (`tokenEnforcement.js`) | Complete |
| DynamoDB passes table with `issuedBy-index` GSI | Complete |
| User-issued passes (`passGeneratePost.js`) | Complete — `digital-pass` (10 tokens, P7D, 20 uses) and `physical-pass` (10 tokens, no expiry, 10 uses) |
| Pass type registry (`submit.passes.toml`) | Complete — includes `campaign-pass` type definition |
| Bundle capacity management | Complete |
| Email hashing with secret versioning | Complete |
| QR code generation (client-side) | Complete |
| `web/public/passes/generate-digital.html` and `generate-physical.html` | Complete |

**What does NOT exist yet (this plan's scope):**

- Campaign pass issuance with free-pass allowance and monthly reset
- Referral tracking (who referred whom)
- Progressive referral rewards (tokens on redemption, on VAT submission, on subscription)
- Ambassador tier system (Starter/Silver/Gold)
- Commission payout mechanism
- Campaign UI sections on bundles.html
- Campaign-specific monitoring and documentation

---

## 1. Data Model Changes

### 1.1 Referral Records

Store referrals in the existing **bundles table** using a new item type, avoiding a new table.

```
Table: {env}-env-bundles
PK: referral#{referrerHashedSub}
SK: referred#{referredHashedSub}

Fields:
  referrerHashedSub     String   Who issued the campaign pass
  referredHashedSub     String   Who redeemed it
  passCode              String   The campaign pass code that linked them
  redeemedAt            String   ISO8601 — when the pass was redeemed
  firstVatSubmissionAt  String   ISO8601 — when referred user first submitted VAT (null until it happens)
  subscribedAt          String   ISO8601 — when referred user subscribed to resident-pro (null until it happens)
  rewardsGranted        Map      { redemption: bool, vatSubmission: bool, subscription: bool }
  createdAt             String   ISO8601
```

**Why the bundles table?** It already has the `hashedSub` partition key pattern and the Lambda IAM permissions. Adding a `referral#` prefix to PK avoids a new table, new CDK stack changes, and new IAM grants.

**Query patterns:**
- "All referrals by user X": `PK = referral#{hashedSub}` (scan SK)
- "Was user Y referred?": Requires a GSI (see below)

### 1.2 New GSI: `referred-index`

```
GSI Name: referred-index
PK: referredHashedSub
Projection: ALL
```

Purpose: Look up "who referred this user?" when the referred user submits their first VAT return or subscribes. Without this GSI, we'd need a full table scan.

**CDK change**: Add GSI to the bundles table in `DataStack.java`.

### 1.3 Ambassador Tier Tracking

Store on the user's existing bundle record (e.g. `resident-pro` bundle item):

```
Additional fields on bundle record:
  campaignPassesIssuedThisMonth   Number   Resets monthly (lazy-eval, same pattern as token refresh)
  campaignPassesResetAt           String   ISO8601 — next monthly reset
  totalReferralRedemptions        Number   Lifetime count (drives tier progression)
  referralCreditsEarned           Number   Free months earned (cap: 12)
  referralCreditsApplied          Number   Free months already used
```

**Tier calculation** is derived at read time from `totalReferralRedemptions`:

| Tier | Threshold | Free passes/month |
|------|-----------|-------------------|
| Starter | 0 | 3 |
| Silver | 5 redemptions | 5 |
| Gold | 15 redemptions | 8 |

No separate tier field needed — compute from `totalReferralRedemptions` in code.

### 1.4 Campaign Pass Type (Already Defined)

In `submit.passes.toml`, the `campaign-pass` type already exists:

```toml
[[passTypes]]
id = "campaign-pass"
bundleId = "day-guest"
defaultValidityPeriod = "P7D"
defaultMaxUses = 1000
tokenCost = 25
```

**Adjustment needed**: The backlog specifies `P3D` validity and `maxUses = 1` with a token cost of 3 (after free allowance exhausted). The current definition has `P7D`, `maxUses = 1000`, and costs 25 tokens. Update to match the campaign economics:

```toml
[[passTypes]]
id = "campaign-pass"
bundleId = "invited-guest"          # Full month of access (not day-guest)
defaultValidityPeriod = "P3D"       # 3-day redemption window (urgency)
defaultMaxUses = 1                  # Single use per pass
tokenCost = 3                       # Cost after free allowance exhausted
```

---

## 2. API Endpoints

### 2.1 Issue Campaign Pass

**`POST /api/v1/pass/campaign`**

File: `app/functions/account/passCampaignPost.js`

```
Request:
  Authorization: Bearer {idToken}
  Body: { notes?: string }

Response (201):
  {
    code: "word-word-word-word",
    url: "https://submit.diyaccounting.co.uk/bundles.html?pass=word-word-word-word",
    passTypeId: "campaign-pass",
    bundleId: "invited-guest",
    validUntil: "2026-03-19T...",     // now + 3 days
    maxUses: 1,
    freePassesRemaining: 2,           // of 3 (or 5/8 for Silver/Gold)
    freePassesAllowance: 3,           // tier-based total
    tokensConsumed: 0,                // 0 if free pass used, 3 if paid
    tokensRemaining: 97,
    ambassadorTier: "starter"
  }

Error (403): { error: "Insufficient tokens" }
Error (429): { error: "Daily limit reached (max 5 paid passes per day)" }
```

**Logic:**
1. Authenticate user, get `hashedSub`
2. Find user's token-bearing bundle (resident-pro or resident-pro-comp)
3. Check `campaignPassesIssuedThisMonth` (lazy-reset if `campaignPassesResetAt < now`)
4. Compute free allowance from ambassador tier
5. If free passes remaining: create pass, increment counter, no token charge
6. If free passes exhausted: consume 3 tokens via `tokenEnforcement.js`, then create pass
7. Set `issuedBy = hashedSub` on pass record (enables referral tracking on redemption)
8. Return pass details with campaign-specific metadata

### 2.2 Get Referral Dashboard

**`GET /api/v1/referrals`**

File: `app/functions/account/referralsGet.js`

```
Request:
  Authorization: Bearer {idToken}

Response (200):
  {
    ambassadorTier: "starter",
    totalRedemptions: 3,
    nextTier: { name: "silver", threshold: 5, remaining: 2 },
    freePassesPerMonth: 3,
    freePassesUsedThisMonth: 1,
    referralCreditsEarned: 1,
    referralCreditsApplied: 0,
    referralCreditsRemaining: 1,
    referrals: [
      {
        passCode: "word-word-word-word",
        redeemedAt: "2026-03-10T...",
        hasSubmittedVat: true,
        hasSubscribed: false,
        rewardsGranted: { redemption: true, vatSubmission: true, subscription: false }
      }
    ]
  }
```

**Logic:**
1. Query `PK = referral#{hashedSub}` from bundles table
2. Compute tier from `totalReferralRedemptions` on the user's bundle record
3. Return aggregated referral stats and individual referral status

### 2.3 Referral Reward Triggers

No new endpoints — rewards are triggered by existing actions:

**On pass redemption** (`passPost.js` modification):
- After granting bundle, check if `pass.issuedBy` is set
- If yes: write referral record, credit referrer with 2 tokens
- Use `issuedBy` to find the referrer's bundle and atomically increment `tokensRemaining`

**On first VAT submission** (`hmrcVatReturnPost.js` modification):
- After successful submission, query `referred-index` GSI for current user
- If referral exists and `firstVatSubmissionAt` is null:
  - Set `firstVatSubmissionAt = now`
  - Credit referrer with 5 tokens
  - Update `rewardsGranted.vatSubmission = true`

**On subscription purchase** (`billingWebhookPost.js` modification):
- In `handleCheckoutComplete`, query `referred-index` for the subscribing user
- If referral exists and `subscribedAt` is null:
  - Set `subscribedAt = now`
  - Increment referrer's `referralCreditsEarned` (cap at 12)
  - Update `rewardsGranted.subscription = true`
  - Increment `totalReferralRedemptions` for tier progression

---

## 3. Database Indexing Summary

| Table | Index | PK | SK | Purpose |
|-------|-------|----|----|---------|
| bundles | (table) | hashedSub | bundleId | Existing — user bundles |
| bundles | referred-index (NEW) | referredHashedSub | — | Look up referrer when referred user acts |
| passes | (table) | pk | — | Existing — pass by code |
| passes | issuedBy-index | issuedBy | — | Existing — passes issued by user |

Only **one new GSI** needed.

---

## 4. New Pages & UI Changes

### 4.1 Campaign Section on `bundles.html`

Add below the existing "My Generated Passes" section. Visible only to users with a token-bearing bundle (resident-pro or resident-pro-comp).

```
┌──────────────────────────────────────────────────┐
│ Issue an Invitation                               │
│                                                    │
│ Share a free month of VAT submission access.       │
│ Your guest gets full invited-guest access —        │
│ they just need to redeem within 3 days.            │
│                                                    │
│ 2 of 3 free invitations remaining this month       │
│ ── or ── Additional invitations cost 3 tokens      │
│                                                    │
│ Notes (optional): [________________________]       │
│                                                    │
│ [ Issue Invitation ]                               │
│                                                    │
│ ── Result (after issuing) ──                       │
│ Code: tiger-happy-mountain-silver                  │
│ URL: https://submit.../bundles.html?pass=...       │
│ [Copy Link] [View QR] [Copy Code]                  │
│ Expires: 19 March 2026                             │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Referral Rewards                                  │
│                                                    │
│ Ambassador tier: Starter                           │
│ 3 passes redeemed — 2 more to unlock Silver        │
│ (5 free invitations/month)                         │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ 3/5                        │
│                                                    │
│ Rewards earned:                                    │
│ • 6 tokens from redemptions (3 × 2 tokens)        │
│ • 5 tokens from VAT submissions (1 × 5 tokens)    │
│ • 0 free months from subscriptions                 │
│                                                    │
│ Recent referrals:                                  │
│ ┌─────────────────────────────────────────┐       │
│ │ tiger-happy-mountain-silver              │       │
│ │ Redeemed 10 Mar · Submitted VAT ✓       │       │
│ │ Rewards: +2 tokens, +5 tokens           │       │
│ └─────────────────────────────────────────┘       │
│ ┌─────────────────────────────────────────┐       │
│ │ ocean-bright-forest-cloud               │       │
│ │ Redeemed 8 Mar · Awaiting VAT submission│       │
│ │ Rewards: +2 tokens                      │       │
│ └─────────────────────────────────────────┘       │
└──────────────────────────────────────────────────┘
```

### 4.2 Post-Submission Prompt on `submitVat.html`

After successful VAT submission, show:

```
┌──────────────────────────────────────────────────┐
│ ✓ Your VAT return was submitted successfully      │
│                                                    │
│ Know someone who'd find this useful?               │
│ Share a free invitation — they get a full month    │
│ of access.                                         │
│                                                    │
│ [ Share an Invitation → ]                          │
└──────────────────────────────────────────────────┘
```

Links to `bundles.html#issue-invitation`.

### 4.3 Ambassador Help Page

`web/public/help.html` or a section within — document:
- How invitations work
- Ambassador tiers (Starter → Silver → Gold)
- Reward structure (2 tokens on redemption, 5 on VAT submission, free month on subscription)
- Commission programme eligibility (see Section 6)

---

## 5. Abuse Controls

| Control | Implementation |
|---------|----------------|
| No self-referral | `passPost.js`: reject if `pass.issuedBy === redeemerHashedSub` |
| One referrer per account | `referred-index` query: reject if referred user already has a referral record |
| Free pass monthly limit | Lazy-reset counter on bundle record; tier-based cap (3/5/8) |
| Paid pass daily limit | Count passes created today by user; cap at 5 paid passes/day |
| Campaign passes are public | Cannot set `restrictedToEmail` on campaign-pass type |
| TTL auto-cleanup | DynamoDB TTL: `validUntil + 30 days` (already implemented for passes) |
| Reward idempotency | `rewardsGranted` map prevents double-crediting |

---

## 6. Commission Programme

### 6.1 Economics

| Event | Reward |
|-------|--------|
| Pass redeemed | +2 tokens (~£0.72 value) |
| Referred user submits first VAT return | +5 tokens (~£1.80 value) |
| Referred user subscribes (resident-pro) | +1 free month (~£10.75 value) |
| **Commission** (after 3 conversions) | 20% of first year (~£25.80 per conversion) |

### 6.2 Commission Payout Mechanism

Commission becomes payable when a referrer has **3 or more converted users** (users who subscribed to resident-pro via their referral).

**Payout options (in order of simplicity):**

#### Option A: Stripe Connect (Recommended)

Use [Stripe Connect](https://stripe.com/gb/connect) with **Standard accounts**:
- Referrer creates a Stripe account (via Stripe's onboarding)
- DIY Accounting sends payouts via the Stripe Transfers API
- Stripe handles identity verification, tax reporting, and bank transfers
- No employment relationship — Stripe Connect is designed for marketplace/platform payouts

**Data model addition:**
```
On bundle record:
  stripeConnectAccountId    String   Referrer's Stripe Connect account ID (null until onboarded)
  commissionBalance         Number   Accumulated unpaid commission in pence (£25.80 = 2580)
  commissionPaidOut         Number   Total commission paid out in pence
  lastPayoutAt              String   ISO8601
```

**Payout rules:**
- Minimum payout threshold: £50 (avoids micro-transaction costs)
- Below threshold: accumulate as account credit (reduces subscription cost)
- Above threshold: automatic monthly payout via Stripe Transfer
- Referrer must complete Stripe Connect onboarding before cash payout

**Endpoint**: `POST /api/v1/referrals/payout` — triggers payout if balance >= £50 and Stripe Connect account is verified.

#### Option B: Account Credit Only (Simplest, No Cash)

All commission is applied as subscription credit:
- £25.80 commission = ~2.4 free months
- Applied automatically to next subscription renewals
- No cash ever leaves the platform
- No need for Stripe Connect, no payment processing

**Trade-off**: Less attractive to high-volume referrers (accountants) who want cash, but avoids all payout complexity.

#### Option C: Manual PayPal/Bank Transfer (Interim)

- Referrer requests payout via support email
- Admin verifies balance and sends manual bank transfer
- Simple but doesn't scale beyond ~20 referrers

### 6.3 Avoiding "Employment" Classification

This is critical — HMRC and UK employment law distinguish between employees, workers, and self-employed contractors. The referral programme must be structured as **none of these**:

**The programme is a customer loyalty/incentive scheme, not employment, because:**

1. **No obligation to perform work**: Referrers choose whether to share passes. There is no minimum activity requirement, no targets, no reporting obligation, and no consequence for inactivity.

2. **No mutuality of obligation**: DIY Accounting is not obligated to provide passes, and referrers are not obligated to distribute them. Either party can stop at any time.

3. **No control over how/when**: Referrers share passes however they choose — social media, word of mouth, printed QR codes. DIY Accounting does not direct, supervise, or schedule their activity.

4. **Reward, not payment for services**: The commission is a reward for successful introductions, structured identically to customer referral programmes run by banks (e.g., Monzo, Revolut), utilities (Octopus Energy), and SaaS platforms (Dropbox, Notion). These are universally treated as incentive schemes, not employment.

5. **No personal service requirement**: Anyone with a subscription can refer. There is no interview, onboarding, training, or exclusivity.

**Legal structuring:**

- **Terms & Conditions**: Frame as "Referral Reward Programme Terms" (not "Commission Agreement" or "Affiliate Contract")
- **Terminology**: Use "reward" and "bonus" not "salary", "wage", or "commission" in user-facing copy. (This plan uses "commission" internally for clarity only.)
- **Tax responsibility**: Programme terms state that referrers are responsible for declaring rewards as income if applicable. DIY Accounting does not deduct tax or NI.
- **No IR35 risk**: There is no contract for services. The referrer is a customer earning rewards, not a contractor providing marketing services.
- **Account credit default**: By defaulting to account credit (not cash), the programme is even further from employment — it's indistinguishable from loyalty points (Tesco Clubcard, Nectar, etc.).
- **Cash payout threshold (£50)**: The threshold ensures cash payouts are infrequent and substantial, not regular "salary-like" payments. This is consistent with how cashback programmes operate.

**Precedent**: HMRC's own guidance (BIM40455) treats customer incentive payments as "annual payments" or miscellaneous income, not employment income, provided there is no contract for services.

**Accountant-partner tier** (future): If an accountant refers 50+ clients, the relationship could start to look more like a commercial partnership. At that scale, consider a formal **affiliate agreement** (B2B contract between DIY Accounting Ltd and the accountant's practice) rather than the customer reward programme. This keeps the standard programme clearly in "loyalty scheme" territory.

---

## 7. Implementation Phases

### Phase 6.1: Campaign Pass Issuance (Backend)

- [ ] Create `app/functions/account/passCampaignPost.js`
- [ ] Add free-pass monthly counter logic (lazy-reset pattern from token refresh)
- [ ] Add ambassador tier calculation helper (`getTierForRedemptions(count)`)
- [ ] Update `submit.passes.toml`: adjust `campaign-pass` to P3D validity, maxUses=1, tokenCost=3, bundleId=invited-guest
- [ ] Wire Lambda in `AccountStack.java`: `POST /api/v1/pass/campaign` (JWT auth, custom auth)
- [ ] Add Express server route for local dev
- [ ] Unit tests: `passCampaignPost.test.js`

### Phase 6.2: Referral Tracking (Backend)

- [ ] Add `referred-index` GSI to bundles table in `DataStack.java`
- [ ] Create `app/data/dynamoDbReferralRepository.js` — CRUD for referral records in bundles table
- [ ] Modify `passPost.js`: on redemption of a pass with `issuedBy`, create referral record and credit 2 tokens
- [ ] Add anti-abuse: reject self-referral, one-referrer-per-account
- [ ] Unit tests: referral creation, self-referral rejection

### Phase 6.3: Progressive Rewards (Backend)

- [ ] Modify `hmrcVatReturnPost.js`: after successful submission, check `referred-index` for current user, credit referrer 5 tokens on first submission
- [ ] Modify `billingWebhookPost.js`: on `checkout.session.completed`, check `referred-index`, credit referrer with 1 free month
- [ ] Add `totalReferralRedemptions` increment on each successful referral reward
- [ ] Add `referralCreditsEarned` / `referralCreditsApplied` to bundle records
- [ ] Unit tests: reward idempotency, cap enforcement (12 months max)

### Phase 6.4: Referral Dashboard API (Backend)

- [ ] Create `app/functions/account/referralsGet.js`
- [ ] Wire in `AccountStack.java`: `GET /api/v1/referrals` (JWT auth)
- [ ] Unit tests

### Phase 6.5: Campaign UI (Frontend)

- [ ] Add "Issue an Invitation" section to `bundles.html`
- [ ] Add "Referral Rewards" section to `bundles.html` (tier progress, stats, referral list)
- [ ] Add post-submission prompt on `submitVat.html`
- [ ] Add ambassador programme explanation to help pages

### Phase 6.6: Commission Payout (Deferred)

- [ ] Integrate Stripe Connect for Standard accounts
- [ ] Add commission balance tracking to bundle records
- [ ] Create `POST /api/v1/referrals/payout` endpoint
- [ ] Create payout eligibility UI on `bundles.html`
- [ ] Draft "Referral Reward Programme Terms" (legal)
- [ ] Add admin reporting for commission balances

### Phase 7: Campaign Production Readiness

- [ ] CloudWatch alarms: unusual pass issuance volume, self-referral attempts
- [ ] Admin dashboard: campaign passes created/redeemed/expired, referral funnel, tier distribution
- [ ] FAQ/help documentation for ambassador programme
- [ ] Referral programme terms & conditions page

---

## 8. Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `app/functions/account/passCampaignPost.js` | 6.1 | Campaign pass issuance Lambda |
| `app/functions/account/referralsGet.js` | 6.4 | Referral dashboard API |
| `app/data/dynamoDbReferralRepository.js` | 6.2 | Referral record CRUD |
| `app/unit-tests/functions/passCampaignPost.test.js` | 6.1 | Campaign pass unit tests |
| `app/unit-tests/data/dynamoDbReferralRepository.test.js` | 6.2 | Referral repository tests |

## 9. Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `submit.passes.toml` | 6.1 | Update campaign-pass definition (P3D, maxUses=1, tokenCost=3, bundleId=invited-guest) |
| `infra/.../DataStack.java` | 6.2 | Add `referred-index` GSI to bundles table |
| `infra/.../AccountStack.java` | 6.1, 6.4 | Add `passCampaignPost` and `referralsGet` Lambdas |
| `app/functions/account/passPost.js` | 6.2 | Create referral record on redemption, credit 2 tokens |
| `app/functions/hmrc/hmrcVatReturnPost.js` | 6.3 | Credit referrer 5 tokens on referred user's first submission |
| `app/functions/billing/billingWebhookPost.js` | 6.3 | Credit referrer free month on referred user's subscription |
| `app/data/dynamoDbBundleRepository.js` | 6.1 | Add campaign counter fields and lazy-reset logic |
| `web/public/bundles.html` | 6.5 | Add campaign issuance and referral rewards sections |
| `web/public/hmrc/vat/submitVat.html` | 6.5 | Add post-submission referral prompt |

---

## 10. Mockups

See SVG mockups in the project root:

| File | Screen |
|------|--------|
| `PLAN_CAMPAIGN_AND_REFERRALS_ISSUE_INVITATION.svg` | "Issue an Invitation" section on bundles.html — free pass counter, notes input, result with QR/copy/link |
| `PLAN_CAMPAIGN_AND_REFERRALS_REFERRAL_REWARDS.svg` | "Referral Rewards" dashboard — ambassador tier progress bar, reward totals, individual referral cards with status |
| `PLAN_CAMPAIGN_AND_REFERRALS_GENERATED_PASSES_LIST.svg` | Updated "My Generated Passes" list — notes displayed, View QR button, campaign/invitation badge |
| `PLAN_CAMPAIGN_AND_REFERRALS_POST_SUBMISSION_PROMPT.svg` | Post-VAT-submission prompt on submitVat.html — encourages sharing an invitation |

---

## 11. Drop-in Platform Evaluation

Before building the referral/commission system in-house, evaluate third-party platforms that integrate with Stripe and could replace most of the custom backend.

### Recommendation: FirstPromoter ($49/month)

**Best overall fit** for all four requirements:

| Requirement | FirstPromoter Coverage |
|-------------|----------------------|
| Referral tracking (who referred whom) | Native Stripe integration — automatic |
| Progressive rewards (tokens/credits) | Built-in performance tier system |
| Ambassador tiers (Starter/Silver/Gold) | Configurable tiers with auto-promotion on referral count thresholds |
| Commission payouts (20%, ~£25/conversion) | Stripe Connect support — automate payouts with min threshold |

**What you would NOT need to build**: referral records, GSI, tier calculation, commission balance tracking, payout endpoint, referral dashboard API. FirstPromoter provides a hosted affiliate dashboard, commission tracking, and payout management.

**What you would still build**: campaign pass issuance (the pass/token system is bespoke), the "Issue Invitation" UI on bundles.html, and the post-submission prompt. FirstPromoter tracks conversions once the referred user subscribes via Stripe; your pass system handles the initial sharing mechanic.

### Comparison Summary

| Platform | Price/mo | Stripe Depth | Tiers Built-in | Auto Payouts | UK Fit |
|----------|----------|-------------|----------------|--------------|--------|
| **FirstPromoter** | $49 | Very good | **Yes** | PayPal + Stripe Connect | Good |
| Rewardful | $49 | Excellent | Partial (API needed) | Manual/PayPal | Good |
| Tolt | $29 | Very good | Partial | PayPal + Wise | **Good (Wise)** |
| GrowSurf | $99 | Fair | Milestones only | No cash payouts | Fair |
| Tapfiliate | $89 | Fair | Yes | PayPal | Fair |
| PartnerStack | ~$500+ | Good | Full | Yes | Overkill |
| ReferralCandy | $59 | None | Basic | Ecommerce only | Not a fit |
| Stripe alone | $0 | N/A | None | DIY via Connect | Build everything |

### Integration Approach (with FirstPromoter or Rewardful)

If using a third-party platform, the architecture simplifies to:

```
Phase 6.1  Campaign pass issuance     → Keep (bespoke pass/token system)
Phase 6.2  Referral tracking          → REPLACE with FirstPromoter
Phase 6.3  Progressive rewards        → REPLACE with FirstPromoter (configure tiers + commission rules)
Phase 6.4  Referral dashboard API     → REPLACE with FirstPromoter hosted dashboard
Phase 6.5  Campaign UI (bundles.html) → Keep "Issue Invitation" section; embed FirstPromoter widget for referral stats
Phase 6.6  Commission payout          → REPLACE with FirstPromoter + Stripe Connect
Phase 7    Monitoring                 → PARTIALLY REPLACE — FirstPromoter has analytics; keep CloudWatch for abuse detection
```

**Custom code still needed**:
1. `passCampaignPost.js` — campaign pass issuance with free-pass allowance (this is unique to DIY Accounting's pass/token model)
2. "Issue Invitation" section on bundles.html — calls your API, not FirstPromoter's
3. Post-submission referral prompt on submitVat.html
4. Integration glue: when a campaign pass is redeemed and the user later subscribes via Stripe, FirstPromoter picks up the Stripe subscription event automatically (via its Stripe integration) and attributes it to the referrer

**What you avoid building**: referral repository, referred-index GSI, reward trigger hooks in passPost/hmrcVatReturnPost/billingWebhookPost, commission balance tracking, payout endpoint, tier calculation, referral dashboard API.

### Budget Option: Tolt ($29/month)

If cost is a concern at early stage, Tolt offers similar Stripe-native tracking at $29/month. Its Wise payout integration is practical for UK bank transfers. The risk is it's a smaller company — evaluate current feature set against your specific tier requirements.

### Build vs Buy Decision

| Factor | Build In-House | Use FirstPromoter/Rewardful |
|--------|---------------|---------------------------|
| Monthly cost | $0 (but dev time) | $49/month |
| Dev effort | ~2-3 weeks | ~2-3 days (integration only) |
| Maintenance | Ongoing (tier logic, payouts, compliance) | Managed by vendor |
| Flexibility | Full control | Constrained to platform capabilities |
| Payout compliance | You handle tax, KYC, bank transfers | Platform assists (Stripe Connect/PayPal) |
| Risk | Bugs in commission calc, payout errors | Vendor dependency, possible sunset |

**Recommendation**: Start with **FirstPromoter** (or Tolt for budget). If the programme scales to hundreds of affiliates or requires features the platform doesn't support, migrate to in-house at that point — the pass/token system and data model described in this plan remain valid as a migration target.

---

*Last updated: 2026-03-16*
*GitHub Issue: #560*
