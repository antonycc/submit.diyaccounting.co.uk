# Migration Plan: Unsalted to Salted Hash for User Sub

## Executive Summary

**Current State**: User sub claims are hashed using unsalted SHA-256, making them vulnerable to rainbow table attacks if DynamoDB access is compromised.

**Goal**: Migrate to salted HMAC-SHA256 hashing using environment-specific salts stored in AWS Secrets Manager.

**Strategy**: Clean break migration (acceptable since no live user data exists yet). After this migration, backup/restore procedures will preserve salts to maintain data integrity.

---

## Current Implementation Analysis

### Hash Function
- **Location**: `app/services/subHasher.js`
- **Algorithm**: Simple SHA-256 without salt
- **Output**: 64-character hex string

```javascript
export function hashSub(sub) {
  return crypto.createHash("sha256").update(sub).digest("hex");
}
```

### Usage Locations

#### DynamoDB Tables (all use `hashedSub` as partition key)
1. **receipts** - PK: `hashedSub`, SK: `receiptId`
2. **bundles** - PK: `hashedSub`, SK: `bundleId`
3. **hmrc-api-requests** - PK: `hashedSub`, SK: `requestId`
4. **bundle-post-async-requests** - PK: `hashedSub`, SK: `requestId`
5. **bundle-delete-async-requests** - PK: `hashedSub`, SK: `requestId`
6. **hmrc-vat-return-post-async-requests** - PK: `hashedSub`, SK: `requestId`
7. **hmrc-vat-return-get-async-requests** - PK: `hashedSub`, SK: `requestId`
8. **hmrc-vat-obligation-get-async-requests** - PK: `hashedSub`, SK: `requestId`

#### Application Code
- `app/data/dynamoDbReceiptRepository.js` - Line 4, 35
- `app/data/dynamoDbBundleRepository.js` - Line 4, 35
- `app/data/dynamoDbHmrcApiRequestRepository.js` - Line 4
- `app/data/dynamoDbAsyncRequestRepository.js` - Line 4

#### Admin Scripts
- `scripts/export-dynamodb-for-test-users.js` - Line 27
- `scripts/export-user-data.js` - Line 19 (newly created)
- `scripts/delete-user-data.js` - Line 20 (newly created)

#### Test Infrastructure
- `behaviour-tests/helpers/dynamodb-assertions.js`
- `behaviour-tests/helpers/dynamodb-export.js`
- `app/test-helpers/dynamodbExporter.js` - Line 7
- Multiple system and unit tests

#### AWS CDK Infrastructure
- `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java` - Lines 73, 92 (table schema definitions)
- All Lambda functions inherit environment variables from stacks

---

## Migration Architecture

### Salt Properties

**Requirements**:
- Unique per environment (ci, prod)
- Cryptographically secure (high entropy)
- Persistent across stack deletions
- Retrievable for disaster recovery
- Not stored in Git or code

**Storage**: AWS Secrets Manager
- **Naming**: `{environment-name}/submit/sub-hash-salt`
- **Example**:
  - `ci/submit/sub-hash-salt`
  - `prod/submit/sub-hash-salt`

**Format**: Base64-encoded 512-bit (64-byte) random value
- High entropy ensures rainbow table attacks infeasible
- HMAC-SHA256 with this salt provides strong security

### Why AWS Secrets Manager?

1. **Survives stack deletion** - Secrets have independent lifecycle from CloudFormation
2. **Automatic rotation capable** - Though not needed for this use case
3. **Access control** - IAM policies control which Lambdas can read
4. **Audit trail** - CloudTrail logs all access
5. **Encryption at rest** - Encrypted with KMS
6. **Cross-region replication** - Available for DR scenarios
7. **Versioning** - Keeps history of changes (though salt should never change)

---

## Implementation Plan

### Phase 1: Salt Generation in CI/CD Pipeline

**File**: `.github/workflows/deploy-environment.yml`

**Location**: Add new step in `create-secrets` job (after HMRC secrets, before deploy jobs)

