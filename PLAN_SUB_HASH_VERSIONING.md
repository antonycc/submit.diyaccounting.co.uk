# Plan: Sub Hash Versioning and Salt Lifecycle

**Created**: 15 February 2026
**Status**: Discussion / Assessment
**Branch**: `sub-hash-versioning`

---

## User Assertions (verbatim)

> Introducing versioning to the user sub hash. Discuss scenarios such as: Rotating the salt under a BAU scenario. Restoring data from a backup and applying an exported salt as the secret to make the data usable. Recovering from a scenario where the salt was lost (e.g. restoring a backup without an exported salt). Rotating the salt after it has been disclosed. Also wonder about having the salt material as the 4-words concept we use for passes — the idea is that it's easier to print and store in physical form then re-key.

> Right now we have a few signed up users that I backed up the emails for but nobody has been given access to any features or signed up for packages. Cognito is disposable at this point, customers would sign in with Google just the same. Could we also iterate through all tables and add the explicit version v1 to the table items? Also generally what should we do where a backup store is worthless without the hash salt, but then storing the salt elsewhere creates two places to lose it.

> No raw-string fallback in subHasher.js — apply a data migration to convert the Secrets Manager format. Suggest a CDK-variant of EF migrations for managing data migrations on deploy. Option B (migrate) for Step 4. KMS key in submit-prod for now, update AWS docs to note it must move to submit-backup later. CI and prod use different salts. Add saltVersion to async request tables alongside anything salted. No annual rotation schedule — comprehensive runbook scenarios instead.

---

## 1. Current State Assessment

### Pre-launch window

We are **before launch**. The current data is entirely test activity:

| Environment | Users (Cognito) | Bundles | Receipts | HMRC Requests | Passes |
|-------------|-----------------|---------|----------|---------------|--------|
| **prod** | 5 (3 Google, 2 test) | 778 | 911 | 15,616 | 831 |
| **ci** | transient test users | 885 | 864 | — | — |

No user has active subscriptions or production HMRC submissions. All data is disposable. Cognito profiles are disposable — Google-federated users re-create automatically on next sign-in.

**This is the ideal moment to introduce versioning**, change salt format, and backfill existing data — before any of it matters.

### How it works today

```
Cognito sub (e.g. "f6e2d2f4-60e1-7021-a866-6244e2ac173a")
    │
    ▼
HMAC-SHA256(salt, sub) → 64-char hex hash
    │
    ▼
DynamoDB partition key: hashedSub
```

- **Salt**: 32 bytes cryptographic random, base64-encoded (~44 chars)
- **Storage**: AWS Secrets Manager at `{env}/submit/user-sub-hash-salt` — raw string (no JSON wrapper)
- **Versioning**: None — no version field on any DynamoDB item
- **14 Lambda handlers** call `initializeSalt()` on cold start
- **4 data repositories** call `hashSub(userId)` to build DynamoDB keys

### All 8 DynamoDB tables using hashedSub

| Table | Sort Key | TTL | PITR | Notes |
|-------|----------|-----|------|-------|
| bundles | `bundleId` | 1 month post-expiry | Yes | User subscriptions |
| receipts | `receiptId` | — | Yes | 7-year HMRC retention |
| hmrc-api-requests | `id` | 90 days | Yes | HMRC interaction audit trail |
| bundle-post-async-requests | `requestId` | 1 hour | No | Transient |
| bundle-delete-async-requests | `requestId` | 1 hour | No | Transient |
| hmrc-vat-return-post-async-requests | `requestId` | 1 hour | No | Transient |
| hmrc-vat-return-get-async-requests | `requestId` | 1 hour | No | Transient |
| hmrc-vat-obligation-get-async-requests | `requestId` | 1 hour | No | Transient |

All 8 tables will receive `saltVersion` — consistency matters more than the low value on transient tables.

### Cognito username vs sub

Cognito Username is **NOT** the unhashed sub for Google-federated users:

| User Type | Username | Sub |
|-----------|----------|-----|
| Google federated | `Google_109498926136624044663` | `c6f222d4-40a1-70bf-...` |
| Native (test) | `f6e2d2f4-60e1-7021-...` | `f6e2d2f4-60e1-7021-...` (same) |

The `sub` attribute is always available via `aws cognito-idp list-users`, regardless of provider.

### Existing precedent: emailHash.js already has versioning

The `emailHash.js` module stores `emailHashSecretVersion` alongside each email hash on pass records:

```javascript
// emailHash.js returns { hash, secretVersion }
// Pass record stores: { restrictedToEmailHash: "...", emailHashSecretVersion: "v1" }
```

