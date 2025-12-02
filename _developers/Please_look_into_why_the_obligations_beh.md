### Summary
The 500 is coming from our own `/api/v1/hmrc/token` handler because the HMRC OAuth token exchange returns a non-2xx response in GitHub Actions. Locally it works because your env points the token exchange to the sandbox client secret, but in CI the job uses the live client secret while the auth code is issued by the HMRC test API, producing a mismatch and a 400 from HMRC, which our code surfaces as a 500.

### What’s happening
- The failing URL in your log is the website’s OAuth callback exchange endpoint: `POST /api/v1/hmrc/token`.
- This endpoint ultimately calls `buildTokenExchangeResponse()` which POSTs to HMRC at `${HMRC_BASE_URI}/oauth/token` with the redirect URI built from `DIY_SUBMIT_BASE_URL`.
- If HMRC returns non-OK, we log and return a 500:
    - Code: `app/lib/httpResponseHelper.js` → `buildTokenExchangeResponse()` → returns `http500ServerErrorResponse` when `!response.ok`.
- Which HMRC credentials are used is decided here:
    - `app/functions/hmrc/hmrcTokenPost.js` → `exchangeCodeForToken(code, hmrcAccount)`
    - If header `hmrcAccount: sandbox` is present, it uses `HMRC_SANDBOX_CLIENT_ID`/`HMRC_SANDBOX_CLIENT_SECRET`.
    - Otherwise it uses `HMRC_CLIENT_ID`/`HMRC_CLIENT_SECRET`.
- In your CI run, the behaviour logs show sandbox mode is NOT enabled via env:
    - Artifact log shows `Sandbox mode detection: HMRC_ACCOUNT= => sandbox=false`.
- The workflow step only passes `HMRC_CLIENT_SECRET` (live) and no `HMRC_SANDBOX_CLIENT_SECRET`:
  ```yaml
  - name: Run behaviour tests - obligation
    run: |
      npm run test:obligationBehaviour || exit_code=$? \
      ; cp ./target/submit*.log ./target/behaviour-test-results/ || true \
      ; exit ${exit_code:-0} \
      ;
    env:
      HMRC_CLIENT_SECRET: ${{ secrets.HMRC_CLIENT_SECRET }}
      NGROK_AUTHTOKEN: ${{ secrets.NGROK_AUTH_TOKEN }}
  ```
- But `.env.proxy` drives HMRC against the HMRC TEST API (`https://test-api.service.hmrc.gov.uk`) while the token exchange uses the “live” secret when `hmrcAccount` header is not set to `sandbox`. The auth code issued by HMRC test API must be exchanged with the sandbox secret; using the live secret causes HMRC to reject the exchange (typically 400), which our handler returns as a 500.

### Why it works locally
- Your local `.env` likely has `HMRC_CLIENT_SECRET` set to the sandbox secret (or you have both sandbox/live secrets equal), so even without explicitly setting `HMRC_ACCOUNT=sandbox` the exchange succeeds. In CI, `HMRC_CLIENT_SECRET` is a different (live) secret.

### Confirming in the code
- Token exchange code chooses secret by `hmrcAccount` header:
  ```js
  // app/functions/hmrc/hmrcTokenPost.js
  const secretArn = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN : process.env.HMRC_CLIENT_SECRET_ARN;
  const overrideSecret = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_SECRET : process.env.HMRC_CLIENT_SECRET;
  const hmrcBaseUri = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcClientId = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_ID : process.env.HMRC_CLIENT_ID;
  ```
- Browser side, the header is added only if `localStorage.hmrcAccount` is set (submitVatCallback.html):
  ```js
  const hmrcAccount = localStorage.getItem("hmrcAccount");
  if (hmrcAccount) {
    requestHeaders["hmrcAccount"] = hmrcAccount;
  }
  ```
