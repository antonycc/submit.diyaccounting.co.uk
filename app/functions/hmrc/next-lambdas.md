### High-level take
Overall, these three Lambdas are in good shape. The refactor has made them much more consistent in structure and intent:
- Common layout: `apiEndpoint` → `extractAndValidateParameters` → `handler` → service adaptor (`submitVat`/`getVatReturn`/`getVatObligations`).
- Clear separation of concerns between HTTP-facing logic and HMRC service calls.
- Consistent validation and error shaping using helpers from `httpResponseHelper.js`/`hmrcApi.js`.
- Good observability: request IDs, structured logs, and fraud-prevention headers propagated.
- Tests are pragmatic and resilient (mock network, assert only on key values), and everything passes.

There are, however, a few inconsistencies and a couple of security and ergonomics nits you can address to make this rock solid.

### What’s strong
- Consistent parameter validation across the three functions (VRN, periodKey, dates, etc.).
- Authorization handling is clear and consistent: 400 for missing, 401 for explicit unauthorized (`UnauthorizedTokenError`), 400 for invalid format.
- HMRC error mapping for GET endpoints is explicit (403/404/500) and visible at the handler level.
- The POST flow includes bundle enforcement and environment validation; GOV client headers are normalized and included.
- Stub strategy for GET endpoints is simple and effective; POST handler has a `NODE_ENV === "stubbed"` path for receipts.

### Gaps and risks to consider
1) Token leakage risk in POST request logging
- `logHmrcRequestDetails` currently logs merged headers including `Authorization` with full token. Unlike `hmrcHttpGet`, it does not redact values and may leak tokens to logs.

Suggestion:
- Redact sensitive header values before logging.

Example:
```js
// app/lib/httpServerToLambdaAdaptor.js
function redactHeaders(headers) {
  const h = { ...headers };
  for (const key of Object.keys(h)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "x-authorization") {
      h[key] = "Bearer ****";
    }
  }
  return h;
}

export function logHmrcRequestDetails(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody) {
  const safeHeaders = { ...redactHeaders(hmrcRequestHeaders), ...redactHeaders(govClientHeaders) };
  logger.info({
    message: `Request to POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    headers: safeHeaders,
    body: hmrcRequestBody,
    environment: { nodeEnv: process.env.NODE_ENV },
  });
}
```

2) Bundle enforcement inconsistency (POST has it, GETs do not)
- `hmrcVatReturnPost.handler` enforces bundles via `enforceBundles(event)`; the two GET handlers do not. If entitlement control is intended across all HMRC endpoints, bring GETs in line with POST.

Suggestion:
- Add the same try/catch around `enforceBundles(event)` at the start of both GET handlers and return `http403ForbiddenFromBundleEnforcement` on failure.

3) Two auth-token extractors
- Both `httpHelper.extractBearerTokenFromAuthHeaderInLambdaEvent` and `hmrcHelper.extractHmrcAccessTokenFromLambdaEvent` exist. This is minor duplication and a long-term footgun.

Suggestion:
- Pick one location (likely `hmrcHelper`) and make others delegate to it to avoid drift.

4) Inconsistent environment validation
- POST validates `["HMRC_BASE_URI", "COGNITO_USER_POOL_ID"]` while GET handlers check only `HMRC_BASE_URI`.

Suggestion:
- Either align on the minimal set per endpoint (e.g., all check `HMRC_BASE_URI` only) or centralize env validation in a helper that knows what each endpoint needs.

5) Error mapping duplication for GETs
- Both GET handlers re-implement HMRC status mapping (403/404/500). It’s readable, but duplicated.

Suggestion:
- Introduce a small helper to map HMRC `Response` to app responses for GETs (mirroring `generateHmrcErrorResponseWithRetryAdvice` for POST):
```js
// app/lib/hmrcApi.js (conceptual)
export function mapHmrcGetResponseToHttp(request, requestId, hmrcResponse, headers) {
  if (hmrcResponse.status === 403) return http403ForbiddenFromHmrcResponse(/* ... */);
  if (hmrcResponse.status === 404) return http404NotFoundFromHmrcResponse(/* ... */);
  return http500ServerErrorFromHmrcResponse(/* ... */);
}
```

Suggestion:
- Consider aligning on one approach (env-variable-driven stub objects) and optionally gating with a `TEST_*_ENABLED` flag for clarity.

7) Subtle difference in exception behavior
- POST bubbles network errors (“throw error”) while GET handlers convert to HTTP 500 with a fixed message. This is visible and preserves tests, but it’s a difference to be aware of.

Suggestion:
- If you want uniform behavior, consider converting POST network errors into a 500 with logged detail (or ensure callers always catch exceptions at the Express layer).

8) Minor: periodKey normalization and validation
- You normalize to uppercase and validate with `/^[A-Z0-9#]{3,5}$/i`. That’s fine. If HMRC tightens allowed patterns (e.g., quarterly codes), a more precise validator may reduce HMRC 400s.

9) Minor: date-range defaults in obligations
- Defaulting `from` to Jan 1 of the current year and `to` to today is sensible. Consider documenting this behavior explicitly in the route comments and API docs to avoid surprises for API consumers.

10) Timeouts and retries for HMRC calls
- `fetch` calls don’t include timeouts. A hung connection can hold resources for too long.

Suggestion:
- Add an `AbortController` with a conservative timeout (e.g., 10s) and consider one retry on transient statuses (502/503/504) with jitter.

Sketch:
```js
const controller = new AbortController();
const t = setTimeout(() => controller.abort(), 10_000);
try {
  const hmrcResponse = await fetch(url, { method: "GET", headers, signal: controller.signal });
  // ...
} finally {
  clearTimeout(t);
}
```

### Smaller polish items
- JSDoc typedefs on service adaptor functions (`submitVat`, `getVatReturn`, `getVatObligations`) will improve IDE help and test authoring.
- Consider centralizing the VRN/periodKey/date validators in a small `validators.js` to keep rules in one place.
- The comment on `submitVat` reads “Service adaptor for aware …” – tiny grammar nit.

### Test suite feedback
- The new handler tests are balanced and not brittle; good use of `expect.objectContaining`.
- You might add a regression test that ensures we never log raw `Authorization` values. This can be done by stubbing the logger and asserting the calls do not include the token string.
- If you add bundle enforcement to GET handlers, include unit tests where `enforceBundles` throws and confirm a 403 with the expected shape.
- If you add timeouts, include a test that simulates a hung fetch and verifies we return a 500 with a clear, actionable message.

### Recommendation summary
- Redact `Authorization` in POST logging (highest priority security fix).
- Add `enforceBundles(event)` to both GET handlers for consistency, plus tests.
- DRY up auth-token extraction and GET error mapping.
- Consider unifying stub strategy and environment validation.
- Add timeouts (and maybe simple retries) to HMRC calls.

With these adjustments, the Lambdas will be both consistent and production-hardened while staying easy to test and extend.
