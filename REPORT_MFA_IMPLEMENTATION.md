# MFA Implementation Summary

**Date**: 2026-02-26 (updated from 2026-01-06 original)
**Status**: IMPLEMENTED — Awaiting CI deployment verification
**PR**: #724 (branch `mfatotp`)
**Plan**: `PLAN_COGNITO_TOTP_MFA.md`

---

## What Was Implemented

### Two MFA Paths

| Auth Method | MFA Source | `amr` claims | `Gov-Client-Multi-Factor` type |
|-------------|-----------|--------------|-------------------------------|
| Google (federated) | Google 2FA | `["mfa", "pwd"]` | `type=OTHER` |
| Cognito native (test users) | TOTP enrollment | `["otp", "pwd"]` | `type=TOTP` |

### CDK Infrastructure

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java` (lines 168-174)

Cognito User Pool configured with optional TOTP MFA:
```java
.mfa(Mfa.OPTIONAL)
.mfaSecondFactor(MfaSecondFactor.builder()
    .otp(true)  // TOTP via authenticator apps
    .sms(false) // No SMS MFA (no phone numbers collected)
    .build())
```

`OPTIONAL` means only users who enroll a TOTP device are challenged. Google-federated users are unaffected — federated auth bypasses Cognito MFA entirely.

### Frontend — MFA Detection and Type Mapping

**Files**:
- `web/public/auth/loginWithCognitoCallback.html` (lines 228-267)
- `web/public/auth/loginWithMockCallback.html` (lines 168-204)

After OAuth login, the callback page:
1. Extracts `amr` (Authentication Methods Reference) claims from ID token
2. Detects MFA indicators: `'mfa'`, `'swk'` (software key), `'hwk'` (hardware key), `'otp'`
3. Maps `otp` to `type=TOTP`, everything else to `type=OTHER`
4. Stores MFA metadata in sessionStorage

```javascript
const amrClaims = idTokenPayload.amr || [];
const mfaIndicators = ["mfa", "swk", "hwk", "otp"];
const hasMFA = Array.isArray(amrClaims) && amrClaims.some((method) => mfaIndicators.includes(method));

if (hasMFA) {
  const mfaType = amrClaims.includes("otp") ? "TOTP" : "OTHER";
  const mfaMetadata = {
    type: mfaType,
    timestamp: authTime ? new Date(authTime * 1000).toISOString() : new Date().toISOString(),
    uniqueReference: crypto.randomUUID(),
  };
  sessionStorage.setItem("mfaMetadata", JSON.stringify(mfaMetadata));
}
```

### Frontend — MFA Header Generation

**File**: `web/public/lib/services/hmrc-service.js` (lines 176-186, 228-229)

When making HMRC API calls:
```javascript
let govClientMultiFactorHeader;
try {
  const mfaMetadata = sessionStorage.getItem("mfaMetadata");
  if (mfaMetadata) {
    const mfa = JSON.parse(mfaMetadata);
    govClientMultiFactorHeader = `type=${mfa.type}&timestamp=${encodeURIComponent(mfa.timestamp)}&unique-reference=${encodeURIComponent(mfa.uniqueReference)}`;
  }
} catch (err) {
  console.warn("Failed to read MFA metadata from sessionStorage:", err);
}

// Later:
if (govClientMultiFactorHeader) {
  headers["Gov-Client-Multi-Factor"] = govClientMultiFactorHeader;
}
```

### Backend — Header Pass-Through

**File**: `app/lib/buildFraudHeaders.js` (line 191)

`Gov-Client-Multi-Factor` is in the client header pass-through list. No backend changes needed — the header flows from browser → Lambda → HMRC.

### Test User TOTP Enrollment

**File**: `scripts/create-cognito-test-user.js` (lines 108-206)

After creating a user and setting the password, the script enrolls TOTP:
1. Authenticates user → gets access token
2. `AssociateSoftwareToken` → gets base32 TOTP secret
3. Generates TOTP code using `otpauth` library
4. `VerifySoftwareToken` → confirms enrollment
5. `AdminSetUserMFAPreference` → makes TOTP required for subsequent logins
6. Outputs `TOTP_SECRET=<base32>` and writes to `GITHUB_OUTPUT`

### Enable Script — TOTP Secret Passthrough

**File**: `scripts/enable-cognito-native-test.js` (lines 59-120)

Captures `TOTP_SECRET` from the create script output and saves in `cognito-native-test-credentials.json`:
```json
{
  "environment": "ci",
  "username": "test-xxx@test.diyaccounting.co.uk",
  "password": "TestXxx!Aa1#",
  "totpSecret": "JBSWY3DPEHPK3PXP...",
  "createdAt": "2026-02-26T..."
}
```

### Behaviour Tests — TOTP Challenge Handler

**File**: `behaviour-tests/steps/behaviour-login-steps.js` (lines 247-313)

`handleTotpChallenge(page, totpSecret, screenshotPath)`:
1. Waits for TOTP code input field on Cognito Hosted UI
2. Generates TOTP code from secret using `otpauth`
3. Types code using keyboard input (matches existing Cognito form handling pattern)
4. Submits the challenge form
5. Waits for redirect to callback URL

Called from `loginWithCognitoOrMockAuth()` (lines 56-61) when `TEST_AUTH_TOTP_SECRET` env var is set.

### TOTP Code Helper

**File**: `scripts/totp-code.js` — `npm run test:totpCode`

Generates TOTP codes locally from a secret:
```bash
npm run test:totpCode -- JBSWY3DPEHPK3PXP
# or
oathtool --totp --base32 JBSWY3DPEHPK3PXP
```

Reads from: CLI argument, `TEST_AUTH_TOTP_SECRET` env var, or `cognito-native-test-credentials.json`.

### GitHub Actions Workflows

| Workflow | Change |
|----------|--------|
| `synthetic-test.yml` | `test-auth-totp-secret` input/output/passthrough + `TEST_AUTH_TOTP_SECRET` env |
| `deploy-app.yml` | `TEST_AUTH_TOTP_SECRET` env on behaviour test step |
| `generate-pass.yml` | TOTP secret + `oathtool` command in job summary |

---

## End-to-End Flow

```
1. Test user created with TOTP enrolled (create-cognito-test-user.js)
   ↓
