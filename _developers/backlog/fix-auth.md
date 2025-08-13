Your repo uses AWS Cognito as an OAuth broker: the login page calls `GET /api/google/auth‑url`, which builds a Cognito `/oauth2/authorize` URL using `DIY_SUBMIT_COGNITO_CLIENT_ID` and `DIY_SUBMIT_COGNITO_BASE_URI`.  Cognito then redirects the user to Google’s OAuth endpoint using the Google client ID and secret configured on the user‑pool’s identity provider.  When the user returns, the callback page posts to `/api/google/exchange‑token` but the lambda ignores the `client_id` from the request and uses `DIY_SUBMIT_COGNITO_CLIENT_ID` for the token exchange.  Because the environment is mis‑configured, Google returns `401 invalid_client` to the user’s `loginWithGoogleCallback.html?error=invalid_request`.  The test workflows also set the wrong secret: the behaviour‑test job exports `DIY_SUBMIT_GOOGLE_CLIENT_SECRET` equal to the HMRC secret.

### Root cause

1. **Wrong client credentials:** `.env.ci` defines `DIY_SUBMIT_GOOGLE_CLIENT_ID` but leaves `DIY_SUBMIT_COGNITO_CLIENT_ID` unset.  However, the code uses the Cognito client ID, not the Google ID.  When this value is undefined, Cognito calls Google with an invalid client ID, leading to `401 invalid_client`.
2. **Mis‑wired secrets in CI:** In GitHub workflow `test-slowly.yml` and `deploy.yml`, `DIY_SUBMIT_GOOGLE_CLIENT_SECRET` is incorrectly set to `secrets.HMRC_CLIENT_SECRET`.  This makes the Google IdP in Cognito use the HMRC secret, which Google rejects.
3. **Hard‑coded client ID in callback page:** `loginWithGoogleCallback.html` posts a body containing a hard‑coded Google client ID, but the server ignores it.  This mismatch is confusing and may conceal configuration errors.
4. **Missing fall‑back logic:** `authUrl.js` has a TODO to fall back to `DIY_SUBMIT_GOOGLE_CLIENT_ID` when Cognito is not configured, but this is not implemented, so local flows cannot use direct Google sign‑in.

### Recommended fixes

1. **Correct the OAuth credentials.**

    * Create or locate a valid **Google OAuth 2.0 client** (type “Web application”) in Google Cloud Console and note its client ID and client secret.  In the Google console, set **Authorized redirect URIs** to Cognito’s IdP callback (e.g. `https://auth.submit.diyaccounting.co.uk/oauth2/idpresponse` and `https://auth.ci.submit.diyaccounting.co.uk/oauth2/idpresponse`) .
    * Set these values in the CDK context/environment: `googleClientId` and `googleClientSecret` (used by `CognitoAuth.Builder`) so the CDK constructs the `UserPoolIdentityProviderGoogle` with the correct credentials.  Do **not** leave `googleClientId` blank or equal to the Cognito ID.
    * Ensure the pipeline sets a **Google‑specific secret** (e.g. `GOOGLE_CLIENT_SECRET` in GitHub Secrets).  Update `test-slowly.yml` and `deploy.yml` to export `DIY_SUBMIT_GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}` instead of using the HMRC secret.  Similarly provide a `DIY_SUBMIT_GOOGLE_CLIENT_ID` if you implement the direct‑Google fallback.

2. **Configure Cognito properly.**

    * In your CDK stack (`WebStack`), pass `googleClientId`/`googleClientSecret` into `CognitoAuth.Builder` so that the `UserPoolIdentityProviderGoogle` is created.  Make sure `callbackUrls` include all pages that may receive a code (`/`, `/loginWithGoogleCallback.html`, `/bundles.html`).
    * After deployment, export the generated user‑pool client ID as `DIY_SUBMIT_COGNITO_CLIENT_ID`.  For example, capture the `UserPoolClientId` output from the stack and set it as a deployment variable; your `.env.prod` or CI workflow should not leave this as “To get later…”.
    * In `authUrl.js`, implement the TODO so that if `DIY_SUBMIT_COGNITO_CLIENT_ID` is missing, it falls back to `DIY_SUBMIT_GOOGLE_CLIENT_ID` and uses Google’s OAuth endpoint directly.  That allows local or stubbed flows without Cognito.
    * In `exchangeToken.js` (`httpPostGoogle`), similarly fall back to `DIY_SUBMIT_GOOGLE_CLIENT_ID` when `DIY_SUBMIT_COGNITO_CLIENT_ID` is undefined.  The redirect URI for direct Google flows should match the one authorized in Google Cloud.

3. **Remove misleading code and handle errors.**

    * In `loginWithGoogleCallback.html`, remove the unused `client_id` field from the token exchange body.  The server uses its own client ID; sending a mismatched ID is misleading.
    * Add logic in the callback page to display `error_description` when present.  Right now it silently does nothing if there is no `code` parameter.
    * Document in README (and comments) that `DIY_SUBMIT_COGNITO_CLIENT_ID` refers to the Cognito user‑pool client and `DIY_SUBMIT_GOOGLE_CLIENT_ID` is only for direct Google flows.

4. **Fix the CI/CD workflows.**

    * In `.github/workflows/test-slowly.yml` and `deploy.yml`, pass all required environment variables for CDK synthesis.  Specifically, provide `DIY_SUBMIT_COGNITO_CLIENT_ID` (use a dummy value for synth if necessary) so that `cdk synth` doesn’t fail due to missing variables.
    * Replace `DIY_SUBMIT_GOOGLE_CLIENT_SECRET: ${{ secrets.HMRC_CLIENT_SECRET }}` with the correct secret as noted above.
    * After building the CDK stack, export the `CognitoClientId` and set it for later jobs; the `synth` job can read outputs from `cdk synth` to avoid “to get later” placeholders.

5. **Other improvements.**

    * Add integration tests to verify that the `authUrl` returns a valid URL (status 200) and that the callback page receives a code, not an error.  Use a stubbed Google IdP or test against Google’s sandbox.
    * Consider adding a health check endpoint or UI message for OAuth misconfiguration, so the site reports “Google login misconfigured” rather than leaving users on a blank callback page.
    * Ensure `DIY_SUBMIT_BUNDLE_EXPIRY_DATE` and other bundle settings are loaded into Cognito user attributes so that bundle selection and activity permissions work end‑to‑end (the CDK stack already provisions these attributes【962】; just populate values in your `.env.prod`).

These changes should fix the 401 invalid\_client error and make the pipeline’s CDK synth/test jobs succeed.  You’ll need to supply your actual Google OAuth credentials and update the CI secrets before re‑deploying.
