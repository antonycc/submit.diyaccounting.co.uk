# Production Login Experience Cleanup Plan

## Goal

Provide a clean, professional login experience for production users while maintaining the ability to run automated behavior tests.

### User Experience Goals

| Environment | Login Options Visible | Notes |
|-------------|----------------------|-------|
| **Production** (normal) | Google only | Clean UX for real users |
| **Production** (dev mode) | Google + Native form | Click "Show developer options" |
| **CI** (normal) | Google only | Same clean UX |
| **CI** (dev mode) | Google + Native form | Tests click the toggle |
| **Proxy/Simulator** | Google + Mock auth | Local development |

### What's Wrong Today

1. **Test User Login always visible in prod**: The `login-native-addon.js` file is deployed to S3 and the form is always shown.

2. **Cognito Hosted UI native login**: The hosted UI shows native login when `selfSignUpEnabled(true)`.

3. **OIDC.antonycc.com provider**: Legacy identity provider to be removed.

---

## Implementation Phases

### Phase 1: Disable Cognito Self-Registration

**File:** `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`

**Line 154 - Change from:**
```java
                .selfSignUpEnabled(true)
```

**To:**
```java
                .selfSignUpEnabled(false)
```

**Full context (lines 152-172):**
```java
        this.userPool = UserPool.Builder.create(this, props.resourceNamePrefix() + "-UserPool")
                .userPoolName(props.resourceNamePrefix() + "-user-pool")
                .selfSignUpEnabled(false)  // CHANGED: was true
                .signInAliases(SignInAliases.builder().email(true).build())
                .standardAttributes(standardAttributes)
                .customAttributes(Map.of(
                        "bundles",
                        StringAttribute.Builder.create()
                                .maxLen(2048)
                                .mutable(true)
                                .build()))
                // Phase 2.1: Enable Cognito Threat Protection (risk-based adaptive authentication)
                // FULL_FUNCTION mode blocks suspicious sign-ins and requires MFA for risky attempts
                // Provides: compromised credential detection, account takeover protection,
                // suspicious IP detection, and device fingerprinting
                // Requires PLUS tier for Threat Protection features
                .featurePlan(FeaturePlan.PLUS)
                .standardThreatProtectionMode(StandardThreatProtectionMode.FULL_FUNCTION)
                .customThreatProtectionMode(CustomThreatProtectionMode.FULL_FUNCTION)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
```

**Impact:**
- Cognito Hosted UI will no longer show "Create account" option
- Random users cannot self-register or use native login
- Tests can still create users via `adminCreateUser` API
- Federated users (Google) still auto-created on first login

**Security note:** With self-signup disabled, even if someone sees the native login form, they cannot use it unless they have credentials for a user created via `adminCreateUser`.

**Verification:**
```bash
./mvnw clean verify
```

**What users will see on Cognito Hosted UI after this change:**

Before (current):
- `https://prod-auth.submit.diyaccounting.co.uk/login?...`
- Shows: Email/password form, "Create account" link, "Sign in with Google" button, "Sign in with cognito" button