```yaml
- name: Generate or retrieve sub hash salt
  run: |
    SALT_SECRET_NAME="${{ needs.names.outputs.environment-name }}/submit/sub-hash-salt"
    SALT_ARN="arn:aws:secretsmanager:${{ env.AWS_REGION }}:${{ env.AWS_ACCOUNT_ID }}:secret:${SALT_SECRET_NAME}"

    echo "Checking for existing salt: $SALT_SECRET_NAME"

    # Try to retrieve existing salt (supports restore scenarios)
    if aws secretsmanager describe-secret --secret-id "$SALT_ARN" 2>/dev/null; then
      echo "✅ Salt already exists for environment ${{ needs.names.outputs.environment-name }}"
      echo "   ARN: $SALT_ARN"
      echo "   This salt will be reused (critical for data integrity)"
    else
      echo "🔐 Creating new salt for environment ${{ needs.names.outputs.environment-name }}"

      # Generate cryptographically secure 512-bit (64-byte) salt
      SALT=$(openssl rand -base64 64 | tr -d '\n')

      # Create secret with protective tags
      aws secretsmanager create-secret \
        --name "$SALT_SECRET_NAME" \
        --description "User sub hash salt for ${{ needs.names.outputs.environment-name }} - CRITICAL: DO NOT DELETE - Required for user data access" \
        --secret-string "$SALT" \
        --region ${{ env.AWS_REGION }} \
        --tags \
          Key=Environment,Value=${{ needs.names.outputs.environment-name }} \
          Key=Purpose,Value=SubHashSalt \
          Key=Criticality,Value=High \
          Key=ManagedBy,Value=GitHub-Actions \
          Key=DoNotDelete,Value=true

      echo "✅ Salt created successfully"
      echo "   ARN: $SALT_ARN"
      echo "   ⚠️  IMPORTANT: This salt is now required for all user data access"
    fi

    # Output for downstream jobs
    echo "SALT_ARN=$SALT_ARN" >> $GITHUB_OUTPUT
  id: salt-setup
```

**Key Features**:
- **Idempotent**: Safe to run multiple times, won't recreate if exists
- **Tagged for protection**: Clear tags warn against deletion
- **Supports restore**: Checks for existing salt first (restore from backup scenario)
- **Audit trail**: All operations logged to CloudTrail

---

### Phase 2: Update Hash Implementation

#### 2.1 Update `app/services/subHasher.js`

Replace entire file:

```javascript
// app/services/subHasher.js

import crypto from "crypto";

/**
 * Hash a user sub claim with HMAC-SHA256 using environment-specific salt.
 *
 * This provides stronger security than unsalted SHA-256 by making rainbow table
 * attacks infeasible. The salt is unique per environment and stored in AWS Secrets Manager.
 *
 * @param {string} sub - User sub claim to hash (e.g., from JWT or OAuth token)
 * @param {string} [salt] - Optional salt override (for testing only). If not provided,
 *                          uses SUB_HASH_SALT environment variable.
 * @returns {string} - Hex-encoded HMAC-SHA256 hash (64 characters)
 * @throws {Error} If sub is invalid or salt is not available
 *
 * @example
 * const hashedSub = hashSub("google-oauth2|123456789");
 * // Returns: "a1b2c3d4..." (64 hex chars)
 */
export function hashSub(sub, salt = null) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }

  const actualSalt = salt || process.env.SUB_HASH_SALT;

  if (!actualSalt || typeof actualSalt !== "string" || actualSalt.length === 0) {
    throw new Error(
      "SUB_HASH_SALT environment variable is required. " +
      "For local dev, set in .env.proxy. " +
      "For Lambda, ensure secret is passed from CDK stack."
    );
  }

  // Use HMAC-SHA256 with salt for cryptographically strong hashing
  // HMAC prevents length extension attacks and binds hash to the salt
  return crypto.createHmac("sha256", actualSalt).update(sub).digest("hex");
}

/**
 * Legacy unsalted hash function - DO NOT USE IN NEW CODE
 *
 * This function is kept temporarily for:
 * 1. Understanding old hash values during migration
 * 2. Migration scripts that need to compare old vs new hashes
 *
 * @deprecated Will be removed after migration is complete
 * @param {string} sub - User sub claim
 * @returns {string} - Unsalted SHA-256 hash
 */
export function hashSubLegacy(sub) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }
  return crypto.createHash("sha256").update(sub).digest("hex");
}
```

