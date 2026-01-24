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
10. [Improvement Recommendations](#10-improvement-recommendations)

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
| User Sub Hash Salt | **Never rotate** | N/A | N/A |

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

The user sub hash salt creates the link between Cognito user identities and DynamoDB data.

| If the salt is... | Impact |
|-------------------|--------|
| **Missing** | All Lambda functions fail on cold start |
| **Wrong value** | All user data becomes orphaned (hashes don't match) |
| **Compromised** | Attacker could correlate users across datasets |

**The salt value must remain constant** for the lifetime of user data. It is **never rotated** under normal circumstances.

### 4.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Secrets Manager                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ {env}/submit/user-sub-hash-salt                         │    │
│  │ Value: "Abc123...base64..." (44 chars)                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ GetSecretValue (on cold start)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Lambda Functions                              │
│  AuthStack: cognitoTokenPost, customAuthorizer                  │
│  HmrcStack: hmrcTokenPost, vatObligations, vatReturns, etc.     │
│  AccountStack: bundleGet, bundlePost, bundleDelete              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ hashSub(userSub) → HMAC-SHA256
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DynamoDB Tables                              │
│  bundles, receipts, hmrc-api-requests                           │
│  Partition Key: hashedSub (64-char hex)                         │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Salt Creation

The salt is automatically created by `deploy-environment.yml` in the `create-secrets` job:
- Only created if it doesn't exist (idempotent)
- 32-byte cryptographically secure random value (base64 encoded)
- Tagged as `Critical=true`, `BackupRequired=true`

**Source**: `.github/workflows/deploy-environment.yml` lines 182-198

### 4.4 Salt Backup Procedure

**Recommended**: Monthly backup to secure location.

1. Go to **Actions** → **manage secrets**
2. Select **Action**: `backup-salt`
3. Select **Environment**: `prod` (or `ci`)
4. Click **Run workflow**
5. View the workflow run output
6. Copy the salt value displayed
7. Store securely (password manager, encrypted file)
8. **Delete the workflow run** from Actions history

### 4.5 Salt Recovery Procedures

**Scenario 1: Salt accidentally deleted**

Symptoms:
- Lambdas fail with "ResourceNotFoundException"
- All authenticated API calls return 500 errors

Recovery (with backup):
1. Go to **Actions** → **manage secrets**
2. Select **Action**: `restore-salt`
3. Enter the backed-up salt value
4. Click **Run workflow**
5. **Delete the workflow run**
6. Redeploy or wait for Lambda cold start

Recovery (without backup):
- **DATA WILL BE LOST** - all user data becomes orphaned
- Run `deploy environment` workflow to create new salt
- Users will appear as "new"

**Scenario 2: Wrong salt value**

Symptoms:
- Users can't access existing data
- No error messages (hashing works, just wrong values)

Recovery:
1. Identify correct salt from backup
2. Use `restore-salt` action
3. Force Lambda cold starts (redeploy)

### 4.6 IAM Access

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
- ⬜ Penetration testing (required before production approval)
- ⬜ HMRC production readiness checklist (see `_developers/REVIEW_TO_MTD.md`)

---

## 10. Improvement Recommendations

### 10.1 Quick Wins (Low Risk, Implement Now)

| Priority | Recommendation | Effort | Status |
|----------|----------------|--------|--------|
| 1 | **Document rotation dates** in Section 3.3 table | 5 min | ⬜ |
| 2 | **Create admin scripts** referenced in Section 5 (`export-user-data.js`, etc.) | 2-4 hours | ⬜ |
| 3 | **Set up monthly calendar reminder** for salt backup | 5 min | ⬜ |
| 4 | **Archive old documents** after this runbook is complete | 10 min | ⬜ |

### 10.2 Medium Term (Plan for Next Quarter)

| Priority | Recommendation | Effort | Notes |
|----------|----------------|--------|-------|
| 5 | **Enable GuardDuty** for threat detection | 1 day | See `SECURITY_DETECTION_UPLIFT_PLAN.md` |
| 6 | **Add CloudWatch alarms** for auth failure spikes | 2 hours | Currently logged but not alerting |
| 7 | **Add WAF rate limit alerts** | 1 hour | Detect active attacks |
| 8 | **Implement automated secret rotation** in Secrets Manager | 1 week | Phase 3.4 of security uplift plan |

### 10.3 Known Gaps

| Gap | Risk | Mitigation |
|-----|------|------------|
| Admin scripts not implemented | Manual data requests slow | Create scripts per Section 5 |
| Salt backup not automated | Recovery risk if deleted | Monthly manual backup (Section 4.4) |
| GuardDuty not enabled | Reduced threat visibility | Manual CloudTrail review |
| No automated rotation | Secrets may become stale | Annual manual rotation schedule |

### 10.4 Documents to Archive

After this runbook is adopted, the following source documents should be archived or deleted:
- `_developers/PRIVACY_DUTIES.md` → Merged into this document
- `_developers/PII_AND_SENSITIVE_DATA.md` → Merged into this document
- `_developers/SALT_SECRET_RECOVERY.md` → Merged into this document
- `_developers/SALTED_HASH_IMPLEMENTATION.md` → Merged into this document

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
