 # Combined Plan: Salted User Sub Hashing

**Status**: Recommended approach combining best aspects of all reviewed plans
**Date**: January 5, 2026
**Context**: Migration from unsalted SHA-256 to HMAC-SHA256 with persistent environment-specific salts

---

## Executive Summary

This plan combines three sources:
1. **ROLLOUT-salted-user-sub-hash.md** - Execution-focused deployment guide (base)
2. **SALTED_HASH_MIGRATION_PLAN.md** - Comprehensive operational procedures
3. **PLAN-salted-user-sub-hash.md** - Detailed technical design

**Result**: Production-ready implementation with clear execution path and operational maturity.

---

## Overview

### Security Benefits
- **Rainbow table resistance**: Salted hashes cannot be pre-computed
- **Environment isolation**: Different environments have different salts
- **Breach containment**: Compromised hash from one environment doesn't work in another
- **Audit trail**: All salt access logged via CloudTrail

### Architecture
- **Algorithm**: HMAC-SHA256 (stronger than plain SHA-256)
- **Salt Storage**: AWS Secrets Manager (survives stack deletion)
- **Salt Size**: 256-bit (32 bytes base64-encoded)
- **Per-Environment**: Unique salt for ci, prod
- **Initialization**: One-time fetch per Lambda cold start, then cached

---

## Pre-Deployment Checklist

- [ ] No live user data exists (confirmed - clean break acceptable)
- [ ] All code changes reviewed
- [ ] Unit tests pass: `npm test`
- [ ] Backup script created: `scripts/backup-salts.sh`
- [ ] PRIVACY_DUTIES.md updated with salt management section

---

## Implementation Components

### 1. GitHub Actions Salt Creation

**File**: `.github/workflows/deploy-environment.yml`

Add in `create-secrets` job (after HMRC secrets):

```yaml
- name: Create or retrieve user sub hash salt
  run: |
    SECRET_NAME="${{ needs.names.outputs.environment-name }}/submit/user-sub-hash-salt"
    SECRET_ARN="arn:aws:secretsmanager:${{ env.AWS_REGION }}:${{ env.AWS_ACCOUNT_ID }}:secret:${SECRET_NAME}"

    if ! aws secretsmanager describe-secret --secret-id "$SECRET_ARN" 2>/dev/null; then
      echo "Creating new salt for $SECRET_NAME"
      # Generate 32-byte cryptographically secure random salt, base64 encoded
      SALT=$(openssl rand -base64 32)
      aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Salt for hashing user subs - DO NOT DELETE (required for data recovery)" \
        --secret-string "$SALT" \
        --region ${{ env.AWS_REGION }} \
        --tags Key=Purpose,Value=user-sub-hashing Key=Critical,Value=true Key=BackupRequired,Value=true
    else
      echo "Salt secret $SECRET_NAME already exists - preserving existing value"
    fi
  env:
    AWS_REGION: ${{ env.AWS_REGION }}
```

