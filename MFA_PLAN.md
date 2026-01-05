# MFA Implementation Plan (Phase 1, Step 1.1)

**Issue**: #442 - Gov-Client-Multi-Factor header not yet implemented
**Priority**: Critical - Blocks HMRC production approval
**Status**: Not started
**Parent Document**: HMRC_MTD_APPROVAL_PLAN.md

---

## Overview

Implement Multi-Factor Authentication (MFA) using Cognito TOTP and ensure the `Gov-Client-Multi-Factor` fraud prevention header is sent with all HMRC API requests. This is a mandatory requirement for HMRC MTD VAT production approval.

---

## HMRC Requirements

### Gov-Client-Multi-Factor Header Specification

```
Gov-Client-Multi-Factor: type=TOTP&timestamp=<ISO8601>&unique-reference=<session-id>
```

**Required Fields**:
- `type`: MFA type - use `TOTP` (authenticator app), `AUTH_CODE` (SMS), or `OTHER`
- `timestamp`: ISO 8601 timestamp when MFA was verified (e.g., `2026-01-05T12:34:56Z`)
- `unique-reference`: Unique identifier for the MFA session (Cognito session ID or UUID)

**When to send**:
- Include header on **all** HMRC API calls when user has completed MFA
- Omit header when user has not completed MFA (e.g., MFA not enforced)

**HMRC Reference**: [Fraud Prevention Headers Specification](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/)

---

## Implementation Steps

### Step 1: Enable MFA in Cognito User Pool

**File**: `infra/main/java/co/uk/diyaccounting/submit/SubmitApplicationStack.java`

Update Cognito User Pool configuration:

```java
UserPool.Builder.create(this, "SubmitUserPool")
    .userPoolName(deploymentName + "-submit-users")
    // ... existing config ...
    .mfa(Mfa.REQUIRED)  // Enforce MFA for all users
    .mfaSecondFactor(MfaSecondFactor.builder()
        .otp(true)   // Enable TOTP (authenticator apps)
        .sms(false)  // Disable SMS MFA (optional: enable if needed)
        .build())
    .build();
```

**Testing**: After deployment, verify MFA is enforced:
```bash
# CI environment
aws cognito-idp describe-user-pool \
  --user-pool-id <ci-user-pool-id> \
  --region eu-west-2 \
  --query 'UserPool.MfaConfiguration'

# Should return: "ON"
```

---

### Step 2: Update Frontend to Collect MFA Metadata

**File**: `web/public/submit.js`

#### 2.1: Store MFA Verification Data in Session

After successful MFA verification, store timestamp and session ID:

```javascript
// In Cognito authentication flow (after MFA challenge completion)
async function handleMfaVerification(cognitoUser, mfaCode) {
  // Complete MFA challenge
  const session = await cognitoUser.sendMFACode(mfaCode);

  // Store MFA metadata in sessionStorage
  const mfaMetadata = {
    type: 'TOTP',
    timestamp: new Date().toISOString(),
    sessionId: session.getAccessToken().getJwtToken().split('.')[2].substring(0, 16), // Use part of token as unique ref
    verified: true
  };

  sessionStorage.setItem('mfaMetadata', JSON.stringify(mfaMetadata));

  return session;
}
```

#### 2.2: Generate Gov-Client-Multi-Factor Header

Update fraud prevention header collection (currently commented out around line 405):

```javascript
// Gov-Client-Multi-Factor: Must include timestamp and unique-reference
let govClientMultiFactorHeader = null;

try {
  const mfaMetadataStr = sessionStorage.getItem('mfaMetadata');
  if (mfaMetadataStr) {
    const mfaMetadata = JSON.parse(mfaMetadataStr);

    if (mfaMetadata.verified) {
      const type = mfaMetadata.type || 'TOTP';
      const timestamp = mfaMetadata.timestamp;
      const uniqueRef = mfaMetadata.sessionId || crypto.randomUUID();

      govClientMultiFactorHeader = `type=${type}&timestamp=${encodeURIComponent(timestamp)}&unique-reference=${encodeURIComponent(uniqueRef)}`;
    }
  }
} catch (err) {
  console.warn('Failed to generate Gov-Client-Multi-Factor header:', err);
  // Omit header if we can't generate it properly
}
```

