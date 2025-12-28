Here is a comprehensive plan for delivering **Phase 5: HMRC VAT Return Submission (POST)** using the asynchronous pattern, tailored for an agentic AI working on the `refresh` branch (to be merged into a new feature branch).  The plan synthesizes the existing rollout document with additional requirements on polling intervals, status messages, and logging.

---

## 1 Infrastructure changes

### 1.1 Add a new async request table

1. **DataStack.java** – Define a new DynamoDB table `hmrcVatReturnPostAsyncRequestsTable` (or similar) in `DataStack`.

    * Partition key: `requestId` (string).
    * Sort key: `userSub` (string).
    * TTL attribute: `expiresAt`.
    * Billing mode: on‑demand.
    * Enforce encryption and server‑side logging.

   This matches the approach used for other async tables.

2. **Table names and environment variables** – Add a constant in `SubmitSharedNames.java` for the table name, and export it as `HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME` to be consumed by the Lambda.

### 1.2 Convert the Lambda to `AsyncApiLambda`

1. **HmrcStack.java** – Replace the existing `LambdaRestApi` declaration for HMRC VAT Return POST with an `AsyncApiLambda` (see how `bundlePost` or other Async Lambdas are defined).

    * Pass `asyncRequestsTableName` and `asyncRequestsQueue` (the SQS queue for this Lambda) as environment variables.
    * Configure the SQS event source for the consumer with reserved concurrency = 1 to avoid throttling.
    * Add an IAM policy allowing the Lambda to read and write to the new async table.

2. **Deploy pipeline** – Ensure the new table and queue are created via CDK deploy.  Update `lambda-concurrency-config.yaml` to include `hmrc-vat-return-post-consumer` with peak/zero concurrency values similar to Phase 1 patterns.

3. **No auto‑scale to peak by default** – The new Lambda will be scaled to zero except during scheduled or manual peaks using the existing `scale-to.yml`.

---

## 2 Refactor `hmrcVatReturnPost.js` using async pattern

### 2.1 Overall structure

Replicate the structure from `app/functions/account/bundlePost.js`:

* **handler()** – Accepts the initial POST request, validates input, sets fraud‑prevention headers, reads `waitTimeMs` from `x-wait-time-ms` header, and calls `asyncApiServices.initiateProcessing()` with the payload (VAT return data and fraud headers) and `asyncRequestsTableName`.  It then calls `asyncApiServices.wait()` if `waitTimeMs > 0`, followed by `asyncApiServices.check()` and `asyncApiServices.respond()`.

* **consumer()** – Invoked by SQS.  It receives the payload, performs the actual VAT submission (call `submitVat()`), saves the receipt to DynamoDB (`putReceipt()`), and updates the async request record with the result or error.

* **initiateProcessing() payload** – Include all data needed by the consumer (e.g., `vatReturnInput`, `fraudHeaders`, `userSub`, `requestId`).

* **MAX_WAIT_MS** – Set to zero or very low for this endpoint to force asynchronous behaviour unless the client explicitly requests to wait; the default should be 0.

### 2.2 Handler details

1. **Validate user and input** – Reuse existing validation logic from `hmrcVatReturnPost.js`.

2. **Generate fraud‑prevention headers** – Keep the logic for Gov‑Client headers. Include them in the payload passed to the consumer.

3. **Initiate async processing**:

   ```js
   import { asyncApiServices } from '../../services/asyncApiServices.js';
   import { getWaitTimeMsFromHeader } from '../../services/someHelper.js';

   export async function handler(event) {
     const waitTimeMs = getWaitTimeMsFromHeader(event.headers['x-wait-time-ms']) ?? 0;
     const payload = {
       vatReturn: extractVatReturnFromEvent(event),
       fraudHeaders: buildFraudHeaders(event),
       userSub,
       requestId: uuid.v4(),
     };
     const initResult = await asyncApiServices.initiateProcessing({
       payload,
       asyncRequestsTableName: process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME,
       sqsQueueUrl: process.env.ASYNC_REQUESTS_QUEUE_URL,
       waitTimeMs,
     });

     const waitResult = await asyncApiServices.wait({
       ...initResult,
       waitTimeMs,
       asyncRequestsTableName: process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME,
     });
     const checkResult = await asyncApiServices.check({
       ...initResult,
       asyncRequestsTableName: process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME,
     });
     return asyncApiServices.respond({ ...checkResult });
   }
   ```

   Ensure logs mirror those in `bundlePost.js` – log start, enqueued message, waiting/polling, and final response.

### 2.3 Consumer details

