# Stripe Integration for Business Bundle Subscriptions

This document describes the Stripe integration for subscription-based business bundle validation in the DIY Accounting Submit application.

## Overview

The application uses Stripe to validate subscriptions for the "business" bundle. When a user requests a business bundle, the system:

1. Validates that the user has an active Stripe subscription
2. Sets the bundle expiration date to the subscription's current period end date
3. Stores subscription metadata in DynamoDB for tracking
4. Runs nightly checks to update subscription statuses

## Architecture

### Components

1. **Stripe Helper Library** (`app/lib/stripeHelper.js`)
   - Manages Stripe API interactions
   - Validates subscription status
   - Creates/retrieves Stripe customers
   - Validates webhook signatures

2. **Bundle Request Handler** (`app/functions/account/bundlePost.js`)
   - Validates business bundle requests via Stripe
   - Falls back to test mode when Stripe is not configured
   - Stores subscription metadata in DynamoDB

3. **Subscription Check Lambda** (`app/functions/ops/checkSubscriptions.js`)
   - Scheduled to run nightly at 2 AM UTC
   - Updates subscription statuses from Stripe
   - Updates bundle expiration dates
   - Runs via EventBridge scheduled rule

4. **DynamoDB Bundle Store** (`app/lib/dynamoDbBundleStore.js`)
   - Stores subscription metadata alongside bundle information
   - Tracks: customer ID, subscription ID, subscription status, last check time

## Environment Configuration

### Required Environment Variables

All environments need these variables configured:

```bash
# Stripe Secret Key (stored in AWS Secrets Manager)
STRIPE_SECRET_KEY_ARN=arn:aws:secretsmanager:REGION:ACCOUNT:secret:ENV/submit/stripe/secret_key

# Stripe Publishable Key (for client-side usage)
STRIPE_PUBLISHABLE_KEY=pk_test_... # or pk_live_...

# Stripe Webhook Secret (for webhook signature validation)
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Business Price ID (the price/plan to check for)
STRIPE_BUSINESS_PRICE_ID=price_...
```

### Environment-Specific Configuration

#### CI Environment (.env.ci)
Uses test Stripe credentials:
```bash
STRIPE_SECRET_KEY_ARN=arn:aws:secretsmanager:eu-west-2:887764105431:secret:ci/submit/stripe/secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_test_placeholder
STRIPE_BUSINESS_PRICE_ID=price_test_placeholder
```

#### Production Environment (.env.prod)
Uses production Stripe credentials:
```bash
STRIPE_SECRET_KEY_ARN=arn:aws:secretsmanager:eu-west-2:887764105431:secret:prod/submit/stripe/secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_placeholder
STRIPE_WEBHOOK_SECRET=whsec_prod_placeholder
STRIPE_BUSINESS_PRICE_ID=price_prod_placeholder
```

#### Local/Proxy Environment (.env.proxy)
Can run without Stripe (test mode):
```bash
STRIPE_SECRET_KEY_ARN=
STRIPE_PUBLISHABLE_KEY=pk_test_local_placeholder
STRIPE_WEBHOOK_SECRET=whsec_test_local_placeholder
STRIPE_BUSINESS_PRICE_ID=price_test_local_placeholder
```

## Deployment

### AWS Secrets Manager Setup

Before deploying, create the Stripe secret key in AWS Secrets Manager:

```bash
# For CI environment
aws secretsmanager create-secret \
  --name ci/submit/stripe/secret_key \
  --secret-string "sk_test_..." \
  --region eu-west-2

# For Production environment
aws secretsmanager create-secret \
  --name prod/submit/stripe/secret_key \
  --secret-string "sk_live_..." \
  --region eu-west-2
```

### CDK Context Configuration

Add Stripe configuration to `cdk.json` or pass via environment variables:

```json
{
  "context": {
    "stripeSecretKeyArn": "arn:aws:secretsmanager:eu-west-2:ACCOUNT:secret:ENV/submit/stripe/secret_key",
    "stripePublishableKey": "pk_test_...",
    "stripeWebhookSecret": "whsec_...",
    "stripeBusinessPriceId": "price_..."
  }
}
```

### Infrastructure Components

The CDK deployment creates:

1. **AccountStack**: Adds Stripe environment variables to `bundlePostLambda`
2. **OpsStack**: Creates `checkSubscriptionsLambda` and EventBridge schedule
3. **Permissions**: Grants Secrets Manager read access to both Lambda functions

## Testing

### Unit Tests

Run unit tests for Stripe integration:
```bash
npm run test:unit
```

