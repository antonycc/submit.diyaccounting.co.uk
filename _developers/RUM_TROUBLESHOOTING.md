# Amazon CloudWatch RUM Troubleshooting Guide

**Created**: 2024-12-13
**Purpose**: Help developers and operators diagnose and resolve RUM implementation issues

---

## Common Issues

### 1. RUM Client Not Loaded

**Symptoms**:
- `window.cwr` is undefined in browser console
- No requests to `client.rum.*.amazonaws.com` in Network tab
- No RUM telemetry appearing in CloudWatch

**Diagnosis**:
```javascript
// In browser console
window.__RUM_CONFIG__
// If undefined, config not populated

typeof window.cwr
// If "undefined", client not loaded

localStorage.getItem('consent.rum')
// Check consent status
```

**Possible Causes**:
1. Meta tags have placeholders (not replaced during deployment)
2. `bootstrapRumConfigFromMeta()` not called on page load
3. User declined consent or hasn't been prompted yet
4. JavaScript errors preventing submit.js from executing

**Solutions**:
- Check deployed HTML for real RUM config values (not `${...}` placeholders)
- Verify `bootstrapRumConfigFromMeta()` is called in submit.js initialization
- Clear localStorage and reload page to see consent banner: `localStorage.clear()`
- Check browser console for JavaScript errors

---

### 2. Placeholders Not Replaced in Deployed HTML

**Symptoms**:
- HTML contains `${RUM_APP_MONITOR_ID}` in production
- Browser console shows empty meta tag content
- `window.__RUM_CONFIG__` has empty strings for config values

**Diagnosis**:
```bash
# Check deployed HTML
curl -s https://ci.submit.diyaccounting.co.uk/index.html | grep "RUM_APP_MONITOR_ID"
# Should NOT find placeholder in deployed version

# Check CloudFormation outputs
aws cloudformation describe-stacks \
  --stack-name ci-env-ObservabilityStack \
  --region eu-west-2 \
  --query 'Stacks[0].Outputs'
```

**Possible Causes**:
1. Deployment workflow failed at placeholder injection step
2. Workflow queried wrong CloudFormation stack
3. ObservabilityStack not deployed in target environment
4. sed/envsubst command in deployment script has errors

**Solutions**:
- Check GitHub Actions logs for `deploy-publish` job
- Verify ObservabilityStack is deployed: `aws cloudformation list-stacks --region eu-west-2 | grep ObservabilityStack`
- Manually test placeholder replacement locally before deploying
- Review deployment script for correct stack name and region

---

### 3. No Data Appearing in CloudWatch

**Symptoms**:
- RUM client loaded (`window.cwr` exists) but no metrics in CloudWatch dashboard
- Dashboard shows "No data available"
- No dataplane requests in browser Network tab

**Diagnosis**:
```bash
# Check if RUM app monitor exists
aws rum get-app-monitor --name ci-rum --region eu-west-2

# List RUM metrics
aws cloudwatch list-metrics --namespace AWS/RUM --region eu-west-2

# Check IAM role permissions
aws iam get-role-policy \
  --role-name $(aws iam list-roles | jq -r '.Roles[] | select(.RoleName | contains("RumGuestRole")) | .RoleName' | head -1) \
  --policy-name RumGuestRolePolicy
```

**Possible Causes**:
1. IAM Guest Role lacks `rum:PutRumEvents` permission
2. Domain not in RUM App Monitor allow list
3. Network requests blocked by CORS or firewall
4. Identity pool configuration incorrect
5. Session sample rate set to 0 (no sessions sampled)

**Solutions**:
- Verify IAM role has correct permissions (see ObservabilityStack code)
- Check RUM App Monitor domain configuration allows your site's domain
- Check browser Network tab for failed requests to `dataplane.rum.*.amazonaws.com`
- Verify CORS headers allow RUM dataplane requests
- Check session sample rate in RUM config (should be > 0)

---

### 4. Consent Banner Not Appearing

**Symptoms**:
- No consent banner on first visit to site
- RUM not initializing even though user hasn't declined
- Banner appears but clicking Accept doesn't initialize RUM

**Diagnosis**:
```javascript
// Check if banner was already shown and dismissed
localStorage.getItem('consent.rum')
// Should be null on first visit

// Check if banner exists in DOM
document.getElementById('consent-banner')
// Should exist if no consent recorded

// Check if consent check is working
function hasConsent() {
  return localStorage.getItem('consent.rum') === 'granted' ||
         localStorage.getItem('consent.analytics') === 'granted';
}
hasConsent()
// Should return false on first visit
```