```js
export async function consumer(event) {
  for (const record of event.Records) {
    const msg = JSON.parse(record.body);
    const { vatReturn, fraudHeaders, userSub, requestId } = msg;
    try {
      const receipt = await submitVat(vatReturn, fraudHeaders); // existing method
      // Save receipt via putReceipt() if not already done
      const receiptId = `${new Date().toISOString()}-${receipt.formBundleNumber}`;
      await putReceipt(userSub, receiptId, receipt);

      await asyncApiServices.complete({
        asyncRequestsTableName: process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME,
        requestId,
        userSub,
        result: {
          statusCode: 201,
          body: { receipt },
        },
      });
    } catch (err) {
      await asyncApiServices.error({
        asyncRequestsTableName: process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME,
        requestId,
        userSub,
        error: err,
      });
    }
  }
}
```

Use `putReceipt()` to persist the receipt; this ensures receipts are saved server‑side (as previously planned).

---

## 3 Web client changes

### 3.1 Trigger async behaviour

1. **Submit VAT call** – Modify `submitVat.html` (or supporting JS module) to set `x-wait-time-ms: 0` on the request.  This triggers asynchronous processing.

2. **Poll at 1000 ms intervals** – Replace the existing tiered polling (10×10 ms then 1 s) with a flat 1000 ms interval.  Use `fetchWithIdToken()` or a new helper to call the same URL repeatedly until a non‑202 response or until 90 s have elapsed.  For each poll:

   ```js
   function pollVatReturnStatus(requestInit, timeoutMs = 90000) {
     const start = Date.now();
     async function poll() {
       if (Date.now() - start > timeoutMs) {
         showStatus('Timed out waiting for VAT return result', 'error');
         throw new Error('timeout');
       }
       showStatus('Checking VAT return status...', 'info');
       const res = await fetchWithIdToken('/api/v1/hmrc/vat/return', {
         ...requestInit,
         method: 'GET', // or POST with same body if using POST polling
       });
       if (res.status === 202) {
         await new Promise((r) => setTimeout(r, 1000));
         return poll();
       }
       return res;
     }
     return poll();
   }
   ```

### 3.2 Status messages

* At the start of submission, call `showStatus('Submitting VAT return…', 'info');`.
* After each poll call, update the UI: `showStatus('Still processing…', 'info');`.
* On final result (non‑202), call `showStatus('VAT return processed', 'success');` or `showStatus('VAT return failed', 'error');`.
* On timeout, show an appropriate error message and provide a link to retry.

### 3.3 Update error handling

* If the final response is a failure (4xx or 5xx status), handle accordingly (e.g., display error details).
* Support `requestId` tracking: store the returned `x-request-id` header to poll the same resource.

### 3.4 Front-end tests

* Update tests in `fetch-polling.test.js` to expect 1‑second polling intervals.  Remove logic that counts a burst of 10×10 ms polls and set the maximum polls to 90 (one per second).  Adjust the timeout to 90 s.
* Add tests that verify status messages are posted at each poll iteration and on final result.

---

## 4 Deployment and workflow adjustments

1. **Update CDK** – After converting the Lambda, ensure `deploy.yml` passes the new environment variables (`HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME`, `ASYNC_REQUESTS_QUEUE_URL`) to the Lambda during deployment using `npx dotenv` (as seen in other stacks).

2. **Update `lambda-concurrency-config.yaml`** – Add an entry for the new consumer (e.g., `hmrc-vat-return-post-consumer`) with `zero: 0` and `peak: 1` or a higher value if HMRC rate limits allow.

3. **Pipeline changes** – Add steps to `deploy.yml` to scale this Lambda to peak concurrency during deployment if needed.  Add this new Lambda to the scheduled scale-to-zero job.

4. **Behaviour tests** – If using separate behavioural tests (`submitVatBehaviour-proxy`), update them to account for asynchronous behaviour: ensure the test waits for the result and verifies a 202 followed by a final 201/200 response.

---

## 5 Logging and monitoring

* Follow the logging practices in `bundlePost.js`: log initial request details, SQS enqueue, polling attempts, consumer execution, and final results.
* Add CloudWatch metrics for queue length, processing times, and failures.
* Consider adding X-Ray or AWS StepFunctions to trace asynchronous flows.

---

## 6 Documentation updates

* Modify `async-pattern-rollout.md` under Phase 5 to reflect the new polling interval (1000 ms) and 90‑second timeout.
* Update end‑user documentation to explain that VAT submission may take up to 90 s and that the status indicator will update during processing.
* Document how to override `x-wait-time-ms` if synchronous behaviour is ever needed.

---

### Summary

Implementing Phase 5 involves creating a dedicated async request table and SQS queue, refactoring the `hmrcVatReturnPost` Lambda into a handler/consumer pair using `asyncApiServices`, modifying the web client to poll at 1‑second intervals with status updates and a 90‑s timeout, and updating tests and deployment scripts accordingly.  Following these steps will align the HMRC VAT return submission flow with the multi‑pattern asynchronous architecture while meeting the new polling and status requirements.