Key test files:
- `app/unit-tests/stripeHelper.test.js` - Stripe helper functions
- `app/unit-tests/checkSubscriptions.test.js` - Nightly subscription checks

### Behavior Tests

Test business bundle subscription flow end-to-end:
```bash
# Local testing (test mode, no Stripe validation)
npm run test:businessSubscriptionBehaviour

# CI testing (with test Stripe credentials)
npm run test:businessSubscriptionBehaviour-ci
```

The behavior test validates:
1. User can log in
2. User can request a business bundle
3. Bundle is granted (test mode without Stripe, or with valid subscription in CI)
4. Bundle appears in active bundles list

## Usage Flow

### User Requests Business Bundle

1. User navigates to the bundles page
2. User clicks "Request Business" button
3. System validates via Stripe:
   - If Stripe is not enabled: grants bundle with 1-month expiry (test mode)
   - If Stripe is enabled:
     - Gets/creates Stripe customer for user
     - Checks for active subscription with business price ID
     - If active: grants bundle with subscription period end date
     - If not active: returns error requiring subscription
4. System stores subscription metadata in DynamoDB
5. User sees bundle in active bundles list

### Nightly Subscription Checks

1. EventBridge triggers `checkSubscriptionsLambda` at 2 AM UTC
2. Lambda retrieves all bundles with subscription metadata from DynamoDB
3. For each bundle:
   - Queries Stripe for current subscription status
   - Updates subscription status in DynamoDB
   - Updates bundle expiration date if changed
4. Lambda logs results (checked count, updated count, errors)

## Data Model

### DynamoDB Bundle Item with Subscription

```javascript
{
  hashedSub: "sha256-hash-of-user-sub",
  bundleId: "business",
  bundleStr: "business|EXPIRY=2025-12-31",
  createdAt: "2025-11-15T17:00:00.000Z",
  
  // Subscription metadata
  stripeCustomerId: "cus_...",
  stripeSubscriptionId: "sub_...",
  subscriptionStatus: "active",
  lastSubscriptionCheck: "2025-11-15T17:00:00.000Z",
  
  // Expiry and TTL
  expiry: "2025-12-31",
  ttl: 1735689600  // Unix timestamp for automatic deletion
}
```

## Monitoring

### CloudWatch Logs

Monitor subscription checks in CloudWatch Logs:
- Log Group: `/aws/lambda/ENV-check-subscriptions`
- Key log messages:
  - "Starting nightly subscription status check"
  - "Found subscription bundles to check"
  - "Updated subscription status"
  - "Completed nightly subscription status check"

### CloudWatch Metrics

Monitor Lambda metrics in the OpsStack dashboard:
- Lambda invocations
- Lambda errors
- Lambda duration
- Lambda throttles

### Operational Dashboard

Access the operational dashboard:
```
https://REGION.console.aws.amazon.com/cloudwatch/home?region=REGION#dashboards:name=ENV-lambdas
```

## Troubleshooting

### Subscription Validation Fails

If subscription validation fails:

1. Check Stripe credentials in Secrets Manager
2. Verify business price ID matches actual Stripe price
3. Check CloudWatch Logs for error details
4. Verify user has active Stripe subscription

### Nightly Checks Not Running

If nightly checks aren't running:

1. Verify EventBridge rule is enabled in AWS Console
2. Check CloudWatch Logs for Lambda invocations
3. Verify Lambda has DynamoDB read/write permissions
4. Verify Lambda has Secrets Manager read permissions

### Test Mode Behavior

When Stripe is not configured (test mode):
- Business bundles are granted with 1-month expiry
- No subscription validation occurs
- Nightly checks are skipped
- Log message: "Stripe not enabled, allowing subscription bundle for testing"

## Security Considerations

1. **Secret Key Protection**: Stripe secret key is stored in AWS Secrets Manager, never in code
2. **IAM Permissions**: Lambda functions have least-privilege access to required services
3. **Webhook Security**: Webhook signatures should be validated (when webhooks are implemented)
4. **Customer Data**: Only minimal customer data (email, user ID) is stored in Stripe

## Future Enhancements

Potential improvements for the Stripe integration:

1. **Webhook Handler**: Add Lambda to handle Stripe webhooks for real-time updates
2. **Subscription Management**: UI for users to manage their subscriptions
3. **Payment Links**: Generate Stripe payment links for new subscriptions
4. **Usage-Based Billing**: Track API usage for metered billing
5. **Multiple Tiers**: Support different subscription tiers (basic, professional, enterprise)
6. **Grace Period**: Add grace period after subscription expires before removing access
7. **Cancellation Handling**: Handle subscription cancellations gracefully
8. **Dunning Management**: Handle failed payment retries
