### Structure
- Server hook (`apiEndpoint`) builds a Lambda-like event for local Express and delegates to the handler.
- HTTP-aware handler (`handler`) does env checks → bundle enforcement → input parsing/validation → token validation → service call → response mapping.
- Service adaptor (`submitVat`) encapsulates the HMRC call and stubbed behavior.
- Cross-cutting helpers handle Gov‑Client headers, responses, logging, and HMRC/bundle error mapping.

#### 1) Response semantics for proxied 4xx
- Today, `http403ForbiddenFromHmrcResponse` returns a 400 to the client (via `httpBadRequestResponse`). This might be intentional for UX/testing, but it’s semantically surprising.
- Consider one of the following:
    - Propagate true client status codes (403 stays 403). OR
    - Keep current mapping but document it clearly (OpenAPI, code comment in `hmrcHelper`, and tests) so future maintainers don’t “fix” it.
- Do a pass across GET/POST HMRC handlers so 401/403/404 behave consistently (same mapping, same message shape).

#### 3) Input validation robustness
- `vatDue` parsing:
    - You call `parseFloat` for three fields. Add a validation to ensure `vatDue` is a numeric string or number and not `NaN`.
    - Consider rounding/scale rules (e.g., two decimal places) if HMRC expects monetary precision.
- VRN and period key:
    - The POST handler currently doesn’t validate `vatNumber` pattern or `periodKey` format as strictly as the GET handlers. Consider mirroring the GET validations (`^\d{9}$` for VRN, and your periodKey regex) for symmetry.
- Token fields
    - You accept `accessToken` or `hmrcAccessToken`. Good for ergonomics; add a comment in the handler specifying precedence and keep it stable.

#### 5) Timeouts, retries, and rate limiting
- Wrap `fetch` with:
    - Request timeouts (AbortController) and a sensible default (e.g., 10–20s), configured via env.
    - Optional retry with backoff for idempotent HMRC calls (GET paths). For POST, usually no auto-retry unless idempotency protected.
    - Explicit handling of 429 and `Retry-After` headers translating to a 503/429 to the caller with backoff guidance.

#### 6) Observability and tracing
- Add a correlation/request ID (e.g., from `event.requestContext.requestId` or generated UUID) and include it in logs and responses where safe.

### Concrete suggestions (non-breaking)
- Add numeric and format validation before `submitVat`:
  ```js
  if (vatDue !== 0 && !vatDue) errorMessages.push("Missing vatDue parameter from body");
  const numVatDue = typeof vatDue === "number" ? vatDue : Number(vatDue);
  if (Number.isNaN(numVatDue)) errorMessages.push("Invalid vatDue - must be a number");
  if (vatNumber && !/^\d{9}$/.test(String(vatNumber))) errorMessages.push("Invalid vatNumber format - must be 9 digits");
  if (periodKey && !/^[A-Z0-9#]{3,5}$/i.test(String(periodKey))) errorMessages.push("Invalid periodKey format");
  ```
- Normalize `periodKey` if HMRC is case-insensitive:
  ```js
  const normalizedPeriodKey = typeof periodKey === "string" ? periodKey.toUpperCase() : periodKey;
  ```
- Enforce timeout for `fetch`:
  ```js
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.HMRC_TIMEOUT_MS || 20000));
  try {
    hmrcResponse = await fetch(hmrcRequestUrl, { method: "POST", headers: { ...hmrcRequestHeaders, ...govClientHeaders }, body: JSON.stringify(hmrcRequestBody), signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  ```
- Add 429 mapping in `hmrcHelper` (if HMRC returns it):
  ```js
  if (hmrcResponse.status === 429) {
    return httpServerErrorResponse({ request, headers: { ...govClientHeaders }, message: "Upstream rate limited. Please retry later.", error: { hmrcResponseCode: hmrcResponse.status, responseBody: hmrcResponse.data } });
  }
  ```
- Expand OpenAPI responses using `SubmitSharedNames.Responses` for HMRC endpoints: add `401`, `403`, `404`, `500` with short descriptions.
