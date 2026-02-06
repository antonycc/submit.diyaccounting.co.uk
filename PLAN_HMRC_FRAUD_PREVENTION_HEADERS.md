# Plan: HMRC Fraud Prevention Header Fixes

**Date**: 6 February 2026
**Triggered by**: HMRC FPH Team review response (4 February 2026)
**Goal**: Fix fraud prevention header issues to achieve HMRC production API approval

---

## HMRC Feedback Summary

HMRC reviewed headers from 10:11-10:12 UTC, 4 February 2026, across all three endpoints:
- `GET /organisations/vat/{vrn}/obligations`
- `POST /organisations/vat/{vrn}/returns`
- `GET /organisations/vat/{vrn}/returns/{periodKey}`

Three issues identified:

| # | Header | Issue | Severity |
|---|--------|-------|----------|
| 1 | Gov-Vendor-Public-IP & Gov-Client-Public-IP | Values must not be the same | Blocking |
| 2 | Gov-Client-Public-Port | Must be provided (previous omission justification rejected) | Blocking |
| 3 | Gov-Vendor-License-IDs | Omit the header (confirming our approach) | None |

---

## Issue 1: Gov-Vendor-Public-IP = Gov-Client-Public-IP

### Root Cause

In `app/lib/buildFraudHeaders.js:79`:
```javascript
const serverPublicIp = process.env.SERVER_PUBLIC_IP || publicClientIp;
```