After:
- Same URL
- Shows: Email/password form (but can't create new accounts), "Sign in with Google" button, "Sign in with cognito" button
- The "Create account" link is removed
- Existing users created via `adminCreateUser` can still log in with email/password

**Note:** The Cognito Hosted UI email/password form is separate from our custom `login-native-addon.js`. The hosted UI is used when users click "Continue with Google" and get redirected to Cognito. Our addon is used for direct API-based authentication during tests.

---

### Phase 2: Hide Native Login Form by Default

**File:** `web/public/auth/login-native-addon.js`

**Replace the entire file with:**

```javascript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/public/auth/login-native-addon.js
// Native Cognito user login addon - only served when TEST_AUTH_PROVIDER=cognito-native
// In other environments, server.js returns an empty script for this file

(function () {
  "use strict";

  const container = document.getElementById("native-auth-container");
  if (!container) return;

  // Inject the native login form (hidden by default)
  container.innerHTML = `
    <div class="developer-options">
      <button type="button" class="dev-toggle-btn" id="showDevOptions">
        Show developer options
      </button>
    </div>
    <div class="auth-provider" id="nativeCognitoProvider" style="display: none;">
      <h3 style="margin: 1rem 0 0.5rem; font-size: 1rem; color: #666;">Test User Login</h3>
      <form id="nativeLoginForm" class="native-login-form">
        <div class="form-group">
          <input
            type="email"
            id="nativeUsername"
            name="username"
            placeholder="Email address"
            required
            autocomplete="username"
          />
        </div>
        <div class="form-group">
          <input
            type="password"
            id="nativePassword"
            name="password"
            placeholder="Password"
            required
            autocomplete="current-password"
          />
        </div>
        <button type="submit" class="btn auth-btn native-btn" id="loginWithNativeCognito">
          Sign in with Test Account
        </button>
        <p class="native-hint">For behavior tests only</p>
      </form>
    </div>
    <style>
      .developer-options {
        margin-top: 2rem;
        text-align: center;
      }
      .dev-toggle-btn {
        background: none;
        border: none;
        color: #999;
        font-size: 0.75rem;
        cursor: pointer;
        padding: 0.5rem;
      }
      .dev-toggle-btn:hover {
        color: #666;
        text-decoration: underline;
      }
      .native-login-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 300px;
        margin: 0 auto;
      }
      .native-login-form .form-group input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
      }
      .native-login-form .form-group input:focus {
        outline: none;
        border-color: #2c5aa0;
      }
      .native-btn {
        background: #6c757d !important;
        border: none;
      }
      .native-btn:hover {
        background: #5a6268 !important;
      }
      .native-hint {
        font-size: 0.75rem;
        color: #666;
        margin: 0.5rem 0 0;
        text-align: center;
      }
    </style>
  `;

  // Add toggle handler for developer options
  const toggleBtn = document.getElementById("showDevOptions");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      const provider = document.getElementById("nativeCognitoProvider");
      const isHidden = provider.style.display === "none";
      provider.style.display = isHidden ? "block" : "none";
      this.textContent = isHidden ? "Hide developer options" : "Show developer options";
    });
  }

  // Add form submit handler
  const form = document.getElementById("nativeLoginForm");
  if (form) {
    form.addEventListener("submit", loginWithNativeCognito);
  }

  // Login with native Cognito user (username/password)
  async function loginWithNativeCognito(e) {
    e.preventDefault();

    const username = document.getElementById("nativeUsername").value;
    const password = document.getElementById("nativePassword").value;
    const submitBtn = document.getElementById("loginWithNativeCognito");

    console.log("Initiating native Cognito user login");

    // Clear stored tokens and user info
    localStorage.removeItem("cognitoAccessToken");
    localStorage.removeItem("cognitoIdToken");
    localStorage.removeItem("cognitoRefreshToken");
    localStorage.removeItem("userInfo");
    localStorage.removeItem("authState");

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    try {
      const response = await fetch("/api/v1/cognito/native-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Authentication failed: ${response.status}`);
      }

      const tokens = await response.json();

      // Store tokens
      localStorage.setItem("cognitoAccessToken", tokens.accessToken);
      localStorage.setItem("cognitoIdToken", tokens.idToken);
      if (tokens.refreshToken) {
        localStorage.setItem("cognitoRefreshToken", tokens.refreshToken);
      }

      // Decode ID token to extract user info
      const idTokenPayload = decodeJwtPayload(tokens.idToken);
      const userInfo = {
        sub: idTokenPayload.sub,
        email: idTokenPayload.email || username,
        given_name: idTokenPayload.given_name || "",
        family_name: idTokenPayload.family_name || "",
      };
      localStorage.setItem("userInfo", JSON.stringify(userInfo));

      console.log("Native Cognito login successful", { email: userInfo.email });

      if (typeof window.showStatus === "function") {
        window.showStatus("Login successful", "success");
      }

      // Redirect to home page
      window.location.href = "../index.html";
    } catch (error) {
      console.error("Native Cognito login failed:", error);
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in with Test Account";

      if (typeof window.showStatus === "function") {
        window.showStatus(error.message || "Login failed. Please check your credentials.", "error");
      } else {
        alert(error.message || "Login failed. Please check your credentials.");
      }
    }
  }

  // Decode JWT payload (base64url)
  function decodeJwtPayload(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }
      const payload = parts[1];
      // Handle base64url encoding
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const decoded = atob(padded);
      return JSON.parse(decoded);
    } catch (e) {
      console.error("Failed to decode JWT:", e);
      return {};
    }
  }
})();
```

---

### Phase 3: Update Behavior Tests

**File:** `behaviour-tests/steps/behaviour-login-steps.js`

**Modify the `fillInNativeAuth` function (lines 203-220):**

**Change from:**
```javascript
// Native Cognito authentication (username/password)
export async function fillInNativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enters their native Cognito credentials", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-native-auth.png` });

    // Wait for the native auth form to be visible
    await expect(page.locator("#nativeLoginForm")).toBeVisible({ timeout: 10000 });

    // Fill in username (email)
    await loggedFill(page, "#nativeUsername", testAuthUsername, "Entering username", { screenshotPath });
    await page.waitForTimeout(100);

    // Fill in password
    if (testAuthPassword) {
      await loggedFill(page, "#nativePassword", testAuthPassword, "Entering password", { screenshotPath });
    }
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-native-auth-filled.png` });
  });
}
```

