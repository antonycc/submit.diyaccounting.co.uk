## Goals

- **Expose the product catalogue** – add a `GET /api/catalog` endpoint that returns `{version, bundles, activities}` parsed from `product‑catalog.toml`.  Validate against the JSON schema, cache in memory and serve with ETag/Last‑Modified headers:contentReference[oaicite:0]{index=0}.
- **Centralise entitlements** – implement an `entitlementsService` that determines active bundles per user based on catalogue rules (automatic vs on‑request, qualifiers like `requiresTransactionId` and `subscriptionTier`):contentReference[oaicite:1]{index=1}.  Provide methods `getGrantedBundles(userCtx)` and `isActivityAllowed(activityId,userCtx)`:contentReference[oaicite:2]{index=2}.
- **Add a bundle‑request flow** – create `POST /api/request-bundle` to grant on‑request bundles.  Validate qualifiers and caps, compute expiry from `timeout` (ISO durations like `P1D`), persist grants and return `{granted, expiry}`:contentReference[oaicite:3]{index=3}.
- **Guard APIs** – wrap each existing API (submit VAT, VAT obligations, sandbox endpoints) with middleware that calls `isActivityAllowed`.  If no active bundle enables the requested activity, return `403` with `{error:'not_allowed',activityId,bundles:active}`:contentReference[oaicite:4]{index=4}.
- **Render UI from the catalogue** – modify `index.html` and `bundles.html` to fetch `/api/catalog`, show only allowed activities, and display bundles with qualifier inputs.  Use a `CATALOG_DRIVEN_UI` flag to toggle between new and legacy rendering:contentReference[oaicite:5]{index=5}:contentReference[oaicite:6]{index=6}.
- **Testing baseline** – run all current unit and Playwright tests before changes.  After each change, re‑run them to catch regressions.  Expand tests to cover new endpoints and entitlements.  Verify that anonymous users see “VAT Obligations” but not “Submit VAT”, and that requesting the `guest` bundle unlocks “Submit VAT”:contentReference[oaicite:7]{index=7}.

## Current state

The repository includes `product‑catalog.toml` with bundles and activities.  The server has helpers to parse and query the catalogue, but there is no `/api/catalog` endpoint.  Entitlements are stored only in a Cognito custom attribute via `bundle.js`, and there is no central service or route guard.  UI pages (`index.html`, `bundles.html`) hard‑code lists of activities:contentReference[oaicite:8]{index=8}.  The backlog spells out tasks for Phase 2: exposing the catalogue, centralising availability checks, adding a bundle request flow, rendering from the catalogue and adding test coverage:contentReference[oaicite:9]{index=9}.

## Implementation plan

### Server – catalogue endpoint
1. Create `getCatalog.js` in `app/functions`.  At cold start, call `loadCatalogFromRoot()` to parse `product‑catalog.toml`, validate against `product-catalog.schema.json`, and store in memory.  Watch the file for changes (dev only) and reload.  Generate an ETag from a hash of the JSON.
2. On request, return `304 Not Modified` if the ETag or Last‑Modified matches; otherwise return `200` with the catalogue and caching headers.
3. Add a route in `server.js` and a corresponding `Function` and `FunctionUrl` in CDK (`WebStack.java`).  When `CATALOG_DRIVEN_UI` is false, the client will not call this endpoint but it remains available.

### Server – entitlements service
1. Create `app/src/lib/entitlementsService.js`.  Implement `getGrantedBundles(userCtx)` to read grants from a persistent store (initially S3 under `grants/{sub}/`).  Represent grants as `{subject,bundleId,qualifiers,expiry}`.
2. Implement `isActivityAllowed(activityId,userCtx)` to determine if any bundle in `activity.bundles` is active.  A bundle is active if `allocation == automatic` and its qualifiers match, or if `allocation == on-request` and a valid grant exists:contentReference[oaicite:10]{index=10}.
3. Provide `getActiveBundles(userCtx)` to return the list of active bundle IDs.  Use qualifiers like `requiresTransactionId` and `subscriptionTier` to verify user claims.

