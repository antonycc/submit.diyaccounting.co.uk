# Passes and Bundles System

This document explains how passes, bundles, and tokens work together in DIY Accounting Submit.

## Overview

The system uses a three-tier model:

1. **Passes** - Invitation codes (four-word passphrases) that unlock access to bundles
2. **Bundles** - Access tiers that grant tokens and enable HMRC API activities
3. **Tokens** - Consumable credits for metered activities (e.g. submitting a VAT return costs 1 token)

## How It Works

1. An admin generates a pass via GitHub Actions (`generate-pass.yml`) or the pass admin API
2. The pass is a four-word code (e.g. `tiger-happy-mountain-silver`) with a URL and QR code
3. User visits the URL or enters the code on the bundles page
4. The pass is validated (not expired, not exhausted, email matches if restricted)
5. The pass grants the associated bundle to the user
6. The bundle provides tokens for metered activities

## Pass Types

Defined in `submit.passes.toml`. Each pass type is a template with defaults.

| Pass Type | Bundle Granted | Max Uses | Validity | Email Required | Payment |
|-----------|---------------|----------|----------|---------------|---------|
| `test-access` | test | 1 | 7 days | No | Free (admin) |
| `day-trial` | day-guest | 1 | 1 day | No | Free (admin) |
| `invited-guest` | invited-guest | 1 | 1 month | Yes | Free (admin) |
| `resident-guest` | resident-guest | 1 | Unlimited | Yes | Free (admin) |
| `resident-pro-comp` | resident-pro-comp | 1 | 1 year | Yes | Free (admin) |
| `group-invite` | invited-guest | 10 | 1 month | No | Free (admin) |
| `campaign` | invited-guest | 1 | 3 days | No | 10 tokens (user-issued, Phase 6) |
| `digital-pass` | day-guest | 100 | 7 days | No | 10 tokens (user-issued, Phase 6) |
| `physical-pass` | day-guest | 10 | Unlimited | No | 10 tokens (user-issued, Phase 6) |

### When is payment required?

- **Admin-issued passes** (test-access, day-trial, invited-guest, resident-guest, resident-pro-comp, group-invite): **No payment** - created by admins via GitHub Actions workflow
- **User-issued passes** (campaign, digital-pass, physical-pass): **10 tokens** from the issuing user's bundle (Phase 6, not yet implemented)
- **Subscription** (resident-pro): **Planned £9.99/month** via Stripe (not yet implemented)

## Bundles

Defined in `web/public/submit.catalogue.toml`. Each bundle is an access tier.

| Bundle | Level | Tokens | Refresh | Timeout | Allocation | Unlocked By |
|--------|-------|--------|---------|---------|------------|-------------|
| `default` | - | - | - | - | Automatic | All authenticated users |
| `day-guest` | Guest | 3 | None | 1 day | On-Request | day-trial, digital-pass, physical-pass |
| `invited-guest` | Guest | 3 | Monthly | 1 month | On-Email-Match | invited-guest, group-invite, campaign |
| `resident-guest` | Guest | 3 | Monthly | Unlimited | On-Email-Match | resident-guest |
| `resident-pro-comp` | Pro | 100 | Monthly | Unlimited | On-Email-Match | resident-pro-comp |
| `resident-pro` | Pro | 100 | Monthly | - | On-Pass (planned: subscription) | (planned: Stripe subscription) |
| `test` | - | - | - | - | On-Pass | test-access |

### Key bundle concepts

- **Tokens**: Credits consumed by metered activities. Only VAT submission costs tokens (1 per submission). Viewing obligations and returns is free.
- **Token refresh**: Bundles with `tokenRefreshInterval` replenish tokens periodically (lazy evaluation on API call).
- **Timeout**: How long the bundle stays active after allocation. `day-guest` expires after 1 day; `resident-guest` never expires.
- **Capacity cap**: `day-guest` has a global cap (0 in closed beta, 10 in public beta) limiting concurrent allocations across all users.

## Activities

Activities define what users can do and which bundles they need.

| Activity | Token Cost | Bundles Required | Display |
|----------|-----------|-----------------|---------|
| Submit VAT | 1 | day-guest, invited-guest, resident-guest, resident-pro-comp, resident-pro | Always (with upsell) |
| VAT Obligations | 0 (free) | day-guest, invited-guest, resident-guest, resident-pro-comp, resident-pro | Always (with upsell) |
| View VAT Return | 0 (free) | day-guest, invited-guest, resident-guest, resident-pro-comp, resident-pro | Always (with upsell) |
| View Receipts | 0 (free) | default | On-Entitlement |
| Generate Digital Pass | 10 | resident-pro-comp, resident-pro | On-Entitlement |
| Generate Physical Pass | 10 | resident-pro-comp, resident-pro | On-Entitlement |
| Help | 0 (free) | default | Always |