#### 2.3: Include Header in HMRC API Requests

Ensure the header is passed with fraud prevention headers:

```javascript
const fraudPreventionHeaders = {
  'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
  // ... other headers ...
};

if (govClientMultiFactorHeader) {
  fraudPreventionHeaders['Gov-Client-Multi-Factor'] = govClientMultiFactorHeader;
}

return fraudPreventionHeaders;
```

---

### Step 3: Update Backend to Forward MFA Header

**File**: `app/functions/hmrc/hmrcVatReturnPost.js` (and similar for other HMRC endpoints)

Ensure the MFA header from client is forwarded to HMRC:

```javascript
// In buildHmrcHeaders or similar function
const fraudPreventionHeaders = buildFraudHeaders(event);

// Gov-Client-Multi-Factor is already collected by buildFraudHeaders
// Verify it's being passed through to HMRC API call

const hmrcHeaders = {
  'Authorization': `Bearer ${hmrcAccessToken}`,
  'Content-Type': 'application/json',
  'Accept': 'application/vnd.hmrc.1.0+json',
  ...fraudPreventionHeaders  // Includes Gov-Client-Multi-Factor if present
};

await hmrcHttpPost(url, body, hmrcHeaders);
```

**File**: `app/lib/buildFraudHeaders.js`

Verify MFA header is extracted from request:

```javascript
export function buildFraudHeaders(event) {
  const headers = event.headers || {};

  return {
    'Gov-Client-Connection-Method': headers['gov-client-connection-method'],
    'Gov-Client-Public-IP': headers['gov-client-public-ip'],
    // ... other headers ...
    'Gov-Client-Multi-Factor': headers['gov-client-multi-factor'], // Add this
  };
}
```

---

### Step 4: Handle MFA Setup Flow for Users

**New File**: `web/public/mfa-setup.html` (or integrate into existing flow)

Create a user-friendly MFA setup experience:

```html
<div id="mfa-setup">
  <h2>Set Up Two-Factor Authentication</h2>
  <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
  <div id="qr-code"></div>
  <p>Or enter this code manually: <code id="totp-secret"></code></p>

  <form id="verify-mfa-form">
    <label>Enter 6-digit code from your app:</label>
    <input type="text" name="mfa-code" pattern="[0-9]{6}" maxlength="6" required />
    <button type="submit">Verify</button>
  </form>
</div>
```

**JavaScript** (in submit.js):

