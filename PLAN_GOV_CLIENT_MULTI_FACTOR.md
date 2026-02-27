# Plan: Fix Gov-Client-Multi-Factor Header Missing from HMRC Requests

## User Assertions (non-negotiable)

- `Gov-Client-Multi-Factor` MUST be set in all HMRC API requests from CI/prod
- Behaviour tests MUST fail if any mandatory FPH header is missing
- All headers in `essentialFraudPreventionHeaders` must be asserted against in tests
- The MFA header must carry genuine values from the authentication flow
- `unique-reference` must be stable across API calls (same user + same factor = same reference)

## Evidence

### DynamoDB scan: zero MFA headers from CI tests

791 HMRC VAT requests since 2026-02-22 — **zero** have `Gov-Client-Multi-Factor`. All 15 other
Gov-* headers present on every request. Checked via `aws --profile submit-ci dynamodb scan` on
`ci-env-hmrc-api-requests` table.

### CI test run browser console (run 22462538116, 2026-02-26T21:52:18Z)

```
[BROWSER CONSOLE log]: No MFA detected. amr: [] federated: false auth_time: [UTR]
```

Cognito returns `amr: []` in the ID token even after successful TOTP challenge completion.
The frontend checks `amr` for MFA indicators → finds nothing → removes `mfaMetadata` from
sessionStorage → `Gov-Client-Multi-Factor` header never generated.

### Manual Google login DOES produce the header

User login with `antonyccartwright@gmail.com` via Google federated auth on CI
(traceparent `00-a570e5d616ec6d053c65d86852e6bd7d-90d047013cd5d85b-01`):

7 DynamoDB records found under that trace:
- 1 OAuth token exchange (no Gov headers — expected)
- 3 VAT API calls — all have `Gov-Client-Multi-Factor: type=OTHER&timestamp=2026-02-26T23:29:07.000Z&unique-reference=efd39606-4b2d-451e-b953-c4440b715403`
- 3 FPH validation calls (`/test/fraud-prevention-headers/validate`) — same MFA header

The `isFederatedLogin && authTime` branch at `loginWithCognitoCallback.html:252` works correctly
for Google federated auth. The `identities` claim triggers it, and `auth_time` provides the
real timestamp.

### FPH validation checkbox never ticked by CI tests

`runFraudPreventionHeaderValidation` is controlled by `isSandboxMode()` which checks
`HMRC_ACCOUNT=sandbox`. This is only set in `.env.simulator` and `.env` (local proxy) —
**NOT** in `.env.ci` or `.env.prod`. So CI tests never tick the checkbox and never call
HMRC's `/test/fraud-prevention-headers/validate` endpoint.

Exception: `postVatReturnFraudPreventionHeaders.behaviour.test.js` hardcodes it to `true`.

### `unique-reference` uses random UUID (HMRC non-compliant)

Both callback pages use `crypto.randomUUID()` — a fresh random value every login. HMRC spec says:

> "unique-reference identifies a single factor. Use the same hashing function consistently so that
> this can be recognised across API calls."

The user's manual login produced `unique-reference=efd39606-4b2d-451e-b953-c4440b715403` — this
will be different on next login. HMRC expects the same value for the same user's MFA factor.

### `assertEssentialFraudPreventionHeadersPresent()` defined but never called

Function exists at `dynamodb-assertions.js:223` with 8 mandatory headers including
`gov-client-multi-factor`. No test calls it. Tests call `assertFraudPreventionHeaders()` which
checks HMRC's validation feedback endpoint, not individual request headers in DynamoDB.

## Root Causes

### 1. Cognito doesn't populate `amr` for native auth TOTP

The TOTP challenge completes successfully but the ID token has `amr: []`. The frontend MFA
detection at `loginWithCognitoCallback.html:239` checks `amr` → finds nothing → header never set.

Google federated login works because it uses the `isFederatedLogin && authTime` fallback branch
(line 252) which doesn't rely on `amr`.

### 2. `unique-reference` is random per login

`crypto.randomUUID()` at lines 248/259 in the Cognito callback and lines 186/196 in the mock
callback. Must be replaced with a stable hash.

### 3. No test guards

`assertEssentialFraudPreventionHeadersPresent()` is dead code. The simulator treats
`gov-client-multi-factor` as optional. CI tests don't tick the FPH validation checkbox.

## HMRC Spec Reference

Source: [Web App via Server — Fraud Prevention](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/web-app-via-server/)

| Field | Requirement | Example |
|-------|-------------|---------|
| `type` | `TOTP`, `AUTH_CODE`, or `OTHER` | `type=TOTP` |
| `timestamp` | UTC, minimum `yyyy-MM-ddThh:mmZ`, must include `T`, 24h format | `timestamp=2026-02-26T21:52Z` |
| `unique-reference` | Identifies a single factor. Consistent hash across API calls. Not the secret. Percent-encoded. | `unique-reference=fc4b5fd6...` |

