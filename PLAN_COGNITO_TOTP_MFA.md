# Plan: Cognito TOTP MFA for Gov-Client-Multi-Factor Header

## User Assertions (non-negotiable)

- The test suite MUST exercise real MFA so `Gov-Client-Multi-Factor` is populated with genuine values
- HMRC FPH headers must carry real MFA data from the authentication flow, not mocked/injected values
- Cognito native auth (used by behaviour tests against CI/prod) must complete TOTP MFA
- The `Gov-Client-Multi-Factor` header must use `type=TOTP` when Cognito TOTP is the MFA method

## Problem

`Gov-Client-Multi-Factor` is populated when authenticating via Google (federated IdP) because the
`amr` claim in the ID token contains MFA indicators like `["mfa", "pwd"]`. When using Cognito native
auth (email/password) — used by behaviour tests against CI and prod — no MFA occurs, so the header
is absent.

This means behaviour tests running against real HMRC sandbox/production never send the
`Gov-Client-Multi-Factor` header. **HMRC has explicitly flagged this**: their FPH team reported that
"a large proportion of your requests are missing the Gov-Client-Multi-Factor header" across all three
endpoints (`GET /obligations`, `POST /returns`, `GET /returns/{periodKey}`). HMRC requires correctly
populated values for the latest requests to each endpoint before they will approve the application.

HMRC also noted: "If MFA is not mandatory for all users and MFA information will not be available for
all requests please let us know and we will take this into consideration when validating future fraud
prevention headers." Our position: MFA **will** be present on all requests once this plan is
implemented — Google-federated users get MFA from Google 2FA, and Cognito native users (including
test users) will get MFA from TOTP enrollment.

The `intentionallyNotSuppliedHeaders` list in `dynamodb-assertions.js` is now empty — all FPH headers
are expected to be present. `Gov-Client-Multi-Factor` must be genuinely populated.

## Goal

Enable TOTP MFA on Cognito native auth so that:
1. Behaviour tests complete a real TOTP challenge during login
2. The Cognito ID token contains `amr: ["otp", "pwd"]`
3. The frontend detects `otp` in `amr` and sets `type=TOTP` in the header
4. HMRC receives `Gov-Client-Multi-Factor: type=TOTP&timestamp=...&unique-reference=...`
5. The FPH validation endpoint returns `VALID_HEADER` for this field

## Current State (as of 2026-02-26)

| Component | Status |
|-----------|--------|
| `Gov-Client-User-IDs` key name | DONE — both frontend and backend use `cognito=<sub>` |
| `intentionallyNotSuppliedHeaders` | DONE — now empty `[]`, all headers expected |
| Frontend MFA detection (`loginWithCognitoCallback.html:228-263`) | DONE — detects `amr` claims and federated login |
| Frontend MFA header generation (`hmrc-service.js:176-186`) | DONE — reads `mfaMetadata` from sessionStorage |
| Backend pass-through (`buildFraudHeaders.js:191`) | DONE — `Gov-Client-Multi-Factor` in pass-through list |
| Mock OAuth `amr` claims | DONE — proxy tests get MFA via mock OAuth server |
| CDK MFA configuration on User Pool | NOT DONE — no `.mfa()` or `.mfaSecondFactor()` |
| TOTP enrollment in test user creation | NOT DONE |
| TOTP challenge handling in Playwright | NOT DONE |
| Frontend `type=TOTP` mapping for `otp` in `amr` | NOT DONE — currently all MFA maps to `type=OTHER` |
| `otpauth` npm dependency | NOT DONE |

## Implementation Steps

### Step 1: CDK — Enable TOTP MFA on User Pool

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`

Add MFA configuration to the User Pool builder (after `.accountRecovery(AccountRecovery.NONE)` at line 166):

```java
// Enable optional TOTP MFA for native auth users (test users, future native users)
// Federated users (Google) bypass Cognito MFA — their IdP handles MFA independently
.mfa(Mfa.OPTIONAL)
.mfaSecondFactor(MfaSecondFactor.builder()
    .otp(true)    // TOTP via authenticator apps
    .sms(false)   // No SMS MFA (no phone numbers collected)
    .build())