```javascript
async function setupMFA() {
  // Get current Cognito user
  const cognitoUser = await getCurrentUser();

  // Associate software token (get secret for QR code)
  const secretCode = await cognitoUser.associateSoftwareToken();

  // Generate QR code
  const qrCodeUrl = `otpauth://totp/DIYAccounting:${cognitoUser.username}?secret=${secretCode}&issuer=DIYAccounting`;
  generateQRCode(qrCodeUrl, '#qr-code');

  // Display secret for manual entry
  document.getElementById('totp-secret').textContent = secretCode;

  // Handle verification
  document.getElementById('verify-mfa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mfaCode = e.target['mfa-code'].value;

    try {
      await cognitoUser.verifySoftwareToken(mfaCode);
      await cognitoUser.setUserMfaPreference({ TOTP: { Enabled: true, PreferredMfa: true } });
      alert('MFA setup successful!');
      window.location.href = 'index.html';
    } catch (err) {
      alert('Invalid code. Please try again.');
    }
  });
}
```

---

### Step 5: Update Tests to Support MFA

#### 5.1: Proxy Environment (Mock MFA)

**File**: `.env.proxy`

```bash
# MFA Testing (Phase 1, Step 1.1)
TEST_MFA_ENABLED=true
TEST_MFA_TYPE=TOTP
TEST_MFA_TIMESTAMP=2026-01-05T12:00:00Z
TEST_MFA_SESSION_ID=test-session-12345
```

**File**: `mock-oauth2-server.json`

Add MFA claims to mock OAuth2 tokens:

```json
{
  "interactiveLogin": true,
  "httpServer": {
    "port": 8080
  },
  "tokenCallbacks": [
    {
      "issuerId": "default",
      "tokenExpiry": 3600,
      "requestMappings": [
        {
          "match": "*",
          "claims": {
            "sub": "user",
            "iss": "http://localhost:8080/default",
            "aud": "client",
            "scope": "openid profile",
            "mfa_verified": true,
            "mfa_timestamp": "2026-01-05T12:00:00Z",
            "mfa_type": "TOTP"
          }
        }
      ]
    }
  ]
}
```

**File**: `behaviour-tests/helpers/behaviour-helpers.js`

Add helper to inject mock MFA metadata:

```javascript
/**
 * Inject mock MFA metadata into page for testing
 */
export async function injectMockMFA(page) {
  if (process.env.TEST_MFA_ENABLED !== 'true') return;

  const mfaMetadata = {
    type: process.env.TEST_MFA_TYPE || 'TOTP',
    timestamp: process.env.TEST_MFA_TIMESTAMP || new Date().toISOString(),
    sessionId: process.env.TEST_MFA_SESSION_ID || crypto.randomUUID(),
    verified: true
  };

  await page.evaluate((metadata) => {
    sessionStorage.setItem('mfaMetadata', JSON.stringify(metadata));
  }, mfaMetadata);

  console.log('[Mock MFA] Injected MFA metadata:', mfaMetadata);
}
```

**File**: `behaviour-tests/auth.behaviour.test.js`

Inject mock MFA after login:

```javascript
await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath);
await verifyLoggedInStatus(page, screenshotPath);

// Inject mock MFA metadata for testing
await injectMockMFA(page);

await consentToDataCollection(page, screenshotPath);
```

#### 5.2: CI/Production Environment (Real Cognito MFA)

**New File**: `behaviour-tests/helpers/cognito-mfa-helper.js`

```javascript
import { CognitoIdentityProviderClient, AdminSetUserMFAPreferenceCommand } from "@aws-sdk/client-cognito-identity-provider";
import { authenticator } from 'otplib'; // npm install otplib

/**
 * Enable MFA for a test user (admin operation)
 */
export async function enableMFAForTestUser(userPoolId, username) {
  const client = new CognitoIdentityProviderClient({ region: 'eu-west-2' });

  await client.send(new AdminSetUserMFAPreferenceCommand({
    UserPoolId: userPoolId,
    Username: username,
    SoftwareTokenMfaSettings: {
      Enabled: true,
      PreferredMfa: true
    }
  }));

  console.log(`[Cognito MFA] Enabled MFA for user ${username}`);
}

/**
 * Generate TOTP code from secret
 */
export function generateTOTPCode(secret) {
  return authenticator.generate(secret);
}

/**
 * Get test user TOTP secret from Secrets Manager
 */