**To:**
```javascript
// Native Cognito authentication (username/password)
export async function fillInNativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enters their native Cognito credentials", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-native-auth.png` });

    // Click "Show developer options" to reveal the native login form
    const devToggle = page.locator("#showDevOptions");
    if (await devToggle.isVisible({ timeout: 5000 })) {
      await loggedClick(page, devToggle, "Show developer options", { screenshotPath });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01b-native-auth-dev-options-shown.png` });
    }

    // Wait for the native auth form to be visible
    await expect(page.locator("#nativeLoginForm")).toBeVisible({ timeout: 10000 });

    // Fill in username (email)
    await loggedFill(page, "#nativeUsername", testAuthUsername, "Entering username", { screenshotPath });
    await page.waitForTimeout(100);

    // Fill in password
    if (testAuthPassword) {
      await loggedFill(page, "#nativePassword", testAuthPassword, "Entering password", { screenshotPath });
    }
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-native-auth-filled.png` });
  });
}
```

---

### Phase 4: Remove OIDC.antonycc.com Provider (Future)

Once everything else is working, remove the legacy identity provider.

#### 4.1 IdentityStack.java

**File:** `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`

**Remove the field declaration (line 55):**
```java
    public CfnUserPoolIdentityProvider antonyccIdentityProvider;
```

**Remove from IdentityStackProps interface (lines 95-97):**
```java
        String antonyccClientId();

        String antonyccBaseUri();
```

**Remove the provider creation (lines 189-211):**
```java
        // Antonycc OIDC via Cognito IdP (using L1 construct to avoid clientSecret requirement)
        this.antonyccIdentityProvider = CfnUserPoolIdentityProvider.Builder.create(
                        this, props.resourceNamePrefix() + "-CognitoIdentityProvider")
                .providerName("cognito")
                .providerType("OIDC")
                .userPoolId(this.userPool.getUserPoolId())
                .providerDetails(Map.of(
                        "client_id",
                        props.antonyccClientId(),
                        "oidc_issuer",
                        props.antonyccBaseUri(),
                        "authorize_scopes",
                        "email openid profile",
                        "attributes_request_method",
                        "GET"
                        // No client_secret provided
                        ))
                .attributeMapping(Map.of(
                        "email", "email",
                        "given_name", "given_name",
                        "family_name", "family_name"))
                .build();
        this.identityProviders.put(UserPoolClientIdentityProvider.custom("cognito"), this.antonyccIdentityProvider);
```

**Remove the output (line 268):**
```java
        cfnOutput(this, "CognitoAntonyccIdpId", this.antonyccIdentityProvider.getProviderName());