**Changes**:
- Uses `crypto.createHmac()` instead of `crypto.createHash()`
- Requires salt from environment variable
- Clear error messages for missing salt
- Keeps legacy function for reference (will be removed later)

#### 2.2 Update `app/unit-tests/services/subHasher.test.js`

Replace entire file:

```javascript
// app/unit-tests/services/subHasher.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { hashSub, hashSubLegacy } from "@app/services/subHasher.js";

describe("subHasher.js - salted HMAC-SHA256", () => {
  const TEST_SALT = "test-salt-for-unit-tests-DO-NOT-USE-IN-PRODUCTION";
  const ORIGINAL_ENV = process.env.SUB_HASH_SALT;

  beforeEach(() => {
    process.env.SUB_HASH_SALT = TEST_SALT;
  });

  afterEach(() => {
    if (ORIGINAL_ENV !== undefined) {
      process.env.SUB_HASH_SALT = ORIGINAL_ENV;
    } else {
      delete process.env.SUB_HASH_SALT;
    }
  });

  describe("hashSub (salted)", () => {
    test("should hash a sub claim to a 64-character hex string", () => {
      const sub = "user-12345";
      const hashed = hashSub(sub);

      expect(hashed).toBeDefined();
      expect(typeof hashed).toBe("string");
      expect(hashed).toMatch(/^[a-f0-9]{64}$/); // HMAC-SHA256 produces 64 hex characters
    });

    test("should produce consistent hashes for the same input with same salt", () => {
      const sub = "user-12345";
      const hash1 = hashSub(sub);
      const hash2 = hashSub(sub);

      expect(hash1).toBe(hash2);
    });

    test("should produce different hashes for different inputs", () => {
      const sub1 = "user-12345";
      const sub2 = "user-67890";
      const hash1 = hashSub(sub1);
      const hash2 = hashSub(sub2);

      expect(hash1).not.toBe(hash2);
    });

    test("should produce different hash than legacy unsalted version", () => {
      const sub = "user-12345";
      const saltedHash = hashSub(sub);
      const unsaltedHash = hashSubLegacy(sub);

      expect(saltedHash).not.toBe(unsaltedHash);
    });

    test("should produce different hashes with different salts", () => {
      const sub = "user-12345";
      const hash1 = hashSub(sub, "salt1");
      const hash2 = hashSub(sub, "salt2");

      expect(hash1).not.toBe(hash2);
    });

    test("should accept explicit salt parameter (for testing)", () => {
      const sub = "user-12345";
      const customSalt = "custom-test-salt";
      const hashed = hashSub(sub, customSalt);

      expect(hashed).toMatch(/^[a-f0-9]{64}$/);

      // Verify it uses the custom salt
      const hashedAgain = hashSub(sub, customSalt);
      expect(hashed).toBe(hashedAgain);
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

    test("should throw error if SUB_HASH_SALT not set and no explicit salt", () => {
      delete process.env.SUB_HASH_SALT;
      expect(() => hashSub("user-12345")).toThrow("SUB_HASH_SALT environment variable is required");
    });

    test("should throw error if SUB_HASH_SALT is empty string", () => {
      process.env.SUB_HASH_SALT = "";
      expect(() => hashSub("user-12345")).toThrow("SUB_HASH_SALT environment variable is required");
    });
  });

  describe("hashSubLegacy (deprecated)", () => {
    test("should still work for backward compatibility", () => {
      const sub = "user-12345";
      const hashed = hashSubLegacy(sub);

      expect(hashed).toMatch(/^[a-f0-9]{64}$/);
    });

    test("should not require salt", () => {
      delete process.env.SUB_HASH_SALT;
      const sub = "user-12345";
      const hashed = hashSubLegacy(sub);

      expect(hashed).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
```

**Test Coverage**:
- Normal operation with salt from environment
- Custom salt override for testing
- All error conditions
- Comparison with legacy function
- Salt variations produce different hashes

---

### Phase 3: Infrastructure Updates (AWS CDK)

#### 3.1 Update All Stack Files