## Generating Passes

### Via GitHub Actions (recommended)

The `generate-pass.yml` workflow creates passes and stores them in DynamoDB.

**Manual dispatch**: Go to Actions > Generate Pass > Run workflow, then select:
- **pass-type**: Which template to use (from the table above)
- **environment**: `ci` (testing) or `prod` (production)
- **email**: Required for email-restricted pass types
- **quantity**: How many passes to generate (default 1)
- **generate-hmrc-user**: Creates an HMRC sandbox test user for end-to-end testing
- **generate-cognito-user**: Creates a Cognito native login user for debugging

**Automatic triggers**:
- Daily at 09:00 UTC: Generates a `test-access` pass for CI
- On push to `submit.passes.toml` or related files: Generates a test pass

**Output**: The workflow produces:
- Pass codes and URLs in the GitHub Actions step summary
- QR code PNGs and annotated SVGs as downloadable artifacts (30-day retention)
- HMRC sandbox credentials (if requested)

### Via API

`POST /api/v1/pass/admin` - Admin endpoint for programmatic pass creation.

## Pass Redemption Flow

1. User receives pass URL: `https://submit.diyaccounting.co.uk/bundles.html?pass=tiger-happy-mountain-silver`
2. If not logged in, redirected to login, then back to pass URL
3. Pass validation checks: not revoked, not expired, uses remaining, email matches
4. Pass `useCount` atomically incremented
5. Bundle granted to user with tokens
6. User redirected to home with success message

### Validation failure reasons

| Code | Meaning |
|------|---------|
| `valid` | Pass redeemed successfully |
| `not_found` | Pass code doesn't exist |
| `revoked` | Pass was revoked by admin |
| `expired` | Pass validity window has passed |
| `exhausted` | All uses consumed (useCount >= maxUses) |
| `wrong_email` | User's email doesn't match restriction |
| `email_required` | Pass requires email but none available |

## Architecture

### Configuration files

| File | Purpose |
|------|---------|
| `submit.passes.toml` | Pass type templates (defaults for generation) |
| `web/public/submit.catalogue.toml` | Bundle and activity definitions (runtime catalogue) |

### Key source files

| File | Purpose |
|------|---------|
| `app/services/passService.js` | Pass creation, validation, redemption |
| `app/services/productCatalog.js` | Parse catalogue TOML, filter bundles/activities |
| `app/services/tokenEnforcement.js` | Token consumption and enforcement |
| `app/functions/account/passPost.js` | POST /api/v1/pass (user pass redemption) |
| `app/functions/account/passAdminPost.js` | POST /api/v1/pass/admin (admin pass creation) |
| `app/functions/account/bundlePost.js` | POST /api/v1/bundle (grant bundle) |
| `app/functions/account/bundleGet.js` | GET /api/v1/bundle (list user bundles with capacity) |
| `app/data/dynamoDbPassRepository.js` | Pass CRUD with atomic useCount increment |
| `app/data/dynamoDbBundleRepository.js` | Bundle CRUD and token tracking |
| `app/lib/passphrase.js` | Four-word passphrase generation |
| `app/lib/emailHash.js` | Deterministic HMAC-SHA256 email hashing |
| `app/lib/qrCodeGenerator.js` | QR code generation (PNG, SVG, annotated) |
| `scripts/generate-pass-with-qr.js` | CLI script for pass generation with QR codes |

### DynamoDB tables

| Table | Purpose |
|-------|---------|
| `{env}-env-passes` | Pass records (four-word code, bundleId, maxUses, useCount, validity) |
| `{env}-env-bundles` | User bundle allocations and token tracking |

### Workflow

| Workflow | Purpose |
|----------|---------|
| `.github/workflows/generate-pass.yml` | Generate passes via GitHub Actions |

## Current Status (Closed Beta)

- `day-guest` requires a pass (`enable = "on-pass"`) with capacity cap = 0
- `resident-pro` requires a pass (planned: Stripe subscription)
- All pass generation is admin-only via GitHub Actions
- User-issued passes (campaign, digital, physical) are defined but Phase 6 is deferred

### To reach Public Beta

1. Set `day-guest` `enable = "always"` and `cap = 10`
2. Remove `listedInEnvironments` restrictions
3. Requires production HMRC credentials validated by a trial user

### To reach Launch

1. Implement `resident-pro` subscription via Stripe (`allocation = "on-subscription"`)
2. Enable user-issued passes (campaign, digital, physical) - Phase 6