```

#### 4.2 SubmitEnvironment.java

**File:** `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java`

**Remove from SubmitEnvironmentProps class (lines 50-51):**
```java
        public String antonyccClientId;
        public String antonyccBaseUri;
```

**Remove from IdentityStack builder (lines 215-216):**
```java
                        .antonyccClientId(appProps.antonyccClientId)
                        .antonyccBaseUri(appProps.antonyccBaseUri)
```

#### 4.3 CDK Context Files

**File:** `cdk-environment/cdk.json` (lines 28-29)

**Remove:**
```json
    "antonyccClientId": "submit-diyaccounting-co-uk",
    "antonyccBaseUri": "https://oidc.antonycc.com/",
```

**File:** `cdk-application/cdk.json` (lines 33-34)

**Remove:**
```json
    "antonyccClientId": "submit-diyaccounting-co-uk",
    "antonyccBaseUri": "https://oidc.antonycc.com/",
```

#### 4.4 Test Files Using Cognito OIDC Provider

**File:** `behaviour-tests/steps/behaviour-login-steps.js`

The following functions are used for the `TEST_AUTH_PROVIDER=cognito` flow which uses the antonycc OIDC provider:
- `selectOidcCognitoAuth()` (lines 123-138)
- `fillInCognitoAuth()` (lines 140-146)
- `submitCognitoAuth()` (lines 148-156)

These will need to be removed or updated once the OIDC provider is removed. The `loginWithCognitoOrMockAuth()` function (line 52-76) has a branch for `testAuthProvider === "cognito"` that calls these functions.

**After Phase 4, supported auth providers will be:**
- `mock` - Local development with mock-oauth2-server
- `cognito-native` - AWS environments with Cognito username/password
- Google federated login - Production users via Cognito hosted UI

---

## Code Elements Summary

### Files to Modify

| File | Change |
|------|--------|
| `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java` | `selfSignUpEnabled(false)` (Phase 1) |
| `web/public/auth/login-native-addon.js` | Hide form by default, add toggle button (Phase 2) |
| `behaviour-tests/steps/behaviour-login-steps.js` | Click toggle before using native login (Phase 3) |
| `.env.ci` | Change `TEST_AUTH_PROVIDER=cognito` to `TEST_AUTH_PROVIDER=cognito-native` |
| `.env.prod` | Change `TEST_AUTH_PROVIDER=cognito` to `TEST_AUTH_PROVIDER=cognito-native` |

### No Changes Needed

- No new Lambda functions
- No SSM parameters
- No CloudFront behavior changes
- No workflow changes to `synthetic-test.yml` or `deploy.yml`

---

## Test Scenarios

### Scenario 1: Production User Login
1. User visits https://submit.diyaccounting.co.uk/auth/login.html
2. Sees only "Continue with Google via Amazon Cognito" button
3. Small "Show developer options" link at bottom (unobtrusive)
4. User ignores it and logs in with Google

### Scenario 2: Curious User Clicks Developer Options
1. User clicks "Show developer options"
2. Native login form appears
3. User tries to enter random credentials
4. Login fails (no valid user exists - self-signup disabled)

### Scenario 3: Automated Test in CI
1. Test creates Cognito user via `adminCreateUser`
2. Playwright visits login page
3. Test clicks "Show developer options"
4. Test fills in credentials and submits
5. Login succeeds (user was pre-created)

### Scenario 4: Local Development (proxy)
1. Express server serves `login-mock-addon.js` for `TEST_AUTH_PROVIDER=mock`
2. Mock OAuth flow works locally
3. Native addon also hidden by default with toggle

---

## Verification Commands

```bash
# Build and verify CDK changes
./mvnw clean verify

# Run unit tests
npm test