2. User authenticates via Cognito Hosted UI (email/password)
   ↓
3. Cognito presents TOTP challenge page (because TOTP is preferred MFA)
   ↓
4. Playwright generates TOTP code from secret and submits (handleTotpChallenge)
   ↓
5. Cognito validates TOTP → issues ID token with amr: ["otp", "pwd"]
   ↓
6. loginWithCognitoCallback.html detects "otp" in amr → stores type=TOTP
   ↓
7. User submits VAT return
   ↓
8. hmrc-service.js reads sessionStorage → generates header:
   Gov-Client-Multi-Factor: type=TOTP&timestamp=2026-02-26T19:00:00.000Z&unique-reference=abc123...
   ↓
9. Header sent to Lambda (buildFraudHeaders.js passes through to HMRC)
   ↓
10. HMRC validates fraud prevention headers ✅
```

---

## HMRC Compliance

### Header Format
Complies with HMRC specification:
```
Gov-Client-Multi-Factor: type=<TYPE>&timestamp=<ISO8601>&unique-reference=<UUID>
```

### Type Values Used
- `TOTP` — Cognito native auth users with enrolled TOTP device
- `OTHER` — Google-federated users with Google 2FA

### Omission Policy
Header omitted only when no MFA detected (e.g., Google without 2FA). Once this deployment is live, all test and production users will have MFA.

### `intentionallyNotSuppliedHeaders`
Now empty `[]` — all FPH headers are expected to be present.

---

## Testing

### Local Validation — PASSED
```bash
npm test              # 933 tests passed
./mvnw clean verify   # BUILD SUCCESS (CDK compiles with Mfa/MfaSecondFactor)
```

### Proxy Mode
Mock OAuth server includes `amr: ["mfa", "pwd"]` claims → `type=OTHER` header generated automatically.

### CI/Prod (Cognito Native Auth)
```bash
export AWS_PROFILE=submit-ci
npm run test:enableCognitoNative    # Creates TOTP-enrolled user
# Use the printed credentials:
TEST_AUTH_USERNAME='...' TEST_AUTH_PASSWORD='...' TEST_AUTH_TOTP_SECRET='...' npm run test:submitVatBehaviour-ci
npm run test:disableCognitoNative   # Clean up
```

---

## Files Changed

| File | Lines | Purpose |
|------|-------|---------|
| `infra/.../IdentityStack.java` | 168-174 | CDK: optional TOTP MFA on User Pool |
| `web/public/auth/loginWithCognitoCallback.html` | 228-267 | Detect `amr`, map `otp` → `type=TOTP` |
| `web/public/auth/loginWithMockCallback.html` | 168-204 | Same MFA type mapping for mock auth |
| `web/public/lib/services/hmrc-service.js` | 176-229 | Generate `Gov-Client-Multi-Factor` from sessionStorage |
| `app/lib/buildFraudHeaders.js` | 191 | Pass-through `Gov-Client-Multi-Factor` to HMRC |
| `scripts/create-cognito-test-user.js` | 108-206 | TOTP enrollment during test user creation |
| `scripts/enable-cognito-native-test.js` | 59-120 | Capture/save TOTP secret |
| `scripts/totp-code.js` | 1-52 | TOTP code generator helper |
| `behaviour-tests/steps/behaviour-login-steps.js` | 56-61, 247-313 | TOTP challenge handler for Playwright |
| `.github/workflows/synthetic-test.yml` | — | TOTP secret passthrough |
| `.github/workflows/deploy-app.yml` | — | TOTP secret env var |
| `.github/workflows/generate-pass.yml` | — | TOTP secret in job summary |
| `package.json` | — | `otpauth` v9.5.0 + `test:totpCode` script |

---

## Open Items

### Cognito Hosted UI TOTP Selectors
The exact CSS selectors for the TOTP challenge page input are undocumented and based on best guesses:
```
input[name="totpCode"], input[name="SOFTWARE_TOKEN_MFA_CODE"],
input[type="text"][inputmode="numeric"], input[name="code"]
```
These need to be verified after the first CI deployment. If they don't match, examine screenshots in `target/behaviour-test-results/` and update `handleTotpChallenge()`.

---

## References

- **Plan**: `PLAN_COGNITO_TOTP_MFA.md` — Full implementation plan with status
- **PR**: #724 — All changes on `mfatotp` branch
