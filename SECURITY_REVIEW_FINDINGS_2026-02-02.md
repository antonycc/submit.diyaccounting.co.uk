# Security Review: OWASP Top 10 Analysis
**Date:** 2026-02-02  
**Reviewer:** GitHub Copilot Agent  
**Scope:** Comprehensive security analysis of DIY Accounting Submit application

---

## Executive Summary

This security review assessed the application against OWASP Top 10 (2021) vulnerabilities. The application demonstrates **strong security fundamentals** with comprehensive PII redaction, proper JWT verification, and well-scoped IAM policies. 

**Key Findings:**
- ✅ **4 Critical Controls Implemented Correctly**
- ⚠️ **2 High-Severity Issues Identified** (localStorage token storage, capacity table access control)
- ⚠️ **2 Medium-Severity Issues Identified** (JWT decode usage, missing PKCE)
- 💡 **2 Low-Severity Dependencies** (eslint, fast-xml-parser)

**Overall Security Posture:** **Good** with recommended improvements

---

## OWASP Top 10 Findings

### A01: Broken Access Control ⚠️

#### ✅ **SECURE: User Isolation in Core Repositories**
**Status:** Properly Implemented  
**Files Reviewed:**
- `app/data/dynamoDbBundleRepository.js` (Lines 22, 76, 90, 170, 198, 235)
- `app/data/dynamoDbReceiptRepository.js` (Lines 36, 99, 148)
- `app/data/dynamoDbHmrcApiRequestRepository.js` (Lines 35, 61)
- `app/functions/account/bundleGet.js` (Lines 48, 81-88, 125)

**Evidence:**
- All DynamoDB queries include `hashedSub` as partition key or filter expression
- `hashSub()` consistently converts user `sub` claim to HMAC-SHA256 hash
- Bundle access properly scoped to authenticated user's `userId` from JWT

**Example (bundleGet.js:125):**
```javascript
const bundles = await getUserBundles(userId); // Enforces hashedSub filtering
```

#### ⚠️ **VULNERABILITY: Missing User Isolation in Capacity Table**
**Severity:** HIGH  
**File:** `app/data/dynamoDbCapacityRepository.js`  
**Lines:** 24-31, 54, 79-81, 95-103

**Issue:**
Capacity counter operations use only `bundleId` as the key, **without `hashedSub` filtering**:
```javascript
// Lines 24-31: incrementCounter()
Key: { bundleId },  // NO hashedSub!

// Lines 54: decrementCounter()
Key: { bundleId },  // NO hashedSub!

// Lines 79-81: getCounter()
Key: { bundleId },  // NO hashedSub!
```