This is the pattern to follow for sub hashing.

---

## 2. Proposed Change: Add Salt Version to Hashed Records

### Schema change (DynamoDB items)

Before:
```json
{ "hashedSub": "a1b2c3...", "bundleId": "day-guest", ... }
```

After:
```json
{ "hashedSub": "a1b2c3...", "saltVersion": "v1", "bundleId": "day-guest", ... }
```

### Salt version format

Simple counter — `v1`, `v2`, `v3`. Stored alongside the salt in Secrets Manager as JSON:

```json
{ "salt": "base64-encoded-salt-value", "version": "v1" }
```

**No raw-string fallback.** The Secrets Manager value must be valid JSON. The migration from raw string to JSON format is a one-time operation per environment (see Section 6, Migration 001).

### Code changes

1. **`subHasher.js`** — Parse JSON salt format `{ salt, version }`, expose `getSaltVersion()`. Throw if the secret is not valid JSON.
2. **4 data repositories** — Add `saltVersion: getSaltVersion()` to every PutItem/UpdateItem.
3. **1 async request repository** — Add `saltVersion` to `putAsyncRequest()`.
4. **Secrets Manager format** — Migrate from raw string to JSON via migration script.
5. **`manage-secrets.yml`** — Update backup/restore to handle JSON format, update length validation.
6. **Unit tests** — JSON parsing, version exposure, rejection of non-JSON format.

### Impact

| Component | Change | Risk |
|-----------|--------|------|
| `subHasher.js` | JSON parsing + version tracking | Low — strict, no fallback |
| 4 data repositories | Add `saltVersion` field to writes | Low — additive |
| 1 async request repository | Add `saltVersion` field to writes | Low — additive |
| 14 Lambda handlers | None | None |
| DynamoDB tables (8) | Backfill `saltVersion` on existing items | Low — additive |
| Secrets Manager secret | Format change (raw → JSON) | **Migration required** |
| Backup/restore workflows | Updated JSON validation | Low |

---

## 3. Data Migration Framework

### Design: CDK-variant of EF Migrations

EF Migrations track schema changes with numbered scripts and a database tracking table. Our equivalent for DynamoDB:

```
scripts/migrations/
├── runner.js                            # Migration runner
├── 001-convert-salt-to-json.js          # Secrets Manager format migration
├── 002-backfill-salt-version-v1.js      # Add saltVersion to all existing items
└── 003-rotate-salt-to-passphrase.js     # Migrate from v1 random salt to v2 passphrase
```

**Tracking**: A special partition key `system#migrations` in the bundles table:

```json
{ "hashedSub": "system#migrations", "bundleId": "001-convert-salt-to-json", "appliedAt": "2026-02-16T10:30:00Z", "environment": "ci" }
{ "hashedSub": "system#migrations", "bundleId": "002-backfill-salt-version-v1", "appliedAt": "2026-02-16T10:30:05Z", "environment": "ci" }
```

### Migration runner (`scripts/migrations/runner.js`)

```
1. Read all migration files from scripts/migrations/ (sorted by number prefix)
2. Query bundles table for pk=system#migrations to get applied set
3. For each unapplied migration (in order):
   a. Run the migration's up() function
   b. Write tracking record to bundles table
   c. Log completion
4. Report summary: X applied, Y already done, Z total
```

### Integration with deployment

**GitHub Actions step** — after CDK deploy, before behaviour tests:

```yaml
# In deploy.yml, after CDK deploy step:
- name: Run data migrations
  run: node scripts/migrations/runner.js
  env:
    ENVIRONMENT_NAME: ${{ env.ENV_NAME }}
    AWS_REGION: eu-west-2
```

**Local execution** — for dev/testing:

```bash
# After assuming role
. ./scripts/aws-assume-submit-deployment-role.sh
ENVIRONMENT_NAME=ci node scripts/migrations/runner.js
```

### Why this approach over CDK Custom Resources

| Approach | Pros | Cons |
|----------|------|------|
| **GitHub Actions step** | Visible in logs, testable locally, runs with deployment role, no Lambda packaging needed | Separate from CDK lifecycle |
| CDK Custom Resource Lambda | Tightly coupled to deploy | Must package as Lambda, harder to test, harder to debug, opaque in CloudFormation |
| CDK AwsCustomResource | Simple for single API calls | Can't orchestrate multi-step logic |

GitHub Actions step is the right fit: migrations need access to multiple tables and Secrets Manager, involve multi-step logic, and benefit from being visible and debuggable. CDK Custom Resources are better suited for single AWS API calls (like the Route53 upsert pattern already in the codebase).

### Idempotency

