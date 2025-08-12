## Goals

- **Stubbed responses for all endpoints** – allow each new handler to return predefined JSON from environment variables so that front‑end work and tests can proceed without HMRC.
- **Comprehensive test suites** – expand unit, integration and Playwright tests to cover the catalogue, entitlements, VAT and self‑employment APIs, receipts and new infrastructure.
- **Proxy & mock environment** – use `npm run proxy` and `npm run auth` to create a local environment that simulates Cognito and HMRC flows.  This enables fast iterations without deploying to AWS.
- **Automated scenario testing** – incorporate `Gov‑Test‑Scenario` values into tests to exercise HMRC sandbox scenarios:contentReference[oaicite:41]{index=41}.

## Current state

The repository has some unit tests and Playwright tests, plus stubbed mode for `submitVat.js`.  There is a proxy script and a mock OAuth server, but no stubbed data for new endpoints or automated scenario testing.

## Implementation plan

### Define stubbed data

1. For each new VAT and self‑employment endpoint, create stub JSON files under `app/test/stubs/vat/` and `app/test/stubs/selfEmployment/`.  Use examples from the HMRC specs.
2. Define environment variables like `DIY_SUBMIT_TEST_VAT_OBLIGATIONS` whose value points to the stub file or contains the JSON directly.  Use these variables in dev and CI environments.
3. In each handler, check for its stub variable.  If set, parse and return the stub; otherwise call HMRC.  Support selecting stubs based on `Gov‑Test‑Scenario` by mapping scenario names to stub files.

### Expand unit tests

1. **Catalogue & entitlements:** test parsing of the catalogue (valid and invalid TOML), ETag caching, bundle activation (automatic, on‑request, qualifiers) and cap enforcement.  Use mock timers to test expiry.
2. **VAT & self‑employment:** test each handler’s parameter parsing, stub path, HMRC call path, error handling and return values.  Use `nock` to intercept HMRC calls.
3. **Receipts:** test `logReceipt` writes to the correct prefix and `listReceipts`/`getReceipt` enforce prefix checks.

### Expand integration tests

1. Use `supertest` to spin up the Express app with all routes.  Test sign‑in and sign‑out flows using a fake Cognito token.
2. Test entitlements gating: call `GET /api/vat/obligations` without the `default` bundle and expect `403`.  Request the `guest` bundle and repeat, expecting `200`.
3. Test the bundle request endpoint’s cap logic by issuing multiple requests and verifying `409` responses when the cap is exceeded.
4. For self‑employment, test creating, retrieving, updating and deleting period summaries using stubbed responses.

### Expand Playwright tests

1. Start the proxy and mock OAuth server locally.  Configure the application to point at the ngrok URL.
2. Automate logging in via Google (or the mock provider) and confirm the OAuth flow completes.
3. Navigate to activities and bundles pages.  Request bundles and verify UI updates.  Use stubbed data to simulate obligations and returns.
4. Perform VAT flows end to end: view obligations, submit a return, view the return, list receipts.
5. Perform self‑employment flows: create a period, list periods, amend it, delete it.  View annual summaries.
6. Include tests for negative scenarios: invalid VRN, missing qualifiers, caps exceeded.  Confirm error messages appear.

### Proxy environment

1. **Documentation:** update the README and developer docs to explain how to run `npm run auth` to start a mock OAuth server and `npm run proxy` to expose the site.  Note how to update `.env` with the ngrok URL for Cognito and Google redirect URIs.
2. **Test configuration:** update Playwright config to use the proxy URL for tests.  Provide a `--use-sandbox` flag to run tests against the HMRC sandbox instead of stubs.

### CI & automation

1. In GitHub Actions, run `npm run validate:catalog`, `npm test` and Playwright tests on every push.  Use matrix jobs to run with stubbed data and with the HMRC sandbox.
2. Schedule a nightly workflow to call HMRC sandbox with all `Gov‑Test‑Scenario` values and compare responses to stored snapshots.  Send alerts if responses change unexpectedly.
3. Use `cdk synth` in CI to ensure infrastructure changes compile.

## Testing & iteration strategy

1. **Iterate locally:** start with stubbed mode to build pages and logic quickly.  Run unit and integration tests on each change.
2. **Integrate with proxy:** once basic UI works, run Playwright tests against the proxy with the mock OAuth server.  Fix issues related to redirects and tokens.
3. **HMRC sandbox:** periodically run tests against the sandbox to ensure compatibility with real HMRC responses.  Use the `Gov‑Test‑Scenario` header to cover all documented scenarios.
4. **Regression:** re‑run the full suite after each feature merge.  Only deploy to prod when all tests pass and manual sanity checks succeed.

## HMRC context

HMRC’s sandbox is designed for iterative development and supports many scenarios via `Gov‑Test‑Scenario` headers:contentReference[oaicite:42]{index=42}.  By building a robust dry‑run infrastructure with stubs and sandbox tests, the DIY Accounting platform can rapidly adapt to API changes and ensure reliable behaviour when MTD becomes mandatory.
