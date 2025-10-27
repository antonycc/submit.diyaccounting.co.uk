# Fix for HTTP 502 Error on /api/v1/catalog

## Problem

When accessing `https://ci.submit.diyaccounting.co.uk/api/v1/catalog`, CloudFront returns an HTTP 502 error:

```
CloudFront wasn't able to resolve the origin domain name.
```

## Root Cause

The CloudFront distribution has a behavior configured for `/api/v1/*` paths that should forward requests to the API Gateway. However, if the API Gateway origin is missing or misconfigured in the CloudFront distribution, CloudFront cannot resolve the origin domain name and returns a 502 error.

This typically happens when:
1. The EdgeStack is deployed before the ApiStack (missing HTTP_API_URL)
2. The HTTP_API_URL environment variable is not set during EdgeStack deployment
3. The deployment gets out of sync
4. Manual changes are made that break the configuration

## Solution

### Automated Fix (Deployment Workflow)

The deployment workflow has been updated to automatically configure the CloudFront origin after deploying the EdgeStack. This happens in the `deploy-edge` job, after the edge outputs are resolved:

```yaml
- name: Update CloudFront API Gateway origin configuration
  if: ${{ needs.names.outputs.environment-name == 'prod' || env.FORCE_ALL_STACK_DEPLOYMENT == 'true' || steps.static-skip.outputs.skipStaticStackDeployment != 'true' }}
  run: npm run set-apex-origins
  env:
    ENVIRONMENT_NAME: ${{ needs.names.outputs.environment-name }}
    DEPLOYMENT_NAME: ${{ needs.names.outputs.deployment-name }}
    AWS_REGION: ${{ env.AWS_REGION }}
```

### Manual Fix

If you need to fix the issue manually without redeploying:

1. Ensure AWS credentials are configured with appropriate permissions
2. Set the environment variables:
   ```bash
   export ENVIRONMENT_NAME=ci
   export DEPLOYMENT_NAME=ci
   export AWS_REGION=eu-west-2
   ```
3. Run the fix script:
   ```bash
   npm run set-apex-origins
   ```

The script will:
1. Query CloudFormation for the API Gateway URL from `app-ci-ApiStack`
2. Query CloudFormation for the CloudFront distribution ID from `del-ci-EdgeStack`
3. Update the CloudFront distribution to add/update the API Gateway origin
4. Configure the `/api/v1/*` behavior to use the API Gateway origin

### Verification

After running the fix, wait 5-15 minutes for CloudFront changes to propagate, then test:

```bash
curl -I https://ci.submit.diyaccounting.co.uk/api/v1/catalog
```

You should see a 200 OK response instead of 502.

## Technical Details

### CloudFront Configuration

The script configures:

1. **Origin**: 
   - ID: `api-gateway-origin`
   - Domain: Extracted from the API Gateway URL (e.g., `abc123.execute-api.eu-west-2.amazonaws.com`)
   - Protocol: HTTPS only
   - SSL: TLSv1.2

2. **Cache Behavior**:
   - Path pattern: `/api/v1/*`
   - Target origin: `api-gateway-origin`
   - Allowed methods: All HTTP methods
   - Cache policy: CachingDisabled
   - Origin request policy: AllViewerExceptHostHeader
   - Response headers policy: CORS-With-Preflight-And-SecurityHeadersPolicy

### Stack Dependencies

The fix depends on these CloudFormation stacks being deployed:
- `app-{DEPLOYMENT_NAME}-ApiStack` (primary region, e.g., eu-west-2)
- `del-{DEPLOYMENT_NAME}-EdgeStack` (us-east-1)

### AWS Permissions Required

- `cloudformation:DescribeStacks` on both stacks
- `cloudfront:GetDistributionConfig` on the distribution
- `cloudfront:UpdateDistribution` on the distribution

## Files Modified

- `.github/workflows/deploy.yml` - Added automatic origin configuration step
- `app/actions/set-apex-origins.mjs` - Script to update CloudFront configuration
- `app/actions/README.md` - Documentation for the actions scripts

## Testing

The solution has been tested with:
- ✅ Unit tests pass (app/unit-tests)
- ✅ Linting passes (eslint)
- ✅ Code formatting correct (prettier)
- ⏸️ Manual testing pending (requires AWS access to deployed infrastructure)

## Next Steps

1. Merge this PR
2. Deploy to CI environment
3. Manually verify the fix resolves the 502 error
4. Consider running the script as a post-deployment step for all environments
