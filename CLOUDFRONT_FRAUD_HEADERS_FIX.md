# CloudFront Fraud Prevention Headers Fix

**Date**: 2026-01-06  
**Issue**: HMRC fraud prevention headers missing in CI environment  
**Status**: Fixed - awaiting deployment

## Problem Description

HMRC fraud prevention headers (Gov-Client-*) were present when running tests locally against the local Express server but were missing when tests ran against the CI environment (CloudFront + API Gateway + Lambda).

## Root Cause

The CloudFront EdgeStack configuration was using the default `OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER` for the API Gateway behavior. While this policy forwards most viewer headers, it does not forward custom headers like `Gov-Client-*` by default.

### Header Flow
1. **Browser** → Sends Gov-Client-* headers (via `submit.js:getGovClientHeaders()`)
2. **CloudFront** → ❌ **Strips custom headers** (due to default policy)
3. **API Gateway** → Receives request without Gov-Client-* headers
4. **Lambda** → buildFraudHeaders.js cannot find the headers
5. **HMRC API** → Request missing required fraud prevention headers

## Solution

Created a custom `OriginRequestPolicy` that explicitly whitelists all required headers:

```java
// infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java

OriginRequestPolicy fraudPreventionHeadersPolicy = OriginRequestPolicy.Builder.create(
        this, props.resourceNamePrefix() + "-FraudPreventionORP")
    .originRequestPolicyName(props.resourceNamePrefix() + "-fraud-prevention-orp")
    .comment("Origin request policy that forwards HMRC fraud prevention headers (Gov-Client-*) to API Gateway")
    .headerBehavior(OriginRequestHeaderBehavior.allowList(
        // HMRC Fraud Prevention Headers
        "Gov-Client-Browser-JS-User-Agent",
        "Gov-Client-Device-ID",
        "Gov-Client-Public-IP",
        "Gov-Client-Public-IP-Timestamp",
        "Gov-Client-Screens",
        "Gov-Client-Timezone",
        "Gov-Client-User-IDs",
        "Gov-Client-Window-Size",
        "Gov-Client-Multi-Factor",
        "Gov-Client-Browser-Do-Not-Track",
        // Fallback headers
        "x-device-id",
        "x-forwarded-for",
        // Standard headers
        // Note: Authorization and Accept-Encoding cannot be in OriginRequestPolicy
        // They are handled by CachePolicy.CACHING_DISABLED instead
        "Content-Type",
        "User-Agent",
        "Referer",
        "Origin",
        // Test/account headers
        "Gov-Test-Scenario",
        "x-hmrc-account"))
    .queryStringBehavior(OriginRequestQueryStringBehavior.all())
    .cookieBehavior(OriginRequestCookieBehavior.none())
    .build();
```

### Updated Header Flow
1. **Browser** → Sends Gov-Client-* headers
2. **CloudFront** → ✅ **Forwards whitelisted headers** (via custom policy)
3. **API Gateway** → Receives request with Gov-Client-* headers
4. **Lambda** → buildFraudHeaders.js successfully reads and processes headers
5. **HMRC API** → Request includes all required fraud prevention headers

## Files Changed

- `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java`
  - Added imports for OriginRequest policy builders
  - Created custom OriginRequestPolicy with whitelisted headers
  - Modified `createBehaviorOptionsForApiGateway()` to use custom policy

## Deployment

The fix requires redeployment of the EdgeStack to take effect:

```bash
# Deploy to CI environment (via GitHub Actions workflow)
# The deploy-application.yml workflow will pick up the changes
```

## Verification

After deployment, verify the fix by:

1. Running behaviour tests against CI environment:
   ```bash
   npm run test:submitVatBehaviour-ci
   ```

2. Checking test report at:
   ```
   https://ci.submit.diyaccounting.co.uk/tests/test-report-template.html?test=web-test
   ```

3. Verifying that HMRC API requests logged in DynamoDB include Gov-Client-* headers in the `httpRequest.headers` field

## References

- HMRC Fraud Prevention Specification: https://developer.service.hmrc.gov.uk/guides/fraud-prevention/
- CloudFront Origin Request Policies: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html
- Browser header collection: `web/public/submit.js:getGovClientHeaders()`
- Lambda header building: `app/lib/buildFraudHeaders.js:buildFraudHeaders()`
