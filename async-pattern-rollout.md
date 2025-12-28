### Asynchronous API Pattern Rollout Plan (async-pattern-rollout.md)

This document revises the original `branch_plan_actualasync.md` to incorporate a **multi-pattern API strategy** using widely recognised names. It applies these patterns incrementally while preserving the existing Lambda structure (`handler` + `consumer`) and the shared `asyncApiServices` primitives.

The goal is **near-zero idle cost**, predictable client behaviour, and a clear, incremental migration path.

---

## Global Principles

- **Pattern is explicit, not implicit**
  Each endpoint has a *default* execution pattern. Client overrides are supported only where explicitly allowed (via `x-wait-time-ms`).

- **One async-requests table per mutating API**
  POST/DELETE endpoints that run asynchronously own a DynamoDB request-state table with TTL. Pure reads remain table-less unless async is explicitly required.

- **Stable Lambda shape**
  Each API remains a single file with:
    - `handler(event)` – HTTP-aware entrypoint
    - `consumer(event)` – SQS processor
    - shared service functions
      composed from `initiateProcessing()`, `wait()`, `check()`, and `respond()`.

- **Deliberate concurrency limits**
  SQS consumers default to `reservedConcurrentExecutions = 1` to avoid upstream throttling and simplify reasoning about side-effects.

- **Client optimism with bounded staleness**
  For optimistic writes, the client updates local state immediately and relies on TTL (≈5 minutes) rather than server callbacks.

---

## API Execution Patterns (Proposed Names)

### 1. Static Content
*(formerly “Synchronous Static”)*

- **Description**
  Pre-computed responses published as static assets.
- **Characteristics**
    - No Lambda invocation
    - No DynamoDB
    - Browser + CloudFront caching
    - Versioned filenames for cache busting
- **Examples**
    - Product catalogue (`/product-catalogue-vX.toml`)
- **Client behaviour**
    - Direct fetch
    - No polling
    - Cache controlled entirely by HTTP headers

---

### 2. Cache-Aside Read
*(formerly “Synchronous Dynamic”)*

- **Description**
  Runtime-generated responses that complete within a single request and are safe to cache client-side.
- **Characteristics**
    - Lambda executes inline
    - No SQS
    - No async-requests table
- **Examples**
    - Bundle GET
    - Receipt GET
- **Client behaviour**
    - Cache-aside using **either** IndexedDB **or** Cache API (choose one)
    - Cache populated on successful response
    - TTL-based expiry only (no background invalidation)

---

### 3. Async Polling
*(formerly “Asynchronous Unreliable”)*

- **Description**
  Client initiates work and polls until a terminal result is available.
- **Characteristics**
    - Initial HTTP 202
    - SQS consumer performs work
    - Result persisted to async-requests table
- **Examples**
    - HMRC VAT Return POST
    - HMRC VAT Obligations GET
- **Client behaviour**
    - Poll same API with same request ID
    - Stop on HTTP 200 / 201 / 204 / 4xx / 5xx
    - Tiered polling (fast → slow)

---

### 4. Fire-and-Forget Write
*(formerly “Asynchronous Reliable” / “Optimistic Async”)*

- **Description**
  Client initiates a mutation and does **not** wait for server completion.
- **Characteristics**
    - Always returns HTTP 202
    - SQS consumer performs work
    - Async-requests table used for observability/debugging only
- **Examples**
    - Bundle POST (idempotent PUT → 201)
    - Bundle DELETE (204)
- **Client behaviour**
    - Immediately update local cache
    - Do **not** reconcile on server completion
    - Rely on TTL (≈5 minutes) for eventual consistency

---

## Pattern Selection via `x-wait-time-ms`

- `x-wait-time-ms = 0`
  → **Fire-and-Forget Write**
- `0 < x-wait-time-ms < MAX_WAIT_MS`
  → **Async Polling**
- Header omitted or `x-wait-time-ms ≥ MAX_WAIT_MS`
  → **Cache-Aside Read**

Each API defines which modes are valid; unsupported modes are ignored or coerced.

---

## Phase 1: Account Bundle Management

| Endpoint | Default Pattern | Notes |
|--------|------------------|-------|
| GET `/bundle` | Cache-Aside Read | Cacheable, no SQS |
| POST `/bundle` | Fire-and-Forget Write | Idempotent PUT, optimistic cache update |
| DELETE `/bundle` | Fire-and-Forget Write | 204 on success |

- Async-requests tables are created **only** for POST and DELETE.
- GET remains synchronous by default; async polling is optional for diagnostics/testing.

---

## Phase 2: Auth URL clientside generation

Eliminate runtime dependency on the Cognito Auth URL and HMRC Auth URL Lambdas by calculating
OAuth2 authorization URLs entirely in the browser, using environment values injected at
deploy-time into a single static file.

---


### Phase 3: Cognito & HMRC Token Exchange
**Goal**: n/a Leave as is with synchronous processing.

---

### Phase 4: HMRC Receipt Management (GET)
**Goal**: Remove bundle POST Leave GET as is with synchronous processing.

---

### Phase 5: HMRC VAT Return Submission (POST)
**Goal**: Critical path async implementation for VAT submissions.

#### Infrastructure
- **DataStack.java**: Add `hmrcVatReturnPostAsyncRequestsTableName`.
- **HmrcStack.java**: Convert `hmrcVatReturnPost` to `AsyncApiLambda`.

#### Application
- **hmrcVatReturnPost.js**:
    - Extensive refactor to ensure fraud prevention headers and VAT data are correctly passed to the consumer payload.
    - Consumer handles the actual `fetch` to HMRC and stores the response (including 400/403/500 errors) in the request state.

#### Testing
- **Behaviour Tests**: Full verification using `test:submitVatBehaviour-proxy`.

---

### Phase 6: HMRC VAT Obligations and Returns (GET)
**Goal**: Finalize rollout with read-only HMRC integrations.

#### Infrastructure
- **DataStack.java**: Tables for `hmrcVatObligationGet` and `hmrcVatReturnGet`.
- **HmrcStack.java**: Convert both to `AsyncApiLambda`.

#### Application
- **hmrcVatObligationGet.js**: Refactor to async.
- **hmrcVatReturnGet.js**: Refactor to async.

#### Final Review
- Ensure all endpoints are documented in OpenAPI with 202 responses.
- Verify `deploy.yml` produces a stable environment with all async resources.
