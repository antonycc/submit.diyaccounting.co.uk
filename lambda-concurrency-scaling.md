# Lambda Provisioned Concurrency Scaling

This document describes the Lambda provisioned concurrency scaling system implemented for cost optimization and performance management.

## Overview

The system automatically scales Lambda function provisioned concurrency between "zero" (cost-saving) and "peak" (performance) levels based on deployment events and scheduled intervals.

## Components

### 1. Configuration File: `lambda-concurrency-config.json`

This JSON file defines the Lambda functions to manage and their concurrency levels:

```json
{
  "lambdas": [
    {
      "handler": "cognitoAuthUrlGet",
      "description": "Cognito authentication URL handler",
      "concurrency": {
        "zero": 0,
        "peak": 1
      }
    },
    ...
  ]
}
```

**Fields:**
- `handler`: The Lambda function handler name (used to construct the full function name)
- `description`: Human-readable description of the Lambda's purpose
- `concurrency.zero`: Provisioned concurrency for idle/cost-saving mode (typically 0)
- `concurrency.peak`: Provisioned concurrency for active/performance mode (>= 1)

**Function Naming Convention:**
Lambda function names are constructed as: `{deployment-name}-submit-{handler}`
- Example: `prod-ea373de-submit-cognitoAuthUrlGet`

**Excluded Functions:**
- Mock Lambda functions (not needed in production)
- Custom authorizer Lambda (excluded per requirements)
- Self-destruct Lambda (infrastructure management only)

### 2. Composite Action: `.github/actions/scale-lambda-concurrency/`

A reusable GitHub Actions composite action that:
1. Reads the configuration file
2. Iterates through each Lambda function
3. Sets or removes provisioned concurrency using AWS CLI
4. Polls for status to ensure deterministic completion
5. Provides detailed logging and summary statistics

**Inputs:**
- `deployment-name`: The deployment identifier (e.g., `prod-ea373de`)
- `concurrency-level`: Target level (`zero` or `peak`)
- `config-file`: Path to configuration JSON (default: `lambda-concurrency-config.json`)
- `aws-region`: AWS region (default: `eu-west-2`)

**Behavior:**
- When scaling to `zero`: Deletes provisioned concurrency configuration
- When scaling to `peak`: Sets provisioned concurrency to specified value
- Skips functions that are already at the target concurrency
- Skips functions that don't exist (e.g., in non-prod environments)
- Polls for up to 5 minutes to ensure functions reach "READY" status

### 3. Workflow: `.github/workflows/scale-to.yml`

A GitHub Actions workflow that manages Lambda concurrency scaling.

**Triggers:**

1. **Manual Dispatch** (`workflow_dispatch`):
   - Allows manual triggering with custom parameters
   - Useful for emergency scaling or testing

2. **Workflow Call** (`workflow_call`):
   - Called by `deploy.yml` during prod deployments
   - Scales to "peak" when new code is deployed

3. **Scheduled** (`schedule`):
   - Runs every 2 hours (at :22 past even hours: 00:22, 02:22, 04:22, etc.)
   - Automatically scales prod environment to "zero" to save costs
   - Only affects prod environment

**Concurrency Control:**
- Only one scaling job can run at a time per environment
- Uses concurrency group: `scale-lambda-concurrency-{environment}`
- Prevents race conditions and conflicting updates

### 4. Integration with `deploy.yml`

The main deployment workflow now includes a new job:

```yaml
scale-lambda-concurrency-to-peak:
  name: 'scale Lambda concurrency to peak'
  if: ${{ needs.names.outputs.environment-name == 'prod' }}
  needs:
    - names
    - skip-deploy-check
    - deploy-auth
    - deploy-hmrc
    - deploy-account
  uses: './.github/workflows/scale-to.yml'
  with:
    concurrency-level: 'peak'
```