Every migration's `up()` function must be idempotent — safe to re-run if a previous run was interrupted. The tracking record is written AFTER success, so a crash mid-migration means it will be re-attempted on next deploy.

---

## 4. The Backup/Salt Coupling Problem

### The dilemma

A DynamoDB backup without the corresponding salt is a locked box without a key. But storing the salt alongside the backup means a single breach exposes both.

```
 DynamoDB backup alone  →  worthless (can't compute partition keys)
 Salt alone             →  worthless (no data to de-anonymise)
 Both together          →  attacker wins (can link users to data)
```

This is fundamentally the **key escrow problem**: you need redundancy to prevent loss, but each copy is an attack surface.

### Proposed solution: Three independent recovery paths

The goal is that **any ONE surviving path** can recover the salt, while an attacker must compromise **all paths** to gain the salt:

```
┌─────────────────────────────────────────────────────────┐
│                    RECOVERY PATHS                        │
│                                                         │
│  Path 1: AWS Secrets Manager (runtime, automated)       │
│    └─ Live secret, available to Lambdas                 │
│    └─ Soft-delete has 7-30 day recovery window          │
│                                                         │
│  Path 2: Physical passphrase (disaster recovery)        │
│    └─ 8-word passphrase printed on card                 │
│    └─ Stored in fire safe / bank deposit box            │
│    └─ Independent of any digital system                 │
│    └─ Can be read aloud, typed manually to restore      │
│                                                         │
│  Path 3: Encrypted in DynamoDB itself (self-contained)  │
│    └─ Special item: pk="system#config", sk="salt"       │
│    └─ Salt encrypted with KMS (CMK in submit-prod*)     │
│    └─ Every DynamoDB backup automatically includes it   │
│    └─ Useless without KMS key access                    │
│                                                         │
│  Bonus: Password manager (digital backup)               │
│    └─ 1Password / equivalent                            │
│    └─ Redundant with Path 2 but more convenient         │
│                                                         │
│  * KMS key starts in submit-prod. Must move to          │
│    submit-backup during account separation (see          │
│    PLAN_AWS_ACCOUNTS.md / AWS_ARCHITECTURE.md).          │
└─────────────────────────────────────────────────────────┘
```

**Path 3 is the key insight**: By storing the salt (KMS-encrypted) inside the DynamoDB tables themselves, every backup is self-contained. Initially the KMS key is in submit-prod (simpler, no cross-account setup needed). When the account separation happens (PLAN_PRODUCTION_AND_SEPARATION.md Phase 2), the KMS key moves to submit-backup for proper isolation.

**Path 2 is the fallback of last resort**: If AWS, Secrets Manager, DynamoDB, and KMS are all lost, the physical passphrase card still works. This is why the human-friendly format matters.

### Recovery matrix

| Scenario | Path 1 (Secrets Mgr) | Path 2 (Physical) | Path 3 (KMS in DynamoDB) | Outcome |
|----------|----------------------|--------------------|--------------------------|---------|
| Normal operation | Available | Not needed | Not needed | Works |
| Secret accidentally deleted (within 30d) | Restore soft-delete | Not needed | Not needed | Works |
| Secret deleted (past 30d) | Gone | Type passphrase | Or decrypt from backup | Works |
| AWS account compromised | Rotate | Type passphrase for new env | Encrypted copy safe (after KMS moves to backup account) | Works |
| DynamoDB backup restored to new env | Create from passphrase | Available | Decrypt from restored data | Works |
| All digital systems lost | Gone | **Available** | Gone | Works (passphrase) |
| Attacker has DynamoDB dump only | N/A | N/A | Encrypted, needs KMS | Data still anonymised |
| Attacker has DynamoDB + KMS | N/A | N/A | N/A | Salt exposed — rotate |

---

## 5. Operational Scenarios

### Scenario A: BAU Salt Rotation (Planned, No Compromise)

**When**: Moving to a new salt format, responding to a policy review, or proactive rotation after infrastructure changes. No fixed annual schedule — rotation is event-driven with thorough runbook procedures.

**Pre-launch shortcut** (available now): Since all data is disposable, the simplest rotation is:

1. Generate new salt (8-word passphrase), assign version `v2`
2. Store in Secrets Manager as JSON `{ "salt": "word-word-...", "version": "v2" }`
3. Deploy updated code
4. Run migration 003 (re-keys all items from v1→v2)
5. Verify, then clean up old salt

**Post-launch procedure** (once real data exists):

