# Content Security Policy (CSP) Inline Script Fix

**Date**: 2025-12-17
**Issue**: CSP violation blocking inline script execution preventing RUM initialization and page functionality

## Problem

The application was experiencing Content Security Policy (CSP) violations when deployed to AWS:

```
[BROWSER CONSOLE error]: Executing inline script violates the following Content Security Policy directive 'script-src 'self' https://client.rum.us-east-1.amazonaws.com https://unpkg.com'. Either the 'unsafe-inline' keyword, a hash ('sha256-/wKlHic0EgwTk1WljnVi7rfn3EXm7R9hJpjjhZWMq6A='), or a nonce ('nonce-...') is required to enable inline execution.
```

This caused:
1. CloudWatch RUM script initialization failure
2. Page elements like `#dynamicActivities` not rendering
3. Timeout errors in browser tests: `page.waitForSelector: Timeout 15000ms exceeded`

## Root Cause

The CSP policy defined in `EdgeStack.java` and `ApexStack.java` only allowed scripts from specific external sources:

```java
"script-src 'self' https://client.rum.us-east-1.amazonaws.com https://unpkg.com;"
```

However, the application uses:
1. **Inline scripts in HTML files** (e.g., `index.html` lines 90-332)
2. **CloudWatch RUM client library** which may create inline scripts for initialization
3. **Dynamic script injection** via `loadScript()` function in `submit.js`

Without `'unsafe-inline'` in the CSP, all inline script execution was blocked by the browser.

## Solution

Added `'unsafe-inline'` to the `script-src` directive in both CloudFront response header policies:

**Before:**
```java
"script-src 'self' https://client.rum.us-east-1.amazonaws.com https://unpkg.com;"
```

**After:**
```java
"script-src 'self' 'unsafe-inline' https://client.rum.us-east-1.amazonaws.com https://unpkg.com;"
```

### Files Modified

1. **`infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java`** (line 304)
   - CloudFront distribution response headers policy for edge locations

2. **`infra/main/java/co/uk/diyaccounting/submit/stacks/ApexStack.java`** (line 227)
   - CloudFront distribution response headers policy for apex domain

## Security Implications

### Understanding the Trade-off

Adding `'unsafe-inline'` to CSP's `script-src` directive reduces security by allowing:
- Inline `<script>` tags in HTML
- `onclick` and other inline event handlers
- `javascript:` URLs
- Dynamic `eval()` and similar constructs

### Why This Is Acceptable for This Application

1. **Existing Design Pattern**: The application already extensively uses inline scripts in HTML files (index.html, submitVat.html, etc.), so this aligns with the current architecture rather than introducing new risk.

2. **CloudWatch RUM Requirement**: AWS CloudWatch RUM client library may inject inline scripts for telemetry collection. Without `'unsafe-inline'`, RUM cannot function properly.

3. **Consistency with Style Policy**: The CSP already uses `'unsafe-inline'` for `style-src`, indicating a pragmatic approach to CSP enforcement in this codebase.

4. **Mitigating Controls**:
   - External scripts are still restricted to specific domains (`'self'`, `client.rum.us-east-1.amazonaws.com`, `unpkg.com`)
   - AWS WAF provides additional protection with rate limiting and common attack pattern blocking
   - All user input is sanitized before rendering
   - Authentication via AWS Cognito protects sensitive operations

5. **Alternative Approaches Too Complex**:
   - **Nonce-based CSP**: Would require server-side rendering or complex build-time injection into static files
   - **Hash-based CSP**: Would break with any script changes and require constant maintenance
   - **Refactor to External Scripts**: Would require significant architectural changes to move all inline scripts to external files

### More Secure Alternatives (Future Improvements)

If stricter CSP is desired in the future:

1. **Move to Nonce-Based CSP**:
   - Use Lambda@Edge to inject unique nonces into HTML
   - Add matching nonces to all inline scripts
   - Update RUM configuration to work with nonces

2. **Refactor Inline Scripts**:
   - Move all inline JavaScript to external `.js` files
   - Use event delegation instead of inline event handlers
   - Remove `'unsafe-inline'` from policy

3. **Use CSP Level 3 Hash Sources**:
   - Generate SHA-256 hashes for each inline script
   - Update CSP to allow specific hashes
   - Maintain hash list in infrastructure code

## Testing

After deployment, verify the fix works by:

1. **Browser Console**: No CSP violation errors
   ```javascript
   // Should not see: "Executing inline script violates..."
   ```

2. **Page Elements Load**: `#dynamicActivities` element is visible and populated
   ```javascript
   document.getElementById('dynamicActivities').style.display !== 'none'
   ```

3. **RUM Initialization**: CloudWatch RUM client loads successfully
   ```javascript
   typeof window.cwr === 'function'
   window.__RUM_INIT_DONE__ === true
   ```

4. **Behaviour Tests**: Playwright tests pass without timeout errors
   ```bash
   npm run test:behaviour-ci
   ```

## Deployment

The fix requires redeploying the CDK stacks to update CloudFront response headers policies:

```bash
# Deploy environment stack (if needed)
npm run cdk:synth-environment

# Deploy application stack with updated CSP
npm run cdk:synth-application

# Deploy to CI environment
ENVIRONMENT_NAME=ci ./mvnw clean verify
# Follow standard deployment workflow
```

CloudFront will automatically apply the new response headers policy to all requests.

## Monitoring

After deployment, monitor:

1. **Browser Console Errors**: Check for any remaining CSP violations in production
2. **CloudWatch RUM Metrics**: Verify RUM telemetry is being collected
3. **Page Load Times**: Ensure no performance regression from inline script execution
4. **Security Alerts**: Monitor AWS WAF for any increase in blocked requests

## References

- **W3C CSP Specification**: https://www.w3.org/TR/CSP3/
- **MDN CSP Guide**: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- **AWS CloudWatch RUM Documentation**: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-RUM.html
- **CSP Evaluator Tool**: https://csp-evaluator.withgoogle.com/

## Related Documentation

- `_developers/RUM_TROUBLESHOOTING.md` - CloudWatch RUM troubleshooting guide
- `_developers/RUM_PLAN.md` - Original RUM implementation plan
- `REPOSITORY_DOCUMENTATION.md` - Complete architecture and deployment documentation

## Change Log

- **2025-12-17**: Initial fix implemented - added `'unsafe-inline'` to CSP script-src directive in EdgeStack.java and ApexStack.java