export async function getTestUserTOTPSecret(envName = 'ci') {
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");

  const client = new SecretsManagerClient({ region: 'eu-west-2' });
  const secretName = `${envName}/submit/test-user-totp-secret`;

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  const secret = JSON.parse(response.SecretString);

  return secret.totp_secret;
}
```

**File**: `behaviour-tests/steps/behaviour-login-steps.js`

Update to handle MFA challenge:

```javascript
export async function loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath) {
  // ... existing login code ...

  // Handle MFA challenge if Cognito is configured with MFA
  if (testAuthProvider === 'cognito' && process.env.TEST_MFA_ENABLED === 'true') {
    try {
      // Wait for MFA prompt (timeout if not present)
      await page.waitForSelector('input[name="totp_code"], input[placeholder*="code"]', { timeout: 5000 });

      console.log('[Login] MFA challenge detected, generating TOTP code');

      // Get TOTP secret and generate code
      const envName = process.env.ENVIRONMENT_NAME || 'ci';
      const totpSecret = await getTestUserTOTPSecret(envName);
      const totpCode = generateTOTPCode(totpSecret);

      console.log(`[Login] Generated TOTP code: ${totpCode}`);

      // Enter TOTP code
      await page.fill('input[name="totp_code"], input[placeholder*="code"]', totpCode);
      await page.screenshot({ path: `${screenshotPath}/06-mfa-code-entered.png`, fullPage: true });

      // Submit MFA form
      await page.click('button[type="submit"], input[type="submit"]');

      // Wait for successful redirect
      await page.waitForURL(/.*\/(index\.html|activities)/, { timeout: 10000 });

      console.log('[Login] MFA challenge completed successfully');

    } catch (err) {
      console.log('[Login] No MFA challenge detected or MFA failed:', err.message);
      // Continue - MFA might not be enforced yet
    }
  }
}
```

#### 5.3: Store Test TOTP Secrets

```bash
# CI environment
aws secretsmanager create-secret \
  --name "ci/submit/test-user-totp-secret" \
  --secret-string '{"totp_secret": "JBSWY3DPEHPK3PXP"}' \
  --region eu-west-2

# Production environment (when ready)
aws secretsmanager create-secret \
  --name "prod/submit/test-user-totp-secret" \
  --secret-string '{"totp_secret": "KBSWY3DPEHPK3PXQ"}' \
  --region eu-west-2
```

**Note**: The TOTP secret must be the same one configured for the test user account.

#### 5.4: Update Fraud Prevention Header Assertions

**File**: `behaviour-tests/helpers/dynamodb-assertions.js`

Remove MFA from intentionally omitted list:

```javascript
// Before:
export const intentionallyNotSuppliedHeaders = [
  "gov-client-multi-factor",  // ❌ Remove this line once MFA is implemented
  "gov-vendor-license-ids",
  "gov-client-public-port"
];

// After:
export const intentionallyNotSuppliedHeaders = [
  "gov-vendor-license-ids",
  "gov-client-public-port"
];
```

Add MFA header validation:

```javascript
/**
 * Assert Gov-Client-Multi-Factor header is present and valid
 */
export function assertMfaHeader(hmrcApiRequestsFile) {
  const records = readDynamoDbExport(hmrcApiRequestsFile);

  // Filter authenticated requests (exclude OAuth token calls)
  const authenticatedRequests = records.filter(r =>
    r.url && !r.url.includes('/oauth/token')
  );

  console.log(`[MFA Assertions] Checking ${authenticatedRequests.length} authenticated HMRC API requests for MFA header`);

  authenticatedRequests.forEach((record, index) => {
    const mfaHeader = record.httpRequest?.headers?.['gov-client-multi-factor'];

    // Assert header is present
    expect(mfaHeader, `Request #${index + 1} (${record.url}) missing Gov-Client-Multi-Factor header`).toBeDefined();

    // Parse header
    const params = new URLSearchParams(mfaHeader);

    // Verify required fields
    const type = params.get('type');
    const timestamp = params.get('timestamp');
    const uniqueRef = params.get('unique-reference');

    expect(type, `Request #${index + 1}: MFA type missing`).toBeTruthy();
    expect(['TOTP', 'AUTH_CODE', 'OTHER'].includes(type), `Request #${index + 1}: Invalid MFA type ${type}`).toBe(true);

    expect(timestamp, `Request #${index + 1}: MFA timestamp missing`).toBeTruthy();
    expect(timestamp, `Request #${index + 1}: Invalid timestamp format`).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    expect(uniqueRef, `Request #${index + 1}: MFA unique-reference missing`).toBeTruthy();
    expect(uniqueRef.length, `Request #${index + 1}: unique-reference too short`).toBeGreaterThan(10);

    console.log(`[MFA Assertions] ✓ Request #${index + 1} has valid MFA header: type=${type}, timestamp=${timestamp}`);
  });

  console.log('[MFA Assertions] All authenticated requests have valid Gov-Client-Multi-Factor headers');
}
```

#### 5.5: Create Dedicated MFA Test

**New File**: `behaviour-tests/mfaValidation.behaviour.test.js`

```javascript
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  runLocalSslProxy,
  injectMockMFA,
} from "./helpers/behaviour-helpers.js";
import { goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import { clickLogIn, loginWithCognitoOrMockAuth, verifyLoggedInStatus } from "./steps/behaviour-login-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import { assertMfaHeader } from "./helpers/dynamodb-assertions.js";
import { initSubmitVat, fillInVat, submitFormVat } from "./steps/behaviour-hmrc-vat-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/mfa-validation-test";

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);

