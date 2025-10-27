# Actions Scripts

This directory contains utility scripts for managing the deployed infrastructure.

## set-apex-origins.mjs

Updates the CloudFront distribution to ensure the API Gateway origin is properly configured for the `/api/v1/*` behavior.

### Purpose

This script fixes HTTP 502 errors that occur when accessing API endpoints through CloudFront (e.g., `https://ci.submit.diyaccounting.co.uk/api/v1/catalog`). The error happens when the API Gateway URL is not properly configured as an origin in the CloudFront distribution.

### Usage

```bash
# Set the environment and deployment names (defaults to 'ci')
export ENVIRONMENT_NAME=ci
export DEPLOYMENT_NAME=ci

# Ensure AWS credentials are configured
export AWS_REGION=eu-west-2

# Run the script
npm run set-apex-origins
```

### What it does

1. Queries CloudFormation to get the API Gateway URL from the ApiStack outputs
2. Queries CloudFormation to get the CloudFront distribution ID from the EdgeStack outputs
3. Updates the CloudFront distribution configuration to:
   - Add or update the API Gateway origin
   - Configure the `/api/v1/*` cache behavior to use the API Gateway origin

### When to use

- After deploying the infrastructure for the first time
- When the API Gateway URL changes
- When you see HTTP 502 errors accessing `/api/v1/*` endpoints
- As part of the deployment process to ensure proper configuration

### Example output

```
============================================================
CloudFront Origin Configuration Tool
============================================================
Environment: ci
Deployment: ci
Region: eu-west-2

Fetching outputs from app-ci-ApiStack...
✓ Found HTTP API URL: https://abc123def.execute-api.eu-west-2.amazonaws.com/

Fetching outputs from del-ci-EdgeStack...
✓ Found Distribution ID: E1ABCDEFGHIJK

Updating CloudFront distribution E1ABCDEFGHIJK...
API Gateway host: abc123def.execute-api.eu-west-2.amazonaws.com
Adding new origin: api-gateway-origin
Adding new cache behavior for /api/v1/*
✓ Successfully updated distribution E1ABCDEFGHIJK
  - Origin: abc123def.execute-api.eu-west-2.amazonaws.com
  - Behavior: /api/v1/* -> api-gateway-origin

============================================================
✓ Configuration complete!
============================================================

Note: CloudFront changes may take several minutes to propagate.
Test the API at: https://ci.submit.diyaccounting.co.uk/api/v1/catalog
```

### Prerequisites

- AWS credentials configured with permissions to:
  - Read CloudFormation stack outputs
  - Get and update CloudFront distribution configurations
- Node.js 20+ installed
- `@aws-sdk/client-cloudformation` and `@aws-sdk/client-cloudfront` packages installed

### Troubleshooting

**Error: Stack not found**

Make sure the stack names match your deployment. The script looks for:

- `app-{DEPLOYMENT_NAME}-ApiStack` (in the primary region)
- `del-{DEPLOYMENT_NAME}-EdgeStack` (in us-east-1)

**Error: HttpApiUrl not found**

The ApiStack hasn't been deployed or doesn't export the `HttpApiUrl` output.

**Error: DistributionId not found**

The EdgeStack hasn't been deployed or doesn't export the `DistributionId` output.

**CloudFront changes not taking effect**

CloudFront distributions can take 5-15 minutes to propagate changes. Wait a few minutes and try again.