**Possible Causes**:
1. `showConsentBannerIfNeeded()` not called
2. `hasRumConsent()` incorrectly returns true
3. CSS hiding the banner
4. JavaScript error preventing banner creation

**Solutions**:
- Verify `maybeInitRum()` is called in submit.js initialization section
- Clear localStorage: `localStorage.clear()` and reload page
- Check browser console for JavaScript errors
- Inspect DOM to see if banner element exists but is hidden by CSS

---

### 5. RUM Works Locally But Not in Deployed Environment

**Symptoms**:
- RUM initializes correctly when testing locally
- Production deployment doesn't initialize RUM
- Different behavior between environments

**Diagnosis**:
```bash
# Compare local and deployed HTML
diff <(curl -s http://localhost:3000/index.html | grep -A4 "rum:") \
     <(curl -s https://ci.submit.diyaccounting.co.uk/index.html | grep -A4 "rum:")

# Check environment-specific configurations
echo "Local: $RUM_APP_MONITOR_ID"
curl -s https://ci.submit.diyaccounting.co.uk/index.html | grep "rum:appMonitorId"
```

**Possible Causes**:
1. ObservabilityStack not deployed in production
2. Different placeholder replacement logic between environments
3. Content Security Policy (CSP) blocking RUM scripts in production
4. Firewall/WAF blocking RUM dataplane requests

**Solutions**:
- Verify ObservabilityStack exists in production account
- Check deployment logs for environment-specific issues
- Review CloudFront/WAF rules that might block RUM requests
- Check browser console for CSP violations

---

## Verification Checklist

Use this checklist to verify RUM is working correctly:

- [ ] **Infrastructure**: ObservabilityStack deployed in target environment
- [ ] **CloudFormation**: Stack outputs contain RUM config values
- [ ] **HTML Source**: Local source files contain `${...}` placeholders
- [ ] **HTML Deployed**: Deployed HTML has real values (not placeholders)
- [ ] **Browser - Config**: `window.__RUM_CONFIG__` populated with real values
- [ ] **Browser - Consent**: Consent banner appears on first visit
- [ ] **Browser - Client**: `window.cwr` function exists after consent granted
- [ ] **Network - Client**: Request to `client.rum.*.amazonaws.com/1.16.0/cwr.js`
- [ ] **Network - Data**: Requests to `dataplane.rum.*.amazonaws.com`
- [ ] **CloudWatch**: Metrics appear in dashboard (allow 5-10 minutes)
- [ ] **CloudWatch**: No error logs in Lambda/CloudWatch Logs related to RUM

---

## Useful Commands

### Query RUM App Monitor
```bash
# Get app monitor details
aws rum get-app-monitor --name ci-rum --region eu-west-2

# List all app monitors
aws rum list-app-monitors --region eu-west-2
```

### Query CloudWatch Metrics
```bash
# List all RUM metrics
aws cloudwatch list-metrics --namespace AWS/RUM --region eu-west-2

# Query LCP (Largest Contentful Paint) metric
aws cloudwatch get-metric-statistics \
  --namespace AWS/RUM \
  --metric-name WebVitalsLargestContentfulPaint \
  --dimensions Name=application_name,Value=ci-rum \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region eu-west-2

# Query JavaScript error count
aws cloudwatch get-metric-statistics \
  --namespace AWS/RUM \
  --metric-name JsErrorCount \
  --dimensions Name=application_name,Value=ci-rum \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region eu-west-2
```

### Check IAM Permissions
```bash
# Find RUM guest role
aws iam list-roles \
  | jq -r '.Roles[] | select(.RoleName | contains("RumGuestRole")) | .RoleName'

# Get role policy (replace ROLE_NAME)
aws iam get-role-policy \
  --role-name ROLE_NAME \
  --policy-name RumGuestRolePolicy

# Verify trust policy allows Cognito identity pool
aws iam get-role \
  --role-name ROLE_NAME \
  --query 'Role.AssumeRolePolicyDocument'
```

### Check CloudFormation Stack
```bash
# Get stack outputs
aws cloudformation describe-stacks \
  --stack-name ci-env-ObservabilityStack \
  --region eu-west-2 \
  --query 'Stacks[0].Outputs'

# Get stack resources
aws cloudformation describe-stack-resources \
  --stack-name ci-env-ObservabilityStack \
  --region eu-west-2
```