**Behavior:**
- Only runs for prod deployments (`environment-name == 'prod'`)
- Runs in parallel with `deploy-api` (same dependencies)
- Does not block deployment pipeline (failure doesn't block other jobs)
- Scales functions to "peak" concurrency during deployment
- Runs asynchronously - no waiting required

## Usage

### Automatic Operation

The system operates automatically:
1. **During Production Deployment**: Scales to "peak" concurrency
2. **Every 2 Hours (Scheduled)**: Scales to "zero" concurrency in prod

### Manual Operation

You can manually trigger scaling via GitHub Actions UI:

1. Go to **Actions** tab in GitHub
2. Select **scale-to** workflow
3. Click **Run workflow**
4. Select:
   - Branch (typically `main` for prod)
   - Concurrency level (`zero` or `peak`)
   - Environment name (optional, defaults based on branch)
   - Deployment name (optional, auto-detected)
5. Click **Run workflow**

### Adding New Lambda Functions

To add a new Lambda function to the scaling system:

1. Edit `lambda-concurrency-config.json`
2. Add a new entry to the `lambdas` array:
   ```json
   {
     "handler": "newFunctionHandler",
     "description": "Description of the new function",
     "concurrency": {
       "zero": 0,
       "peak": 2
     }
   }
   ```
3. Commit and push the change
4. The next deployment or scheduled run will include the new function

### Adjusting Concurrency Levels

To change peak concurrency for existing functions:

1. Edit `lambda-concurrency-config.json`
2. Update the `concurrency.peak` value for the desired function
3. Commit and push the change
4. Manually run the workflow or wait for the next automatic run

## Architecture Decisions

### Why Provisioned Concurrency?

Provisioned concurrency keeps Lambda functions "warm" to eliminate cold starts:
- **Benefits**: Faster response times, better user experience
- **Cost**: Charges for provisioned capacity even when not in use
- **Strategy**: Use during deployments, scale down during idle periods

### Why These Concurrency Levels?

- **Zero (0)**: No provisioned concurrency
  - Cost: Only pay for actual invocations
  - Performance: Cold starts may occur
  - Use case: Idle periods, overnight, weekends

- **Peak (1-2)**: Minimal provisioned concurrency
  - Cost: Low fixed cost + invocation costs
  - Performance: First few requests have no cold starts
  - Use case: Active deployment periods, anticipated traffic

### Why Every 2 Hours?

- Balances cost savings with responsiveness
- Prod deployments happen occasionally, not continuously
- Most traffic occurs during business hours
- After-hours traffic accepts slight latency from cold starts

### Why Only Prod?

- Non-prod environments (ci) are short-lived (8-hour self-destruct)
- Dev/test environments have lower traffic requirements
- Cost optimization focus is on long-running prod infrastructure

## Monitoring

### GitHub Actions

View workflow runs:
- **Actions** → **scale-to** workflow
- Check job logs for:
  - Functions processed
  - Success/failure counts
  - Detailed per-function status

### AWS Console

View Lambda provisioned concurrency:
1. Navigate to **Lambda** → Select function
2. Go to **Configuration** → **Concurrency**
3. Check **Provisioned concurrency** section

View CloudWatch Logs:
- Lambda function logs show cold start indicators
- CloudWatch metrics show `ProvisionedConcurrentExecutions`

## Troubleshooting

### Function Not Found

**Symptom**: "Function not found, skipping" in logs

**Cause**: Function doesn't exist in the target environment

**Solution**: 
- Verify deployment name is correct
- Check if function exists in AWS Console
- Ensure function has been deployed

### Timeout Waiting for Ready Status

**Symptom**: "Timeout waiting for Lambda functions to be ready"

**Cause**: Functions taking longer than 5 minutes to provision

**Solution**:
- Check AWS Console for provisioning status
- May indicate AWS service issues
- Functions will eventually reach ready state; workflow timeout is precautionary

### Permission Denied

**Symptom**: AWS API errors about permissions

**Cause**: IAM role lacks necessary permissions

**Solution**: Ensure deployment role has these permissions:
- `lambda:GetFunction`
- `lambda:GetProvisionedConcurrencyConfig`
- `lambda:PutProvisionedConcurrencyConfig`
- `lambda:DeleteProvisionedConcurrencyConfig`

### Concurrent Execution Limit

**Symptom**: Error about account concurrency limits

**Cause**: AWS account has per-region concurrent execution limits

**Solution**:
- Review total provisioned concurrency across all functions
- Request limit increase from AWS Support if needed
- Adjust peak concurrency values in config

## Cost Impact

### Estimated Costs (as of 2024)

**Provisioned Concurrency Pricing** (eu-west-2):
- ~$0.0000041667 per GB-second
- For a 128 MB function: ~$0.000000520 per second
- For 1 function at 128 MB: ~$1.35 per month (continuous)

**Cost Optimization Strategy**:
- **Without scaling**: 13 functions × $1.35 = $17.55/month
- **With 2-hour cycles**: ~75% idle time = $4.39/month savings
- **Effective cost**: ~$13/month for provisioned concurrency

**Additional Benefits**:
- Reduced cold start latency improves user experience
- Better performance during deployment windows
- Negligible invocation cost difference (cold vs. warm)

## Future Enhancements

Potential improvements for consideration:

1. **Dynamic Scaling**: Scale based on actual traffic patterns or CloudWatch metrics
2. **Environment-Specific Configs**: Different concurrency levels per environment
3. **Time-Based Schedules**: Different schedules for weekdays vs. weekends
4. **Gradual Scaling**: Ramp up/down concurrency gradually
5. **Cost Reporting**: Track and report provisioned concurrency costs
6. **Alert Integration**: Notify on scaling failures or anomalies

## References

- [AWS Lambda Provisioned Concurrency](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html)
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [AWS CLI Lambda Commands](https://docs.aws.amazon.com/cli/latest/reference/lambda/)