`SERVER_PUBLIC_IP` is never set in CDK Lambda environment variables. The fallback uses
`publicClientIp` (the user's IP from `X-Forwarded-For`), making both headers identical.

### What These Headers Mean

- **Gov-Client-Public-IP**: The end user's public IP address (from their ISP/network)
- **Gov-Vendor-Public-IP**: The IP from which the **server** makes outbound calls to HMRC APIs

These are fundamentally different: the client is a home user, the vendor is AWS Lambda.

### Fix

1. **Remove the toxic fallback** `process.env.SERVER_PUBLIC_IP || publicClientIp`
2. **Detect Lambda's outbound IP at cold start** by calling `https://checkip.amazonaws.com`
3. **Cache the result** in a module-level variable (persists across warm invocations)
4. **Log a warning** if detection fails (header will be omitted, not falsified)

The Lambdas are NOT in a VPC (no VPC references in CDK stacks), so they use AWS-managed NAT.
`checkip.amazonaws.com` is an AWS service — reliable and fast (~50ms from Lambda).

### Files Changed

- `app/lib/buildFraudHeaders.js` — IP detection + remove fallback
- `app/unit-tests/lib/buildFraudHeaders.test.js` — Updated tests

---

## Issue 2: Gov-Client-Public-Port

### Background

Previously omitted with justification: "CloudFront doesn't preserve client TCP source port."
HMRC rejected this: "We see no technical limitations that would prevent the change."

### Solution: CloudFront-Viewer-Address Header

CloudFront provides the `CloudFront-Viewer-Address` header containing `ip:port` of the viewer.
This header is a CloudFront-generated header that must be explicitly configured in the
Origin Request Policy to be forwarded to the origin (API Gateway → Lambda).

### Approach 1: Try `all("CloudFront-Viewer-Address")` (Current Attempt)

Change the Origin Request Policy from:
```java
.headerBehavior(OriginRequestHeaderBehavior.denyList("Host"))
```
To:
```java
.headerBehavior(OriginRequestHeaderBehavior.all("CloudFront-Viewer-Address"))
```

This maps to CloudFormation's `allViewerAndWhitelistCloudFront` behavior:
- Forwards ALL viewer headers (including Host) to API Gateway
- PLUS the CloudFront-Viewer-Address header

**Risk**: The code comment says `all()` caused 403 errors from API Gateway previously because
it forwards the viewer's `Host` header (e.g., `submit.diyaccounting.co.uk`) instead of letting
CloudFront set it to the API Gateway domain. However, this is an HTTP API v2 which routes by
path, not Host — so it may work. This needs to be tested via deployment.

### Approach 3 (Fallback): Add API Gateway Custom Domain

If Approach 1 causes 403 errors, the fallback is to configure an API Gateway custom domain
that matches the CloudFront domain, so the forwarded Host header is valid.

#### Steps for API Gateway Custom Domain

1. **Create ACM certificate** in the API Gateway's region (eu-west-2) for the deployment domain
   (e.g., `ci-submit.diyaccounting.co.uk`). Note: CloudFront certificates must be in us-east-1,
   but API Gateway custom domains use the regional certificate.

2. **Add custom domain to API Gateway HTTP API** in `ApiStack.java`:
   ```java
   DomainName customDomain = DomainName.Builder.create(this, "CustomDomain")
       .domainName(props.sharedNames().deploymentDomainName)
       .certificate(regionalCert)
       .build();
   ApiMapping.Builder.create(this, "ApiMapping")
       .api(httpApi)
       .domainName(customDomain)
       .build();
   ```

3. **Update Route53** to add a CNAME or alias record from the deployment domain to the API
   Gateway custom domain endpoint. However, since CloudFront already owns the A/AAAA record
   for this domain, we'd need a different approach — likely a subdomain like
   `api.ci-submit.diyaccounting.co.uk` or a path-based approach.

4. **Alternative**: Instead of a custom domain, use API Gateway request parameter mapping
   to strip/override the Host header before it reaches the Lambda integration.

#### Complexity Assessment

Approach 3 is significantly more complex because:
- Requires a regional ACM certificate (separate from the CloudFront us-east-1 cert)
- May require a subdomain to avoid Route53 alias conflicts
- Adds infrastructure coupling between EdgeStack and ApiStack
- Needs careful DNS planning

**Recommendation**: Deploy Approach 1 first and test. If it works (HTTP API v2 may not
reject on Host mismatch), no further work needed.

### Server-Side Extraction

In `buildFraudHeaders.js`, extract the port from `CloudFront-Viewer-Address`:
```javascript
// CloudFront-Viewer-Address format: "ip:port" (IPv4) or "[ip]:port" (IPv6)
const viewerAddress = getHeader("cloudfront-viewer-address");
if (viewerAddress) {
    const port = viewerAddress.split(":").pop();
    headers["Gov-Client-Public-Port"] = port;
}
```

### Files Changed

- `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java` — ORP change
- `app/lib/buildFraudHeaders.js` — Extract port from CloudFront-Viewer-Address
- `behaviour-tests/helpers/dynamodb-assertions.js` — Remove from intentionallyNotSupplied
- `hmrc-fraud-prevention.md` — Update documentation

---

## Issue 3: Gov-Vendor-License-IDs (No Change)

HMRC says: "Please omit the header in future submissions and we will take this into
consideration when validating."

This header is already intentionally not sent. No code change needed. HMRC is acknowledging
our open-source rationale.

---

## Flagged Fallbacks

### Toxic fallback (REMOVED)
- `buildFraudHeaders.js:79`: `process.env.SERVER_PUBLIC_IP || publicClientIp`
  — Falsified Gov-Vendor-Public-IP by using client's IP as server IP

### Acceptable patterns (NOT toxic)
- `buildFraudHeaders.js:72`: `authorizer?.claims?.sub || authorizer?.sub || "anonymous"`
  — The custom authorizer rejects unauthenticated requests before this code runs.
    "anonymous" is a dead-code defensive pattern, not a production fallback. However,
    a warning log has been added for visibility.

### Browser-side patterns (NOT sent to HMRC)
- `hmrc-service.js:155`: `return "SERVER_DETECT"` — Browser IP detection fallback.
  This value is sent to the Express/Lambda server as `Gov-Client-Public-IP` but the server
  does NOT pass through `Gov-Client-Public-IP` from client headers. It independently
  extracts the IP from `X-Forwarded-For`. So "SERVER_DETECT" never reaches HMRC.

---

## HMRC Additional Requirements

HMRC also requires:
1. **Use the Test API** to confirm headers are valid after changes
2. **Submit using different hardware and users** to show headers vary correctly
3. **Use all endpoints** the application will use in production

These are testing/validation requirements, not code changes.

---

## Deployment & Validation Plan

1. Implement code changes (this PR)
2. Run `npm test` — unit tests pass
3. Run `./mvnw clean verify` — CDK compiles
4. Push to feature branch → GitHub Actions deploys to CI
5. If Approach 1 (all("CloudFront-Viewer-Address")) causes 403 errors:
   - Revert ORP change to `denyList("Host")`
   - Implement Approach 3 (API Gateway custom domain)
6. Run behaviour tests against CI deployment
7. Validate fraud prevention headers via HMRC Test API
8. Test with multiple users/devices
9. Submit to HMRC for re-review
