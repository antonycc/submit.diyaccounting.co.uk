# Information Security Runbook

**Document Version**: 2.0
**Last Updated**: 2026-01-24
**Administrator**: admin@diyaccounting.co.uk

This document consolidates all security, privacy, and data protection procedures for operating DIY Accounting Submit.

---

## Table of Contents

1. [Data Inventory](#1-data-inventory)
2. [Secrets Management](#2-secrets-management)
3. [Secret Rotation Procedures](#3-secret-rotation-procedures)
4. [User Sub Hashing (Salt)](#4-user-sub-hashing-salt)
5. [Data Subject Rights](#5-data-subject-rights)
6. [Security Incident Response](#6-security-incident-response)
7. [Security Monitoring](#7-security-monitoring)
8. [Data Retention](#8-data-retention)
9. [Regulatory Compliance](#9-regulatory-compliance)
10. [Public Repository Security](#10-public-repository-security)
11. [Improvement Recommendations](#11-improvement-recommendations)

---

## 1. Data Inventory

### 1.1 Data Storage Locations

| Storage | Data Types | Encryption | Retention |
|---------|------------|------------|-----------|
| **DynamoDB** `{env}-submit-bundles` | User entitlements, bundle IDs | At rest (AWS managed) | Until account deletion |
| **DynamoDB** `{env}-submit-receipts` | VAT submission receipts, HMRC responses | At rest (AWS managed) | 7 years (legal requirement) |
| **DynamoDB** `{env}-submit-hmrc-api-requests` | Audit trail of HMRC API calls (masked) | At rest (AWS managed) | 30 days TTL |
| **AWS Cognito** | Email, password hash, user attributes | AWS managed | Until account deletion |
| **AWS Secrets Manager** | OAuth secrets, user sub hash salt | KMS encryption | Permanent (except rotation) |
| **CloudWatch Logs** | Application logs, API access logs | At rest (AWS managed) | 30-90 days configurable |
| **S3** | Static assets, deployment artifacts | SSE-S3 | Version controlled |
| **CloudFront** | CDN cache, access logs | In transit (TLS) | Short-lived cache |

### 1.2 Sensitive Data and Compromise Impact

| Data Type | Storage Location | If Compromised... | Mitigating Secret |
|-----------|------------------|-------------------|-------------------|
| User emails | Cognito User Pool | Identity disclosure, phishing risk | Cognito is AWS managed |
| User passwords | Cognito (hashed) | Account takeover | Cognito is AWS managed |
| VAT submission data | DynamoDB (by hashedSub) | Financial data exposure | `USER_SUB_HASH_SALT` |
| HMRC receipts | DynamoDB (by hashedSub) | Tax filing history exposure | `USER_SUB_HASH_SALT` |
| HMRC OAuth tokens | Session only (masked in audit) | Unauthorized HMRC API access | `HMRC_CLIENT_SECRET` |
| User-to-data mapping | DynamoDB partition keys | Link users to their data | `USER_SUB_HASH_SALT` |

### 1.3 Protection Mechanisms

**Data Masking** (`app/lib/dataMasking.js`):
- Automatically masks sensitive fields before DynamoDB persistence
- Fields masked: `authorization`, `access_token`, `refresh_token`, `password`, `client_secret`, `code`
- Pattern matching: fields ending in `password`, `secret`, `token`
- Allowlist for safe fields: `periodKey`, `tokenInfo`, `hasAccessToken`

**User Sub Hashing** (`app/services/subHasher.js`):
- HMAC-SHA256 with environment-specific salt
- Original Cognito `sub` never stored in DynamoDB
- All partition keys use `hashedSub`
- Prevents correlation attacks across data breaches

---

## 2. Secrets Management

### 2.1 Secret Inventory

| Secret Name | GitHub Secret | AWS Secrets Manager Path | Used By |
|-------------|---------------|--------------------------|---------|
| Google OAuth Client Secret | `GOOGLE_CLIENT_SECRET` | `{env}/submit/google/client_secret` | Cognito Identity Provider |
| HMRC Production Client Secret | `HMRC_CLIENT_SECRET` | `{env}/submit/hmrc/client_secret` | HMRC OAuth token exchange |
| HMRC Sandbox Client Secret | `HMRC_SANDBOX_CLIENT_SECRET` | `{env}/submit/hmrc/sandbox_client_secret` | HMRC sandbox testing |
| User Sub Hash Salt | (auto-generated) | `{env}/submit/user-sub-hash-salt` | DynamoDB partition keys |

### 2.2 Secret Flow Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   GitHub Secrets    │───▶│  deploy-environment │───▶│  AWS Secrets Mgr    │
│   (source of truth  │    │  workflow           │    │  (runtime access)   │
│   for OAuth secrets)│    │  create-secrets job │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
                                                               │
                                                               ▼
                           ┌─────────────────────┐    ┌─────────────────────┐
                           │  CDK Stacks         │◀───│  Lambda Functions   │
                           │  (reference ARNs)   │    │  (read at runtime)  │
                           └─────────────────────┘    └─────────────────────┘
```

### 2.3 Verifying Secrets

Use the **manage secrets** workflow:
1. Go to **Actions** → **manage secrets**
2. Select **Action**: `check`
3. Select **Environment**: `ci` or `prod`
4. Click **Run workflow**

This verifies all required secrets exist and have values.

---

## 3. Secret Rotation Procedures

### 3.1 Google OAuth Client Secret Rotation

**When to rotate**: Annually, or immediately if compromised.

**Step 1: Obtain new secret from Google**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your **OAuth 2.0 Client ID**
4. Click **Add Secret** (allows having multiple active secrets)
5. Copy the new secret value

**Step 2: Update GitHub Secret**
1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click on `GOOGLE_CLIENT_SECRET`
3. Click **Update secret**
4. Paste the new secret value
5. Click **Update secret**

**Step 3: Deploy to AWS**
1. Go to **Actions** → **deploy environment**
2. Click **Run workflow**
3. Select the environment (`ci` or `prod`)
4. Check **"Force refresh of Cognito Identity Provider"** ✓
5. Click **Run workflow**
6. Wait for deployment to complete

**Step 4: Verify and cleanup**
1. Test login via Google on the deployed environment
2. Once verified, return to Google Cloud Console
3. Delete the old secret

**Important**: The `force-identity-refresh` flag is required because Cognito caches the secret value. Without this flag, CloudFormation won't detect the change.

### 3.2 HMRC Client Secret Rotation

**When to rotate**: Annually, or immediately if compromised.

**Step 1: Obtain new secret from HMRC**
1. Go to [HMRC Developer Hub](https://developer.service.hmrc.gov.uk/)
2. Navigate to your application
3. Regenerate the client secret
4. Copy the new secret value

**Step 2: Update GitHub Secret**
1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click on `HMRC_CLIENT_SECRET` (or `HMRC_SANDBOX_CLIENT_SECRET` for sandbox)
3. Click **Update secret**
4. Paste the new secret value
5. Click **Update secret**

**Step 3: Deploy to AWS**
1. Go to **Actions** → **deploy environment**
2. Click **Run workflow**
3. Select the environment (`ci` or `prod`)
4. Click **Run workflow**
5. Wait for deployment to complete

**Step 4: Verify**
1. Test HMRC OAuth flow (retrieve obligations or submit VAT return)
2. Check Lambda logs for any authentication errors

**Note**: HMRC secrets are read at Lambda runtime, so a standard deployment is sufficient. The `create-secrets` job automatically updates the value in AWS Secrets Manager.

### 3.3 Rotation Schedule

| Secret | Rotation Frequency | Last Rotated | Next Due |
|--------|-------------------|--------------|----------|
| Google Client Secret | Annually | 2026-01-24 | 2027-01-24 |
| HMRC Client Secret | Annually | 2025-07-24 | 2026-07-24 |
| HMRC Sandbox Client Secret | Annually | 2026-01-24 | 2027-01-24 |
| User Sub Hash Salt | Via migration framework | See Section 4 | See Section 4 |

### 3.4 Other Repository Secrets

These secrets are used for CI/CD and testing, not runtime OAuth:

| Secret | Purpose | Last Updated | Notes |
|--------|---------|--------------|-------|
| `NGROK_AUTH_TOKEN` | Local tunnel for OAuth callbacks | 2025-07-24 | Rotate if compromised |
| `PERSONAL_ACCESS_TOKEN` | GitHub API for workflow automation | 2026-01-17 | Rotate quarterly recommended |
| `RELEASE_PAT` | GitHub release creation | 2026-01-10 | Rotate quarterly recommended |
| `SUPPORT_ISSUE_PAT` | GitHub issue management | 2026-01-17 | Rotate quarterly recommended |
| `TEST_HMRC_PASSWORD` | HMRC sandbox test user password | 2026-01-24 | Regenerate via HMRC test user API |

---

## 4. User Sub Hashing (Salt)

### 4.1 Why the Salt is Critical

The user sub hash salt creates the link between Cognito user identities and DynamoDB data via `HMAC-SHA256(salt, userSub)`. Every DynamoDB item uses the resulting 64-character hex hash as its partition key (`hashedSub`).

| If the salt is... | Impact |
|-------------------|--------|
| **Missing** | All Lambda functions fail on cold start |
| **Wrong value** | New writes go to unreachable partition keys (silent data loss) |
| **Compromised** | Attacker could de-anonymise users if they also have DynamoDB access |

### 4.2 Multi-Version Salt Registry

The salt is stored in Secrets Manager as a JSON registry supporting multiple versions:

```json
{
  "current": "v2",
  "versions": {
    "v1": "Abc123...base64...",
    "v2": "tiger-happy-castle-river-noble-frost-plume-brave"
  }
}
```

- **`current`**: The version used for all new writes
- **`versions`**: All known salt values (old versions kept for read-path fallback during migration windows)
- Lambda functions read the registry on cold start and cache the parsed result
- All DynamoDB items include a `saltVersion` field indicating which version was used

### 4.3 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Secrets Manager                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ {env}/submit/user-sub-hash-salt                         │    │
│  │ Value: {"current":"v2","versions":{"v1":"...","v2":"..."}}│   │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ GetSecretValue (on cold start)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Lambda Functions                              │
│  subHasher.js: hashSub() uses current version for writes        │
│                getPreviousVersions() for read-path fallback      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ hashSub(userSub) → HMAC-SHA256
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DynamoDB Tables                              │
│  bundles, receipts, hmrc-api-requests, async-requests (5)       │
│  Partition Key: hashedSub (64-char hex)                         │
│  Each item stores: saltVersion ("v1", "v2", etc.)               │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Three Recovery Paths

If the salt is lost from Secrets Manager, three independent recovery paths exist:

| Path | Location | Recovery Method |
|------|----------|-----------------|
| **Path 1** | Secrets Manager | Soft-delete recovery (7-30 day window) |
| **Path 2** | Physical card | 8-word passphrase printed on card in fire safe |
| **Path 3** | DynamoDB `system#config` item | KMS-encrypted salt, decrypted with DataStack KMS key |

**Path 2 detail**: The current salt (v2) is an 8-word passphrase (~82 bits entropy) that can be typed manually into the `restore-salt` workflow.

### 4.5 Salt Creation

The salt is automatically created by `deploy-environment.yml` in the `create-secrets` job:
- Only created if it doesn't exist (idempotent)
- Initial v1: 32-byte random value (base64 encoded), wrapped in JSON registry format
- Tagged as `Critical=true`, `BackupRequired=true`

Migration 003 rotates from v1 to v2 (8-word passphrase) and re-keys all items.

### 4.6 Salt Backup Procedure

1. Go to **Actions** → **manage secrets**
2. Select **Action**: `backup-salt`
3. Select **Environment**: `prod` (or `ci`)
4. Click **Run workflow**
5. Copy the **full JSON registry** from the output
6. Store securely (password manager, encrypted file)
7. **Delete the workflow run** from Actions history

The `check-salt` action validates registry format and shows version details without exposing values.

### 4.7 Salt Recovery Procedures

**Scenario: Salt accidentally deleted**

Symptoms: Lambdas fail with "ResourceNotFoundException" on cold start.

Recovery (try in order):
1. **Path 1**: Check Secrets Manager soft-delete recovery (7-30 day window)
2. **Path 3**: Decrypt `system#config`/`salt-v2` item from bundles table using KMS key
3. **Path 2**: Type the 8-word passphrase from the physical backup card

After recovering the value:
1. Go to **Actions** → **manage secrets** → `restore-salt`
2. Enter the full JSON registry value
3. **Delete the workflow run**
4. Redeploy or wait for Lambda cold start

**Scenario: Salt tampered (wrong value)**

Symptoms: Users can't access data; no errors (hashing works, just wrong values). Detected by salt health canary — a `system#canary` item in the bundles table with a known expected hash.

Recovery:
1. Restore correct salt from Path 2 or Path 3
2. Use `restore-salt` action with the correct registry JSON
3. Force Lambda cold starts (redeploy)

**Scenario: Total salt loss (all paths fail)**

If Secrets Manager, physical card, and KMS-encrypted backup are all lost:
- The HMAC is irreversible by design — user data cannot be reconnected to users
- Generate a new salt, existing data becomes orphaned (TTLs will clean up over time)

### 4.8 Salt Rotation (Migration Framework)

Salt rotation uses the EF-style migration framework at `scripts/migrations/`:

```bash
# Run manually via workflow or CLI
ENVIRONMENT_NAME=ci node scripts/migrations/runner.js --phase post-deploy
```

Migrations are tracked in the bundles table under `system#migrations` partition key. The runner skips already-applied migrations (idempotent).

| Migration | Phase | Purpose |
|-----------|-------|---------|
| 001-convert-salt-to-registry | pre-deploy | Convert raw string to JSON registry |
| 002-backfill-salt-version-v1 | post-deploy | Add `saltVersion="v1"` to existing items |
| 003-rotate-salt-to-passphrase | post-deploy | Generate 8-word passphrase, re-key all items |

During rotation, the read-path version fallback ensures users can access data at any salt version in the registry. No user experiences data loss during migration.

### 4.9 IAM Access

Lambda functions are granted access via CDK helper:

```java
// infra/main/java/co/uk/diyaccounting/submit/utils/SubHashSaltHelper.java
SubHashSaltHelper.grantSaltAccess(lambda, region, account, envName);
```

This adds permission for `secretsmanager:GetSecretValue` on the salt secret ARN.

---

## 5. Data Subject Rights

**Response deadline**: 30 days for all requests.

### 5.1 Right of Access

**Request**: User asks for copy of their personal data.

**Action**:
1. Run `scripts/export-user-data.js <userId>`
2. Email JSON file or provide secure download link

### 5.2 Right to Erasure

**Request**: User asks for account and data deletion.

**Action**:
1. Run `scripts/delete-user-data.js <userId>`
2. HMRC receipts retained for 7 years (anonymized)
3. Verify deletion in DynamoDB and Cognito
4. Inform user about HMRC receipt retention (legal requirement)

### 5.3 Right to Rectification

**Request**: User reports incorrect data.

**Action**: Update via DynamoDB console or admin scripts.

### 5.4 Right to Data Portability

**Request**: User wants data for transfer.

**Action**: Same as Right of Access - export to JSON/CSV.

---

## 6. Security Incident Response

### 6.1 When a Breach Occurs

**72-hour notification requirement** applies to UK GDPR breaches.

1. **Assess impact**: What data affected? How many users?
2. **Contain**: Revoke credentials, block access, rotate secrets
3. **Notify within 72 hours**:
   - **ICO**: https://ico.org.uk/make-a-complaint/data-protection-complaints/
   - **HMRC**: SDSTeam@hmrc.gov.uk (if OAuth tokens or HMRC data affected)
   - **Affected users**: Email with details and recommended actions
4. **Document**: Keep records of incident, response, and remediation

### 6.2 Breach Types Requiring Notification

- Unauthorized access to DynamoDB (bundles, receipts)
- Exposed OAuth tokens or HMRC credentials
- AWS credential compromise
- Data exfiltration or ransomware
- Accidental public exposure of user data

### 6.3 Immediate Actions by Secret Type

| Compromised Secret | Immediate Actions |
|--------------------|-------------------|
| `GOOGLE_CLIENT_SECRET` | 1. Regenerate in Google Console<br>2. Update GitHub secret<br>3. Deploy with `force-identity-refresh` |
| `HMRC_CLIENT_SECRET` | 1. Regenerate in HMRC Developer Hub<br>2. Update GitHub secret<br>3. Run deploy environment workflow |
| `USER_SUB_HASH_SALT` | 1. Assess data exposure<br>2. **Do NOT rotate** (breaks data access)<br>3. Focus on access control |
| AWS Credentials | 1. Rotate IAM credentials<br>2. Review CloudTrail for unauthorized access<br>3. Check for data exfiltration |

---

## 7. Security Monitoring

### 7.1 Automatic Alerts (CloudWatch Alarms)

| Detection | Alarm Name Pattern | Response |
|-----------|-------------------|----------|
| Lambda errors | `{env}-submit-*-errors` | Check Lambda logs for stack trace |
| Lambda log errors | `{env}-submit-*-log-errors` | Search logs for error pattern |
| API 5xx errors | `{env}-submit-api-5xx` | Check API Gateway + Lambda logs |
| Lambda throttles | `{env}-submit-*-throttles` | Potential abuse - check source |
| Health check failures | `{env}-ops-health-check` | Check CloudFront, API, Lambda |

### 7.2 Manual Monitoring Required

| Detection | Where to Find | What It Indicates |
|-----------|---------------|-------------------|
| Auth failures | CloudWatch Logs > custom-authorizer | Brute force, invalid tokens |
| WAF blocks | AWS Console > WAF > Sampled requests | Active attacks (SQLi, XSS) |
| Unusual AWS API calls | CloudTrail > Event History | Credential compromise |
| HMRC API failures | CloudWatch Logs > hmrc-* | Token theft, unauthorized access |

### 7.3 Investigation Queries

**CloudWatch Logs Insights - Auth Failures**:
```
fields @timestamp, @message
| filter @logStream like /custom-authorizer/
| filter level = "WARN" or level = "ERROR"
| sort @timestamp desc
| limit 100
```

### 7.4 Monitoring Schedule

| Frequency | Tasks |
|-----------|-------|
| **Weekly** | Check CloudWatch alarms, review auth failures, check WAF activity |
| **Monthly** | Review DynamoDB growth, audit IAM access, check CloudTrail |
| **Quarterly** | Test export/deletion scripts, review policies, update this document |
| **Annually** | Rotate OAuth secrets, disaster recovery test, penetration testing |

---

## 8. Data Retention

| Data Type | Retention Period | Cleanup Method |
|-----------|------------------|----------------|
| Active user bundles | Until account deletion | Manual deletion script |
| Closed account data | 30 days after closure | `scripts/cleanup-deleted-accounts.js` |
| HMRC receipts | 7 years (legal requirement) | TTL + archive to Glacier |
| HMRC API audit trail | 30 days | DynamoDB TTL (automatic) |
| CloudWatch logs | 30-90 days | Retention policy (automatic) |

---

## 9. Regulatory Compliance

### 9.1 UK GDPR Requirements

- ✅ Data subject requests: 30-day response
- ✅ Breach notification: 72-hour requirement
- ✅ Privacy policy: `web/public/privacy.html`
- ✅ Terms of use: `web/public/terms.html`

### 9.2 HMRC MTD Requirements

- ✅ Fraud Prevention Headers: Gov-Client-* headers on all API calls
- ✅ OAuth Token Security: Never logged, masked in audit trail
- ✅ Penetration testing (Zap scan)

---

## 10. Public Repository Security

This repository is **public on GitHub**. The security model is "secure by design" - no security through obscurity.

### 10.1 What Is Public (By Design)

| Item | Why It's Safe |
|------|---------------|
| AWS Account ID `887764105431` | Account IDs are identifiers, not secrets. AWS IAM controls access. |
| HMRC Client IDs | Public OAuth identifiers. Secrets stored in GitHub Secrets → AWS Secrets Manager. |
| Secret ARNs | Just references to secrets, not the secrets themselves. |
| Infrastructure code (CDK) | Reveals architecture but not access credentials. |
| `.env.ci`, `.env.prod` | No secrets, only configuration and ARN references. |
| `submit.passes.toml` | Pass type definitions only, no secrets or user data. |

### 10.2 What Is Kept Private

| Item | Protection Method |
|------|-------------------|
| OAuth client secrets | GitHub Secrets → AWS Secrets Manager (never in code) |
| User sub hash salt | AWS Secrets Manager only (auto-generated) |
| GitHub PATs | GitHub Secrets only |
| HMRC test credentials | GitHub Secrets + regenerated per test run |
| Salt backups | `.gitignore` excludes `salt-backup-*.json` |
| Local dev secrets | `.gitignore` excludes `/.env`, `/secrets.env` |

### 10.3 Security Verification (Passed)

| Check | Result |
|-------|--------|
| No AWS access keys (AKIA/ASIA) in code | ✅ Clean |
| No GitHub PATs (ghp_/gho_) in code | ✅ Clean |
| No hardcoded passwords | ✅ All from env vars |
| Sensitive files in .gitignore | ✅ Properly configured |
| Secrets use ARN references only | ✅ Never inline values |

### 10.4 HMRC Production URL Placeholder

**Note**: `.env.prod` contains placeholder `HMRC_BASE_URI=https://to0request0from0hmrc-api.service.hmrc.gov.uk`. This must be updated with the real production URL when HMRC grants production access.

---

## Appendix A: File References

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-environment.yml` | Secret creation, Identity stack deployment |
| `.github/workflows/manage-secrets.yml` | Secret verification, backup, restore |
| `app/services/subHasher.js` | HMAC-SHA256 hashing with salt |
| `app/lib/dataMasking.js` | Sensitive data masking for DynamoDB |
| `infra/main/java/.../utils/SubHashSaltHelper.java` | CDK helper for salt IAM permissions |
| `infra/main/java/.../stacks/IdentityStack.java` | Cognito + Google IdP configuration |

---

## Appendix B: Contact Information

| Contact | Purpose | Details |
|---------|---------|---------|
| Administrator | Data requests, incidents | admin@diyaccounting.co.uk |
| ICO | GDPR guidance, breach reporting | https://ico.org.uk/ |
| HMRC SDS Team | MTD compliance | SDSTeam@hmrc.gov.uk |
| AWS Support | Infrastructure incidents | Via AWS Console |

---

*This document should be reviewed quarterly and updated whenever procedures change.*