```

**Imports to add**:
```java
import software.amazon.awscdk.services.cognito.Mfa;
import software.amazon.awscdk.services.cognito.MfaSecondFactor;
```

**Risk assessment**: RESOLVED — CloudFormation `MfaConfiguration` property is **"Update requires: No interruption"**. Enabling `OPTIONAL` MFA on an existing pool is an in-place update. No user pool replacement, no user deletion, no downtime.

**Impact on existing users**: None. `OPTIONAL` means MFA is only required for users who have enrolled a TOTP device. Existing Google-federated users are completely unaffected — federated auth bypasses Cognito MFA entirely.

### Step 2: Install `otpauth` dependency

**File**: `package.json`

```bash
npm install --save-dev otpauth
```

The `otpauth` package is a well-maintained, lightweight TOTP/HOTP library that:
- Generates 6-digit TOTP codes from a base32 secret
- Uses HMAC-SHA1 (required by Cognito — Cognito only accepts HMAC-SHA1 TOTPs)
- Has zero dependencies
- Works in Node.js (scripts) and can work in browser if needed

### Step 3: Test User Script — Enroll TOTP Device

**File**: `scripts/create-cognito-test-user.js`

After creating the user and setting the password (line 93), add TOTP enrollment:

1. **Authenticate the user** — call `AdminInitiateAuth` with `USER_PASSWORD_AUTH` to get an access token. Since MFA is `OPTIONAL` and the user hasn't enrolled yet, this returns tokens directly (no MFA challenge).

2. **Associate TOTP device** — call `AssociateSoftwareToken` with the access token. Returns a `SecretCode` (base32-encoded TOTP shared secret).

3. **Compute a valid TOTP code** — use `otpauth` to generate the current 6-digit code from the secret.

4. **Verify the device** — call `VerifySoftwareToken` with the access token and the computed code. This confirms enrollment and activates the TOTP device.

5. **Set TOTP as preferred MFA** — call `AdminSetUserMFAPreference` with `SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true }`. This ensures subsequent logins require TOTP.

**New imports**:
```javascript
import {
  AdminInitiateAuthCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  AdminSetUserMFAPreferenceCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { TOTP } from "otpauth";
```

**Output the TOTP secret** alongside username/password for the enable script to capture:
```
TOTP_SECRET=JBSWY3DPEHPK3PXP...
```

### Step 4: Enable Script — Pass TOTP Secret Through

**File**: `scripts/enable-cognito-native-test.js`

Update the credential parsing (line 67-72) to also capture `TOTP_SECRET` from the create script's stdout. Save it in `cognito-native-test-credentials.json`:

```json
{
  "environment": "ci",
  "username": "test-xxx@test.diyaccounting.co.uk",
  "password": "TestXxx!Aa1#",
  "totpSecret": "JBSWY3DPEHPK3PXP...",
  "createdAt": "2026-02-26T..."
}
```

Update the usage instructions to include `TEST_AUTH_TOTP_SECRET`:
```
TEST_AUTH_USERNAME='...' TEST_AUTH_PASSWORD='...' TEST_AUTH_TOTP_SECRET='...' npm run test:submitVatBehaviour-ci
```

### Step 5: Behaviour Tests — Handle TOTP Challenge on Cognito Hosted UI

**File**: `behaviour-tests/steps/behaviour-login-steps.js`

After `submitHostedUINativeAuth()` submits username/password, the Cognito Hosted UI presents an additional TOTP challenge page (confirmed by AWS docs: "your user submits their username and password, and then submits the TOTP password on an additional sign-in page").

Add a new function `handleTotpChallenge(page, totpSecret, screenshotPath)`:

1. **Detect the TOTP challenge page** — wait for the TOTP code input field. The Cognito Hosted UI renders a form with an input for the 6-digit code. Look for an input with `name` containing `totpCode` or `softwareToken`, or a generic code input.

2. **Read the TOTP secret** — from `process.env.TEST_AUTH_TOTP_SECRET` or from the credentials file.

3. **Compute the current 6-digit code** — use `otpauth` to generate the code:
   ```javascript
   import { TOTP } from "otpauth";
   const totp = new TOTP({ secret: totpSecret, algorithm: "SHA1", digits: 6, period: 30 });
   const code = totp.generate();
   ```

4. **Enter the code** — type the 6-digit code into the input field using keyboard input (same pattern as username/password to handle Cognito's duplicate forms).

5. **Submit the form** — click the submit/verify button.

6. **Wait for redirect** — the Cognito Hosted UI redirects to the callback URL with the authorization code. `loginWithCognitoCallback.html` handles the rest.

**Update `loginWithCognitoOrMockAuth()`** in the `cognito-native` branch to call `handleTotpChallenge()` after `submitHostedUINativeAuth()`:

```javascript
} else if (testAuthProvider === "cognito-native") {
  await initCognitoAuth(page, screenshotPath);
  await fillInHostedUINativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath);
  await submitHostedUINativeAuth(page, screenshotPath);
  await handleTotpChallenge(page, process.env.TEST_AUTH_TOTP_SECRET, screenshotPath);
}
```

**Discovering the exact form elements**: The Cognito Hosted UI's TOTP challenge page HTML is not documented. We need to deploy Step 1 first, enroll a TOTP device manually, then inspect the Hosted UI to find the exact input names, button names, and form structure. Take a screenshot in Playwright and examine it. This is a discovery step during implementation.

### Step 6: Frontend — Map `otp` in `amr` to `type=TOTP`

**File**: `web/public/auth/loginWithCognitoCallback.html` (lines 239-247)

Currently, all detected MFA maps to `type: "OTHER"`:

```javascript
if (hasMFA) {
  const mfaMetadata = {
    type: "OTHER",  // ← always OTHER
    ...
  };
```

Update to detect the specific MFA method from `amr` claims:

```javascript
if (hasMFA) {
  // Map specific amr claims to HMRC MFA type values
  // otp = TOTP authenticator app, swk/hwk = security key
  const mfaType = amrClaims.includes("otp") ? "TOTP" : "OTHER";
  const mfaMetadata = {
    type: mfaType,
    timestamp: authTime ? new Date(authTime * 1000).toISOString() : new Date().toISOString(),
    uniqueReference: crypto.randomUUID(),
  };
  sessionStorage.setItem("mfaMetadata", JSON.stringify(mfaMetadata));
  console.log("MFA detected from amr claims:", amrClaims, "type:", mfaType, "Stored metadata:", mfaMetadata);
}
```

This means:
- Cognito native TOTP → `amr` contains `otp` → `type=TOTP`
- Google 2FA → `amr` may contain `mfa` → `type=OTHER` (correct — it's federated IdP MFA, not our TOTP)
- Federated login fallback → `type=OTHER` (unchanged)

**Also update `loginWithMockCallback.html`** with the same logic if it has the same MFA detection code.

### Step 7: Disable Script — No Change Needed

**File**: `scripts/disable-cognito-native-test.js`

Deleting the Cognito user (`AdminDeleteUser`) automatically removes their TOTP device enrollment. The TOTP secret in the credentials file is deleted when the file is removed. No changes needed.

## Files to Modify

| File | Change |
|------|--------|
| `infra/.../IdentityStack.java` | Add `.mfa(Mfa.OPTIONAL)` and `.mfaSecondFactor()` to User Pool builder |
| `package.json` | Add `otpauth` devDependency |
| `scripts/create-cognito-test-user.js` | Add TOTP enrollment after user creation (Steps 1-5 above) |
| `scripts/enable-cognito-native-test.js` | Capture and save `totpSecret` in credentials file |
| `behaviour-tests/steps/behaviour-login-steps.js` | Add `handleTotpChallenge()` function, update `loginWithCognitoOrMockAuth()` |
| `web/public/auth/loginWithCognitoCallback.html` | Map `otp` in `amr` to `type=TOTP` |
| `web/public/auth/loginWithMockCallback.html` | Same MFA type mapping if applicable |

## Risks and Mitigations

| Risk | Status | Mitigation |
|------|--------|------------|
| User pool MFA change causes replacement | RESOLVED | CloudFormation docs confirm `MfaConfiguration` is "No interruption" — safe in-place update |
| Cognito Hosted UI doesn't show TOTP challenge | RESOLVED | AWS docs confirm managed login presents "an additional sign-in page" for TOTP |
| TOTP clock skew on CI runners | LOW RISK | AWS CI runners use NTP-synchronized clocks. TOTP has a 30-second window with typical ±1 step tolerance |
| Google federation affected by MFA change | NO RISK | Federated users bypass Cognito MFA entirely — Google handles its own MFA |
| TOTP code timing in test (race condition) | LOW RISK | Generate code immediately before entering it. 30-second validity window is ample for Playwright to type 6 digits |
| Hosted UI form element discovery | REQUIRES WORK | Exact input names/selectors for TOTP challenge page are undocumented. Deploy MFA first, then inspect the Hosted UI. Take screenshots during test development |
| `otpauth` package security | LOW RISK | Well-maintained, zero dependencies, widely used. TOTP generation is pure math (HMAC-SHA1 + time) |
| Existing proxy/simulator tests break | NO RISK | Proxy uses mock OAuth server (not Cognito Hosted UI). Mock already provides `amr` claims. Only CI/prod tests go through Cognito native auth |

## Verification

### Local validation (pre-push)

```bash
npm test                    # Unit tests pass (including buildFraudHeaders tests)
./mvnw clean verify         # CDK compiles with new Mfa/EnabledMfas imports
```

### CI deployment and test

1. Push CDK changes → GitHub Actions deploys to CI
2. Wait for deployment to complete

3. Enable Cognito native auth with TOTP:
   ```
   export AWS_PROFILE=submit-ci
   npm run test:enableCognitoNative
   ```
   Verify output includes `TOTP_SECRET=...`

4. Run behaviour tests:
   ```
   TEST_AUTH_USERNAME='...' TEST_AUTH_PASSWORD='...' TEST_AUTH_TOTP_SECRET='...' npm run test:submitVatBehaviour-ci
   ```

5. Verify in test output/logs:
   - TOTP challenge page detected and completed (screenshots in `target/behaviour-test-results/`)
   - `Gov-Client-Multi-Factor: type=TOTP&timestamp=...&unique-reference=...` present in HMRC requests
   - FPH validation shows `VALID_HEADER` for `Gov-Client-Multi-Factor`
   - No FPH validation errors or warnings

6. Clean up:
   ```
   npm run test:disableCognitoNative
   ```

### What success looks like

- Every behaviour test run against CI/prod that uses Cognito native auth sends a genuine `Gov-Client-Multi-Factor: type=TOTP&...` header
- The header value comes from real TOTP MFA in the authentication flow, not from mocked/injected sessionStorage
- HMRC sandbox validates the header as `VALID_HEADER`
- Proxy tests continue to work unchanged (mock OAuth provides `amr` claims → `type=OTHER`)

## Implementation Order

1. **Step 1**: CDK change (smallest, most critical — enables everything else)
2. **Step 2**: Install `otpauth`
3. **Step 3 + 4**: Test user script + enable script (can test TOTP enrollment independently via AWS CLI)
4. **Step 5**: Behaviour test TOTP challenge handler (requires deployed CDK + enrolled TOTP user to test)
5. **Step 6**: Frontend MFA type mapping (independent of other steps, can be done in parallel)
6. Verify end-to-end