# Run behavior tests locally (proxy environment)
npm run test:submitVatBehaviour-proxy
```

---

## Success Criteria

- [ ] Production login page shows only Google login by default
- [ ] "Show developer options" reveals native login form
- [ ] Native login fails for non-existent users (self-signup disabled)
- [ ] Behavior tests pass using native Cognito auth (click toggle first)
- [ ] OIDC.antonycc.com provider removed (Phase 4)

---

## Why This Approach

1. **Simple**: Pure client-side change, no infrastructure modifications
2. **Secure**: Self-signup disabled means native form is harmless
3. **Maintainable**: No SSM toggles to manage or race conditions to worry about
4. **Transparent**: Developers can still access the form when needed
5. **Test-friendly**: Tests just need one extra click

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Self-signup disabled breaks something | Federated users (Google) still auto-created; tests use adminCreateUser |
| Toggle not clicked by tests | Test code explicitly clicks toggle before filling form |
| Curious user sees form | Form is harmless without valid credentials |
| Deployment breaks existing users | No impact on existing authenticated sessions |

---

## Deployment Order

1. **Phase 1** can be deployed independently (disables self-signup in Cognito)
2. **Phase 2** should be deployed with **Phase 3** (hide form + test code clicks toggle)
3. **Enable cognito-native** in .env files (can be done with Phase 3 or later)
   - This switches AWS tests from OIDC.antonycc.com to direct Cognito authentication
   - Required before Phase 4 can be deployed
4. **Phase 4** should be deployed after:
   - Phases 1-3 are verified working
   - .env files have `TEST_AUTH_PROVIDER=cognito-native`
   - Tests confirmed working with cognito-native

---

## Authentication Flow Reference

### Current Authentication Providers (TEST_AUTH_PROVIDER values)

| Value | Environment | How it works |
|-------|-------------|--------------|
| `mock` | proxy, simulator | Mock OAuth2 server in Docker; user enters any username |
| `cognito` | ci, prod (current default) | Redirects to Cognito Hosted UI → OIDC.antonycc.com |
| `cognito-native` | ci, prod (for tests) | Direct API call to Cognito with username/password |
| `test` | unit tests | Mocked authentication |

### How Behavior Tests Authenticate in AWS (ci/prod)

**Current flow with `TEST_AUTH_PROVIDER=cognito`:**
1. Test navigates to `/auth/login.html`
2. Test clicks "Continue with Google via Amazon Cognito"
3. Browser redirects to Cognito Hosted UI
4. Test clicks "cognito" button (OIDC.antonycc.com provider)
5. Browser redirects to OIDC.antonycc.com login page
6. Test clicks "Fill Form" and "Sign in"
7. Browser redirects back with tokens

**New flow with `TEST_AUTH_PROVIDER=cognito-native`:**
1. `synthetic-test.yml` creates test user via `scripts/create-cognito-test-user.sh`
2. Test navigates to `/auth/login.html`
3. Test clicks "Show developer options" (NEW STEP)
4. Test fills in username/password
5. Test clicks "Sign in with Test Account"
6. JavaScript calls `/api/v1/cognito/native-auth` API
7. Lambda authenticates via Cognito USER_PASSWORD_AUTH flow
8. Tokens returned and stored in localStorage

### Related Files Map

```
Authentication Flow:
├── web/public/auth/login.html              # Login page with Google button
├── web/public/auth/login-native-addon.js   # Injected native login form (Phase 2)
├── web/public/auth/login-mock-addon.js     # Mock auth for local dev (excluded from AWS)
├── web/public/auth/loginWithCognitoCallback.html  # OAuth callback handler
│
├── app/bin/server.js                       # Express server (local dev)
│   ├── GET /auth/login-native-addon.js     # Conditional serving based on TEST_AUTH_PROVIDER
│   └── POST /api/v1/cognito/native-auth    # Native auth endpoint (when cognito-native)
│
├── app/functions/auth/cognitoNativeAuthPost.js    # Lambda for native auth
│
├── behaviour-tests/steps/behaviour-login-steps.js # Test login helpers (Phase 3)
│
└── scripts/create-cognito-test-user.sh     # Creates test user via adminCreateUser