**Files to modify**:
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java`
- `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java`
- Any other stack that creates Lambdas using `hashSub`

**Add at top of class** (after other imports):

```java
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
```

**Add in constructor** (before creating Lambdas):

```java
// Lookup sub hash salt secret (created by GitHub Actions)
// This salt is critical for user data integrity - must persist across stack deletions
ISecret subHashSalt = Secret.fromSecretNameV2(
    this,
    "SubHashSalt-%s".formatted(props.deploymentName()),
    "%s/submit/sub-hash-salt".formatted(props.envName())
);

infof("Using sub hash salt from secret: %s", subHashSalt.getSecretName());
```

**For each Lambda environment map**, add:

```java
var lambdaEnv = new PopulatedMap<String, String>()
    .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
    .with("SUB_HASH_SALT_ARN", subHashSalt.getSecretArn());  // ADD THIS LINE
```

**Grant Lambda read access to secret** (after Lambda creation):

```java
// Grant Lambda permission to read sub hash salt
subHashSalt.grantRead(myLambda.ingestLambda);
```

**Example full pattern** (in AccountStack.java bundleGet Lambda):

```java
// Lookup sub hash salt
ISecret subHashSalt = Secret.fromSecretNameV2(
    this,
    "SubHashSalt-%s".formatted(props.deploymentName()),
    "%s/submit/sub-hash-salt".formatted(props.envName())
);

// Add to environment
var getBundlesLambdaEnv = new PopulatedMap<String, String>()
    .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
    .with("SUB_HASH_SALT_ARN", subHashSalt.getSecretArn());

// Create Lambda
var getBundlesAsyncLambda = new ApiLambda(this, ApiLambdaProps.builder()
    // ... other props ...
    .environment(getBundlesLambdaEnv)
    .build());

// Grant secret read access
subHashSalt.grantRead(getBundlesAsyncLambda.ingestLambda);
```

#### 3.2 Create Salt Fetcher Utility

**New file**: `app/lib/saltFetcher.js`

```javascript
// app/lib/saltFetcher.js

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/saltFetcher.js" });

let __secretsManagerClient = null;
let __cachedSalt = null;
let __saltPromise = null;

function getSecretsManagerClient() {
  if (!__secretsManagerClient) {
    __secretsManagerClient = new SecretsManagerClient({
      region: process.env.AWS_REGION || "eu-west-2",
    });
  }
  return __secretsManagerClient;
}

/**
 * Fetch sub hash salt from environment or AWS Secrets Manager.
 *
 * For local development: Uses SUB_HASH_SALT environment variable directly.
 * For Lambda: Fetches from Secrets Manager using SUB_HASH_SALT_ARN.
 *
 * Result is cached for the lifetime of the Lambda container (warm starts).
 *
 * @returns {Promise<string>} The salt value
 * @throws {Error} If salt cannot be retrieved
 */
export async function getSalt() {
  // Return cached value if available (Lambda container reuse)
  if (__cachedSalt) {
    return __cachedSalt;
  }

  // Prevent multiple concurrent fetches (Lambda may have concurrent requests)
  if (__saltPromise) {
    return __saltPromise;
  }

  __saltPromise = (async () => {
    try {
      // Local development: Use environment variable directly
      if (process.env.SUB_HASH_SALT) {
        logger.info("Using SUB_HASH_SALT from environment variable (local dev)");
        __cachedSalt = process.env.SUB_HASH_SALT;
        return __cachedSalt;
      }

      // Lambda: Fetch from Secrets Manager
      const secretArn = process.env.SUB_HASH_SALT_ARN;
      if (!secretArn) {
        throw new Error(
          "Neither SUB_HASH_SALT nor SUB_HASH_SALT_ARN environment variable is set. " +
          "For local dev, set SUB_HASH_SALT in .env file. " +
          "For Lambda, ensure CDK stack passes SUB_HASH_SALT_ARN."
        );
      }

      logger.info({ secretArn }, "Fetching sub hash salt from Secrets Manager");

      const client = getSecretsManagerClient();
      const response = await client.send(
        new GetSecretValueCommand({ SecretId: secretArn })
      );

      if (!response.SecretString) {
        throw new Error(`Secret ${secretArn} exists but has no SecretString value`);
      }

      __cachedSalt = response.SecretString;
      logger.info("Successfully fetched and cached sub hash salt");

      return __cachedSalt;
    } catch (error) {
      logger.error({ error }, "Failed to fetch sub hash salt");
      __saltPromise = null; // Clear promise so next call will retry
      throw new Error(`Failed to fetch sub hash salt: ${error.message}`);
    }
  })();

  return __saltPromise;
}