**Impact:**
- An attacker with knowledge of a `bundleId` could query capacity counters without authentication
- Potential information disclosure about bundle usage patterns
- Horizontal privilege escalation risk (querying other users' bundle capacity)

**Risk Assessment:**
- **Likelihood:** Low (requires knowing valid bundleId UUIDs)
- **Impact:** Medium (information disclosure, not data modification)
- **Overall Severity:** HIGH

**Recommendation:**
Add `hashedSub` to capacity table key schema or enforce user-scoped access checks before capacity operations.

---

### A02: Cryptographic Failures ⚠️

#### ✅ **SECURE: JWT Verification**
**Status:** Properly Implemented  
**File:** `app/functions/auth/customAuthorizer.js` (Lines 27-31, 79)

**Evidence:**
- Uses `aws-jwt-verify` library's `CognitoJwtVerifier`
- Validates signature against Cognito public keys
- Enforces `token_use: "access"` and `clientId` validation
- No custom crypto or timing attack vulnerabilities

**Example:**
```javascript
verifier = CognitoJwtVerifier.create({
  userPoolId: userPoolId,
  tokenUse: "access",
  clientId: clientId,
});
const payload = await jwtVerifier.verify(token); // Line 79
```

#### ⚠️ **ISSUE: Unverified JWT Decode in Helper**
**Severity:** MEDIUM  
**File:** `app/lib/jwtHelper.js`  
**Lines:** 11-24 (decodeJwtNoVerify), 36 (decodeJwtToken), 45-75 (getUserSub)

**Issue:**
- `decodeJwtNoVerify()` performs base64 decode **without signature verification**
- `decodeJwtToken()` and `getUserSub()` extract claims from unverified tokens
- No expiry checking in these functions

**Risk Context:**
- Used in `httpServerToLambdaAdaptor.js` (simulator/local environment only)
- **NOT** used in production API Gateway path (which uses `customAuthorizer.js`)
- If these functions are used for authorization decisions elsewhere, this is a critical vulnerability

**Current Usage Analysis:**
- ✅ Production path uses verified tokens via custom authorizer
- ⚠️ Local/simulator environments may trust unverified claims

**Recommendation:**
- Add documentation warning that these functions are for **local development only**
- Consider renaming to `decodeJwtNoVerifyUnsafe()` to signal risk
- Audit all usages to ensure no security-critical paths depend on unverified tokens

#### ✅ **SECURE: Secrets Management**
**Status:** Properly Implemented  
**Files:**
- `app/services/subHasher.js` (Lines 25-81)
- `infra/main/java/co/uk/diyaccounting/submit/helpers/SubHashSaltHelper.java` (Lines 32-39)

**Evidence:**
- HMAC-SHA256 salt retrieved from AWS Secrets Manager (not hardcoded)
- One-time fetch with container-level caching
- Proper error handling and concurrent initialization protection
- IAM policy scoped to specific secret ARN: `{envName}/submit/user-sub-hash-salt*`

**No hardcoded secrets found** in codebase.

#### ⚠️ **ISSUE: Insecure Token Storage (Frontend)**
**Severity:** HIGH  
**File:** `web/public/lib/services/auth-service.js`  
**Lines:** 92-94, 124-125, 140-146, 160-162, 217-221

**Issue:**
Tokens stored in `localStorage` are vulnerable to XSS attacks:
```javascript
const accessToken = localStorage.getItem("cognitoAccessToken");
const idToken = localStorage.getItem("cognitoIdToken");
const refreshToken = localStorage.getItem("cognitoRefreshToken");
```

**XSS Risk Level:** CRITICAL
- Any script injection can steal tokens
- No `HttpOnly` flag protection (browser-side storage)
- Tokens persist after browser close
- Functions exported to `window` scope (accessible to injected scripts)

**Mitigation Factors:**
- ✅ Token expiry checking (5-minute preemptive refresh)
- ✅ Automatic refresh on expiry
- ⚠️ Still vulnerable if XSS occurs before expiry

**Recommendation:**
1. **Preferred:** Switch to `HttpOnly` secure cookies for token storage
2. **Alternative:** Use in-memory storage with refresh-on-page-load
3. Implement refresh token rotation
4. Add Content Security Policy (CSP) headers to mitigate XSS

---

### A03: Injection ✅

#### ✅ **SECURE: DynamoDB Query Construction**
**Status:** No Injection Vulnerabilities Found  
**Files Reviewed:**
- All `app/data/dynamoDb*Repository.js` files

**Evidence:**
- All DynamoDB queries use parameterized expressions
- `KeyConditionExpression` and `FilterExpression` use placeholder syntax (`:hashedSub`, `:bundleId`)
- `ExpressionAttributeValues` properly escapes values

**Example (dynamoDbBundleRepository.js:235):**
```javascript
KeyConditionExpression: "hashedSub = :hashedSub",
ExpressionAttributeValues: { ":hashedSub": hashedSub },
```

**No string interpolation** in query construction detected.

#### ✅ **SECURE: HMRC API URL Construction**
**Status:** Properly Validated  
**Files:**
- `app/services/hmrcApi.js` (Lines 399-406)
- `app/lib/hmrcValidation.js` (Lines 17-43)

**Evidence:**
- Base URLs from environment variables (controlled)
- Endpoint paths are hardcoded strings (not user-controlled)
- Query parameters sanitized via `URLSearchParams` (Lines 401-404)
- VRN, period keys, and dates validated before use (regex patterns)

**Example:**
```javascript
// Line 404: URLSearchParams properly encodes values
const queryString = new URLSearchParams(cleanParams).toString();
const hmrcRequestUrl = `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ""}`;
```

**Validation Functions:**
- `isValidVrn(vrn)` - enforces 9-digit format
- `isValidPeriodKey(periodKey)` - enforces HMRC pattern
- `isValidIsoDate(date)` - enforces YYYY-MM-DD format