### Test Deployed HTML
```bash
# Fetch and check for placeholders
curl -s https://ci.submit.diyaccounting.co.uk/index.html \
  | grep -o 'rum:[^"]*"[^"]*"' \
  | head -5

# Should show real values like:
# rum:appMonitorId" content="abc123-def456..."
# rum:region" content="eu-west-2"
```

---

## Testing RUM Locally

RUM will not fully work in local development because:
- ObservabilityStack is not deployed locally
- Placeholders are not replaced (HTML contains literal `${...}` values)
- No AWS credentials for RUM client

**Workaround for local testing**:
1. Test consent banner logic (appears/disappears correctly)
2. Test `window.__RUM_CONFIG__` population from meta tags
3. Mock `window.cwr` function for integration tests
4. Use unit tests for RUM functions (see `web/unit-tests/rum-*.test.js`)

---

## Emergency Rollback

If RUM causes critical issues in production:

### Option 1: Disable RUM Initialization (Quickest)
Comment out the RUM initialization code in `web/public/submit.js`:
```javascript
// Wire up on load
if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensurePrivacyLink();
      // Temporarily disabled: bootstrapRumConfigFromMeta();
      // Temporarily disabled: showConsentBannerIfNeeded();
      // Temporarily disabled: maybeInitRum();
      setRumUserIdIfAvailable();
    });
  } else {
    // ... similar for immediate execution
  }
}
```
Redeploy the application. RUM will not initialize but code remains in place for future re-enablement.

### Option 2: Remove RUM Meta Tags
Remove or comment out meta tags in HTML files:
```html
<!-- Temporarily disabled RUM
<meta name="rum:appMonitorId" content="${RUM_APP_MONITOR_ID}" />
<meta name="rum:region" content="${AWS_REGION}" />
<meta name="rum:identityPoolId" content="${RUM_IDENTITY_POOL_ID}" />
<meta name="rum:guestRoleArn" content="${RUM_GUEST_ROLE_ARN}" />
-->
```
Redeploy static files. `window.__RUM_CONFIG__` will be undefined and RUM won't initialize.

### Option 3: Delete ObservabilityStack (Last Resort)
```bash
aws cloudformation delete-stack \
  --stack-name ci-env-ObservabilityStack \
  --region eu-west-2
```
**Warning**: This will also delete CloudWatch dashboard and alarms. Only use if RUM is causing severe issues.

---

## Performance Considerations

### Session Sample Rate
- Default: 100% (`sessionSampleRate: 1`)
- Recommended for production: 10-50% to reduce costs
- Configure in ObservabilityStack or as environment variable

### Data Volume Estimates
- Typical session: 10-50 events (page loads, interactions, errors)
- 10,000 sessions/month at 100% sampling ≈ 500,000 events
- AWS RUM pricing: ~$1 per 100,000 events (check current pricing)

### Cost Optimization
1. Lower session sample rate in production
2. Disable RUM for development/staging environments
3. Set shorter data retention (30 days minimum)
4. Filter out bot/crawler traffic if possible

---

## Support Resources

- **AWS RUM Documentation**: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-RUM.html
- **Web Vitals Guide**: https://web.dev/vitals/
- **Repository Documentation**: See `REPOSITORY_DOCUMENTATION.md` for architecture
- **Implementation Plan**: See `_developers/RUM_PLAN.md` for original plan

---

## Reporting Issues

When reporting RUM issues, include:
1. **Environment**: ci, prod, or local
2. **Browser**: Type, version, and OS
3. **Symptoms**: Specific error messages or missing functionality
4. **Browser Console**: JavaScript errors (if any)
5. **Network Tab**: Failed requests to RUM endpoints (if any)
6. **CloudWatch**: Dashboard screenshots or metric queries
7. **Deployment Logs**: GitHub Actions run ID or CloudFormation stack events

Example issue report:
```
Environment: ci (https://ci.submit.diyaccounting.co.uk)
Browser: Chrome 120 on macOS 14
Symptom: RUM client not loading, window.cwr undefined
Console Error: None
Network: No requests to client.rum.us-east-1.amazonaws.com
window.__RUM_CONFIG__: {"appMonitorId":"","region":"eu-west-2",...}
Diagnosis: appMonitorId is empty string - placeholder not replaced
```

---

## Change Log

- **2024-12-13**: Initial version created as part of RUM implementation plan
