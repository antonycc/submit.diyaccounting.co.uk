# Web Test Bundle Failure Analysis

## Problem Statement

The GitHub Actions workflow job `web-test-bundle` fails when run from `.github/workflows/deploy.yml` but succeeds when run from `.github/workflows/synthetic-test.yml` on branch `optimise`.

**Failure Symptom**: The test times out after ~2 minutes waiting for a bundle creation request to complete. The POST /api/v1/bundle endpoint continuously returns HTTP 202 (Accepted) status, indicating async processing is in progress, but never completes.

## Root Cause Analysis

### 1. **Lambda Concurrency Limits (Primary Cause)**

The bundle creation Lambda functions have extremely low concurrency limits configured in `lambda-concurrency-config.yaml`:

```yaml
- name: submit-app-bundle-post
  handler: app/functions/account/bundlePost.handler
  concurrency:
    zero: 0
    peak: 1    # ← Only 1 concurrent execution allowed

- name: submit-app-bundle-post-consumer
  handler: app/functions/account/bundlePost.consumer
  concurrency:
    zero: 0
    peak: 2    # ← Only 2 concurrent executions allowed
```

**Impact**: With `peak: 1`, only ONE instance of the bundle-post handler Lambda can execute at any time. During the deploy workflow:
- Multiple AWS resources are being updated/deployed
- CloudFront distributions are being configured
- Other Lambda functions may be executing
- If any other bundle request is in progress, new requests are queued/throttled

### 2. **Timing Difference Between Workflows**

**deploy.yml workflow** (lines 1967-2005):
- Job `web-test-bundle` depends on: `names`, `set-origins`, `deploy-publish`
- Runs AFTER full deployment is complete
- System is under load from:
  - Lambda function deployments (cold starts)
  - CloudFront invalidations
  - Multiple concurrent test jobs
  - Resource contention across AWS services

**synthetic-test.yml workflow** (lines 61-167):
- Job `web-test-bundle` depends on: `names` only
- Runs against a stable, idle deployment
- No concurrent deployment operations
- Lambdas are already warm (if recently used)
- No resource contention

### 3. **Async Processing Architecture**

The bundle POST handler uses an async request pattern (`app/functions/account/bundlePost.js`):

1. Client sends POST /api/v1/bundle
2. Handler Lambda initiates async processing:
   - Creates DynamoDB async request entry
   - May queue message to SQS for background processing
   - Returns HTTP 202 (Accepted) if not immediately complete
3. Client polls endpoint until status becomes 200 (completed)

**Problem**: During deployment with concurrency=1:
- If another request is being processed → new requests are throttled
- SQS consumer Lambda may also be throttled (concurrency=2)
- Cold starts add 5-15 seconds to initial processing
- Total processing time exceeds test timeout (~2 minutes)

### 4. **Test Configuration**

From the error log, the test polls for ~20 seconds (20 attempts × 1 second), then the browser-side async handler continues polling for another ~25 seconds (34 total polls) before timing out at the Playwright level (32 second timeout).

## Identified Mitigations

### Mitigation 1: Increase Lambda Concurrency (Recommended - High Impact)

**Change**: Increase concurrency limits for bundle-related Lambdas

**Implementation**:
```yaml
# lambda-concurrency-config.yaml
- name: submit-app-bundle-post
  handler: app/functions/account/bundlePost.handler
  concurrency:
    zero: 0
    peak: 5    # Increased from 1 to 5

- name: submit-app-bundle-post-consumer
  handler: app/functions/account/bundlePost.consumer
  concurrency:
    zero: 0
    peak: 10   # Increased from 2 to 10
```

**Benefits**:
- Allows multiple concurrent bundle requests during deployment
- Reduces queuing/throttling delays
- Better handles burst traffic from tests

**Cost Impact**: Minimal - Lambda charges per invocation and duration, not per concurrent instance. Provisioned concurrency (if used) would cost ~$4.20/month per instance in eu-west-2.

**Risk**: Low - these are user-facing operations that should handle concurrency

---

### Mitigation 2: Add Delay Before web-test-bundle Job (Low Impact)

**Change**: Add a waiting period after deployment before running tests

**Implementation**:
```yaml
# .github/workflows/deploy.yml
web-test-bundle:
  needs:
    - names
    - set-origins
    - deploy-publish
  steps:
    - name: Wait for system to stabilize
      run: sleep 60  # Wait 60 seconds for cold starts and deployments to settle
    # ... rest of job
```

**Benefits**:
- Allows Lambda cold starts to complete
- Reduces immediate post-deployment contention
- Simple, no code changes required

**Drawbacks**:
- Adds 60 seconds to every workflow run
- Doesn't solve the root cause (concurrency limits)
- May not be sufficient under heavy load

---

### Mitigation 3: Increase Test Timeout Values (Low Impact)

**Change**: Increase timeout values in test and async polling logic

**Implementation**:
```javascript
// behaviour-tests/steps/behaviour-bundle-steps.js
await expect(page.getByRole("button", { name: `Added ✓ ${bundleName}` }))
  .toBeVisible({ timeout: 60000 }); // Increased from 32000 to 60000ms

// app/functions/account/bundlePost.js
const MAX_WAIT_MS = 60_000; // Increased from 25_000 to 60_000
```

**Benefits**:
- Allows more time for async operations to complete
- Handles cold starts and deployment contention better

