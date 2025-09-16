### Summary – What’s already implemented vs. the backlog

- Catalog endpoint (GET /api/catalog)
    - Implemented: In-memory cache populated at cold start, ETag and Last-Modified handling, serves JSON from product-catalogue.toml via loadCatalogFromRoot.
    - Gaps: No dev hot-reload; AJV validation is optional (best-effort fallback to “skip if not installed”).

- Entitlements service
    - Implemented: entitlementsService.js with getActiveBundles(userCtx), getGrantedBundles(userCtx), isActivityAllowed(activityId,userCtx), and requireActivity(activityId) middleware; supports basic qualifiers (requiresTransactionId, subscriptionTier) using ID token claims.
    - Gaps: Grants are read from an in-memory map (via bundle.js) only; no durable persistence (S3/DynamoDB). No schema-driven qualifier validation. No clock/expiry checks at storage level (only parse/compare upon read from the in-memory list). No support for additional qualifiers beyond the two examples.

- Bundle management
    - Implemented: POST /api/request-bundle (bundle.httpPostMock) supporting both legacy (Cognito custom:bundles attribute and env-expiry) and catalog-driven on-request/automatic bundles; qualifier check; cap (only counted in memory); ISO duration parsing; returns expiry; OPTIONS for CORS. GET /api/my-bundles implemented and wired.
    - Gaps: Durable persistence and consistent cap counting absent; legacy path remains (OK), but migration strategy not codified. No per-user grant listing endpoint beyond active bundles (the backlog mentions grants as {subject,bundleId,qualifiers,expiry}).

- Route guards
    - Implemented: requireActivity middleware; wired only for submit-vat behind env DIY_SUBMIT_ENABLE_CATALOG_GUARDS.
    - Gaps: Other endpoints (e.g., VAT obligations, sandbox routes, future self-employment APIs) not yet wrapped.

- Client UI (catalog-driven)
    - Implemented: CATALOG_DRIVEN_UI flag toggles new rendering for index.html and bundles.html. Activities are derived from catalog.activities and filtered by /api/my-bundles. Bundles page renders bundle cards from catalog with qualifier inputs and calls POST /api/request-bundle.
    - Gaps: Anonymous-user flow: localStorage handling exists but isn’t integrated with getActiveBundles (server-side) for automatic bundles when logged out; UX to reflect entitlements from server for signed-in users exists but can be expanded (e.g., badge/tooltips). Receipt page isn’t catalog-driven (not necessary per backlog but could be improved).

- Receipts
    - Implemented: myReceipts Lambda and /api/my-receipts (list) and /api/my-receipts/:name (get) using S3; supports test S3 endpoint. Security checks on key prefix.
    - Gaps: None critical to the Phase 2 backlog but consider aligning responses with a typed schema and adding pagination metadata.

- Infrastructure (CDK)
    - Implemented: WebStack provisions function URLs for catalog, bundle, my-bundles, my-receipts, submit-vat, log-receipt; receipts bucket and grants of write to logReceipt; config surfaced to the functions.
    - Gaps: No DynamoDB provision for entitlements store; no IAM wiring for entitlements persistence yet; no CloudFront behaviors for the new endpoints if skipLambdaUrlOrigins toggled differently (currently mapped).

- Testing
    - Implemented: Some integration testing for requireActivity exists. Existing unit/Playwright suites likely run, but coverage not yet extended to all new features.
    - Gaps: Need unit tests for getCatalog (ETag/304), entitlements decisions incl. qualifiers/expiry, request-bundle caps/invalid qualifiers, integration tests for route guards on all guarded endpoints, and Playwright flows for catalog-driven UI.


### Detailed plan to reach the backlog target

#### 1) Catalog endpoint polish
- Add dev-only file watching to reload catalog on change.
    - Approach: In getCatalog.js, on cold start in development (NODE_ENV=development), fs.watchFile(product-catalogue.toml, debounce 200–500ms) to repopulate cached and bump lastModified/etag.
- Make AJV validation deterministic and explicit.
    - Keep the lazy import, but log whether validation ran. Optionally add a tiny “X-Catalog-Validated: true/false” header (already present) and include validation errors in logs (not in response) when failing.

#### 2) Durable entitlements store and migration
- Introduce a DynamoDB table grants with PK: subject (string), SK: bundleId (string), attributes: expiry (ISO string), qualifiers (map), createdAt, updatedAt. GSI: byBundle for cap enforcement (PK=bundleId, SK=subject) if needed.
- Implement storage adapter in app/src/lib/entitlementsStore.js:
    - listGrants(subject)
    - putGrant({subject,bundleId,qualifiers,expiry}) with upsert semantics
    - countActiveGrants(bundleId, now) for cap checks
- Wire entitlementsService.getGrantedBundles to call the store (with a fallback to the in-memory store when DIY_SUBMIT_BUNDLE_MOCK=true for local dev/tests).
- In bundle.httpPostMock:
    - For catalog-driven on-request flows, before granting: enforce cap using countActiveGrants(bundleId, now), then persist with putGrant. Return expiry ISO string.
    - For automatic flows, continue to return granted without persistence.
- Migration strategy for legacy bundles (Cognito custom:bundles):
    - Read legacy bundles on first request; if matching a known catalog bundle with allocation on-request, materialize them as grants into DynamoDB (best-effort) and then continue to honor them from the new store. Keep legacy writes for HMRC_TEST_API path until cutover.

