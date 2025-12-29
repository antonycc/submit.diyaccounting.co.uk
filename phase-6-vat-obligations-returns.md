The latest `async-pattern-rollout.md` document on the `async-polling-hmrc` branch defines Phase 6 as the “finalise roll‑out with read‑only HMRC integrations”.  Both the VAT obligations GET and VAT return GET endpoints must be converted into **Async Polling** endpoints.  Below is a step‑by‑step plan, examples of code changes, and the corresponding updates to tests and deployment to deliver this phase.

---

## 1 Infrastructure updates

1. **New async request tables** – In `DataStack.java`, define two DynamoDB tables (with TTL) for the GET requests:

    * `HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME`
    * `HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME`
      Add constants in `SubmitSharedNames.java` and export them as environment variables.

2. **Convert GET functions to `AsyncApiLambda`** – In `HmrcStack.java`, replace the existing Lambda definitions for `hmrcVatReturnGet` and `hmrcVatObligationGet` with `AsyncApiLambda` resources.  Wire these resources to the new tables and the shared SQS queue.  Set `reservedConcurrentExecutions` to `1` to avoid HMRC throttling.

3. **Concurrency configuration** – Update `lambda-concurrency-config.yaml` to include `hmrc-vat-return-get-consumer` and `hmrc-vat-obligation-get-consumer` with `zero: 0` and `peak: 1` or another sensible peak value.  This ensures they can scale to zero and back during deployment.

4. **Deploy pipeline** – Extend `deploy.yml` to pass the new environment variables into the GET Lambdas and add them to the scheduled scale-to-zero job.  Verify the new tables and SQS triggers are created in the correct environments.

---

## 2 Refactoring the GET handlers

### 2.1 Common constants and imports

In both `app/functions/hmrc/hmrcVatReturnGet.js` and `hmrcVatObligationGet.js`, add:

```js
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { v4 as uuidv4 } from "uuid";
const MAX_WAIT_MS = 25000;      // or another sensible maximum
const DEFAULT_WAIT_MS = 0;      // force async by default
```

Add imports for `getAsyncRequest` if you prefer to fetch persisted results manually.

### 2.2 Refactor `handler` to use async pattern

Replace the synchronous processing section with the pattern used in `hmrcVatReturnPost.js`:

```js
export async function handler(event) {
  validateEnv([
    "HMRC_BASE_URI",
    "HMRC_SANDBOX_BASE_URI",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME",
    "SQS_QUEUE_URL",
  ]);

  const { request, requestId: extractedId } = extractRequest(event);
  const requestId = extractedId || uuidv4();
  if (!extractedId) context.set("requestId", requestId);

  // Bundle enforcement (keep existing logic)
  const userSub = await enforceBundles(event);

  // HEAD returns 200 OK immediately (unchanged)
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({ request, headers: { "Content-Type": "application/json" }, data: {} });
  }

  // Validation, header extraction, gov-test-scenario logic (unchanged)

  // Determine waitTimeMs from X-Wait-Time-Ms header
  const waitTimeMs = parseInt(event.headers?.["x-wait-time-ms"] || event.headers?.["X-Wait-Time-Ms"] || DEFAULT_WAIT_MS, 10);

  const asyncRequestsTableName = process.env.HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME;
  const sqsQueueUrl = process.env.SQS_QUEUE_URL;

  // Persisted request check (to resume polling)
  let persistedRequest = null;
  if (event.headers?.["x-initial-request"]?.toLowerCase() !== "true") {
    persistedRequest = await getAsyncRequest(userSub, requestId, asyncRequestsTableName);
  }

  let result = null;
  if (persistedRequest) {
    if (persistedRequest.status === "completed") {
      result = persistedRequest.data;
    } else if (persistedRequest.status === "failed") {
      throw new asyncApiServices.RequestFailedError(persistedRequest.data);
    }
  } else {
    // Define the processor for the consumer
    const processor = async (payload) => {
      const { vatReturn, hmrcResponse } = await getVatReturn(
        payload.vrn, payload.periodKey,
        payload.hmrcAccessToken,
        payload.govClientHeaders,
        payload.testScenario,
        payload.hmrcAccount,
        payload.userSub,
      );
      const serializableHmrcResponse = {
        ok: hmrcResponse.ok,
        status: hmrcResponse.status,
        statusText: hmrcResponse.statusText,
        headers: Object.fromEntries(
          hmrcResponse.headers
            ? typeof hmrcResponse.headers.forEach === "function"
              ? (() => {
                  const h = {};
                  hmrcResponse.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
                  return Object.entries(h);
                })()
              : Object.entries(hmrcResponse.headers).map(([k, v]) => [k.toLowerCase(), v])
            : [],
        ),
      };
      return { vatReturn, hmrcResponse: serializableHmrcResponse };
    };

    // Initiate processing
    result = await asyncApiServices.initiateProcessing({
      processor,
      userId: userSub,
      requestId,
      waitTimeMs,
      payload: {
        vrn, periodKey, hmrcAccessToken, hmrcAccount,
        govClientHeaders, testScenario: govTestScenarioHeader, userSub,
      },
      tableName: asyncRequestsTableName,
      queueUrl: sqsQueueUrl,
      maxWaitMs: MAX_WAIT_MS,
    });
  }

  // Poll if necessary
  if (!result && waitTimeMs > 0) {
    result = await asyncApiServices.wait({ userId: userSub, requestId, waitTimeMs, tableName: asyncRequestsTableName });
  }
  if (!result) {
    result = await asyncApiServices.check({ userId: userSub, requestId, tableName: asyncRequestsTableName });
  }

  // Map HMRC error responses to our HTTP responses (similar to existing code)
  if (result && result.hmrcResponse && !result.hmrcResponse.ok) {
    const status = result.hmrcResponse.status;
    if (status === 403) return http403ForbiddenFromHmrcResponse(hmrcAccessToken, result.hmrcResponse, responseHeaders);
    if (status === 404) return http404NotFoundFromHmrcResponse(request, result.hmrcResponse, responseHeaders);
    return http500ServerErrorFromHmrcResponse(request, result.hmrcResponse, responseHeaders);
  }

  return asyncApiServices.respond({
    request,
    requestId,
    responseHeaders,
    data: result ? result.vatReturn : null,
  });
}
```

