### Asynchronous Processing Rollout Plan

This plan details the incremental rollout of the asynchronous polling pattern across the DIY Accounting Submit application. The rollout is divided into 6 drops, each followed by a full deployment to AWS.

#### Global Principles
- **One Table Per API**: Each asynchronous API (path + method) will have its own DynamoDB table for tracking request state to ensure isolation and simplified schemas.
- **Consumer Concurrency Capping**: To be a good citizen and avoid throttling from upstream systems (HMRC, Cognito), SQS consumers will have a default `reservedConcurrentExecutions` set to `1`. This aligns with HMRC's recommended practice of limiting outbound requests to avoid hitting application-wide rate limits (typically 150 requests per minute) and Cognito's category-based limits.
- **Generic Service Adoption**: All implementations will use the `asyncApiServices.js` abstraction.
- **CloudWatch Visibility**: Extensive logging at handler, consumer, and service entry/exit points for full traceability.
- **Web Polling Strategy**: The web client (`submit.js`) uses a tiered polling strategy:
    - First 10 polls: 10ms interval.
    - Subsequent polls: 1s interval.
    - Maximum duration: 1 minute.
    - If no terminal response (non-202) is received within 1 minute, the request is considered failed.

---

### Phase 1: Account Bundle Management (POST & DELETE)
**Goal**: Apply async pattern to bundle creation and deletion.

#### Infrastructure (Java/CDK)
- **SubmitSharedNames.java**:
    - Add `bundlePostAsyncRequestsTableName` and `bundleDeleteAsyncRequestsTableName`.
- **DataStack.java**:
    - Instantiate 2 new DynamoDB tables for these APIs.
- **AccountStack.java**:
    - Refactor `bundlePost` and `bundleDelete` to use `AsyncApiLambda`.
    - Set `consumerConcurrency(1)` for both.
    - Grant `bundlesTable` and `bundlePost/DeleteAsyncRequestsTable` permissions to handlers and consumers.
    - Grant Cognito `AdminGetUser` and `AdminUpdateUserAttributes` permissions.

#### Application (Node.js)
- **bundlePost.js**:
    - Refactor `handler` to use `asyncApiServices.initiateProcessing`, `wait`, `check`, and `respond`.
    - Implement `consumer` handler.
    - Extract core granting logic into a service function.
- **bundleDelete.js**:
    - Refactor `handler` to use the same async pattern.
    - Implement `consumer` handler.
    - Handle both query param and path parameter `{id}` deletions asynchronously.

#### Web & Testing
- **Web**: No changes needed; `fetchWithIdToken` in `submit.js` already handles 202 polling.
- **Unit Tests**: New tests for handlers and consumers in `app/unit-tests/functions/`.
- **System Tests**: Update `accountBundles.system.test.js` to verify polling behavior.
- **Behaviour Tests**: Run `npm run test:bundleBehaviour-proxy`.
- **OpenAPI**: Update `OpenApiGenerator.java` to document 202 Accepted responses for all `/bundle` methods.
- **Polling**: Web client updated to use tiered polling (10ms x 10, then 1s) with 1m timeout.

#### Deployment
- Merge to `main` and trigger `deploy.yml`.

---

### Phase 2: Cognito Token Exchange
**Goal**: Decouple Cognito token exchange from the synchronous request thread.

#### Infrastructure
- **SubmitSharedNames.java**: Add `cognitoTokenPostAsyncRequestsTableName`.
- **DataStack.java**: Create the DynamoDB table.
- **AuthStack.java**: Convert `cognitoTokenPost` to `AsyncApiLambda`.

#### Application
- **cognitoTokenPost.js**:
    - Implement the async pattern using `asyncApiServices`.
    - The consumer will perform the token exchange with Cognito and store tokens in the result.

#### Testing & Docs
- **Unit/System Tests**: Verify code exchange flow through the polling mechanism.
- **OpenAPI**: Update `OpenApiGenerator.java` to document the 202 Accepted response.

---

### Phase 3: HMRC Token Exchange
**Goal**: Handle potential HMRC OAuth latency and throttling.

#### Infrastructure
- **SubmitSharedNames.java**: Add `hmrcTokenPostAsyncRequestsTableName`.
- **HmrcStack.java**: Convert `hmrcTokenPost` to `AsyncApiLambda`.

#### Application
- **hmrcTokenPost.js**: Refactor to async pattern.
- **hmrcApi.js**: Ensure logging captures the hand-off to the consumer.

#### Rate Limits Alignment
- **Concurrency**: Maintain cap of `1` to avoid hitting HMRC OAuth rate limits during spikes.

---

### Phase 4: HMRC Receipt Management (GET & POST)
**Goal**: Asynchronous retrieval and storage of submission receipts.

#### Infrastructure
- **DataStack.java**: 2 new tables for `hmrcReceiptGet` and `hmrcReceiptPost`.
- **HmrcStack.java**: Convert both to `AsyncApiLambda`.

#### Application
- **hmrcReceiptGet.js**: Implement async retrieval from DynamoDB/S3.
- **hmrcReceiptPost.js**: Implement async logging of receipts.

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