1. Generate new salt, store in Secrets Manager as a second secret (e.g., `{env}/submit/user-sub-hash-salt-v2`)
2. Deploy code with dual-salt support (reads both versions, writes with new version)
3. Run re-key migration via the migration framework:
   ```
   For each user in Cognito (list-users API):
     oldHash = HMAC-SHA256(v1_salt, user.sub)
     newHash = HMAC-SHA256(v2_salt, user.sub)
     For each table:
       items = query(pk = oldHash)
       For each item:
         write item with pk = newHash, saltVersion = "v2"
         delete item with pk = oldHash
   ```
4. Verify representative users can access data
5. Remove old salt secret, remove dual-salt code
6. Update physical backup card — print new passphrase, destroy old one
7. Update Path 3 KMS-encrypted item in DynamoDB

**Duration**: With ~5 users and ~18,000 items, seconds. At scale (~10,000 users), minutes.

**Rollback**: Old salt stays in Secrets Manager until verification complete. Dual-salt code reads both.

### Scenario B: Restore Data from Backup with Exported Salt

**When**: DynamoDB table restored from AWS Backup or PITR. Salt is available (Secrets Manager still intact, or restored from physical backup).

**Procedure**:

1. Restore DynamoDB table(s) from backup
2. Check `saltVersion` on restored items matches the available salt's version
3. If versions match: done — data is usable
4. If versions don't match: retrieve the salt that matches the data's `saltVersion`:
   - Check Path 3 (KMS-encrypted salt item in the restored backup itself)
   - Check physical backup / password manager for the correct version
   - Restore that salt to Secrets Manager
5. Run `node scripts/migrations/runner.js` to apply any pending migrations to the restored data

**Why versioning helps**: Without `saltVersion` on items, you can't tell which salt era the data belongs to. With it, the data self-describes which salt it needs.

### Scenario C: Salt Lost — Recovery and Re-Key

**When**: Secrets Manager secret gone, and you need to recover.

**Pre-launch** (now): Not a problem. Generate new salt, start fresh. No real data to lose.

**Post-launch recovery sequence** (try each path in order):

1. **Path 1**: Check Secrets Manager soft-delete recovery (7-30 day window)
2. **Path 3**: Decrypt the KMS-encrypted salt item from the DynamoDB table itself
3. **Path 2**: Type the physical passphrase from the printed card
4. **Bonus**: Check password manager

If **any one** of these succeeds, restore the salt to Secrets Manager and you're back to normal.

**If ALL paths fail — total salt loss**:

This is the worst case. Without the salt, the HMAC is irreversible by design:

```
Cognito sub ──HMAC(salt, sub)──► hashedSub
                   ▲
              salt is gone
              can't reverse
```

**Why Cognito can't help**: Even though Cognito has every user's `sub`, and DynamoDB has every `hashedSub`, you cannot reconnect them without the salt. The hash is one-way — `HMAC-SHA256(unknown_salt, known_sub) = known_hash` cannot be solved for `unknown_salt` when the salt has ~82 bits of entropy (8-word passphrase). This is the security property working as intended: if an attacker can't reverse it, neither can we.

**Recovery options in total salt loss**:

| Option | Viable? | Notes |
|--------|---------|-------|
| Brute-force the salt from a known sub+hash pair | No (8 words = ~82 bits) | Would take ~20 million years at 10B HMAC/s |
| Match users to data via content clues | Partial | Some items may contain identifiable data (e.g., UTR numbers in HMRC requests) that could be manually matched |
| Accept data loss and start fresh | Yes | Generate new salt, existing hashedSub items become unreachable orphans (TTLs will clean them up over time) |

**This scenario is why three independent recovery paths exist** — the probability of losing all three simultaneously (Secrets Manager + physical card + KMS-encrypted DynamoDB item + password manager) is vanishingly small.

### Scenario D: Salt Disclosed — Emergency Rotation

**When**: Salt value exposed (leaked in logs, committed to git, shared insecurely).

**Threat assessment**:
- Salt alone doesn't grant API access — attacker also needs DynamoDB access (requires separate IAM compromise)
- Real risk: if attacker has BOTH salt AND DynamoDB data, they can de-anonymise users
- Severity: **Medium** (requires compound breach), not **Critical** (no direct data access)

**Pre-launch** (now): Generate new salt, clear tables, done in minutes.

**Post-launch response**:

1. **Assess scope** — Was it public? For how long? Who saw it?
2. **Revoke access** — If the leak vector is still active (e.g., public git commit), remove it immediately
3. **Do NOT immediately rotate** — Rotating breaks all lookups until migration completes
4. **Prepare** — Generate new salt (v_next), store securely but don't activate yet
5. **Deploy dual-salt code** — Reads both old and new versions
6. **Run re-key migration** — Same as Scenario A post-launch procedure
7. **Verify and cut over** — Remove old salt
8. **Update physical backup** — Print new passphrase card, destroy old one
9. **Update Path 3** — Re-encrypt new salt and store in DynamoDB
10. **Incident report** — Document timeline, scope, and remediation