The refactor for `hmrcVatObligationGet.js` is analogous: replace the synchronous call to `getVatObligations()` with the async pattern, and the processor will call `getVatObligations(vrn, hmrcAccessToken, govClientHeaders, testScenario, hmrcAccount, query, userSub)` and return `{ obligations, hmrcResponse }`.

### 2.3 Implement the consumer functions

For each GET endpoint, define an `export async function consumer(event)` that:

* Parses `record.body` to obtain `userId`, `requestId`, `payload`.
* Calls `getVatReturn()` or `getVatObligations()` with the payload.
* Builds a serialisable `hmrcResponse` object.
* Calls `asyncApiServices.complete()` with the result.
* Handles retryable errors (429/503/504 or network errors) by re‑throwing; logs and calls `asyncApiServices.error()` on terminal errors.

The consumer’s structure mirrors the one in `hmrcVatReturnPost.js` but without receipt saving.

---

## 3 Client-side changes

1. **Initiate GET requests asynchronously** – When calling `/api/v1/hmrc/vat/return/:periodKey` or `/api/v1/hmrc/vat/obligation`, set the `x-wait-time-ms: 0` header and `x-initial-request: true` to trigger asynchronous processing.  Capture the returned `x-request-id`.

2. **Poll every second (1000 ms)** – Use a loop that waits 1000 ms between polls up to a 90‑second timeout.  For each poll, set `x-initial-request: false` and include the same `x-request-id` to resume the async request.

3. **Post status messages** – Call `showStatus()` or an equivalent UI helper:

    * Before the first request: e.g., `showStatus('Retrieving VAT return...', 'info')`.
    * After each poll: `showStatus('Still processing...', 'info')`.
    * On final 200/201 response: `showStatus('VAT return retrieved.', 'success')`.
    * On failure or timeout: `showStatus('Failed to retrieve VAT return.', 'error')`.

4. **Reuse existing polling helpers** – The branch `async-polling-hmrc` updates `submit.js` to support `requestWithPolling()` for POST operations; extend it to GET operations.

---

## 4 Test updates

1. **Unit tests** – Add tests for the new `handler` and `consumer` functions in `app/unit-tests/functions/hmrcVatReturnGet.test.js` and `hmrcVatObligationGet.test.js`.  Ensure the handler returns 202 with an `x-request-id` when `x-wait-time-ms=0`, and that the consumer writes to DynamoDB and returns correct 200 responses.

2. **System/behaviour tests** – Extend `behaviour-tests/submitVat.behaviour.test.js` or create new behaviour tests for read‑only flows:

    * Simulate a user requesting a VAT return or obligations.
    * Verify the first response is 202 and subsequent polls eventually return 200 with the correct data.
    * Check that status messages are posted on each poll and on completion.

3. **Poll interval tests** – Update `web/unit-tests/fetch-polling.test.js` to assert that the new polling interval (1000 ms) and 90‑second timeout apply to GET calls as well as POST.

---

## 5 Deployment & documentation

* **OpenAPI docs** – Update the specification to show that these GET endpoints return 202 for `Async Polling` requests and include the `x-request-id` header, and describe how clients should poll.

* **CI pipeline** – Verify that `infra/test/java/...` tests account for the new tables.  Add the new environment variables to `.env.ci` and `.env.prod`, and update any CDK tests.

* **Error handling** – Ensure that `generateHmrcErrorResponseWithRetryAdvice` or similar is used for GET calls on error; if not, implement consistent error mapping.

---

### Conclusion

By following this plan—adding async request tables, converting both GET handlers to asynchronous patterns using `asyncApiServices`, updating the front‑end to poll with status messages, and revising tests and deployment—you will complete Phase 6 of the async rollout.  This finalises read‑only HMRC integrations and aligns them with the multi‑pattern API strategy introduced earlier.