/**
 * Clear cached salt (for testing only).
 * @private
 */
export function __clearCacheForTesting() {
  __cachedSalt = null;
  __saltPromise = null;
}
```

#### 3.3 Update `app/services/subHasher.js` to Support Async Salt Fetching

**Replace with**:

```javascript
// app/services/subHasher.js

import crypto from "crypto";
import { getSalt } from "../lib/saltFetcher.js";

/**
 * Hash a user sub claim with HMAC-SHA256 using environment-specific salt (async version).
 *
 * This is the preferred method for Lambda functions as it fetches salt from Secrets Manager.
 *
 * @param {string} sub - User sub claim to hash
 * @returns {Promise<string>} - Hex-encoded HMAC-SHA256 hash
 */
export async function hashSubAsync(sub) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }

  const salt = await getSalt();
  return crypto.createHmac("sha256", salt).update(sub).digest("hex");
}

/**
 * Hash a user sub claim with HMAC-SHA256 using environment-specific salt (sync version).
 *
 * Only works when SUB_HASH_SALT is directly in environment (local dev, tests).
 * Use hashSubAsync() in Lambda functions.
 *
 * @param {string} sub - User sub claim to hash
 * @param {string} [salt] - Optional salt override (for testing only)
 * @returns {string} - Hex-encoded HMAC-SHA256 hash
 */
export function hashSub(sub, salt = null) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }

  const actualSalt = salt || process.env.SUB_HASH_SALT;

  if (!actualSalt || typeof actualSalt !== "string" || actualSalt.length === 0) {
    throw new Error(
      "SUB_HASH_SALT environment variable is required for sync hashing. " +
      "For Lambda, use hashSubAsync() instead. " +
      "For local dev, set SUB_HASH_SALT in .env file."
    );
  }

  return crypto.createHmac("sha256", actualSalt).update(sub).digest("hex");
}

/**
 * Legacy unsalted hash function - DO NOT USE
 * @deprecated
 */
export function hashSubLegacy(sub) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }
  return crypto.createHash("sha256").update(sub).digest("hex");
}
```

#### 3.4 Update Repository Files to Use Async Version

**Example**: `app/data/dynamoDbBundleRepository.js`

```javascript
// Change from:
import { hashSub } from "../services/subHasher.js";
const hashedSub = hashSub(userId);

// To:
import { hashSubAsync } from "../services/subHasher.js";
const hashedSub = await hashSubAsync(userId);
```

**Files to update**:
- `app/data/dynamoDbReceiptRepository.js`
- `app/data/dynamoDbBundleRepository.js`
- `app/data/dynamoDbHmrcApiRequestRepository.js`
- `app/data/dynamoDbAsyncRequestRepository.js`

---

### Phase 4: Local Development Environment

#### 4.1 Update `.env.proxy`

Add after existing variables:

```bash
# Sub hash salt for local development (NEVER use this value in production!)
SUB_HASH_SALT=local-dev-salt-for-proxy-testing-DO-NOT-USE-IN-PRODUCTION-f8a7b6c5d4e3
```

#### 4.2 Update `.env.ci` Template

```bash
# Sub hash salt is managed by GitHub Actions and stored in AWS Secrets Manager
# For local CI testing only (if needed):
# SUB_HASH_SALT=ci-test-salt-local-only
```

#### 4.3 Validate Environment Variables

**Update** `app/bin/server.js` (after other validateEnv calls):

```javascript
// Validate salt is present for local server
const requiredVars = [
  "DIY_SUBMIT_BASE_URL",
  "SUB_HASH_SALT",  // ADD THIS
];
validateEnv(requiredVars, "server");
```

---

### Phase 5: Update Admin Scripts

#### 5.1 Update `scripts/export-user-data.js`

**Add at top**:

```javascript
// Validate salt is available
if (!process.env.SUB_HASH_SALT) {
  console.error("❌ Error: SUB_HASH_SALT environment variable is required");
  console.error("");
  console.error("For local use, set in your environment:");
  console.error("  export SUB_HASH_SALT=$(aws secretsmanager get-secret-value --secret-id prod/submit/sub-hash-salt --query SecretString --output text)");
  console.error("");
  console.error("Or run with dotenv:");
  console.error("  npx dotenv -e .env.proxy -- node scripts/export-user-data.js ...");
  process.exit(1);
}
```

#### 5.2 Update `scripts/delete-user-data.js`

**Add same validation as above**

#### 5.3 Update `scripts/export-dynamodb-for-test-users.js`

**Add same validation**

---

### Phase 6: Update Test Infrastructure

#### 6.1 Update Behaviour Test Helpers

**File**: `behaviour-tests/helpers/behaviour-helpers.js`

Add new helper function:

```javascript
/**
 * Get sub hash salt for tests
 * @returns {string}
 */
