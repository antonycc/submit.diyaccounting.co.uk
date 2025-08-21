# Runtime Configuration Management

This document explains how to use the runtime configuration system to switch between mock and real services without redeploying the application.

## Overview

The DIY Submit application supports runtime configuration switches that allow you to toggle between mock and real services (AWS Cognito, OAuth providers) without requiring a full redeployment. This is particularly useful for:

- Running behavior tests against deployed environments
- Switching between development and production modes
- Troubleshooting issues by isolating external dependencies

## Configuration Parameters

The system uses AWS Systems Manager Parameter Store to manage runtime configuration:

| Parameter | Description | Values |
|-----------|-------------|---------|
| `/diy-submit/bundle-mock` | Controls bundle management mode | `true` (mock), `false` (real AWS Cognito) |
| `/diy-submit/auth-mock` | Controls authentication mode | `true` (mock OAuth2), `false` (real providers) |

## How It Works

1. **Parameter Store**: Configuration is stored in AWS Systems Manager Parameter Store
2. **Caching**: Lambda functions cache parameter values for 30 seconds to reduce API calls
3. **Fallback**: If parameter store is unavailable, functions fall back to environment variables
4. **Immediate Effect**: Changes take effect on the next Lambda invocation (within ~30 seconds)

## Usage

### Using the Management Script

The provided script makes it easy to manage runtime configuration:

```bash
# Show current configuration
./scripts/manage-runtime-config.sh status

# Enable bundle mock mode (use in-memory storage instead of Cognito)
./scripts/manage-runtime-config.sh enable-bundle-mock

# Enable auth mock mode (redirect to mock OAuth2 server)
./scripts/manage-runtime-config.sh enable-auth-mock

# Enable all mock modes (useful for testing)
./scripts/manage-runtime-config.sh enable-all-mock

# Disable all mock modes (production setup)
./scripts/manage-runtime-config.sh disable-all-mock

# Use different AWS region
./scripts/manage-runtime-config.sh status --region us-east-1
```

### Using AWS CLI Directly

You can also manage parameters directly with the AWS CLI:

```bash
# Set bundle mock mode
aws ssm put-parameter --name "/diy-submit/bundle-mock" --value "true" --type String --overwrite

# Set auth mock mode  
aws ssm put-parameter --name "/diy-submit/auth-mock" --value "false" --type String --overwrite

# Check current values
aws ssm get-parameter --name "/diy-submit/bundle-mock" --query 'Parameter.Value' --output text
aws ssm get-parameter --name "/diy-submit/auth-mock" --query 'Parameter.Value' --output text
```

## Environment-Specific Usage

### Local Development (proxy environment)
```bash
# Enable all mocks for local testing
./scripts/manage-runtime-config.sh enable-all-mock
```

### CI Environment
```bash
# Enable mocks for behavior tests
./scripts/manage-runtime-config.sh enable-all-mock
```

### Production Environment
```bash
# Disable all mocks for real usage
./scripts/manage-runtime-config.sh disable-all-mock
```

## Behavior Changes

### Bundle Mock Mode (`/diy-submit/bundle-mock = true`)

**When Enabled:**
- Bundle requests use in-memory storage (Map)
- No AWS Cognito calls are made
- User bundles are stored temporarily per Lambda instance
- Suitable for testing and development

**When Disabled:**
- Bundle requests use AWS Cognito User Pool
- User bundles are persisted in Cognito user attributes
- Full production functionality

### Auth Mock Mode (`/diy-submit/auth-mock = true`)

**When Enabled:**
- Auth URLs redirect to mock OAuth2 server (localhost:8080)
- Suitable for local development and testing
- No real OAuth provider calls

**When Disabled:**
- Auth URLs use real providers (HMRC, Google via Cognito)
- Full production authentication flow

## Timing and Caching

- **Cache TTL**: 30 seconds
- **Effect Time**: Changes take effect on next Lambda invocation
- **Predictability**: All Lambda functions will pick up changes within 30 seconds of the cache expiring

To force immediate effect, you can clear the cache by restarting Lambda functions:
```bash
# Update environment variable to force function restart (if needed)
aws lambda update-function-configuration --function-name your-function-name --environment Variables='{...}'
```

## Troubleshooting

### Parameters Not Found
If you see "NOT_FOUND" for parameters:
1. Ensure the CDK stack has been deployed
2. Check you're using the correct AWS region
3. Verify your AWS credentials have SSM permissions

### Changes Not Taking Effect
1. Wait up to 30 seconds for cache to expire
2. Check Lambda function logs for parameter fetch errors
3. Verify parameter values are set correctly

### Permission Errors
Ensure your AWS credentials have the following permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:PutParameter"
      ],
      "Resource": [
        "arn:aws:ssm:*:*:parameter/diy-submit/*"
      ]
    }
  ]
}
```

## Implementation Details

### Parameter Store Helper
The `app/lib/parameterStore.js` module provides:
- Lazy AWS SDK loading
- Automatic caching with TTL
- Graceful fallback to environment variables
- Boolean parameter conversion

### Lambda Integration
Lambda functions check parameters at runtime:
- Bundle functions: Check `/diy-submit/bundle-mock`
- Auth functions: Check `/diy-submit/auth-mock`
- Results are cached for performance

### CDK Infrastructure
The CDK automatically creates parameter store parameters with default values during deployment.