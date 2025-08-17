### Phase 2: make the catalog the single source of truth (backend + frontend)

You already have:
- Product catalog (product-catalogue.toml) and schema (_developers/schemas/product-catalog.schema.json).
- Server helpers: parse/load and availability queries in app/src/lib/productCatalogHelper.js.
- Client helpers in web/public/submit.js (no TOML parsing).
- Tests: unit + system validating helpers and the catalog.

This continuation completes the migration by exposing catalog JSON, centralizing availability checks, rendering UI from catalog, guarding APIs, implementing the bundle request flow via catalog rules, and adding CI checks and rollout toggles.

---

### Backend: expose catalog and centralize availability logic

#### 1) Add a catalog JSON endpoint
- GET /api/catalog
- Returns: { version, bundles, activities } as parsed from TOML (no secrets).
- Impl outline:
    - At startup: const catalog = loadCatalogFromRoot(); (optionally validate against the JSON schema; fail fast in dev/CI, warn in prod).
    - Cache in-memory; set ETag/Last-Modified and a small max-age (e.g., 60s). Reload on file change or at interval if you hot-update.

#### 2) Entitlements service (server-side)
- Inputs: auth context (idToken claims when present), stored grants, default bundle policy.
- Effective bundle is active if:
    - allocation == automatic (and global conditions met), or
    - allocation == on-request AND a valid unexpired grant exists,
    - AND qualifiers match user/inputs (e.g., requiresTransactionId, subscriptionTier).
- API:
    - getGrantedBundles(userCtx): string[]
    - isActivityAllowed(activityId, userCtx): boolean (uses isActivityAvailable with active bundles)
- Storage for grants: reuse receipts/bundle persistence mentioned in README; model grants as { subject, bundleId, qualifiers, expiry }.

#### 3) Route/middleware guards
- For each activity API (submit-vat, vat-obligations, sandbox endpoints):
    - Resolve userCtx.
    - Compute active bundles via entitlements.
    - If no active bundle enables the activity, return 403 with { error: "not_allowed", activityId, bundles: active }.
    - Log structured decision for audit.

---

### Backend: request-bundle flow driven by catalog

#### 4) POST /api/request-bundle
- Request: { bundleId, qualifiers? }
- Auth: if bundle.auth == "required" but no idToken => 401.
- Flow:
    1) Find bundle in catalog; 404 if missing.
    2) Validate qualifiers strictly against bundle.qualifiers (reject unknown keys; check types and required ones like requiresTransactionId).
    3) allocation == automatic: grant implicitly (or return granted:true without persisting if not needed); compute expiry from timeout if present.
    4) allocation == on-request: apply caps and create/update a grant with expiry from timeout (ISO duration like P1D/P1M/P1Y).
    5) Respond { granted: true, expiry } or { granted: false, reason }.
- Caps: define semantics (per-user active grants or rate). Use 409/429 when exceeded.
- Qualifier examples:
    - legacy: requiresTransactionId => must be present.
    - subscriptionTier bundles: verify against user claims (e.g., Cognito custom:subscriptionTier).

---

### Frontend: render from catalog + entitlements

#### 5) Load catalog JSON in the browser
- Use GET /api/catalog (not TOML). Keep fetchCatalogText for tests.
- Entitlements state:
    - Anonymous: start with ["default"] plus any automatic bundles.
    - Authenticated: call GET /api/my-bundles (or derive from request-bundle responses) to hydrate active bundles with expiry.

#### 6) Replace semi-hardcoded sections
- index.html (or equivalent component):
    - Available to you: activities where any activity.bundles intersects active bundles.
    - Requires additional access: all catalog.activities minus available.
    - Badges: show bundle names that unlock each activity; show auth badge if all unlocking bundles require auth.
