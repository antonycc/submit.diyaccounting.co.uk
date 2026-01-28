# Production Login Experience Cleanup Plan

## Goal

Provide a clean, professional login experience for production users while maintaining the ability to run automated behavior tests.

### User Experience Goals

| Environment | Login Options Visible | Notes |
|-------------|----------------------|-------|
| **Production** (normal) | Google only | Clean UX for real users |
| **Production** (during tests) | Google + Native form | Temporarily enabled by toggle script |
| **CI** (normal) | Google only | Same clean UX |
| **CI** (during tests) | Google + Native form | Temporarily enabled by toggle script |
| **Proxy/Simulator** | Google + Mock auth | Local development |

---

## Phase 1: Disable Cognito Self-Registration -- DONE

**Commit:** Previously deployed

**Change:** `IdentityStack.java` — `.selfSignUpEnabled(false)`

**Impact:**
- Cognito Hosted UI no longer shows "Create account" option
- Random users cannot self-register
- Tests create users via `adminCreateUser` API
- Federated users (Google) still auto-created on first login

---

## Phase 2: Hide Native Login + Remove Custom Form -- DONE

**Commit:** `gateway` branch, pushed 2026-01-27

Instead of the originally planned approach (hide the custom `login-native-addon.js` form behind a toggle button), we took a different approach:

### What we actually did:

1. **Removed `COGNITO` from default `supportedIdentityProviders`** in `IdentityStack.java` — the Hosted UI no longer shows the native email/password form by default

2. **Added `AccountRecovery.NONE`** to the UserPool — removes "Forgot your password?" from the Hosted UI

3. **Created `scripts/toggle-cognito-native-auth.js`** — enables/disables COGNITO on the UserPoolClient via `UpdateUserPoolClient` API at runtime. Used during tests to temporarily show the native form.

4. **Created `scripts/delete-cognito-test-user.js`** — deletes test users after tests complete

5. **Rewrote `cognito-native` test flow** to go through the actual Cognito Hosted UI native form (`fillInHostedUINativeAuth` / `submitHostedUINativeAuth`) instead of the custom `login-native-addon.js` form + `/api/v1/cognito/native-auth` endpoint

6. **Updated `synthetic-test.yml`** — added `skip-cleanup` and `skip-native-auth-toggle` inputs, enable/disable steps around the test, user deletion step, and enabled concurrency group

7. **Updated `deploy.yml`** — added `enable-native-auth` and `disable-native-auth` wrapper jobs around the behaviour test fan-out, `skipCleanup` input, and all synthetic test calls pass `skip-native-auth-toggle: 'true'`

8. **Removed redundant custom native auth code:**
   - Deleted `web/public/auth/login-native-addon.js`
   - Deleted `app/functions/auth/cognitoNativeAuthPost.js`
   - Cleaned up `app/bin/server.js` (removed import, conditional serving, route registration)
   - Cleaned up `web/public/auth/login.html` (removed `#native-auth-container` div and script tag)
   - Updated `PublishStack.java` to exclude `login-native-addon.js` from S3 deployment

### Why this differs from the original plan:

The original plan kept the custom form and hid it behind a "Show developer options" toggle. The new approach is better because:
- No native login surface exists on the Hosted UI by default (not even hidden behind a toggle)
- The toggle script enables/disables COGNITO at the Cognito service level, not just visually
- No custom API endpoint needed — authentication goes through the standard Hosted UI OAuth flow
- Cleaner separation: tests use the same Hosted UI form that a real user would see

See `PLAN_COGNITO_HOSTED_UI_NATIVE_AUTH_TOGGLE.md` for the full design of the toggle mechanism.

---

## Phase 3: Enable cognito-native in .env files -- DONE

**Commit:** Previously deployed

**Changes:**
- `.env.ci` line 45: `TEST_AUTH_PROVIDER=cognito-native`
- `.env.prod` line 45: `TEST_AUTH_PROVIDER=cognito-native`

Tests now use native Cognito authentication via the Hosted UI instead of the OIDC.antonycc.com provider.

---

## Phase 4: Remove OIDC.antonycc.com Provider

Now that all tests use `cognito-native`, the antonycc OIDC provider ("Sign in with your corporate ID" on the Hosted UI) is unused and should be removed.

### Phased removal approach (one deploy per step):

#### Phase 4.1: Remove from supportedIdentityProviders

Remove `cognito` (the antonycc OIDC provider name) from the UserPoolClient's `supportedIdentityProviders`. This hides "Sign in with your corporate ID" from the Hosted UI. The provider definition stays in the stack (safe to roll back).

**File:** `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`

**Comment out line 213:**
```java
this.identityProviders.put(UserPoolClientIdentityProvider.custom("cognito"), this.antonyccIdentityProvider);
```

**Impact:**
- "Sign in with your corporate ID" disappears from the Hosted UI
- The `CfnUserPoolIdentityProvider` resource still exists in CloudFormation (no resource deletion)
- Rollback: re-add the line, deploy, and the button reappears

**Verification:**
```bash
./mvnw clean verify
# Deploy to ci, then visit ci-auth.submit.diyaccounting.co.uk/login
# Should show only Google (and COGNITO if toggled on)
```

#### Phase 4.2: Change the OIDC issuer domain

Change the OIDC issuer from `https://oidc.antonycc.com/` to a placeholder like `https://oidc.removed.invalid/`. This ensures the provider can't be used even if somehow re-enabled, and confirms CloudFormation can update the provider resource in-place.

**Files:**
- `cdk-environment/cdk.json` line 29: change `"antonyccBaseUri": "https://oidc.antonycc.com/"` to `"antonyccBaseUri": "https://oidc.removed.invalid/"`
- `cdk-application/cdk.json` line 34: same change