Infrastructure:
├── infra/main/java/.../stacks/IdentityStack.java  # Cognito User Pool (Phase 1, 4)
├── infra/main/java/.../stacks/PublishStack.java   # S3 deployment (excludes mock files)
├── infra/main/java/.../SubmitEnvironment.java     # CDK app entry point (Phase 4)
│
├── cdk-environment/cdk.json                # Context for environment stacks (Phase 4)
└── cdk-application/cdk.json                # Context for app stacks (Phase 4)

Workflows:
├── .github/workflows/synthetic-test.yml    # Runs behavior tests, creates Cognito users
└── .github/workflows/deploy.yml            # Deploys stacks, calls synthetic-test
```

### Environment Configuration

**`.env.ci` current values (lines 44-47):**
```
TEST_AUTH_PROVIDER=cognito
# TEST_AUTH_PROVIDER=cognito-native
TEST_AUTH_USERNAME=
TEST_AUTH_PASSWORD=
```

**`.env.prod` current values (lines 44-46):**
```
TEST_AUTH_PROVIDER=cognito
TEST_AUTH_USERNAME=
TEST_AUTH_PASSWORD=
```

**IMPORTANT:** To enable cognito-native authentication for AWS tests, you must change the .env files:

**Change `.env.ci` (line 44):**
```
TEST_AUTH_PROVIDER=cognito-native
```

**Change `.env.prod` (line 44):**
```
TEST_AUTH_PROVIDER=cognito-native
```

**How `synthetic-test.yml` uses this (lines 248-255):**
```yaml
- name: Create Cognito test user
  id: cognito-test-user
  shell: bash
  run: |
    ENV_FILE=".env.${{ needs.names.outputs.environment-name }}"
    PROVIDER=$(grep -E '^TEST_AUTH_PROVIDER=' "$ENV_FILE" | tail -n1 | cut -d'=' -f2)
    if [ "$PROVIDER" = "cognito-native" ]; then
      chmod +x 'scripts/create-cognito-test-user.sh'
      'scripts/create-cognito-test-user.sh' "${{ needs.names.outputs.environment-name }}"
    else
      echo "Skipping Cognito test user creation (TEST_AUTH_PROVIDER=${PROVIDER:-unset})"
    fi
```

The workflow reads TEST_AUTH_PROVIDER from the .env file and only creates a Cognito test user if it's set to `cognito-native`. The username/password are then passed as environment variables to the test run.

---

## Checklist for Implementation

### Phase 1: Disable Self-Signup
- [ ] Edit `IdentityStack.java` line 154: change `selfSignUpEnabled(true)` to `selfSignUpEnabled(false)`
- [ ] Run `./mvnw clean verify`
- [ ] Deploy to ci environment
- [ ] Verify Cognito Hosted UI no longer shows "Create account"
- [ ] Verify Google login still works
- [ ] Verify behavior tests still pass (they use adminCreateUser)

### Phase 2: Hide Native Login Form
- [ ] Replace `web/public/auth/login-native-addon.js` with new version
- [ ] Test locally: form should be hidden, "Show developer options" reveals it
- [ ] Run `npm run linting-fix && npm run formatting-fix` if needed

### Phase 3: Update Behavior Tests and Enable cognito-native
- [ ] Edit `behaviour-tests/steps/behaviour-login-steps.js` function `fillInNativeAuth`
- [ ] Add click on `#showDevOptions` before filling form
- [ ] Change `.env.ci` line 44: `TEST_AUTH_PROVIDER=cognito-native`
- [ ] Change `.env.prod` line 44: `TEST_AUTH_PROVIDER=cognito-native`
- [ ] Run `npm run test:submitVatBehaviour-proxy` (local test)
- [ ] Deploy phases 2+3 together
- [ ] Run synthetic tests against AWS deployment

### Phase 4: Remove OIDC Provider (Future)
- [ ] Remove from `IdentityStack.java`: field, interface props, provider creation, output
- [ ] Remove from `SubmitEnvironment.java`: props fields, builder calls
- [ ] Remove from `cdk-environment/cdk.json` and `cdk-application/cdk.json`
- [ ] Update or remove cognito OIDC test functions in behavior tests
- [ ] Run `./mvnw clean verify`
- [ ] Deploy and verify