test.setTimeout(300_000);

test("Verify Gov-Client-Multi-Factor header implementation", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  // Login
  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath);
  await verifyLoggedInStatus(page, screenshotPath);

  // For proxy mode, inject mock MFA
  await injectMockMFA(page);

  // Make an HMRC API call (submit VAT return)
  await initSubmitVat(page, screenshotPath);
  await fillInVat(page, "123456789", "24A1", "100.00", screenshotPath);
  await submitFormVat(page, screenshotPath);

  // Export DynamoDB tables
  const hmrcApiRequestsTableName = process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME;
  const dynamoEndpoint = process.env.DYNAMODB_ENDPOINT || "http://127.0.0.1:9000";

  await exportAllTables(outputDir, dynamoEndpoint, {
    hmrcApiRequestsTableName,
  });

  // Assert MFA header is present and valid
  const hmrcApiRequestsFile = path.join(outputDir, "hmrc-api-requests.jsonl");
  assertMfaHeader(hmrcApiRequestsFile);
});
```

**Add to `playwright.config.js`**:

```javascript
{
  name: "mfaValidationBehaviour",
  testDir: "behaviour-tests",
  testMatch: ["**/mfaValidation.behaviour.test.js"],
  workers: 1,
  outputDir: "./target/behaviour-test-results/",
  timeout: 300_000,
}
```

**Add to `package.json`**:

```json
{
  "test:mfaValidationBehaviour": "playwright test --project=mfaValidationBehaviour",
  "test:mfaValidationBehaviour-proxy": "npx dotenv -e .env.proxy -- npm run test:mfaValidationBehaviour",
  "test:mfaValidationBehaviour-ci": "npx dotenv -e .env.ci -- npm run test:mfaValidationBehaviour"
}
```

---

## Testing Strategy

### Phase 1: Local Development (Proxy Mode)

Test MFA with mock data before deploying to AWS:

```bash
# Set test environment variables
export TEST_MFA_ENABLED=true
export TEST_MFA_TYPE=TOTP
export TEST_MFA_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Run auth test with mock MFA
npm run test:authBehaviour-proxy

# Run VAT submission test with MFA
HMRC_ACCOUNT=sandbox npm run test:submitVatBehaviour-proxy

# Run fraud prevention header validation
HMRC_ACCOUNT=sandbox npm run test:postVatReturnFraudPreventionHeadersBehaviour-proxy

# Run dedicated MFA validation test
npm run test:mfaValidationBehaviour-proxy