Multiple factors comma-separated. All keys and values percent-encoded (not separators).

## Implementation Steps

### Step 1: Fix `unique-reference` to Use Stable Hash — DONE

- In both callback pages, replace `crypto.randomUUID()` with:
  ```javascript
  // Stable hash: same user + same factor = same reference across all API calls
  const encoder = new TextEncoder();
  const data = encoder.encode(idTokenPayload.sub + ":" + mfaType);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const uniqueReference = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  ```
- `sub` is an opaque UUID — no PII exposure. Same sub + same factor type = same reference.
- Files: `loginWithCognitoCallback.html`, `loginWithMockCallback.html`

### Step 2: Move `gov-client-multi-factor` to Required in Simulator — DONE

- File: `app/http-simulator/routes/fraud-headers.js`
- Move `"gov-client-multi-factor"` from `optionalHeaders` (line 31) to `requiredHeaders` (line 15)
- This ensures proxy/simulator tests fail if the header is missing

### Step 3: Wire Up Essential Header Assertions in Tests — DONE

- In each behaviour test that reads HMRC API requests from DynamoDB:
  - Call `assertEssentialFraudPreventionHeadersPresent()` on each VAT API request (not OAuth token requests)
  - Import the function from `dynamodb-assertions.js`
- Tests that need the assertion:
  - `submitVat.behaviour.test.js` — calls `assertFraudPreventionHeaders` at line 718
  - `postVatReturn.behaviour.test.js` — calls at line 489
  - `getVatObligations.behaviour.test.js` — calls at line 733
  - `getVatReturn.behaviour.test.js` — calls at line 420
  - `postVatReturnFraudPreventionHeaders.behaviour.test.js` — calls at line 547

### Step 4: Add Pre Token Generation Lambda Trigger — PENDING

- Create `app/functions/auth/preTokenGeneration.js`
- In the trigger handler:
  - Check `event.request.userAttributes["cognito:preferred_mfa_setting"]`
  - If `SOFTWARE_TOKEN_MFA`, add `amr: ["pwd", "otp"]` to `claimsToAddOrOverride`
  - Return the modified event
- Add CDK construct in `IdentityStack.java` to:
  - Create Lambda function
  - Attach as Pre Token Generation trigger on the User Pool
  - Grant necessary permissions

### Step 5: Verify Proxy Tests Still Pass

- Proxy uses mock OAuth server which provides `amr: ["mfa", "pwd"]`
- Frontend should detect MFA and set `Gov-Client-Multi-Factor: type=OTHER`
- Run `npm run test:submitVatBehaviour-proxy` to confirm

### Step 6: Deploy and Verify CI

- Push changes
- Monitor CI deployment (CDK adds Lambda trigger + deploys new frontend)
- Verify DynamoDB HMRC requests now contain `Gov-Client-Multi-Factor`
- All behaviour tests should pass with the new assertions

## Files to Modify

| File | Change |
|------|--------|
| `web/public/auth/loginWithCognitoCallback.html` | Replace `crypto.randomUUID()` with stable SHA-256 hash |
| `web/public/auth/loginWithMockCallback.html` | Same |
| `app/http-simulator/routes/fraud-headers.js` | Move `gov-client-multi-factor` to `requiredHeaders` |
| `behaviour-tests/helpers/dynamodb-assertions.js` | No change (function already exists) |
| `behaviour-tests/submitVat.behaviour.test.js` | Call `assertEssentialFraudPreventionHeadersPresent()` |
| `behaviour-tests/postVatReturn.behaviour.test.js` | Same |
| `behaviour-tests/getVatObligations.behaviour.test.js` | Same |
| `behaviour-tests/getVatReturn.behaviour.test.js` | Same |
| `behaviour-tests/postVatReturnFraudPreventionHeaders.behaviour.test.js` | Same |
| `app/functions/auth/preTokenGeneration.js` | **NEW** — Pre Token Generation Lambda trigger |
| `infra/.../IdentityStack.java` | Add Lambda + Pre Token Generation trigger |

## Verification

1. `npm test` — unit tests pass
2. `./mvnw clean verify` — CDK builds
3. `npm run test:submitVatBehaviour-proxy` — proxy tests pass with MFA header
4. Push → deploy → `npm run test:submitVatBehaviour-ci` — CI tests pass
5. Check DynamoDB: all HMRC requests have `Gov-Client-Multi-Factor` header
6. Behaviour tests fail if any essential FPH header is missing (regression guard)