- bundles.html:
    - List catalog.bundles with allocation/auth/timeout/cap.
    - Show qualifier inputs derived from bundle.qualifiers (e.g., transactionId field for legacy; subscriptionTier selection/CTA).
    - Button to request access -> POST /api/request-bundle and update UI state; show Active with expiry when granted.
- UX:
    - If bundle.auth == required and user not signed in -> show Sign in to request.
    - Validate qualifiers client-side before calling API for better UX (server remains authoritative).

---

### Shared contracts (align with schema)

- Bundle: { id, name, allocation: "automatic"|"on-request", auth: "none"|"required", cap?, timeout?, qualifiers? }
- Activity: { id, name, bundles: string[], tags?, metadata? }
- Grant: { subject, bundleId, expiry?, qualifiers? }

Ensure server-side validates qualifiers and strips unexpected properties.

---

### Testing and CI

#### 7) Schema and integrity validation
- Add npm script validate:catalog that:
    - Parses TOML and validates against product-catalog.schema.json.
    - Checks referential integrity: every activity.bundles entry exists in bundles; ids unique.
- Run in CI before tests.

#### 8) Unit/integration tests
- Entitlements:
    - automatic vs on-request; auth required vs none; qualifiers required/missing; subscription tier mismatch.
- request-bundle endpoint:
    - 401 when auth required; 400 on bad/missing qualifiers; 409/429 on cap; timeout computes expiry.
- Guards: ensure 403 for disallowed activity with informative payload.

#### 9) Browser (Playwright) tests
- Anonymous sees VAT Obligations (default) but not Submit VAT.
- After sign-in and requesting guest, Submit VAT appears.
- Request test -> sandbox activities appear.
- Legacy flow requires transactionId; missing is blocked; provided grants access.

#### 10) Contract/snapshot tests
- Snapshot GET /api/catalog output vs parsed TOML (stable ordering for deterministic snapshots).

---

### Rollout, toggles, and deprecation

#### 11) Feature flag
- CATALOG_DRIVEN_UI=true:
    - When true, pages fetch /api/catalog and render from it.
    - When false, keep old semi-hardcoded rendering for rollback.

#### 12) Migration checklist
- [ ] Implement /api/catalog with caching headers.
- [ ] Add entitlements service; wire guards for submit-vat, vat-obligations, sandbox.
- [ ] Implement POST /api/request-bundle with qualifiers/cap/timeout.
- [ ] Update index.html and bundles.html to catalog-driven rendering.
- [ ] Add GET /api/my-bundles (optional but convenient for UI state).
- [ ] CI: validate:catalog; add unit/integration/browser tests.
- [ ] Logging/metrics for grants and access denials.
- [ ] Remove hardcoded lists after stable verification.

---

### Acceptance criteria

- Catalog solely controls bundles and activity availability.
- Backend enforces access based on active bundles; unauthorized attempts return 403 with context.
- Frontend only shows activities available to current user and pathways to request others.
- Bundle requests respect auth, qualifiers, cap, and timeout.
- CI fails on invalid catalog or inconsistent mappings.
- Feature flag available; disabled after verification.

---

### Quick implementation sketches

- GET /api/catalog handler:
    - const catalog = loadCatalogFromRoot(); return res.json(catalog) with ETag.

- Guard example:
    - const bundles = await entitlements.getGrantedBundles(userCtx);
    - const allowed = catalog.activities.find(a => a.id === activityId)?.bundles?.some(b => bundles.includes(b));
    - if (!allowed) return res.status(403).json({ error: "not_allowed", activityId, bundles });

- Frontend init:
    - const catalog = await fetch('/api/catalog').then(r => r.json());
    - const myBundles = await fetch('/api/my-bundles').then(r => r.json()).catch(() => ['default']);
    - const available = catalog.activities.filter(a => a.bundles.some(b => myBundles.includes(b)));

If you’d like, I can provide concrete code for the /api/catalog endpoint, an entitlements module interface, middleware guard snippets, and sample HTML/JS for activities/bundles pages aligned to your current project structure.