export function getTestSalt() {
  return process.env.SUB_HASH_SALT || "behaviour-test-salt-DO-NOT-USE-IN-PROD";
}

/**
 * Ensure test salt is set
 */
export function ensureTestSalt() {
  if (!process.env.SUB_HASH_SALT) {
    process.env.SUB_HASH_SALT = getTestSalt();
  }
}
```

#### 6.2 Update Behaviour Test Setup

**In each behaviour test file**, add near top (after imports):

```javascript
import { ensureTestSalt } from "./helpers/behaviour-helpers.js";

// Ensure salt is available for tests
ensureTestSalt();
```

---

### Phase 7: Documentation Updates

#### 7.1 Update `PRIVACY_DUTIES.md`

Add new section after "Data Retention Management":

```markdown
## Salt Management (Critical Security Asset)

### Overview
User sub claims are hashed using HMAC-SHA256 with environment-specific salts. These salts are stored in AWS Secrets Manager and are **critical** for accessing user data. Loss of salt = loss of all user data.

### Salt Locations
- **CI Environment**: `arn:aws:secretsmanager:eu-west-2:887764105431:secret:ci/submit/sub-hash-salt`
- **Prod Environment**: `arn:aws:secretsmanager:eu-west-2:887764105431:secret:prod/submit/sub-hash-salt`

### Backup Procedures (Critical - Do Quarterly)

1. **Backup salts to secure location**:
   ```bash
   # Run from project root
   ./scripts/backup-salts.sh
   ```

2. **Store encrypted backup in 1Password**:
   - Create secure note: "Submit DIY Accounting - Environment Salts"
   - Attach JSON file from backup script
   - Tag with: `infrastructure`, `critical`, `disaster-recovery`

3. **Verify backup readable**:
   ```bash
   cat salt-backup-YYYYMMDD.json | jq .
   ```

### Disaster Recovery Procedures

If environment is deleted and needs restoration from backup:

1. **CRITICAL**: Salt must be restored to Secrets Manager **before** deploying stack
2. **DO NOT** let GitHub Actions generate new salt (will make existing data inaccessible)
3. **Restore process**:
   ```bash
   # Retrieve salt from 1Password backup
   SALT=$(jq -r '.prod_salt' salt-backup.json)

   # Restore to AWS Secrets Manager
   aws secretsmanager create-secret \
     --name "prod/submit/sub-hash-salt" \
     --secret-string "$SALT" \
     --description "RESTORED from backup - User sub hash salt - DO NOT DELETE" \
     --region eu-west-2
   ```

4. **Verify** hash matches for known test user before deploying to production

### Security Guidelines

- **Never** commit salt to Git
- **Never** log salt value
- **Never** regenerate salt if users exist (will orphan all data)
- **Always** use Secrets Manager for ci/prod (not environment variables)
- **Test** salt backup/restore procedure annually

### Access Control

- Salts are readable by:
  - All Lambdas in the environment (via IAM role)
  - GitHub Actions deployment role
  - AWS administrators with SecretsManager:GetSecretValue permission

- Tag all salts with:
  - `DoNotDelete=true`
  - `Criticality=High`
  - `Purpose=SubHashSalt`
```

#### 7.2 Update `README.md`

Add to "Environment Variables" section:

```markdown
### Security Configuration

#### Sub Hash Salt (Required)

User sub claims are hashed using HMAC-SHA256 with environment-specific salts.

**Local Development**:
```bash
# .env.proxy
SUB_HASH_SALT=local-dev-salt-DO-NOT-USE-IN-PRODUCTION
```