**Timeline**: Days, not hours. The compound-breach requirement gives breathing room.

### Scenario E: Environment Rebuild (New AWS Account)

**When**: Standing up a fresh environment from scratch (e.g., creating the separate submit-ci account from PLAN_PRODUCTION_AND_SEPARATION.md).

**Procedure**:

1. Deploy CDK stacks (creates empty DynamoDB tables)
2. Generate a new 8-word passphrase salt for this environment
3. Store in Secrets Manager as JSON `{ "salt": "...", "version": "v1" }`
4. Print physical backup card, store in password manager
5. Store KMS-encrypted copy in DynamoDB (Path 3)
6. Run `node scripts/migrations/runner.js` — only the format/schema migrations apply (no data to backfill)
7. CI and prod environments use **independent salts** — a compromise of one doesn't affect the other

### Scenario F: Cognito User Pool Replacement

**When**: Cognito user pool is destroyed or replaced (e.g., during account migration).

**Impact**: Google-federated users get **new** `sub` UUIDs when they sign in to a new user pool. Their old hashedSub values become orphaned.

**Procedure**:

1. Before destroying the old pool: export the `sub` → `hashedSub` mapping for all users (using Cognito `list-users` + the current salt)
2. After users sign in to the new pool: they get new subs
3. Run a re-key migration using the exported mapping to move data from old hashedSub to new hashedSub
4. Or, if pre-launch: accept data loss, users start fresh

### Scenario G: Migrating Salt and Data to a New AWS Account

**When**: Moving production from submit-prod (887764105431) to a new account as part of account separation (PLAN_PRODUCTION_AND_SEPARATION.md Phase 2), or merging/splitting environments.

**What must move together**:

| Component | Source | Destination | Method |
|-----------|--------|-------------|--------|
| DynamoDB tables (8) | submit-prod | New account | AWS Backup cross-account restore, or DynamoDB export/import to S3 |
| Salt secret | Secrets Manager | New Secrets Manager | Physical passphrase (Path 2) — recreate from card, don't copy programmatically |
| KMS key for Path 3 | submit-prod | submit-backup (or new account) | Create new KMS key in destination, re-encrypt the salt item |
| Cognito user pool | submit-prod | New account | See Scenario F — federated users get new subs |
| Migration tracking | `system#migrations` items | Comes with DynamoDB restore | Automatic |

**Procedure**:

1. **Export data**: Use DynamoDB export-to-S3 (full table export, no impact on live traffic) or AWS Backup cross-account copy
2. **Stand up new account**: Deploy CDK stacks (creates empty tables)
3. **Restore data**: Import DynamoDB data into new account's tables
4. **Recreate salt**: Type the 8-word passphrase from the physical backup card into the new account's Secrets Manager as JSON `{ "salt": "...", "version": "v2" }`. Do NOT copy the secret programmatically between accounts — the physical card is the transfer medium, ensuring the old account can be fully decommissioned.
5. **Re-encrypt Path 3**: Create a new KMS key in the destination account, decrypt the salt item using the old KMS key (requires temporary cross-account access), re-encrypt with the new key, write back
6. **Handle Cognito**: If the user pool is recreated (new account = new pool), follow Scenario F to re-key hashedSub values for users who get new subs
7. **Run migrations**: `node scripts/migrations/runner.js` — tracking items came with the data, so only genuinely new migrations will run
8. **Verify**: Confirm representative users can sign in and access their data
9. **Decommission old account**: Only after verification period. Revoke old account's access to the KMS key.

**Key principle**: The physical passphrase card is the bridge between accounts. It's the one artefact that exists outside AWS entirely, making it the natural transfer medium when moving between accounts.

**Duration**: Hours (mostly waiting for DynamoDB export/import). The actual salt recreation takes minutes.

### Scenario H: Creating a Prod-Seeded Test Environment

**When**: Need a test/staging environment with realistic data volumes and patterns, seeded from production, but fully isolated — no writes back to prod backups, no shared secrets.

**Why not just use the prod salt?** If the test environment shares the prod salt, a breach of the test environment (which has weaker access controls) exposes the prod salt. The test environment must use its **own independent salt**, with all data re-keyed during seeding.

**Procedure**:

1. **Export prod data**: DynamoDB export-to-S3 (or backup restore to a staging table set)
2. **Generate a test-environment salt**: New 8-word passphrase, stored in the test account's Secrets Manager
3. **Re-key all items**: Using both the prod salt (for reading) and the test salt (for writing):
   ```
   For each user in prod Cognito (list-users API):
     prodHash = HMAC-SHA256(prod_salt, user.sub)
     testHash = HMAC-SHA256(test_salt, user.sub)
     For each table:
       items = query(pk = prodHash)
       For each item:
         write item with pk = testHash, saltVersion = "v1" (test env's own v1)
   ```
4. **Isolate backups**: The test environment's AWS Backup vault must be **separate** from prod's vault. Configure the test account's backup plan to write to its own vault only — never to the prod or cross-account backup vault.
5. **Isolate Cognito**: The test environment should use its own Cognito user pool. If sharing the prod pool (read-only), ensure no test operations can modify prod user records.
6. **Scrub the prod salt**: After seeding, the prod salt must not remain in the test environment. The re-keying script should load it transiently (from the physical card or a temporary secret) and discard it after use.
7. **Mark as test**: Add a `system#config` item: `{ "hashedSub": "system#config", "bundleId": "environment-type", "type": "test-replica", "seededFrom": "prod", "seededAt": "2026-..." }`

**Ongoing isolation**:

| Concern | Mitigation |
|---------|------------|
| Test backups overwriting prod | Separate backup vault, no cross-account copy to prod vault |
| Test salt leaking to prod | Independent salt, prod salt used transiently during seed only |
| Test data drifting from prod | Re-seed periodically by repeating this procedure |
| HMRC API calls from test | Test environment uses HMRC sandbox credentials, not production |

### Scenario I: Creating an Anonymised Prod Replica (PII-Scrubbed)

**When**: Need a dataset with production-like volume and structure for load testing, debugging, or development — but with **all PII removed** and all user linkage destroyed. No real user should be identifiable from this data.

**Difference from Scenario H**: Scenario H preserves user identity (same users, different hashes). Scenario I **destroys** user identity — every user becomes a synthetic placeholder, and no mapping back to real users exists.

**What counts as PII in our tables**:

| Table | PII Fields | Treatment |
|-------|-----------|-----------|
| bundles | `hashedSub` (pseudonymous) | Replace with synthetic hash |
| bundles | `qualifiers.*` (may contain email) | Scrub or replace with synthetic |
| receipts | `hashedSub` | Replace with synthetic hash |
| receipts | HMRC response data (UTR, VRN) | Replace with synthetic values |
| hmrc-api-requests | `hashedSub` | Replace with synthetic hash |
| hmrc-api-requests | Request/response bodies | Replace HMRC identifiers with synthetic |
| async-requests (5) | `hashedSub` | Replace with synthetic hash |
| passes | `restrictedToEmailHash` | Replace with synthetic hash |
| passes | `createdBy` (email) | Replace with synthetic email |

**Procedure**:

1. **Export prod data**: DynamoDB export-to-S3
2. **Generate synthetic users**: Create N synthetic Cognito sub UUIDs (matching the number of distinct `hashedSub` values in the export). No real Cognito users are involved.
3. **Generate an anonymised-env salt**: New 8-word passphrase, used only for this replica
4. **Build the hashedSub mapping**:
   ```
   For each distinct hashedSub in the exported data:
     syntheticSub = generate random UUID
     newHash = HMAC-SHA256(anon_salt, syntheticSub)
     mapping[oldHash] = newHash
   ```
   This mapping is **one-way and random** — you cannot get from `newHash` back to the original user, even with both salts, because the synthetic sub has no relationship to the real sub.
5. **Transform all items**:
   ```
   For each item in each table:
     Replace hashedSub with mapping[item.hashedSub]
     Replace saltVersion with "v1" (anon env's own version)
     Scrub PII fields:
       - UTR/VRN numbers → synthetic (e.g., "1234567890")
       - Email addresses → synthetic (e.g., "user-001@anon.test")
       - Email hashes → re-hash synthetic emails
       - HMRC request/response bodies → redact or replace identifiers
   ```
6. **Import into anonymised environment**: Write transformed items to the anonymised environment's DynamoDB tables
7. **Verify structural equivalence**: Confirm item counts per table match, sort key distributions are preserved, token counts and bundle structures are intact
8. **Destroy intermediate artefacts**: Delete the export files, the oldHash→newHash mapping, and any temporary access to prod data

**What is preserved** (useful for load testing / debugging):

- Item counts per user (same number of bundles, receipts, HMRC requests per synthetic user)
- Sort key patterns (same bundleIds, same receipt structures)
- Timestamps and TTL values
- Token consumption patterns
- Table size and query patterns