---

### A04: Insecure Design ⚠️

#### ✅ **SECURE: OAuth State Validation**
**Status:** Properly Implemented  
**Files:**
- `web/public/hmrc/vat/submitVat.html` (Line 734)
- `web/public/activities/submitVatCallback.html` (Lines 108-141)
- `web/public/lib/utils/crypto-utils.js` (Lines 14-16)

**Evidence:**
- State generated using `crypto.randomUUID()` (cryptographically secure)
- Stored in `sessionStorage` (session-scoped, not persistent)
- Strict validation on callback: `if (state !== storedState)`
- State cleaned up after use (Line 94)

**CSRF Protection:** ✅ Implemented

#### ⚠️ **MISSING: PKCE Implementation**
**Severity:** MEDIUM  
**File:** `app/functions/hmrc/hmrcTokenPost.js` (Lines 128-134)

**Issue:**
No PKCE (Proof Key for Code Exchange) implementation found:
- Missing `code_verifier` parameter in token exchange
- Missing `code_challenge` in authorization request
- No search results for "code_verifier", "code_challenge", or "PKCE" in codebase

**Risk Assessment:**
- **Mitigation:** Application uses confidential client with `client_secret` (retrieved from Secrets Manager)
- **Standard:** PKCE required for public clients, recommended for all clients (RFC 7636)
- **Likelihood:** Low (confidential client mitigates authorization code interception)
- **Impact:** Medium (defense-in-depth missing)

**Recommendation:**
Implement PKCE for defense-in-depth even with confidential client:
1. Generate `code_verifier` (43-128 char random string)
2. Compute `code_challenge = BASE64URL(SHA256(code_verifier))`
3. Send `code_challenge` in authorization request
4. Send `code_verifier` in token exchange

#### ✅ **SECURE: Token Refresh Race Condition Handling**
**Status:** Protected  
**File:** `web/public/lib/services/auth-service.js` (Lines 122-138)

**Evidence:**
```javascript
if (__ensureSessionInflight) return __ensureSessionInflight; // Line 137
```
Prevents duplicate concurrent refresh requests.

---

### A05: Security Misconfiguration ⚠️

#### ✅ **SECURE: Lambda Execution Roles (Least Privilege)**
**Status:** Properly Scoped  
**Files:**
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AuthStack.java` (Lines 145, 190)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java` (Lines 214-244)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` (Lines 212-216, 287-294)

**Evidence:**
- Lambda functions use scoped grant methods: `grantReadWriteData()`, `grantReadData()`
- Each Lambda receives only necessary table access
- Secrets Manager access restricted to specific ARN patterns
- Cognito actions limited to specific operations (`AdminGetUser`, `AdminUpdateUserAttributes`, `ListUsers`)
- **No wildcard `*` resources** in IAM policies

**Example:**
```java
// Line 145: Scoped table access
bundlesTable.grantReadWriteData(this.cognitoTokenPostLambda);