**Drawbacks**:
- Slower feedback on legitimate failures
- Doesn't solve the root cause
- May hide underlying performance issues

---

### Mitigation 4: Use Reserved Concurrency (Alternative to Mitigation 1)

**Change**: Use Lambda reserved concurrency instead of provisioned concurrency

**Implementation**: Modify CDK stack to set `reservedConcurrentExecutions`:
```java
// infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java
bundlePostLambda.setReservedConcurrentExecutions(10);
bundlePostConsumerLambda.setReservedConcurrentExecutions(20);
```

**Benefits**:
- Guarantees minimum concurrency availability
- No additional cost (not provisioned)
- Prevents throttling from account-level limits

**Drawbacks**:
- May need to adjust account-level concurrent execution limits
- More complex than just increasing peak values

---

### Mitigation 5: Run Tests Sequentially (Workaround)

**Change**: Prevent parallel test execution during deployment

**Implementation**:
```yaml
# .github/workflows/deploy.yml
web-test-submit-vat-sandbox:
  needs:
    - web-test-bundle  # Add explicit dependency
```

**Benefits**:
- Reduces concurrent load on Lambda functions
- Simple workflow change

**Drawbacks**:
- Significantly increases total workflow duration
- Doesn't solve the underlying issue
- Reduces parallelism benefits

---

### Mitigation 6: Skip Concurrent Behaviour Tests During Heavy Deployment

**Change**: Move `behaviour-test-bundle` (proxy-based) to run earlier, skip `web-test-bundle` until deployment stabilizes

**Implementation**:
```yaml
# .github/workflows/deploy.yml
# Keep behaviour-test-bundle (proxy, local) - runs early
behaviour-test-bundle:
  needs: [names]  # Doesn't wait for deployment

# Skip or delay web-test-bundle during deployment
web-test-bundle:
  if: github.event.inputs.skipWebTests != 'true'
  needs:
    - names
    - set-origins
    - deploy-publish
    - upload-web-test-results  # Run after other tests complete
```

**Benefits**:
- Reduces load during critical deployment phase
- Maintains test coverage via behaviour-test-bundle (proxy)

**Drawbacks**:
- Delays production smoke tests
- Reduces deployment confidence

## Recommended Solution

**Primary**: Implement **Mitigation 1** (Increase Lambda Concurrency)
- Change bundle-post handler from peak: 1 → peak: 5
- Change bundle-post consumer from peak: 2 → peak: 10
- Minimal cost impact, high reliability improvement

**Secondary**: Implement **Mitigation 3** (Increase Test Timeouts)
- Increase MAX_WAIT_MS from 25 seconds to 60 seconds
- Increase Playwright timeout from 32 seconds to 60 seconds
- Provides better tolerance for cold starts

**Tertiary**: Consider **Mitigation 2** (Add Stabilization Delay) if needed
- Only if issues persist after primary/secondary fixes
- Start with 30-second delay and adjust based on results

## Cost Analysis

**Current State**:
- bundle-post handler: peak=1, rarely invoked during deployment
- bundle-post consumer: peak=2, processes async requests

**Proposed State** (Mitigation 1):
- bundle-post handler: peak=5 (4 additional potential instances)
- bundle-post consumer: peak=10 (8 additional potential instances)

**Cost Impact**:
- If NOT using provisioned concurrency: $0 additional cost (pay per invocation)
- If using provisioned concurrency: ~$4.20/month per instance in eu-west-2
  - Additional cost: 4 × $4.20 + 8 × $4.20 = ~$50/month
  - However, current config shows `zero: 0`, suggesting NO provisioned concurrency
  - Therefore: **Zero additional cost**

## Implementation Priority

1. **High Priority**: Increase Lambda concurrency (Mitigation 1)
2. **Medium Priority**: Increase test timeouts (Mitigation 3)
3. **Low Priority**: Add stabilization delay if still needed (Mitigation 2)
4. **Not Recommended**: Mitigations 5-6 (reduce parallelism/skip tests)

## Verification Plan

After implementing fixes:

1. Run deploy.yml workflow on branch `optimise`
2. Monitor web-test-bundle job for:
   - Bundle creation time (should be < 10 seconds)
   - Test completion (should pass within timeout)
   - Lambda concurrency metrics in CloudWatch
3. Check CloudWatch Logs for:
   - Lambda throttling events (should be zero)
   - Cold start durations
   - Async request completion times
4. Compare with synthetic-test.yml results (should be similar)

## Additional Observations

- The existing `behaviour-test-bundle` job (lines 220-279) runs using proxy mode with local services, NOT against deployed infrastructure
- It completes successfully because it doesn't hit real Lambda concurrency limits
- The failing `web-test-bundle` job (lines 1967-2005) tests the actual deployed CI environment
- This difference in environments is why one passes and one fails

## References

- Lambda concurrency config: `lambda-concurrency-config.yaml`
- Bundle POST handler: `app/functions/account/bundlePost.js`
- Deploy workflow: `.github/workflows/deploy.yml` (lines 1967-2005)
- Synthetic test workflow: `.github/workflows/synthetic-test.yml` (lines 61-167)
- Bundle behaviour test: `behaviour-tests/bundles.behaviour.test.js`
- Bundle test steps: `behaviour-tests/steps/behaviour-bundle-steps.js`