**AWS Environments**:
- Managed by AWS Secrets Manager
- Created automatically by GitHub Actions on first deployment
- Never deleted (persists across stack deletions)
- Location: `{environment}/submit/sub-hash-salt`

**Important**:
- DO NOT regenerate salt after users exist
- Backup salt quarterly (see PRIVACY_DUTIES.md)
- Required for disaster recovery
```

#### 7.3 Create Salt Backup Script

**New file**: `scripts/backup-salts.sh`

```bash
#!/usr/bin/env bash
# scripts/backup-salts.sh
# Backup sub hash salts from AWS Secrets Manager

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="salt-backup-${TIMESTAMP}.json"
REGION="${AWS_REGION:-eu-west-2}"

echo "🔐 Backing up sub hash salts from AWS Secrets Manager"
echo ""

# Get list of all sub hash salt secrets
SECRETS=$(aws secretsmanager list-secrets \
  --region "$REGION" \
  --filters Key=tag-key,Values=Purpose Key=tag-value,Values=SubHashSalt \
  --query 'SecretList[*].Name' \
  --output json)

if [ "$SECRETS" == "[]" ]; then
  echo "⚠️  No sub hash salt secrets found"
  echo "   This is expected if you haven't deployed yet"
  exit 0
fi

echo "Found secrets:"
echo "$SECRETS" | jq -r '.[]' | sed 's/^/  - /'
echo ""

# Create backup JSON
echo "{" > "$OUTPUT_FILE"
echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$OUTPUT_FILE"
echo "  \"region\": \"$REGION\"," >> "$OUTPUT_FILE"
echo "  \"salts\": {" >> "$OUTPUT_FILE"

FIRST=true
for SECRET_NAME in $(echo "$SECRETS" | jq -r '.[]'); do
  if [ "$FIRST" = false ]; then
    echo "," >> "$OUTPUT_FILE"
  fi
  FIRST=false

  echo "  Backing up: $SECRET_NAME"

  # Get secret value
  SECRET_VALUE=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --region "$REGION" \
    --query SecretString \
    --output text)

  # Get secret metadata
  SECRET_ARN=$(aws secretsmanager describe-secret \
    --secret-id "$SECRET_NAME" \
    --region "$REGION" \
    --query ARN \
    --output text)

  # Add to JSON (escape secret value properly)
  echo -n "    \"$SECRET_NAME\": {" >> "$OUTPUT_FILE"
  echo -n "\"arn\": \"$SECRET_ARN\", " >> "$OUTPUT_FILE"
  echo -n "\"value\": $(echo "$SECRET_VALUE" | jq -Rs .)}" >> "$OUTPUT_FILE"
done

echo "" >> "$OUTPUT_FILE"
echo "  }" >> "$OUTPUT_FILE"
echo "}" >> "$OUTPUT_FILE"

echo ""
echo "✅ Backup complete: $OUTPUT_FILE"
echo ""
echo "📋 Next steps:"
echo "   1. Review the backup file"
echo "   2. Store in 1Password or other secure encrypted storage"
echo "   3. DO NOT commit to Git"
echo "   4. Test restore procedure in non-prod environment"
echo ""
echo "⚠️  IMPORTANT: This file contains sensitive secrets - handle with care!"
```

Make executable:
```bash
chmod +x scripts/backup-salts.sh
```

---

### Phase 8: Update .gitignore

Add to `.gitignore`:

```
# Salt backups (sensitive!)
salt-backup-*.json
```

---

## Migration Execution Plan

### Pre-Migration Checklist

- [ ] All code changes committed to `saltedhash` branch
- [ ] Unit tests pass locally
- [ ] Behaviour tests run with test salt
- [ ] CDK synth succeeds
- [ ] Backup script tested
- [ ] Documentation reviewed

### Execution Steps

#### Step 1: Merge and Deploy (CI Environment First)

```bash
# 1. Ensure on saltedhash branch
git status

# 2. Run tests
npm test
npm run test:unit

# 3. Create PR
git push -u origin saltedhash
# Create PR on GitHub, review, merge to main