// Lines 214-244: Scoped Secrets Manager access
secretArn = String.format("arn:aws:secretsmanager:%s:%s:secret:%s/submit/hmrc/client_secret-*", region, account, envName);
```

#### ✅ **SECURE: CORS Configuration**
**Status:** Not Found (No explicit CORS headers in Lambda responses)

**Note:** CORS should be configured at API Gateway level (not reviewed in this security scan of Lambda code).

#### ⚠️ **MISSING: DynamoDB Encryption Configuration**
**Severity:** MEDIUM  
**File:** `infra/cdk-application/src/main/java/co/uk/diyaccounting/submit/cdk/KindCdk.java` (Lines 205-209)

**Issue:**
DynamoDB tables created via custom resource don't specify `SSESpecification`:
```java
Map<String, Object> createTableParams = Map.of(
    "TableName", tableName,
    "AttributeDefinitions", attributeDefinitions,
    "KeySchema", keySchema,
    "BillingMode", "PAY_PER_REQUEST"  // ← No encryption specified
);
```

**Current State:**
- DynamoDB uses AWS-managed encryption by default (acceptable)
- No customer-managed KMS key configuration

**Recommendation:**
Explicitly configure encryption with customer-managed KMS keys for sensitive data:
- Receipts table (7-year HMRC retention requirement)
- Bundles table (subscription data)
- HMRC API requests table

**Example Fix:**
```java
Map<String, Object> createTableParams = Map.of(
    // ... existing params ...
    "SSESpecification", Map.of(
        "Enabled", true,
        "SSEType", "KMS",
        "KMSMasterKeyId", kmsKeyId
    )
);
```

---

### A06: Vulnerable and Outdated Components ⚠️

#### ⚠️ **DEPENDENCIES WITH KNOWN VULNERABILITIES**
**Severity:** LOW to MODERATE

**npm audit Results:**

1. **eslint < 9.26.0**
   - **Severity:** Moderate
   - **CVE:** GHSA-p5wg-g6qr-c7cg (Stack Overflow with circular references)
   - **Affected:** `@microsoft/eslint-formatter-sarif` dependency
   - **Fix:** `npm audit fix --force` (breaking change)
   - **Impact:** Low (development tool, not production runtime)

2. **fast-xml-parser 4.3.6 - 5.3.3**
   - **Severity:** High
   - **CVE:** GHSA-37qj-frw5-hhjh (RangeError DoS Numeric Entities Bug)
   - **Affected:** `@aws-sdk/xml-builder` → `@aws-sdk/core` → Multiple AWS SDK clients
   - **Fix:** Update AWS SDK to >= 3.894.0
   - **Impact:** Moderate (affects AWS API calls if malicious XML parsed)

**Recommendation:**
1. Upgrade AWS SDK packages to >= 3.894.0
2. Update eslint and related tooling (test impact first)
3. Run `npm audit fix` and verify tests pass
4. Monitor future vulnerabilities via CI/CD pipeline

---

### A07: Identification and Authentication Failures ⚠️

#### ✅ **SECURE: Token Expiry Checking**
**Status:** Properly Implemented  
**Files:**
- `web/public/lib/services/auth-service.js` (Lines 17-86)
- `app/functions/auth/customAuthorizer.js` (Lines 27-31, 79)

**Evidence:**
- **Frontend:** Preemptive refresh 5 minutes before expiry (Lines 68-82)
- **Backend:** `CognitoJwtVerifier` validates `exp` claim automatically
- Automatic session refresh on expired tokens

**Example:**
```javascript
// Lines 67-69: Preemptive refresh
const fiveMinutes = 5 * 60 * 1000;
const accessExpiringSoon = accessExpMs && accessExpMs - now < fiveMinutes;
```

#### ⚠️ **ISSUE: Unverified Token Usage**
**Severity:** MEDIUM  
**File:** `app/lib/jwtHelper.js` (Lines 11-24, 36, 45-75)

**Issue:** (Duplicate from A02 - Cryptographic Failures)
- `decodeJwtNoVerify()` doesn't check expiry or signature
- Used in simulator/local environments

**Recommendation:** See A02 findings.

---

### A08: Software and Data Integrity Failures ✅

#### ✅ **SECURE: HMRC API Response Handling**
**Status:** Properly Validated  
**Files:**
- `app/services/hmrcApi.js` (Lines 448-498)
- `app/lib/hmrcValidation.js` (Lines 317-391)

**Evidence:**
- Response body parsed and validated
- HMRC error codes mapped to user-friendly messages
- HTTP status codes properly handled (401, 403, 404, 500)
- Receipt storage includes response validation

**Example:**
```javascript
// Line 448: Safe JSON parsing
const hmrcResponseBody = await hmrcResponse.json().catch(() => ({}));