# Verify MFA header in DynamoDB export
cat target/behaviour-test-results/*/hmrc-api-requests.jsonl | \
  jq -r '.httpRequest.headers."gov-client-multi-factor"' | \
  grep -E '^type=TOTP&timestamp='
```

**Expected Results**:
- ✅ All tests pass with mock MFA data
- ✅ `Gov-Client-Multi-Factor` header present in all HMRC API requests
- ✅ Header format: `type=TOTP&timestamp=2026-01-05T12:00:00Z&unique-reference=test-session-12345`
- ✅ No errors from HMRC validation endpoint

### Phase 2: CI Environment (Real Cognito MFA)

Deploy MFA-enabled Cognito and test with real TOTP:

```bash
# Deploy infrastructure with MFA enabled
cd infra && npm run cdk:deploy-ci

# Verify MFA is enforced
aws cognito-idp describe-user-pool \
  --user-pool-id <ci-user-pool-id> \
  --region eu-west-2 \
  --query 'UserPool.MfaConfiguration'

# Store test TOTP secret
aws secretsmanager create-secret \
  --name "ci/submit/test-user-totp-secret" \
  --secret-string '{"totp_secret": "JBSWY3DPEHPK3PXP"}' \
  --region eu-west-2

# Enable MFA for test user (one-time setup)
node -e "
  const { enableMFAForTestUser } = require('./behaviour-tests/helpers/cognito-mfa-helper.js');
  enableMFAForTestUser('<user-pool-id>', '<test-username>').then(() => console.log('Done'));
"

# Run tests with real Cognito MFA
TEST_MFA_ENABLED=true npm run test:authBehaviour-ci
TEST_MFA_ENABLED=true HMRC_ACCOUNT=sandbox npm run test:submitVatBehaviour-ci
TEST_MFA_ENABLED=true npm run test:mfaValidationBehaviour-ci

# Verify via GitHub Actions synthetic tests
# (Workflow will automatically run with MFA enabled)
```

**Expected Results**:
- ✅ Playwright completes MFA challenge automatically using TOTP
- ✅ Real MFA timestamp and session ID captured from Cognito
- ✅ `Gov-Client-Multi-Factor` header sent to HMRC with real data
- ✅ HMRC validation endpoint returns no errors/warnings

### Phase 3: Production Environment

Once CI testing is successful, deploy to production:

```bash
# Deploy to production
cd infra && npm run cdk:deploy-prod

# Store production test TOTP secret
aws secretsmanager create-secret \
  --name "prod/submit/test-user-totp-secret" \
  --secret-string '{"totp_secret": "PROD-SECRET-HERE"}' \
  --region eu-west-2

# Run production smoke tests
TEST_MFA_ENABLED=true npm run test:authBehaviour-prod

# Collect evidence for HMRC approval
npm run test:submitVatBehaviour-prod
# Download artifacts: hmrc-api-requests.jsonl, screenshots, video
```

---

## Manual Testing Checklist

### For Developers

- [ ] Create new Cognito user account
- [ ] Prompted to set up MFA on first login
- [ ] Scan QR code with Google Authenticator / Authy
- [ ] Successfully verify TOTP code
- [ ] Login with username, password, and TOTP code
- [ ] MFA metadata stored in sessionStorage
- [ ] Submit VAT return triggers HMRC API call with MFA header
- [ ] Check browser DevTools Network tab: `Gov-Client-Multi-Factor` header present
- [ ] Verify header format: `type=TOTP&timestamp=...&unique-reference=...`

### For QA

- [ ] Test with multiple authenticator apps (Google Authenticator, Authy, Microsoft Authenticator)
- [ ] Test invalid TOTP code handling (shows error, doesn't lock account)
- [ ] Test expired TOTP code (30-second window)
- [ ] Test MFA setup recovery (lost device scenario)
- [ ] Test session persistence (MFA not required on every action)
- [ ] Verify MFA header **not** sent if user hasn't completed MFA challenge

---

## Rollout Plan

### Week 1: Development & Local Testing
- Implement Cognito MFA configuration
- Update frontend MFA header generation
- Create mock MFA test helpers
- Test in proxy environment with mock data
- **Deliverable**: All proxy tests pass with mock MFA

### Week 2: CI Integration
- Deploy MFA-enabled Cognito to CI
- Configure test user with TOTP
- Store TOTP secret in Secrets Manager
- Update behaviour tests for real Cognito MFA
- **Deliverable**: All CI tests pass with real MFA

### Week 3: Production Deployment
- Deploy to production
- Document MFA setup process for users
- Run production smoke tests
- Collect test evidence for HMRC
- **Deliverable**: Production ready, evidence collected

### Week 4: HMRC Approval
- Submit evidence to HMRC
- Address any feedback
- Complete fraud prevention header validation
- **Deliverable**: HMRC approval obtained

---

## Success Criteria

### Technical
- ✅ Cognito MFA enforced for all users
- ✅ `Gov-Client-Multi-Factor` header sent with all HMRC API requests
- ✅ Header format compliant with HMRC specification
- ✅ MFA metadata (timestamp, session ID) captured correctly
- ✅ Tests pass in proxy, CI, and production environments

### HMRC Compliance
- ✅ Fraud prevention header validation endpoint returns no errors
- ✅ Header removed from "intentionally omitted" list
- ✅ Evidence collected for HMRC approval application
- ✅ MFA implementation documented

### User Experience
- ✅ Clear MFA setup instructions
- ✅ QR code and manual entry options
- ✅ Error handling for invalid codes
- ✅ Session persistence (no MFA prompt on every action)

---

## Dependencies

### NPM Packages
```bash
npm install otplib  # TOTP code generation for tests
npm install qrcode  # QR code generation for MFA setup
```

### AWS Permissions

Lambda execution role needs:
- `secretsmanager:GetSecretValue` (for test TOTP secrets)

Test runner needs:
- `cognito-idp:AdminSetUserMFAPreference`
- `cognito-idp:DescribeUserPool`

### Infrastructure
- Cognito User Pool with MFA enabled
- Secrets Manager secrets for test TOTP codes
- Updated Lambda environment variables (no changes needed)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Users lose access to authenticator app | High | Implement recovery codes or admin reset |
| TOTP clock drift causes auth failures | Medium | Use 30-second window, document time sync |
| Test automation fails with real MFA | High | Store test TOTP secrets securely, generate codes dynamically |
| HMRC rejects MFA implementation | Critical | Validate header format early with test endpoint |
| Production users not ready for MFA | Medium | Provide clear docs, grace period, support channel |

---

## Rollback Plan

If MFA causes issues in production:

1. **Immediate**: Change Cognito MFA from `REQUIRED` to `OPTIONAL`
   ```java
   .mfa(Mfa.OPTIONAL)  // Allow login without MFA temporarily
   ```

2. **Short-term**: Omit `Gov-Client-Multi-Factor` header if not present
   ```javascript
   if (govClientMultiFactorHeader) {
     fraudPreventionHeaders['Gov-Client-Multi-Factor'] = govClientMultiFactorHeader;
   }
   // Don't fail if header is missing - HMRC allows omission
   ```

3. **Long-term**: Fix issues, re-enable MFA enforcement

---

## Next Steps

After MFA implementation is complete:

1. ✅ **Complete Phase 1, Step 1.1** of HMRC_MTD_APPROVAL_PLAN.md
2. → Move to **Phase 1, Step 1.3**: Implement Synthetic Monitoring
3. → Move to **Phase 2**: Sandbox Testing with all fraud prevention headers
4. → Move to **Phase 3**: HMRC Production Application

---

## References

- [HMRC Fraud Prevention Headers Specification](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/)
- [Cognito MFA Documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)
- [HMRC_MTD_APPROVAL_PLAN.md](./HMRC_MTD_APPROVAL_PLAN.md) - Parent document
- [Issue #442](https://github.com/your-org/submit/issues/442) - Gov-Client-MFA header tracking

---

**Last Updated**: 2026-01-05
**Owner**: Development Team
**Status**: Ready for implementation