**Key Features**:
- Idempotent (only creates if doesn't exist)
- Survives stack deletion
- Tagged for protection
- 256-bit entropy

---

### 2. Application Code: subHasher.js

**File**: `app/services/subHasher.js`

Replace entire file:

```javascript
// app/services/subHasher.js
import crypto from "crypto";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/subHasher.js" });

let __cachedSalt = null;
let __initPromise = null;

/**
 * Initialize salt once per Lambda container (cold start)
 * Call this at the top of your Lambda handler
 */
export async function initializeSalt() {
  if (__cachedSalt) {
    logger.debug("Salt already initialized (warm start)");
    return;
  }

  // Prevent concurrent initialization
  if (__initPromise) {
    logger.debug("Salt initialization in progress, waiting...");
    return __initPromise;
  }

  __initPromise = (async () => {
    try {
      // For local development/testing, allow env var override
      if (process.env.USER_SUB_HASH_SALT) {
        logger.info("Using USER_SUB_HASH_SALT from environment (local dev)");
        __cachedSalt = process.env.USER_SUB_HASH_SALT;
        return;
      }

      // For deployed environments, fetch from Secrets Manager
      const envName = process.env.ENVIRONMENT_NAME || "ci";
      const secretName = `${envName}/submit/user-sub-hash-salt`;

      logger.info({ secretName }, "Fetching salt from Secrets Manager");

      const client = new SecretsManagerClient({
        region: process.env.AWS_REGION || "eu-west-2",
      });

      const response = await client.send(
        new GetSecretValueCommand({ SecretId: secretName })
      );

      if (!response.SecretString) {
        throw new Error(`Secret ${secretName} exists but has no SecretString value`);
      }

      __cachedSalt = response.SecretString;
      logger.info("Salt successfully fetched and cached");
    } catch (error) {
      logger.error({ error }, "Failed to fetch salt");
      __initPromise = null; // Clear promise so next call will retry
      throw new Error(
        `Failed to initialize salt: ${error.message}. ` +
        `Ensure secret exists and Lambda has secretsmanager:GetSecretValue permission.`
      );
    }
  })();

  return __initPromise;
}

/**
 * Hash a user sub using HMAC-SHA256 with environment-specific salt
 * @param {string} sub - The user's subject identifier
 * @returns {string} 64-character hexadecimal hash
 * @throws {Error} If sub is invalid or salt not initialized
 */
export function hashSub(sub) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }

  if (!__cachedSalt) {
    throw new Error(
      "Salt not initialized. Call initializeSalt() in your Lambda handler before using hashSub(). " +
      "For local dev, set USER_SUB_HASH_SALT in .env file."
    );
  }

  return crypto.createHmac("sha256", __cachedSalt).update(sub).digest("hex");
}

/**
 * Test-only function - allows injecting test salt without AWS
 * @private
 */
export function _setTestSalt(salt) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setTestSalt can only be used in NODE_ENV=test");
  }
  __cachedSalt = salt;
  __initPromise = null;
}

/**
 * Test-only function - clears cached salt
 * @private
 */
export function _clearSalt() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearSalt can only be used in NODE_ENV=test");
  }
  __cachedSalt = null;
  __initPromise = null;
}
```

**Key Features**:
- Single async init, then sync usage
- Caching prevents repeated AWS calls
- Clear error messages
- Test-only functions with NODE_ENV guard
- Concurrent init protection

---

### 3. Lambda Handler Pattern

**Apply to all Lambda functions that use `hashSub()`**:

```javascript
// Example: app/functions/account/bundleGet.js
import { initializeSalt, hashSub } from "@app/services/subHasher.js";

let __initialized = false;

export async function handler(event, context) {
  // One-time initialization per Lambda container
  if (!__initialized) {
    await initializeSalt();
    __initialized = true;
  }

  // Now use hashSub() synchronously in business logic
  const userId = event.requestContext.authorizer.claims.sub;
  const hashedSub = hashSub(userId);

  // ... rest of handler logic
}
```

**Files to update** (add `initializeSalt()` call):
- `app/functions/account/bundleGet.js`
- `app/functions/account/bundlePost.js` (ingest + worker)
- `app/functions/account/bundleDelete.js` (ingest + worker)
- `app/functions/auth/cognitoTokenPost.js`
- `app/functions/auth/customAuthorizer.js`
- `app/functions/hmrc/hmrcTokenPost.js`
- `app/functions/hmrc/hmrcReceiptGet.js`
- `app/functions/hmrc/hmrcVatReturnPost.js` (ingest + worker)
- `app/functions/hmrc/hmrcVatObligationGet.js` (ingest + worker)
- `app/functions/hmrc/hmrcVatReturnGet.js` (ingest + worker)

---

### 4. CDK Infrastructure Updates

#### 4.1 Create Helper Class (Recommended)

**New file**: `infra/main/java/co/uk/diyaccounting/submit/utils/SubHashSaltHelper.java`

```java
package co.uk.diyaccounting.submit.utils;

import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;

import java.util.List;

/**
 * Helper for granting Lambda functions access to user sub hash salt secret
 */
public class SubHashSaltHelper {

    /**
     * Grant a Lambda function permission to read the user sub hash salt secret
     *
     * @param lambda The Lambda function to grant access to
     * @param region AWS region
     * @param account AWS account ID
     * @param envName Environment name (ci, prod, etc)
     */
    public static void grantSaltAccess(Function lambda, String region, String account, String envName) {
        String saltSecretArn = String.format(
            "arn:aws:secretsmanager:%s:%s:secret:%s/submit/user-sub-hash-salt*",
            region, account, envName
        );

        lambda.addToRolePolicy(PolicyStatement.Builder.create()
            .effect(Effect.ALLOW)
            .actions(List.of("secretsmanager:GetSecretValue"))
            .resources(List.of(saltSecretArn))
            .build());
    }
}
```

#### 4.2 Update Stack Files

**Files to modify**:
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java`
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AuthStack.java`
- `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java`

**Add import**:
```java
import static co.uk.diyaccounting.submit.utils.SubHashSaltHelper.grantSaltAccess;
```

**After creating each Lambda**:
```java
// Extract region and account from props
var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

// Grant salt access
grantSaltAccess(this.bundleGetLambda, region, account, props.envName());
grantSaltAccess(this.bundlePostLambda, region, account, props.envName());
grantSaltAccess(this.bundleDeleteLambda, region, account, props.envName());
// ... repeat for all Lambdas
```

**AccountStack.java Lambdas**:
- bundleGetLambda
- bundlePostLambda (+ bundlePostWorkerLambda if separate)
- bundleDeleteLambda (+ bundleDeleteWorkerLambda if separate)

**AuthStack.java Lambdas**:
- cognitoTokenPostLambda
- customAuthorizerLambda

**HmrcStack.java Lambdas**:
- hmrcTokenPostLambda
- hmrcVatReturnPostLambda (+ worker)
- hmrcVatObligationGetLambda (+ worker)
- hmrcVatReturnGetLambda (+ worker)
- receiptGetLambda

---

### 5. Local Development Setup

#### 5.1 Update `.env.proxy`

Add:
```bash
# User sub hash salt for local development
USER_SUB_HASH_SALT=local-dev-salt-for-proxy-DO-NOT-USE-IN-PRODUCTION
```

#### 5.2 Update `.env.test` (if exists)

Add:
```bash
# User sub hash salt for unit tests
USER_SUB_HASH_SALT=test-salt-for-unit-tests-DO-NOT-USE-IN-PRODUCTION
NODE_ENV=test
```

---

### 6. Test Updates

#### 6.1 Update Unit Tests

**File**: `app/unit-tests/services/subHasher.test.js`

Replace entire file:

```javascript
// app/unit-tests/services/subHasher.test.js
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { hashSub, _setTestSalt, _clearSalt } from "@app/services/subHasher.js";
import crypto from "crypto";

describe("subHasher - salted HMAC-SHA256", () => {
  const TEST_SALT = "test-salt-for-unit-tests";
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = "test";
    _setTestSalt(TEST_SALT);
  });

  afterAll(() => {
    _clearSalt();
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  test("should produce 64-character hex string", () => {
    const hashed = hashSub("test-sub");
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });

  test("should produce consistent hashes with same salt", () => {
    const hash1 = hashSub("test-sub");
    const hash2 = hashSub("test-sub");
    expect(hash1).toBe(hash2);
  });

  test("should produce different hashes for different inputs", () => {
    const hash1 = hashSub("sub-1");
    const hash2 = hashSub("sub-2");
    expect(hash1).not.toBe(hash2);
  });

  test("should produce different hash than unsalted SHA-256", () => {
    const salted = hashSub("test-sub");
    const unsalted = crypto.createHash("sha256").update("test-sub").digest("hex");
    expect(salted).not.toBe(unsalted);
  });

  test("should throw if salt not initialized", () => {
    _clearSalt();
    expect(() => hashSub("test")).toThrow("Salt not initialized");
    _setTestSalt(TEST_SALT); // restore for other tests
  });

  test("should throw error for empty string sub", () => {
    expect(() => hashSub("")).toThrow("Invalid sub");
  });

  test("should throw error for null sub", () => {
    expect(() => hashSub(null)).toThrow("Invalid sub");
  });

  test("should throw error for undefined sub", () => {
    expect(() => hashSub(undefined)).toThrow("Invalid sub");
  });

  test("should throw error for non-string sub", () => {
    expect(() => hashSub(12345)).toThrow("Invalid sub");
  });
});
```

#### 6.2 Update System/Behaviour Tests

Ensure test setup includes:

```javascript
import { _setTestSalt } from "@app/services/subHasher.js";

// In test setup
beforeAll(() => {
  process.env.NODE_ENV = "test";
  _setTestSalt("test-salt-for-behaviour-tests");
});
```

---

### 7. Backup Script (Critical)

**New file**: `scripts/backup-salts.sh`

```bash
#!/usr/bin/env bash
# scripts/backup-salts.sh - Export salts for disaster recovery

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="salt-backup-${TIMESTAMP}.json"
REGION="${AWS_REGION:-eu-west-2}"

echo "🔐 Backing up user sub hash salts from AWS Secrets Manager"
echo "   Region: $REGION"
echo ""

# Function to get salt or return NOT_FOUND
get_salt() {
  local secret_id=$1
  aws secretsmanager get-secret-value \
    --secret-id "$secret_id" \
    --region "$REGION" \
    --query SecretString \
    --output text 2>/dev/null || echo "NOT_FOUND"
}

# Get salts
CI_SALT=$(get_salt "ci/submit/user-sub-hash-salt")
PROD_SALT=$(get_salt "prod/submit/user-sub-hash-salt")

# Check if any salts were found
if [ "$CI_SALT" = "NOT_FOUND" ] && [ "$PROD_SALT" = "NOT_FOUND" ]; then
  echo "⚠️  No salts found. This is expected if environments haven't been deployed yet."
  exit 0
fi

# Create JSON backup
cat > "$OUTPUT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "region": "$REGION",
  "salts": {
    "ci": "$CI_SALT",
    "prod": "$PROD_SALT"
  },
  "restore_instructions": {
    "command": "aws secretsmanager update-secret --secret-id <env>/submit/user-sub-hash-salt --secret-string <value> --region $REGION",
    "warning": "Only restore if salt was lost. Using wrong salt makes all data inaccessible."
  }
}
EOF

echo "✅ Backup complete: $OUTPUT_FILE"
echo ""
echo "📋 Found salts:"
[ "$CI_SALT" != "NOT_FOUND" ] && echo "   ✓ CI environment"
[ "$PROD_SALT" != "NOT_FOUND" ] && echo "   ✓ Prod environment"
echo ""
echo "⚠️  IMPORTANT: Store this file securely"
echo "   • Add to 1Password: Infrastructure Secrets vault"
echo "   • Item name: Submit VAT - Salt Backup $TIMESTAMP"
echo "   • DO NOT commit to Git"
echo "   • Keep multiple dated backups"
echo ""
echo "🔁 Schedule: Run this script quarterly"
```

Make executable:
```bash
chmod +x scripts/backup-salts.sh
```

---

### 8. Update .gitignore

Add:
```
# Salt backups (sensitive!)
salt-backup-*.json
```

---

### 9. Documentation Updates

#### 9.1 Update PRIVACY_DUTIES.md

Add new section after "Data Retention Management":

```markdown
## Salt Management (Critical Security Asset)

**Added**: January 2026
**Criticality**: High - Loss of salt = loss of all user data access

### Overview

User sub claims are now hashed using HMAC-SHA256 with environment-specific salts stored in AWS Secrets Manager. The salt is **required** to access any user data.

### Salt Locations

- **CI**: `arn:aws:secretsmanager:eu-west-2:887764105431:secret:ci/submit/user-sub-hash-salt`
- **Prod**: `arn:aws:secretsmanager:eu-west-2:887764105431:secret:prod/submit/user-sub-hash-salt`

### Quarterly Backup (Required)

**Frequency**: Every 3 months

**Procedure**:
```bash
# Run from project root
./scripts/backup-salts.sh
```

**Storage**:
1. Open 1Password
2. Navigate to: Infrastructure Secrets vault
3. Create new item: "Submit VAT - Salt Backup [Date]"
4. Attach JSON file from backup script
5. Add tags: `infrastructure`, `critical`, `disaster-recovery`

**Verification**:
```bash
# Verify backup is readable
cat salt-backup-YYYYMMDD-HHMMSS.json | jq .
```

### Disaster Recovery Procedure

If environment is deleted and needs restoration from DynamoDB backup:

**CRITICAL**: Salt must be restored **before** deploying stack.

1. **Retrieve salt from 1Password backup**:
   - Open latest backup item
   - Download JSON file
   - Extract salt for target environment

2. **Restore to AWS Secrets Manager**:
   ```bash
   # Replace <env> with ci or prod
   # Replace <SALT_VALUE> with value from backup JSON

   aws secretsmanager create-secret \
     --name "<env>/submit/user-sub-hash-salt" \
     --description "RESTORED from backup - User sub hash salt - DO NOT DELETE" \
     --secret-string "<SALT_VALUE>" \
     --region eu-west-2 \
     --tags Key=Critical,Value=true Key=BackupRequired,Value=true
   ```

3. **Verify secret exists**:
   ```bash
   aws secretsmanager describe-secret \
     --secret-id "<env>/submit/user-sub-hash-salt" \
     --region eu-west-2
   ```

4. **Deploy stack** (will use existing salt)

5. **Restore DynamoDB tables** from backup

6. **Verify data access** with known test user

### Security Guidelines

**Never**:
- ❌ Delete salt secrets from AWS Secrets Manager
- ❌ Commit salt values to Git
- ❌ Log salt values in application
- ❌ Share salt values via unencrypted channels
- ❌ Let GitHub Actions create new salt if user data exists

**Always**:
- ✅ Keep quarterly backups in 1Password
- ✅ Test restoration procedure annually in CI
- ✅ Verify salt exists before restoring from backup
- ✅ Use different salts for ci and prod
- ✅ Check CloudTrail for unexpected secret access

### Annual Disaster Recovery Drill

**When**: Once per year (suggested: January)

**Procedure**:
1. Select a past CI environment backup
2. Delete CI salt secret
3. Restore salt from backup
4. Restore DynamoDB from backup
5. Deploy stack
6. Verify test user can access their data
7. Document any issues encountered

### Troubleshooting

**Symptom**: All users appear as "new" after deployment

**Cause**: Salt was recreated with new random value

**Fix**: Restore salt from backup (see Disaster Recovery above)

**Prevention**: GitHub Actions workflow checks if salt exists before creating

---

**Symptom**: "Salt not initialized" error in Lambda logs

**Cause**: Lambda missing `secretsmanager:GetSecretValue` permission

**Fix**: Update CDK stack to grant permission (see `SubHashSaltHelper.java`)

---

**Symptom**: "Access Denied" from Secrets Manager

**Cause**: IAM policy missing or incorrect secret ARN

**Fix**: Verify Lambda IAM role has policy for correct secret ARN pattern
```

#### 9.2 Update README.md

Add to "Environment Variables" section:

```markdown
### Security Configuration

#### User Sub Hash Salt

User sub claims are hashed using HMAC-SHA256 with environment-specific salts for security.

**Local Development**:
```bash
# .env.proxy
USER_SUB_HASH_SALT=local-dev-salt-DO-NOT-USE-IN-PRODUCTION
```

**AWS Environments**:
- Managed by AWS Secrets Manager
- Created automatically by GitHub Actions on first deployment
- Persists across stack deletions
- Location: `{environment}/submit/user-sub-hash-salt`

**Important**:
- Each environment has unique salt (ci ≠ prod)
- Salt backup required quarterly (see PRIVACY_DUTIES.md)
- Never regenerate salt after users exist
- Required for disaster recovery
```

---

## Deployment Sequence

### Step 1: Deploy to CI Environment

1. **Push branch to trigger CI deployment**:
   ```bash
   git push origin saltedhash
   ```

2. **Monitor GitHub Actions workflow**:
   - Watch for salt secret creation step
   - Verify no errors in workflow logs

3. **Verify salt secret was created**:
   ```bash
   aws secretsmanager describe-secret \
     --secret-id "ci/submit/user-sub-hash-salt" \
     --region eu-west-2
   ```

   Expected output:
   ```json
   {
     "ARN": "arn:aws:secretsmanager:...",
     "Name": "ci/submit/user-sub-hash-salt",
     "Tags": [
       {"Key": "Purpose", "Value": "user-sub-hashing"},
       {"Key": "Critical", "Value": "true"}
     ]
   }
   ```

### Step 2: Deploy CDK Changes

1. **Build Java CDK code**:
   ```bash
   cd infra
   ../mvnw clean verify -DskipTests
   ```

2. **Deploy stacks**:
   ```bash
   cd ../cdk-application
   npx cdk deploy --all --require-approval never
   ```

3. **Verify Lambda IAM policies**:
   ```bash
   # Check one Lambda (e.g., bundleGet)
   aws lambda get-function \
     --function-name ci-bundleGet \
     --region eu-west-2 \
     --query 'Configuration.Role' \
     --output text | xargs -I {} aws iam get-role --role-name {}
   ```

### Step 3: Test CI Environment

1. **Run unit tests**:
   ```bash
   npm test
   ```

2. **Run behaviour tests**:
   ```bash
   npm run test:complianceBehaviour-ci
   ```

3. **Test Lambda function manually**:
   ```bash
   # Create test user, attempt bundle creation
   # Verify no errors in CloudWatch Logs
   ```

4. **Check CloudWatch Logs**:
   - Look for "Salt successfully fetched and cached"
   - No errors about "Salt not initialized"
   - No errors about Secrets Manager access

### Step 4: Create First Backup

```bash
./scripts/backup-salts.sh
```

Store in 1Password as described in PRIVACY_DUTIES.md.

### Step 5: Deploy to Production

1. **Merge to main**:
   ```bash
   git checkout main
   git merge saltedhash
   git push origin main
   ```

2. **Verify prod salt created**:
   ```bash
   aws secretsmanager describe-secret \
     --secret-id "prod/submit/user-sub-hash-salt" \
     --region eu-west-2
   ```

3. **Monitor CloudWatch Logs** for errors

4. **Create production backup**:
   ```bash
   ./scripts/backup-salts.sh
   ```

### Step 6: Post-Deployment Verification

- [ ] CI environment accessible with new test users
- [ ] Prod environment accessible with new test users
- [ ] Salts backed up to 1Password
- [ ] No Lambda errors in CloudWatch
- [ ] Salt secrets tagged correctly in AWS
- [ ] All behaviour tests pass
- [ ] PRIVACY_DUTIES.md updated

---

## Rollback Plan

If critical issues discovered after deployment:

### Option 1: Revert Code

```bash
git revert <commit-hash>
git push origin main
```

**Result**:
- Code reverts to unsalted hash
- Salt secrets remain in AWS (harmless)
- Users created during salted period become inaccessible (acceptable per requirements)

### Option 2: Fix Forward

```bash
# Fix bugs in code
# Redeploy
```

**Result**:
- Salts are preserved
- Users created during salted period remain accessible

---

## Troubleshooting

### "Salt not initialized" Error

**Cause**: Lambda doesn't have permission to read salt secret, or secret doesn't exist.

**Fix**:
1. Verify secret exists:
   ```bash
   aws secretsmanager describe-secret \
     --secret-id "{env}/submit/user-sub-hash-salt" \
     --region eu-west-2
   ```

2. Check Lambda IAM role has `secretsmanager:GetSecretValue` permission

3. Verify `ENVIRONMENT_NAME` environment variable set correctly in Lambda

### "Access Denied" from Secrets Manager

**Cause**: Lambda IAM role missing permission.

**Fix**: Ensure `SubHashSaltHelper.grantSaltAccess()` was called for the Lambda in CDK stack.

### Hash Mismatch After Redeploy

**Cause**: Salt was recreated (new random value) instead of preserved.

**Prevention**: GitHub Actions workflow checks if secret exists before creating.

**Recovery**: If you have backup, restore salt. Otherwise, data is orphaned.

### All Users Appear as "New"

**Cause**: Different salt is being used than when data was created.

**Fix**: Restore correct salt from backup.

---

## Post-Migration Cleanup (After 30 Days)

Once migration is stable:

1. **Remove `hashSubLegacy()` function** (if added for reference)
2. **Remove migration-related comments** in code
3. **Archive PLAN and ROLLOUT documents** to `_developers/archive/`
4. **Update this document status** to "Completed"

---

## Success Criteria

- ✅ Salt generated and stored in Secrets Manager for ci and prod
- ✅ All Lambdas can fetch and use salt
- ✅ New users can be created and access their data
- ✅ Admin scripts work with salted hashes
- ✅ Salts backed up to 1Password
- ✅ Behaviour tests pass
- ✅ PRIVACY_DUTIES.md updated with quarterly procedures
- ✅ Disaster recovery procedure tested in CI
- ✅ No unsalted `hashSub()` calls remain in production code

---

## Maintenance Schedule

| Frequency | Task | Owner |
|-----------|------|-------|
| Quarterly | Run `./scripts/backup-salts.sh` and store in 1Password | Admin |
| Annually | Test disaster recovery procedure in CI | Admin |
| After each deployment | Verify salt secrets exist | DevOps |
| On-demand | Respond to data subject requests using correct salt | Admin |

---

## Summary of Changes

| Component | Files Changed | Change Type |
|-----------|---------------|-------------|
| GitHub Actions | `.github/workflows/deploy-environment.yml` | Add salt creation step |
| Core Hashing | `app/services/subHasher.js` | Replace with HMAC-SHA256 + init |
| Lambda Handlers | 11 files in `app/functions/` | Add `initializeSalt()` call |
| CDK Stacks | `AccountStack.java`, `AuthStack.java`, `HmrcStack.java` | Grant IAM permissions |
| CDK Helper | `SubHashSaltHelper.java` (new) | Reusable IAM grant utility |
| Environment | `.env.proxy`, `.env.test` | Add `USER_SUB_HASH_SALT` |
| Unit Tests | `app/unit-tests/services/subHasher.test.js` | Update for salted hash |
| Backup Script | `scripts/backup-salts.sh` (new) | Quarterly backup automation |
| Documentation | `PRIVACY_DUTIES.md`, `README.md` | Add salt management sections |
| Git Ignore | `.gitignore` | Exclude `salt-backup-*.json` |

---

## Estimated Effort

| Phase | Tasks | Time |
|-------|-------|------|
| Code Changes | subHasher.js + Lambda handlers | 2-3 hours |
| CDK Updates | Helper class + stack updates | 2 hours |
| Testing | Unit + behaviour tests | 2 hours |
| Backup Script | Create + test | 1 hour |
| Documentation | PRIVACY_DUTIES.md + README | 1-2 hours |
| Deployment | CI + Prod rollout | 2 hours |
| Verification | End-to-end testing | 1 hour |
| **Total** | | **11-13 hours** |

---

## References

- **ROLLOUT-salted-user-sub-hash.md**: Execution-focused deployment guide
- **PLAN-salted-user-sub-hash.md**: Detailed technical design
- **SALTED_HASH_MIGRATION_PLAN.md**: Comprehensive operational procedures
- **PRIVACY_DUTIES.md**: Updated with salt management section
- **AWS Secrets Manager**: https://docs.aws.amazon.com/secretsmanager/
- **HMAC-SHA256**: RFC 2104

---

**Document Status**: Ready for Implementation
**Last Updated**: January 5, 2026
**Next Review**: After CI deployment success