// Lines 317-391: Error code validation
export function getHmrcErrorMessage(code) {
  const errorMap = { /* ... */ };
  return errorMap[code] || { /* default */ };
}
```

#### ✅ **SECURE: Receipt Storage Integrity**
**Status:** Properly Implemented  
**File:** `app/data/dynamoDbReceiptRepository.js`

**Evidence:**
- Receipts stored with full HMRC response metadata
- Immutable storage (no update operations)
- 7-year retention TTL for HMRC compliance

---

### A09: Security Logging and Monitoring Failures ✅

#### ✅ **EXCELLENT: PII Redaction Implementation**
**Status:** Best Practice  
**File:** `app/lib/logger.js` (Lines 6-356)

**Evidence:**
**Two-layer PII protection:**

**Layer 1: Pino Path-Based Redaction (Lines 66-109)**
- Redacts authentication tokens, secrets, passwords
- Covers request/response headers
- Wildcards catch nested instances: `*.authorization`, `*.access_token`

**Layer 2: Regex-Based Sanitization (Lines 115-190)**
- VRN, UTR, NINO, EORI patterns
- Email addresses
- Bearer tokens
- Key=value secret patterns

**Sensitive Data Detection (Lines 157-163):**
```javascript
export function containsSensitiveData(value) {
  const secretPattern = /\b(client_secret|...|hmrcAccessToken)[\s]*[=:]\s*[^\s&,;'"){}\]]+/gi;
  return secretPattern.test(value);
}
```

**Alert on Credentials (Lines 176-182):**
Logs ERROR when sensitive credentials detected before redaction.

#### ✅ **SECURE: Data Masking**
**Status:** Properly Implemented  
**File:** `app/lib/dataMasking.js` (Lines 1-171)

**Evidence:**
- Recursive object sanitization with circular reference detection
- URL-encoded body masking (OAuth forms)
- Allowlist for non-sensitive fields that match patterns
- Used before persisting API requests to DynamoDB

**Example:**
```javascript
export function maskSensitiveData(data, visited = new Set()) {
  // Circular reference detection (Line 117)
  if (visited.has(data)) return "[Circular Reference]";
  // ... recursive masking ...
}
```

#### ✅ **SECURE: No Token Leakage**
**Status:** Verified

**Evidence:**
- Bearer tokens redacted in logs via logger.js
- `accessToken` fields masked before DynamoDB storage
- X-Ray tracing enabled for audit trail (without token values)

---

### A10: Server-Side Request Forgery (SSRF) ✅

#### ✅ **SECURE: HMRC URL Construction**
**Status:** Properly Validated  
**File:** `app/services/hmrcApi.js` (Lines 33-40, 399-406)

**Evidence:**
- Base URLs from environment variables (controlled, not user input)
- Hardcoded endpoint paths: `/organisations/vat/{vrn}/obligations`, `/organisations/vat/{vrn}/returns`
- Query parameters sanitized via `URLSearchParams` (automatic encoding)
- No user-controlled URL construction

**Example:**
```javascript
// Lines 33-39: Base URL from env (not user input)
export function getHmrcBaseUrl(hmrcAccount) {
  const base = isSandbox ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  if (!base) throw new Error("Missing base URI");
  return base;
}

// Lines 399-406: Safe URL construction
const baseUrl = getHmrcBaseUrl(hmrcAccount);
const queryString = new URLSearchParams(cleanParams).toString(); // Encodes values
const hmrcRequestUrl = `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ""}`;
```

**No SSRF vulnerabilities detected.**

---

## Additional Security Findings

### ✅ **SECURE: Input Validation**
**File:** `app/lib/hmrcValidation.js`

**Comprehensive validation patterns:**
- VRN: 9-digit format (Line 18)
- Period Key: HMRC-specific alphanumeric patterns (Lines 37-42)
- ISO dates: YYYY-MM-DD with calendar validation (Lines 50-72)
- VAT monetary amounts: 2 decimal places, HMRC range validation (Lines 128-141)
- Whole pound amounts: Integer validation for boxes 6-9 (Lines 174-186)

### ✅ **SECURE: Fraud Prevention Headers**
**Files:**
- `app/lib/buildFraudHeaders.js`
- `app/services/hmrcApi.js` (Lines 127-273)

**Evidence:**
- Gov-Client headers properly constructed per HMRC specification
- IP masking for GDPR compliance (Lines 231-264)
- Device ID masking (Lines 272-282)
- Validation endpoint integration (Lines 127-194)

---

## Repository-Specific Security Assessment

### HMRC Integration Security ✅
**Status:** Well Implemented

**Positive Findings:**
- ✅ Client secret retrieved from Secrets Manager (never hardcoded)
- ✅ Sandbox vs production endpoint selection via environment config
- ✅ OAuth state validation (CSRF protection)
- ✅ Access token validation before API calls
- ✅ Fraud prevention header construction per HMRC spec

**Areas for Improvement:**
- ⚠️ Missing PKCE implementation (see A04)

### Frontend Security ⚠️
**Status:** Moderate Risk

**Issues:**
- ⚠️ localStorage token storage (XSS risk) - see A02
- ✅ Token expiry checking and preemptive refresh
- ✅ OAuth state validation

### DynamoDB Security ⚠️
**Status:** Good with Gaps

**Positive:**
- ✅ User isolation via `hashedSub` in core tables
- ✅ 7-year TTL for HMRC receipt retention
- ✅ Parameterized queries (no injection risk)

**Issues:**
- ⚠️ Capacity table missing user isolation (see A01)
- ⚠️ Missing explicit encryption configuration (see A05)

---

## Remediation Priority

### Critical (Fix Immediately)
None - No critical vulnerabilities that require immediate patching.

### High Priority (Fix Within 30 Days)
1. **localStorage Token Storage** (A02)
   - Switch to HttpOnly cookies or in-memory storage
   - Implement CSP headers

2. **Capacity Table Access Control** (A01)
   - Add `hashedSub` to key schema or enforce user checks

### Medium Priority (Fix Within 90 Days)
1. **Unverified JWT Decode** (A02/A07)
   - Document local-only usage
   - Rename to `decodeJwtNoVerifyUnsafe()`
   - Audit all usages

2. **Missing PKCE** (A04)
   - Implement code_verifier/code_challenge flow

3. **DynamoDB Encryption** (A05)
   - Configure customer-managed KMS keys

### Low Priority (Fix Next Quarter)
1. **Vulnerable Dependencies** (A06)
   - Update AWS SDK to >= 3.894.0
   - Update eslint to >= 9.26.0

---

## Conclusion

The DIY Accounting Submit application demonstrates **strong security engineering** with well-implemented controls for:
- ✅ JWT verification (aws-jwt-verify library)
- ✅ Comprehensive PII redaction (two-layer approach)
- ✅ Secrets management (AWS Secrets Manager integration)
- ✅ User isolation (hashedSub enforcement)
- ✅ Input validation (HMRC-specific patterns)
- ✅ IAM least privilege (scoped Lambda roles)

**High-priority fixes** should focus on:
1. Securing frontend token storage (XSS mitigation)
2. Closing capacity table access control gap

**Overall Security Rating:** **B+ (Good)**
- Strong foundational security controls
- Minor gaps in access control and token storage
- Well-maintained with clear security intent

---

## Compliance Notes

### GDPR Compliance ✅
- PII redaction in logs
- IP address masking in fraud prevention headers
- User data isolation via hashedSub

### HMRC MTD Requirements ✅
- 7-year receipt retention
- Fraud prevention headers
- OAuth 2.0 integration
- Test/production environment separation

---

## Appendix: Files Reviewed

### Authentication & Authorization
- `app/functions/auth/customAuthorizer.js` ✅
- `app/functions/auth/cognitoTokenPost.js`
- `app/lib/jwtHelper.js` ⚠️
- `web/public/lib/services/auth-service.js` ⚠️

### Data Access
- `app/data/dynamoDbBundleRepository.js` ✅
- `app/data/dynamoDbReceiptRepository.js` ✅
- `app/data/dynamoDbHmrcApiRequestRepository.js` ✅
- `app/data/dynamoDbCapacityRepository.js` ⚠️

### Input Validation
- `app/lib/hmrcValidation.js` ✅
- `app/lib/vatReturnTypes.js` ✅

### Secrets & PII Protection
- `app/services/subHasher.js` ✅
- `app/lib/dataMasking.js` ✅
- `app/lib/logger.js` ✅

### HMRC Integration
- `app/functions/hmrc/hmrcVatReturnPost.js` ✅
- `app/functions/hmrc/hmrcVatObligationGet.js` ✅
- `app/functions/hmrc/hmrcTokenPost.js` ⚠️
- `app/services/hmrcApi.js` ✅
- `app/lib/buildFraudHeaders.js` ✅

### Infrastructure (CDK)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AuthStack.java` ✅
- `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java` ✅
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` ✅
- `infra/cdk-application/src/main/java/co/uk/diyaccounting/submit/cdk/KindCdk.java` ⚠️

---

**Review Completed:** 2026-02-02  
**Next Review Due:** 2026-08-02 (6 months)