# 4. GitHub Actions will:
#    - Generate salt for 'ci' environment (first time)
#    - Deploy updated Lambdas with salt support
#    - Existing data becomes inaccessible (expected - no live users yet)
```

#### Step 2: Verify CI Deployment

```bash
# Check salt was created
aws secretsmanager describe-secret \
  --secret-id ci/submit/sub-hash-salt \
  --region eu-west-2

# Check Lambda has environment variable
aws lambda get-function-configuration \
  --function-name ci-bundleGet \
  --region eu-west-2 \
  --query 'Environment.Variables.SUB_HASH_SALT_ARN'

# Test with new user
npm run test:complianceBehaviour-ci
```

#### Step 3: Deploy to Prod

```bash
# Merge main to prod branch (or tag for release)
# GitHub Actions deploys to prod environment

# Verify prod salt
aws secretsmanager describe-secret \
  --secret-id prod/submit/sub-hash-salt \
  --region eu-west-2
```

#### Step 4: Backup Salts

```bash
# Immediately after prod deployment
./scripts/backup-salts.sh

# Store in 1Password
# Verify backup is readable
cat salt-backup-*.json | jq .
```

#### Step 5: Test Data Operations

```bash
# Create test user and verify:
# 1. User can create bundle
# 2. Bundle is stored with new salted hash
# 3. User can retrieve bundle
# 4. Admin scripts work with new hash

# Export test user data
npx dotenv -e .env.prod -- \
  node scripts/export-user-data.js prod <test-user-sub>

# Verify export contains data
cat user-data-export-*.json | jq .
```

### Post-Migration Verification

- [ ] CI environment accessible with new users
- [ ] Prod environment accessible with new users
- [ ] Salts backed up to 1Password
- [ ] Admin scripts work (export/delete)
- [ ] Behaviour tests pass
- [ ] No errors in Lambda logs
- [ ] Salt secrets tagged correctly in AWS

---

## Rollback Plan

If critical issues discovered:

### Option 1: Revert Code (Data Loss Acceptable)

```bash
# Revert to previous commit
git revert <migration-commit-hash>
git push

# Salts remain in Secrets Manager (no harm)
# New deployment will ignore them
# Users created during salted period will be inaccessible (acceptable per requirements)
```

### Option 2: Keep Salts, Fix Bugs

```bash
# Salts are created, keep them
# Fix bugs in code
# Redeploy

# Data created during salted period remains accessible
```

---

## Long-Term Maintenance

### Quarterly Tasks

1. **Backup salts** (see scripts/backup-salts.sh)
2. **Verify backup restoration procedure** in test environment
3. **Review IAM permissions** on Secrets Manager
4. **Check CloudTrail logs** for unexpected secret access

### Annual Tasks

1. **Disaster recovery drill**:
   - Delete CI environment
   - Restore from backup using backed-up salt
   - Verify test user data accessible

2. **Security review**:
   - Rotate AWS credentials with secret access
   - Review who has Secrets Manager permissions
   - Update backup storage location password

### Never Do

- ❌ Delete salt secrets from Secrets Manager
- ❌ Regenerate salt after users exist
- ❌ Commit salt values to Git
- ❌ Log salt values in application logs
- ❌ Use same salt across environments (ci and prod must differ)

---

## Success Criteria

- ✅ Salt generated and stored in Secrets Manager for both ci and prod
- ✅ All Lambdas can fetch and use salt
- ✅ New users can be created and access their data
- ✅ Admin scripts work with salted hashes
- ✅ Salts backed up to secure location
- ✅ Behaviour tests pass
- ✅ Documentation complete
- ✅ No unsalted hashSub() calls remain in production code
- ✅ Disaster recovery procedure tested in CI

---

## Timeline Estimate

- **Code changes**: 4-6 hours
- **Testing**: 2-3 hours
- **CI deployment & verification**: 1 hour
- **Prod deployment & verification**: 1 hour
- **Documentation & backup**: 1 hour

**Total**: 1-2 days

---

## Benefits After Migration

1. **Security**: Rainbow table attacks infeasible
2. **Compliance**: Meets security best practices
3. **Disaster Recovery**: Salts survive stack deletion
4. **Environment Isolation**: Each environment has unique salt
5. **Audit Trail**: All secret access logged in CloudTrail
6. **Zero-Trust**: Secrets never in code or environment variables