### Server – request‑bundle endpoint
1. Implement `requestBundle.js`.  Authenticate the caller if `bundle.auth == 'required'`:contentReference[oaicite:11]{index=11}.  Validate the bundle exists and qualifiers match the schema; unknown qualifiers result in `400`.
2. For `automatic` bundles, return `{granted:true,expiry:null}` without persisting.  For `on-request`, enforce caps and expiry.  Compute the expiry using `timeout` (e.g. `P1M` means one month).  Persist the grant in S3 or DynamoDB and return the expiry.
3. Add `GET /api/my-bundles` to return active bundles for the user, using `getActiveBundles`.
4. Register these routes in `server.js` and define corresponding CDK `Function`s with IAM permissions to read/write the grants store.

### Server – route guards
1. Implement a `requireActivity(activityId)` middleware.  It resolves the user context (parse the Cognito ID token), calls `isActivityAllowed`, and either calls the next handler or returns `403` with details.  Log each decision for auditing.
2. Wrap each existing activity endpoint (submit VAT, VAT obligations, sandbox versions) with the appropriate guard.

### Client – dynamic rendering
1. In `index.html`, fetch `/api/catalog` on load.  Determine the user’s active bundles (anonymous users start with `default` plus automatic bundles; authenticated users call `/api/my-bundles`).  Show activities where `activity.bundles` intersects `activeBundles` and grey out others.  Display badges indicating which bundles unlock each activity:contentReference[oaicite:12]{index=12}.
2. In `bundles.html`, fetch the catalogue and list all bundles, showing details such as allocation, auth requirement, cap and timeout.  Generate qualifier fields (e.g. transaction ID input).  When the user requests a bundle, call `POST /api/request-bundle` and update the UI with the new state:contentReference[oaicite:13]{index=13}.
3. Persist active bundles in `localStorage` for anonymous sessions.  When the user signs in, refresh active bundles from `/api/my-bundles`.
4. Use a global `CATALOG_DRIVEN_UI` flag (injected via environment variables) to enable the new rendering while keeping the old hard‑coded version for rollback:contentReference[oaicite:14]{index=14}.

### Suggested libraries

- **TOML parsing:** use `@iarna/toml` to parse the catalogue robustly.
- **ISO durations:** use `luxon` or `dayjs` to parse and add ISO 8601 durations (`P1D`, `P1M`, etc.) when computing expiry.
- **Type validation:** use `ajv` with a generated schema from `product-catalog.schema.json` to validate qualifiers.
- **Storage:** plan to migrate grants from S3 to DynamoDB for scalability and efficient queries; CDK provides high‑level constructs for tables.

## Testing & iteration strategy

1. **Baseline tests:** run existing Jest and Playwright suites to ensure a clean starting point.
2. **Unit tests:** test `getCatalog` (including ETag logic), `entitlementsService` (bundle activation, qualifiers, expiry) and `requestBundle` (caps, invalid qualifiers, expiry).  Use `aws-sdk-client-mock` to mock S3 or DynamoDB.
3. **Integration tests:** use `supertest` to run the Express server in memory.  Test route guards by calling endpoints with and without valid grants.  Ensure `403` responses include informative payloads.
4. **Playwright tests:** expand the browser test suite to fetch the catalogue, request bundles, and verify that new activities appear/disappear accordingly.  Test error scenarios (e.g. requesting a bundle without signing in).
5. **Repeat cycles:** after each feature addition, re‑run all tests.  Deploy to a dev environment and test manually with real Cognito tokens.  Only merge when tests pass and manual checks are successful.

## HMRC context & roadmap

HMRC’s Making Tax Digital initiative requires businesses to use compatible software to keep digital records and submit VAT returns.  From **6 April 2026**, some sole traders and landlords must use MTD if their combined property and trading income exceeds £20 000:contentReference[oaicite:15]{index=15}.  The product catalogue defines activities like `submit-vat`, `vat-obligations`, `self‑employed` and others:contentReference[oaicite:16]{index=16}.  By exposing the catalogue, building entitlements and request flows, and rendering the UI dynamically, the platform prepares for MTD roll‑out and future services such as self‑employment income updates.