#### 3) Route guards applied consistently
- Expand requireActivity to all activity endpoints:
    - VAT obligations (sandbox and prod) → activity ids ‘vat-obligations’, ‘vat-obligations-sandbox’ (depending on how catalog models them).
    - Future self-employment endpoints (if present) → use ids from catalog.
- In app/bin/server.js, gate with DIY_SUBMIT_ENABLE_CATALOG_GUARDS=true, then wrap the routes similarly to submit-vat.
- Logging: ensure res.status(403) payload matches backlog: {error:'not_allowed',activityId,bundles:active} (already implemented).

#### 4) Qualifiers and schema validation
- Create product-catalog.qualifiers.schema.json (or reuse parts of product-catalog.schema.json) to validate requestBundle.js request payload per bundle’s qualifiers definition.
- In bundle.httpPostMock, build a per-bundle AJV validator for the qualifiers object. Unknown keys → 400 unknown_qualifier (already partially handled); missing required qualifiers or mismatches → 400 qualifier_mismatch with details.
- Extend qualifiersMatch in entitlementsService to a single source of truth shared with bundle.js (e.g., move to src/lib/qualifiers.js).

#### 5) Cap and expiry semantics
- Cap enforcement: count only active (not expired) grants; ensure idempotency (if user already has an unexpired grant, respond already_granted).
- Expiry parsing: replace minimal parser with a small library (luxon or dayjs with duration plugin) if allowed; otherwise extend regexp to cover hours/minutes and weeks if needed.

#### 6) API additions and UX
- GET /api/my-bundles – already returns active bundles; add optional details flag (?details=1) to return full grants for the user when authenticated.
- UI
    - index.html and bundles.html already use the new endpoints under CATALOG_DRIVEN_UI; enrich UX to display bundle details (cap, expiry) and show which bundles unlock each activity (already showing badges).
    - Optionally support anonymous sessions by locally storing requested “guest” bundles as allowed per catalog rules (for bundles with auth: optional, allocation: on-request); reconcile upon sign-in by calling /api/my-bundles.

#### 7) Receipts alignment (optional hardening)
- myReceipts already implemented; add pagination support (continue token) in the API response for large histories.
- Add ETag/Last-Modified when returning a single receipt (propagate S3 metadata) to support client caching.

#### 8) Infrastructure (CDK)
- Add a DynamoDB table for entitlements with:
    - Partition key: subject, sort key: bundleId
    - GSI: bundleId → subject (for caps)
    - TTL on expiry
- Grant read/write to the bundle Lambda and read to myBundles Lambda.
- Inject table name as env (DIY_SUBMIT_ENTITLEMENTS_TABLE).
- Optionally add alarms/metrics on throttling and error rates.

#### 9) Tests
- Unit tests
    - getCatalog: ETag 200→304 with If-None-Match/If-Modified-Since; validation on/off paths; malformed TOML handling.
    - entitlementsService: qualifiers permutations; automatic vs on-request; expiry boundary; bundlesForActivity edges.
    - bundle.httpPostMock: unknown qualifier → 400; missing required qualifier → 400; cap reached → 403; automatic bundles → granted without persistence; legacy path coverage.
- Integration tests
    - requireActivity guarding a set of mock endpoints; verify 403 payload shape; verify allowed when bundle is active.
    - Full flow: request-bundle → my-bundles → activities gating.
- Playwright
    - CATALOG_DRIVEN_UI on: activities populate; requesting a bundle enables an activity; error scenarios (unauthenticated, cap reached mocked).
- Mocks
    - Use aws-sdk-client-mock for DynamoDB and S3; feature flag DIY_SUBMIT_BUNDLE_MOCK for in-memory mode.


### Extend the “competing” legacy feature to align
- Keep Cognito custom:bundles as a compatibility layer, but treat it as an import source. When present, on first read for a user, write corresponding grants into DynamoDB and (optionally) clean/normalize the legacy attribute over time.
- For environments without Cognito (tests/dev), continue to use the in-memory store or a local file-backed store.


### Concrete next actions (2–3 PRs)
1) PR A – Persistence and guards
    - Add DynamoDB table and CDK wiring; implement entitlementsStore; refactor bundle.httpPostMock and entitlementsService to use it; migrate legacy bundles on read; extend requireActivity to guard more routes; add unit tests for the store and guards.
2) PR B – Qualifiers/validation and caps
    - AJV-based qualifiers validation; centralize qualifier logic; improve duration parsing; accurate cap enforcement via GSI; add unit and integration tests.
3) PR C – Dev UX and tests
    - Dev hot-reload for catalog; enrich UI badges and status; receipts pagination; add Playwright flows; CI to run full suites.


### Configuration and operational notes
- Feature flags:
    - CATALOG_DRIVEN_UI=true to enable new UI.
    - DIY_SUBMIT_ENABLE_CATALOG_GUARDS=true to enforce activity guards.
    - DIY_SUBMIT_BUNDLE_MOCK=true for local dev without AWS.
- Environment:
    - Provide DIY_SUBMIT_ENTITLEMENTS_TABLE (after DynamoDB added).
    - Continue to set DIY_SUBMIT_TEST_S3_* for non-AWS S3 testing.

This plan brings the codebase up to the Phase 2 backlog, preserves the existing legacy path for smooth migration, and hardens correctness (validation, caps, expiry), scalability (DynamoDB), and UX (catalog-driven pages with tests).
