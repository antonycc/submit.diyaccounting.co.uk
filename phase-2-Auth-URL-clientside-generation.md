Understood. Below is a **refined, consolidated version** of the plan, adjusted exactly as requested:

* **Single file only:** `web/public/submit.env`
* **Checked in placeholder:** `web/public/submit.env`
* **Always overwritten during deploy**
* **`env-loader.js` only ever loads `/​.env`**
* **Environment identity remains in `web/public/submit.environment-name.txt`**
* **No multi-env branching or test-specific env files for this area**

This is written to be used **directly as a prompt for an AI agent (Dec 2025-era Copilot / GPT-class model)** operating on branch `optitwo`.

---

# Replace Auth URL Lambdas with Client-Side Calculation

## (Single web/public/submit.env model, overwritten at deploy)

### Objective

Eliminate runtime dependency on the **Cognito Auth URL** and **HMRC Auth URL** Lambdas by calculating OAuth2 authorization URLs **entirely in the browser**, using environment values injected at deploy time into a **single static file**:

```
web/public/submit.env
```

This file is:

* **Checked into git as a placeholder**
* **Always overwritten during deployment**
* **The only source of auth configuration for the web app**
* **Environment-agnostic** (the site is always “one environment” at runtime)

Secrets remain server-side; only **public OAuth parameters** are exposed.

---

## 1. Repository invariant (checked-in placeholder)

Commit the following file to the repository:

### `web/public/submit.env` (placeholder)

```env
# web/public/submit.env
# Placeholder values for local dev and tests.
# This file is ALWAYS overwritten during deploy.

COGNITO_CLIENT_ID=test-cognito-client-id
COGNITO_BASE_URI=https://test/test-cognito/

HMRC_CLIENT_ID=test-hmrc-client-id
HMRC_BASE_URI=https://test-api/test/hmrc

HMRC_SANDBOX_CLIENT_ID=uqMHA6RsDGGa7h8EG2VqfqAmv4tV
HMRC_SANDBOX_BASE_URI=https://test-api/test/hmrc

DIY_SUBMIT_BASE_URL=https://test/
```

Rules:

* This file **must exist in git**
* It is safe to contain fake / test values
* **Never contains secrets**
* Deployment **always overwrites it**

---

## 2. Deployment: overwrite `web/public/submit.env` inline in `deploy.yml`

Instead of a separate script, add an **inline Bash step** in a suitable job (typically `deploy-edge` or `deploy-publish`) **after** environment variables are loaded via `npx dotenv` and **before** S3 sync.

### New run step (inline Bash)

```yaml
- name: Generate web/public/submit.env for client auth config
  run: |
    set -euo pipefail

    # Overwrite the checked-in placeholder with real values
    cat > web/public/submit.env <<EOF
    COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
    COGNITO_BASE_URI=${COGNITO_BASE_URI}

    HMRC_CLIENT_ID=${HMRC_CLIENT_ID}
    HMRC_BASE_URI=${HMRC_BASE_URI}

    HMRC_SANDBOX_CLIENT_ID=${HMRC_SANDBOX_CLIENT_ID}
    HMRC_SANDBOX_BASE_URI=${HMRC_SANDBOX_BASE_URI}

    DIY_SUBMIT_BASE_URL=${DIY_SUBMIT_BASE_URL}
    EOF
```

**Important constraints**

* This step assumes variables are already exported (as they are today via `npx dotenv`)
* Only **public** values are written
* The file is deployed as a normal static asset
* No branching by environment, test, CI, or prod

---

## 3. Client-side loading model (single file, no fallbacks)

### `env-loader.js`

The loader **only ever attempts to load `/​.env`**.

No environment switching.
No `.env.test`.
No conditional logic.

```js
// web/public/lib/env-loader.js
(function () {
  'use strict';

  async function loadEnv() {
    const response = await fetch('/submit.env', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to load /submit.env');
    }

    const text = await response.text();
    const env = {};

    for (const line of text.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      env[key] = value;
    }

    window.__env = env;
  }

  window.loadEnv = loadEnv;
})();
```

### HTML usage (early load)

```html
<script src="/lib/env-loader.js"></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    loadEnv();
  });
</script>
```

---

## 4. Local calculation of auth URLs (mirror Lambda logic)

Implement helpers that **exactly mirror** the existing Lambdas:

### Cognito

```js
function buildCognitoAuthUrl(state, scope = 'openid profile email') {
  const env = window.__env;

  const redirectUri =
    env.DIY_SUBMIT_BASE_URL.replace(/\/$/, '') +
    '/auth/loginWithCognitoCallback.html';

  return (
    `${env.COGNITO_BASE_URI}/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(env.COGNITO_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`
  );
}
```

### HMRC

```js
function buildHmrcAuthUrl(
  state,
  scope = 'write:vat read:vat',
  account = 'live'
) {
  const env = window.__env;
  const sandbox = account.toLowerCase() === 'sandbox';

  const base = sandbox
    ? env.HMRC_SANDBOX_BASE_URI
    : env.HMRC_BASE_URI;

  const clientId = sandbox
    ? env.HMRC_SANDBOX_CLIENT_ID
    : env.HMRC_CLIENT_ID;

  const redirectUri =
    env.DIY_SUBMIT_BASE_URL.replace(/\/$/, '') +
    '/activities/submitVatCallback.html';

  return (
    `${base}/oauth/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`
  );
}
```

---

## 5. Replace API usage (no Lambda removal yet)

Update all client code that currently does:

```
GET /api/v1/cognito/authUrl
GET /api/v1/hmrc/authUrl
```

to instead:

1. Generate a secure random `state`
2. Call the corresponding builder
3. Redirect directly

The Lambdas remain deployed for now but are no longer on the critical path.

---

## 6. Environment identity remains separate

Continue to use:

```
web/public/submit.environment-name.txt
```

for:

* Displaying environment name
* Logging / diagnostics
* UI badges

**Auth config does not depend on it.**

---

## 7. Resulting properties

* Zero Lambda latency for auth URL generation
* No secrets exposed
* No environment branching logic in the client
* One invariant file: `web/public/submit.env`
* Deterministic behaviour locally, in CI, and in prod
* Clean future path to deleting the Lambdas later

---

## 8. Explicit non-goals (this change)

* Removing the Lambdas (future step)
* Supporting multiple web environments simultaneously
* Service workers or Cache API usage here
* Runtime environment negotiation

---

If you want, next logical follow-ups are:

* **Delete the auth URL Lambdas safely**
* **Move `.env` loading behind a `<meta>` fallback**
* **Add a hard failure if `window.__env` is missing**
* **Sign the `.env` file hash for integrity**

This version should be directly consumable by an AI agent working the `optitwo` branch without further clarification.
