# Plan: Cognito TOTP MFA for Gov-Client-Multi-Factor Header

## Problem

`Gov-Client-Multi-Factor` is only populated when authenticating via Google (federated IdP) because the `amr` claim in the ID token contains MFA indicators like `["mfa", "pwd"]`. When using Cognito native auth (email/password) — including behaviour tests — no MFA occurs, so the header is absent.

Behaviour tests currently use Cognito native auth via `enable-cognito-native-test.js`. There's an `injectMockMfa()` helper that fakes the header in sessionStorage, but this doesn't exercise the real auth flow.

## Goal

Enable TOTP MFA on Cognito native auth so behaviour tests produce a genuine `Gov-Client-Multi-Factor` header value obtained through the real auth system.

## Also: Gov-Client-User-IDs Key Name

Currently:
- Frontend sends: `Gov-Client-User-IDs: browser=<cognito-sub>`
- Backend overwrites with: `Gov-Client-User-IDs: server=<cognito-sub>`

HMRC spec says the key should describe the account system, not the component. Both `browser=` and `server=` are accepted by the validator but are misleading — it's the same Cognito sub in both cases.

**Recommendation**: Use `cognito=<sub>` consistently in both frontend and backend. This accurately describes the identity system. The HMRC validator doesn't enforce specific key names — it just checks the `key=value` format.

Files to change:
- `app/lib/buildFraudHeaders.js:142` — change `server=` to `cognito=`
- `web/public/lib/services/hmrc-service.js:215` — change `browser=` to `cognito=`
- Update tests that assert `server=` or `browser=` prefix

## Implementation Steps

### 1. CDK: Enable TOTP MFA on User Pool

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`

- Set MFA to `OPTIONAL` (doesn't force MFA on users who haven't enrolled)
- Enable TOTP as an MFA mechanism
- This allows per-user MFA enrollment without affecting existing users or Google federation

```java
.mfa(Mfa.OPTIONAL)
.enabledMfas(EnabledMfas.builder()
    .otp(true)    // TOTP via authenticator apps
    .sms(false)   // No SMS MFA
    .build())
```

**Risk**: Changing MFA settings on an existing user pool may require replacement. Check CloudFormation docs — `Mfa` and `EnabledMfas` may be updatable in-place on PLUS tier pools.

### 2. Test User Script: Enroll TOTP Device

**File**: `scripts/create-cognito-test-user.js`

After creating the user and setting the password, enroll a TOTP device:

1. Call `AssociateSoftwareToken` — returns a `SecretCode` (base32-encoded TOTP secret)
2. Compute a valid TOTP code from the secret (use `otpauth` npm package)
3. Call `VerifySoftwareToken` with the computed code — confirms enrollment
4. Call `AdminSetUserMFAPreference` — set TOTP as preferred MFA

Save the TOTP secret in `cognito-native-test-credentials.json` alongside username/password:

```json
{
  "userPoolId": "us-east-1_xxx",
  "clientId": "xxx",
  "username": "test-xxx@test.diyaccounting.co.uk",
  "password": "TestXxx!Aa1",
  "totpSecret": "JBSWY3DPEHPK3PXP..."
}
```

**New dependency**: `otpauth` (or `totp-generator`) — lightweight TOTP code generation.

### 3. Behaviour Tests: Handle MFA Challenge

**File**: `behaviour-tests/helpers/behaviour-helpers.js`

After the Cognito hosted UI login (username/password), Cognito presents a TOTP challenge page. The test needs to:

1. Detect the MFA challenge page (look for TOTP input field)
2. Read the TOTP secret from credentials file
3. Compute the current 6-digit code using `otpauth`
4. Enter the code and submit
5. Login completes — ID token now contains `amr` with MFA indicators

The existing `loginWithCognitoCallback.html` code already:
- Checks `amr` for `["mfa", "otp"]` indicators
- Stores MFA metadata in sessionStorage
- `hmrc-service.js` reads it and sends the header

No frontend changes needed.

### 4. Resulting Header Value

After TOTP MFA, the Cognito ID token `amr` claim contains MFA indicators. The frontend generates:

```
Gov-Client-Multi-Factor: type=TOTP&timestamp=2026-02-10T01:15:00.000Z&unique-reference=<uuid>
```

The backend passes this through to HMRC via `buildFraudHeaders.js` (already in the `clientHeaderNames` pass-through list).

## Files to Modify

| File | Change |
|------|--------|
| `infra/.../IdentityStack.java` | Enable OPTIONAL TOTP MFA on user pool |
| `scripts/create-cognito-test-user.js` | Enroll TOTP device, save secret |
| `scripts/enable-cognito-native-test.js` | Pass TOTP secret through to credentials file |
| `scripts/disable-cognito-native-test.js` | No change needed (user deletion removes MFA) |
| `behaviour-tests/helpers/behaviour-helpers.js` | Add TOTP challenge handler |
| `package.json` | Add `otpauth` devDependency |
| `app/lib/buildFraudHeaders.js` | Change `server=` to `cognito=` |
| `web/public/lib/services/hmrc-service.js` | Change `browser=` to `cognito=` |
| Tests asserting `server=` or `browser=` prefix | Update to `cognito=` |

## Risks and Considerations

1. **User pool MFA change**: Verify that enabling OPTIONAL MFA on an existing Cognito user pool is an in-place update, not a replacement (which would delete all users)
2. **Cognito hosted UI**: Confirm the TOTP challenge page is part of the hosted UI flow (not a custom UI requirement)
3. **TOTP clock skew**: TOTP codes are time-based — CI runners must have accurate clocks (they do)
4. **Google federation unaffected**: Federated users bypass Cognito MFA — Google's own MFA is detected via `amr` as before
5. **`injectMockMfa()` stays**: Keep the mock helper for tests that don't go through the full login flow

## Verification

1. Deploy CDK changes to ci environment
2. Run `npm run test:enableCognitoNative` — should enroll TOTP device
3. Run `npm run test:submitVatBehaviour-ci` — tests should:
   - Complete TOTP MFA challenge during login
   - Send `Gov-Client-Multi-Factor: type=TOTP&timestamp=...&unique-reference=...`
   - HMRC fraud header validation should show `VALID_HEADER` for this field
4. Run `npm run test:disableCognitoNative` — cleanup