**Verification:**
```bash
./mvnw clean verify
# Deploy and verify CloudFormation updates the provider resource successfully
```

#### Phase 4.3: Remove the provider entirely

Remove all antonycc OIDC provider code and configuration.

**Files to modify:**

**`IdentityStack.java`:**
- Remove field (line 56): `public CfnUserPoolIdentityProvider antonyccIdentityProvider;`
- Remove interface props (lines 96-98): `String antonyccClientId();` and `String antonyccBaseUri();`
- Remove provider creation (lines 191-212): the entire `CfnUserPoolIdentityProvider.Builder` block
- Remove output (line 271): `cfnOutput(this, "CognitoAntonyccIdpId", ...);`
- Remove import if no longer needed: `CfnUserPoolIdentityProvider`

**`SubmitEnvironment.java`:**
- Remove props (lines 50-51): `public String antonyccClientId;` and `public String antonyccBaseUri;`
- Remove builder calls (lines 215-216): `.antonyccClientId(appProps.antonyccClientId)` and `.antonyccBaseUri(appProps.antonyccBaseUri)`

**`cdk-environment/cdk.json`:**
- Remove lines 28-29: `"antonyccClientId"` and `"antonyccBaseUri"`

**`cdk-application/cdk.json`:**
- Remove the same keys

**`behaviour-tests/steps/behaviour-login-steps.js`:**
- Remove `selectOidcCognitoAuth()` function (lines 126-141)
- Remove `fillInCognitoAuth()` function (lines 143-149)
- Remove `submitCognitoAuth()` function (lines 151-159)
- Remove the `cognito` branch in `loginWithCognitoOrMockAuth()` (lines 55-79)

**Verification:**
```bash
./mvnw clean verify
npm test
# Deploy and verify CloudFormation deletes the CfnUserPoolIdentityProvider resource
# Run synthetic tests to confirm cognito-native still works
```

---

## Authentication Flow Reference (Current State)

### Supported Authentication Providers (TEST_AUTH_PROVIDER values)

| Value | Environment | How it works |
|-------|-------------|--------------|
| `mock` | proxy, proxyRunning | Mock OAuth2 server in Docker; user enters any username |
| `simulator` | simulator | HTTP simulator mode |
| `test` | unit tests | Mocked authentication |
| `cognito-native` | ci, prod | Toggle script enables COGNITO on Hosted UI; Playwright fills in email/password on Hosted UI |
| `cognito` | _(deprecated, remove in Phase 4.3)_ | Redirects to OIDC.antonycc.com |

### How Behavior Tests Authenticate in AWS (ci/prod)

**Current flow with `TEST_AUTH_PROVIDER=cognito-native`:**
1. `synthetic-test.yml` / `deploy.yml` enables COGNITO on UserPoolClient via `toggle-cognito-native-auth.js`
2. `synthetic-test.yml` creates test user via `scripts/create-cognito-test-user.js`
3. Test navigates to `/auth/login.html`
4. Test clicks "Continue with Google via Amazon Cognito" (goes to Hosted UI)
5. Hosted UI shows native email/password form (because COGNITO was enabled)
6. Test fills in email/password on the Hosted UI
7. Test submits; Hosted UI does OAuth code exchange
8. Browser redirects to `/auth/loginWithCognitoCallback.html` with auth code
9. Callback page exchanges code for tokens
10. After test: user deleted, COGNITO disabled (unless `skip-cleanup`)

### Related Files Map

```
Authentication Flow:
├── web/public/auth/login.html                      # Login page with Google button
├── web/public/auth/login-mock-addon.js              # Mock auth for local dev (excluded from AWS)
├── web/public/auth/loginWithCognitoCallback.html    # OAuth callback handler
│
├── app/bin/server.js                                # Express server (local dev)
│
├── behaviour-tests/steps/behaviour-login-steps.js   # Test login helpers
│
├── scripts/create-cognito-test-user.js              # Creates test user via adminCreateUser
├── scripts/delete-cognito-test-user.js              # Deletes test user via adminDeleteUser
└── scripts/toggle-cognito-native-auth.js            # Enables/disables COGNITO on UserPoolClient

Infrastructure:
├── infra/main/java/.../stacks/IdentityStack.java    # Cognito User Pool, providers, client
├── infra/main/java/.../stacks/PublishStack.java     # S3 deployment (excludes mock/native addon files)
├── infra/main/java/.../SubmitEnvironment.java       # CDK app entry point
│
├── cdk-environment/cdk.json                         # Context for environment stacks
└── cdk-application/cdk.json                         # Context for app stacks

Workflows:
├── .github/workflows/synthetic-test.yml             # Runs behavior tests, manages toggle + test users
└── .github/workflows/deploy.yml                     # Deploys stacks, wraps tests with enable/disable jobs
```

---

## Success Criteria

- [x] Self-signup disabled (`selfSignUpEnabled: false`)
- [x] Account recovery disabled (`AccountRecovery.NONE`)
- [x] COGNITO removed from default supportedIdentityProviders
- [x] Toggle script enables/disables COGNITO during tests
- [x] Custom native auth code removed (login-native-addon.js, cognitoNativeAuthPost.js)
- [x] Tests use Hosted UI native form via `cognito-native`
- [x] `.env.ci` and `.env.prod` set to `TEST_AUTH_PROVIDER=cognito-native`
- [x] OIDC.antonycc.com provider removed from Hosted UI (Phase 4.1)
- [ ] OIDC.antonycc.com issuer changed to placeholder (Phase 4.2)
- [ ] OIDC.antonycc.com provider code fully removed (Phase 4.3)