**What is destroyed** (PII protection):

- Any link between DynamoDB items and real Cognito users
- Real HMRC identifiers (UTR, VRN, tax data)
- Real email addresses and email hashes
- The ability to re-identify users even if both the prod and anon salts are compromised (because synthetic subs are random, not derived from real subs)

**Key property**: Unlike a salt rotation (where `newHash = HMAC(new_salt, same_sub)`), anonymisation uses `newHash = HMAC(anon_salt, random_sub)`. This means even someone with access to both salts AND both datasets cannot correlate records between them.

---

## 6. Eight-Word Passphrase as Salt

### Entropy analysis (1260-word list)

| Words | Entropy (bits) | Brute Force at 10B HMAC/s | Physical Format |
|-------|---------------|--------------------------|-----------------|
| 4 | ~41 bits | **4 minutes** | Fits on a stamp |
| 6 | ~62 bits | **15 years** | Fits on a business card |
| 8 | ~82 bits | **20 million years** | Fits on a business card |
| 32 bytes random | 256 bits | Heat death of universe | 44-char base64 blob |

### When would brute-force matter?

Only if an attacker has:
1. A dump of DynamoDB data (hashedSub values), AND
2. At least one known Cognito sub → hashedSub mapping

Then they can test candidate salts: `does HMAC(candidate, known_sub) == known_hash?`

With 4 words: they recover the salt in minutes and de-anonymise all users.
With 8 words: computationally infeasible for decades.

### Decision

**Use 8 words.** The format `tiger-happy-castle-river-noble-frost-plume-brave`:
- ~82 bits of entropy (brute-force resistant for decades)
- Easy to print on a card, read aloud, dictate over phone
- Easy to type manually into the `restore-salt` workflow
- No KDF needed — the passphrase is the HMAC key directly
- Clearly distinct from the 4-word pass invitation codes (different length = different purpose)

**Do NOT use 4 words** — the operational convenience doesn't justify the entropy reduction. An 8-word passphrase is still very human-friendly, and the security difference is catastrophic (4 minutes vs 20 million years).

---

## 7. Pre-Launch Action Plan

Since we're before launch, we can do everything cleanly. The migration framework (Section 3) manages all data changes.

### Step 1: Build the migration framework

Create `scripts/migrations/runner.js` and the tracking mechanism (`system#migrations` items in bundles table).

### Step 2: Code changes (version tracking)

1. **`subHasher.js`** — Parse JSON salt format `{ salt, version }`, expose `getSaltVersion()`. **No raw-string fallback** — throw if the secret is not valid JSON. The secret format migration (Migration 001) must run first.
2. **4 data repositories** — Add `saltVersion: getSaltVersion()` to every PutItem call:
   - `dynamoDbBundleRepository.js` — `putBundle()`, `putBundleByHashedSub()`
   - `dynamoDbReceiptRepository.js` — `putReceipt()`
   - `dynamoDbHmrcApiRequestRepository.js` — `putHmrcApiRequest()`
   - `dynamoDbAsyncRequestRepository.js` — `putAsyncRequest()`
3. **`manage-secrets.yml`** — Update backup/restore to handle JSON format. Update length validation (8-word passphrase is longer than 44-char base64).
4. **Unit tests** — JSON parsing, version exposure, rejection of non-JSON format.

### Step 3: Migration 001 — Convert salt to JSON format

```javascript
// scripts/migrations/001-convert-salt-to-json.js
// Reads current raw-string salt from Secrets Manager
// Wraps it as { "salt": "<raw-value>", "version": "v1" }
// Writes back to Secrets Manager
// Idempotent: if already JSON, no-op
```

Run per environment (ci, prod). After this migration, the new `subHasher.js` code can deploy.

### Step 4: Migration 002 — Backfill saltVersion on all items

```javascript
// scripts/migrations/002-backfill-salt-version-v1.js
// For each of the 8 tables with hashedSub:
//   Scan all items
//   For each item without saltVersion:
//     UpdateItem SET saltVersion = "v1"
```

With ~800–15,000 items per table, this takes seconds.

### Step 5: Generate 8-word passphrase salt

1. Generate passphrase using `generatePassphrase(8)` from `app/lib/passphrase.js`
2. Print it on a card, store in fire safe
3. Store in password manager
4. Both ci and prod get their own independent 8-word passphrases

### Step 6: Migration 003 — Rotate salt from v1 to v2 (passphrase)

Using **Option B (migrate)** as a dry run — proves the migration tooling works while stakes are zero:

```javascript
// scripts/migrations/003-rotate-salt-to-passphrase.js
// 1. Read v1 salt and v2 salt from Secrets Manager
// 2. Enumerate all users from Cognito (list-users API)
// 3. For each user:
//    oldHash = HMAC-SHA256(v1_salt, user.sub)
//    newHash = HMAC-SHA256(v2_salt, user.sub)
//    For each table:
//      items = query(pk = oldHash)
//      For each item:
//        write item with pk = newHash, saltVersion = "v2"
//        delete item with pk = oldHash
// 4. Update Secrets Manager to v2 salt as the active salt
// 5. Remove v1 salt
```

### Step 7: Add encrypted salt item to DynamoDB (Path 3)

Store KMS-encrypted salt as a special item in the bundles table:
```json
{ "hashedSub": "system#config", "bundleId": "salt-v2", "encryptedSalt": "<KMS ciphertext>", "kmsKeyArn": "arn:..." }
```

The KMS key is created in **submit-prod** for now. When account separation happens (PLAN_PRODUCTION_AND_SEPARATION.md Phase 2), the key moves to submit-backup.

Every future DynamoDB backup automatically includes this item.

### Step 8: Update documentation

1. **RUNBOOK_INFORMATION_SECURITY.md** — Rewrite Section 4 with:
   - Versioned salt schema
   - Three recovery paths
   - All nine operational scenarios (A–I) as runbook procedures
   - Physical backup format and verification procedure
   - Recovery matrix
2. **AWS_ARCHITECTURE.md** — Add note about KMS key for salt encryption (Section 3.4 Data Layer), note that it must move to submit-backup during account separation
3. **PLAN_AWS_ACCOUNTS.md** — Add KMS key migration to the account separation checklist

---

## 8. Deployment Order

The migration framework means deployment order matters:

```
1. Deploy migration framework code (runner.js, migration scripts)
2. Run Migration 001 (convert salt to JSON) — must happen BEFORE new subHasher.js deploys
3. Deploy new subHasher.js + repository code (requires JSON salt format)
4. Run Migration 002 (backfill saltVersion on existing items)
5. Generate v2 passphrase salt, store in Secrets Manager
6. Run Migration 003 (re-key from v1 → v2)
7. Store KMS-encrypted salt in DynamoDB (Path 3)
8. Update documentation
```

In the GitHub Actions workflow, this translates to:

```yaml
# Phase 1: Pre-deploy migrations (run before CDK deploy)
- name: Run pre-deploy migrations
  run: node scripts/migrations/runner.js --phase pre-deploy

# Phase 2: CDK deploy (deploys new Lambda code)
- name: Deploy CDK stacks
  run: ...

# Phase 3: Post-deploy migrations (run after CDK deploy)
- name: Run post-deploy migrations
  run: node scripts/migrations/runner.js --phase post-deploy
```

Migration 001 is `pre-deploy` (must run before new code). Migrations 002+ are `post-deploy`.

---

## 9. Files to Change

| File | Change |
|------|--------|
| `scripts/migrations/runner.js` | **New** — Migration framework runner |
| `scripts/migrations/001-convert-salt-to-json.js` | **New** — Secrets Manager format migration |
| `scripts/migrations/002-backfill-salt-version-v1.js` | **New** — Backfill saltVersion on all items |
| `scripts/migrations/003-rotate-salt-to-passphrase.js` | **New** — Re-key from v1 random salt to v2 passphrase |
| `app/services/subHasher.js` | Parse JSON format, expose `getSaltVersion()`, no raw-string fallback |
| `app/data/dynamoDbBundleRepository.js` | Add `saltVersion` to `putBundle()`, `putBundleByHashedSub()` |
| `app/data/dynamoDbReceiptRepository.js` | Add `saltVersion` to `putReceipt()` |
| `app/data/dynamoDbHmrcApiRequestRepository.js` | Add `saltVersion` to `putHmrcApiRequest()` |
| `app/data/dynamoDbAsyncRequestRepository.js` | Add `saltVersion` to `putAsyncRequest()` |
| `.github/workflows/manage-secrets.yml` | Update backup/restore for JSON format |
| `.github/workflows/deploy.yml` | Add migration runner steps (pre-deploy, post-deploy) |
| `app/unit-tests/services/subHasher.test.js` | JSON parsing tests, version exposure, non-JSON rejection |
| `RUNBOOK_INFORMATION_SECURITY.md` | Rewrite Section 4 with scenarios A–I |
| `AWS_ARCHITECTURE.md` | Add KMS key note, account separation reminder |
| `PLAN_AWS_ACCOUNTS.md` | Add KMS key migration to checklist |