- Behaviour tests decide sandbox vs live based on env var `HMRC_ACCOUNT`:
  ```js
  // behaviour-tests/helpers/behaviour-helpers.js
  export function isSandboxMode() {
    const hmrcAccount = (process.env.HMRC_ACCOUNT || "").toLowerCase();
    return hmrcAccount === "sandbox";
  }
  ```
  The logs show `sandbox=false`, so the flows likely set/keep `localStorage.hmrcAccount` as live, therefore the backend chooses the live secret.

### Fix options
Pick one of the following (option A is the simplest and most explicit):

A) Force sandbox in the CI job and provide the sandbox secret
- Change the job to run the sandbox script that already sets the env:
  ```yaml
  - name: Run behaviour tests - obligation
    run: |
      npm run test:obligationBehaviour-sandbox || exit_code=$? \
      ; cp ./target/submit*.log ./target/behaviour-test-results/ || true \
      ; exit ${exit_code:-0}
    env:
      HMRC_SANDBOX_CLIENT_SECRET: ${{ secrets.HMRC_SANDBOX_CLIENT_SECRET }}
      NGROK_AUTHTOKEN: ${{ secrets.NGROK_AUTH_TOKEN }}
  ```
- Ensure a `HMRC_SANDBOX_CLIENT_SECRET` secret exists in the repo or org secrets.

B) Keep the same script but set the env explicitly
- Keep `npm run test:obligationBehaviour` and set `HMRC_ACCOUNT=sandbox` and pass sandbox secret:
  ```yaml
  env:
    HMRC_ACCOUNT: sandbox
    HMRC_SANDBOX_CLIENT_SECRET: ${{ secrets.HMRC_SANDBOX_CLIENT_SECRET }}
    NGROK_AUTHTOKEN: ${{ secrets.NGROK_AUTH_TOKEN }}
  ```

C) Provide matching secrets to both branches
- If you must keep `HMRC_ACCOUNT` unset, provide both secrets so either branch works:
  ```yaml
  env:
    HMRC_CLIENT_SECRET: ${{ secrets.HMRC_CLIENT_SECRET }}
    HMRC_SANDBOX_CLIENT_SECRET: ${{ secrets.HMRC_SANDBOX_CLIENT_SECRET }}
    NGROK_AUTHTOKEN: ${{ secrets.NGROK_AUTH_TOKEN }}
  ```
  and ensure the FE sets `localStorage.hmrcAccount` to `sandbox` (e.g., by navigating with `?hmrcAccount=sandbox`). But A or B are clearer/safer.

### Why line 299 fails specifically
- That step runs `npm run test:obligationBehaviour` which uses `.env.proxy` (proxy/ngrok flow) but does not set `HMRC_ACCOUNT`. The browser then doesn’t send `hmrcAccount: sandbox` to the backend; the backend uses `HMRC_CLIENT_SECRET` (live) to exchange a code issued by the HMRC test API, and HMRC rejects it → our code returns 500.

### Optional hardening
- Improve error visibility by logging HMRC response body on token exchange failure (we already capture it in `responseBody`, but consider attaching a short extract to the Playwright step log or surface it in the HTML error on the callback page).
- In `hmrcTokenPost.handler`, consider defaulting to sandbox when `HMRC_BASE_URI` points at `test-api.service.hmrc.gov.uk` and no `hmrcAccount` header is present. That would make local/CI behavior more consistent even if the header is missing.

### TL;DR
Set the job to run sandbox and provide the sandbox client secret. Example change:
```yaml
- name: Run behaviour tests - obligation
  run: |
    npm run test:obligationBehaviour-sandbox || exit_code=$? \
    ; cp ./target/submit*.log ./target/behaviour-test-results/ || true \
    ; exit ${exit_code:-0}
  env:
    HMRC_SANDBOX_CLIENT_SECRET: ${{ secrets.HMRC_SANDBOX_CLIENT_SECRET }}
    NGROK_AUTHTOKEN: ${{ secrets.NGROK_AUTH_TOKEN }}
```
This aligns the auth code issuer (HMRC test API) with the credentials used for the token exchange and will stop the 500.
