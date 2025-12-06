# Deployment Modes

This repository supports two deployment modes to AWS:

1. **Serverless Mode (Default)** - Lambda functions + API Gateway + Cognito
2. **Monolith Mode (New)** - Single container on AWS App Runner with scale-to-zero

## Overview

### Serverless Mode
- **Compute**: AWS Lambda (Node.js 22)
- **API Routing**: API Gateway v2
- **Authentication**: AWS Cognito + Google OAuth
- **Database**: DynamoDB (managed)
- **Static Assets**: S3 + CloudFront
- **Cost**: Pay per request, no idle costs
- **Cold Start**: ~100-300ms
- **Scaling**: Automatic, concurrent execution

### Monolith Mode
- **Compute**: AWS App Runner (containerized Node.js)
- **API Routing**: Express.js in container
- **Authentication**: Passport.js + Google OAuth (no Cognito)
- **Database**: DynamoDB Local (in-container) + DynamoDB (for backups)
- **Static Assets**: S3 + CloudFront (same as serverless)
- **Cost**: Scales to zero when idle, pay per vCPU/memory
- **Cold Start**: ~5-10 seconds (container startup + DynamoDB Local)
- **Scaling**: Automatic, but container-based

## When to Use Each Mode

### Use Serverless Mode When:
- You need the lowest cold start times
- You have highly variable traffic
- You want AWS to manage all infrastructure
- You need Cognito integration
- Cost optimization for sporadic usage is critical

### Use Monolith Mode When:
- You want scale-to-zero with a single container
- You prefer traditional application architecture
- You want to minimize AWS service dependencies
- You need local state (DynamoDB Local)
- You want simpler deployment (one container vs many Lambdas)

## Architecture Comparison

### Serverless Architecture
```
CloudFront → API Gateway → Lambda Functions → DynamoDB
                 ↓
              Cognito ← Google OAuth
```

### Monolith Architecture
```
CloudFront → App Runner Container → DynamoDB Local (primary)
                 ↓                       ↓
         Passport.js                DynamoDB (backup)
                 ↓
         Google OAuth
```

## Deployment Instructions

### Prerequisites

Both modes require:
- AWS CLI configured with appropriate credentials
- Java 17+ (for CDK synthesis)
- Node.js 20+ (22+ preferred)
- Docker (for building container image)

### Deploying Serverless Mode

This is the existing deployment process:

```bash
# Set environment variables
export ENVIRONMENT_NAME=prod
export DEPLOYMENT_NAME=prod
export BASE_IMAGE_TAG=v1.0.0

# Build Java CDK
./mvnw clean package -Dmaven.compiler.source=17 -Dmaven.compiler.target=17

# Synthesize CDK stacks
cd cdk-application
npx cdk synth

# Deploy
npx cdk deploy --all
```

### Deploying Monolith Mode

1. **Build the Container Image**:
```bash
# Build with monolith mode
docker build --build-arg APP_MODE=monolith -t submit-monolith:latest .

# Tag for ECR
docker tag submit-monolith:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:monolith-latest

# Push to ECR
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:monolith-latest
```

2. **Configure Environment Variables**:

Required environment variables in `.env.prod` or CI/CD:
```bash
ENVIRONMENT_NAME=prod
DEPLOYMENT_NAME=prod
BASE_IMAGE_TAG=monolith-latest

# Google OAuth (instead of Cognito)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET_PARAM=/prod/submit/google/client_secret

# HMRC API
HMRC_CLIENT_ID=your-hmrc-client-id
HMRC_CLIENT_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name
HMRC_SANDBOX_CLIENT_ID=your-hmrc-sandbox-client-id
HMRC_SANDBOX_CLIENT_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name

# DynamoDB Tables (from environment stacks)
BUNDLE_DYNAMODB_TABLE_NAME=${ENVIRONMENT_NAME}-bundles
RECEIPTS_DYNAMODB_TABLE_NAME=${ENVIRONMENT_NAME}-receipts
HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME=${ENVIRONMENT_NAME}-hmrc-api-requests
```

3. **Store Secrets in Parameter Store**:
```bash
# Google OAuth client secret
aws ssm put-parameter \
  --name "/prod/submit/google/client_secret" \
  --value "YOUR_GOOGLE_CLIENT_SECRET" \
  --type "SecureString" \
  --overwrite

# Cookie secret for sessions
aws ssm put-parameter \
  --name "/prod/submit/cookie_secret" \
  --value "$(openssl rand -base64 32)" \
  --type "SecureString" \
  --overwrite
```

4. **Deploy Container Stack**:
```bash
# Build Java CDK with container entry point
./mvnw clean package -Dmaven.compiler.source=17 -Dmaven.compiler.target=17

# Synthesize container stack
cd cdk-container
npx dotenv -e ../.env.prod -- npx cdk synth

# Deploy
npx dotenv -e ../.env.prod -- npx cdk deploy --all
```

## Environment Configuration

### Monolith-Specific Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_MODE` | Container runtime mode | `monolith` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | From Google Console |
| `GOOGLE_CLIENT_SECRET_PARAM` | Parameter Store name for secret | `/prod/submit/google/client_secret` |
| `COOKIE_SECRET_PARAM` | Parameter Store name for cookie secret | `/prod/submit/cookie_secret` |
| `DYNAMODB_LOCAL_PORT` | Port for DynamoDB Local | `8000` |
| `DYNAMODB_LOCAL_DATA_PATH` | Path for persistent data | `/data/dynamodb` |
| `PORT` | Express server port | `3000` |

### Shared Environment Variables

Both modes use these variables:
- `ENVIRONMENT_NAME` - Environment name (ci, prod)
- `DEPLOYMENT_NAME` - Deployment name (usually same as environment)
- `HMRC_CLIENT_ID` - HMRC OAuth client ID
- `HMRC_CLIENT_SECRET_ARN` - ARN for HMRC client secret
- `HMRC_BASE_URI` - HMRC API base URL
- `BUNDLE_DYNAMODB_TABLE_NAME` - Bundles table name
- `RECEIPTS_DYNAMODB_TABLE_NAME` - Receipts table name
- `HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME` - API requests table name

## Data Persistence

### Serverless Mode
- All data stored in AWS DynamoDB (fully managed)
- Automatic backups via AWS Backup
- Point-in-time recovery available

### Monolith Mode
- Primary: DynamoDB Local (in-container, ephemeral)
- Secondary: AWS DynamoDB (for backup/sync)
- Data path: `/data/dynamodb` (can be mounted volume)

**Note**: For production monolith deployments, consider:
1. Using EFS for persistent `/data/dynamodb` storage
2. Periodic exports to S3
3. Sync to AWS DynamoDB for disaster recovery

## Security Considerations

### Serverless Mode
- IAM roles for Lambda functions
- Cognito for user management
- API Gateway authorization
- WAF rules at CloudFront

### Monolith Mode
- IAM role for App Runner instance
- Passport.js session management
- Express middleware for authorization
- WAF rules at CloudFront
- **Note**: Add rate limiting middleware for production

**Production Security Checklist for Monolith**:
- [ ] Add rate limiting (express-rate-limit)
- [ ] Add security headers (helmet)
- [ ] Implement CSRF protection
- [ ] Add request validation
- [ ] Configure session timeouts
- [ ] Enable HTTPS only
- [ ] Review IAM permissions

## Monitoring and Logging

### Both Modes
- CloudWatch Logs for application logs
- CloudWatch Metrics for performance
- AWS X-Ray for distributed tracing (optional)
- CloudFront metrics and logs

### App Runner Specific
- Service-level metrics (CPU, memory, requests)
- Container health checks
- Auto-scaling events

## Cost Comparison

### Typical Small Application (1000 requests/day)

**Serverless Mode**:
- Lambda: ~$5/month (based on execution time)
- API Gateway: ~$3.50/month
- Cognito: ~$5/month (first 50K users free)
- DynamoDB: ~$5/month (with on-demand)
- **Total**: ~$18.50/month + CloudFront/S3

**Monolith Mode**:
- App Runner: ~$0/month at idle, $15/month with light usage
- DynamoDB: ~$5/month (backup only)
- **Total**: ~$20/month + CloudFront/S3

*Note: Costs vary based on actual usage. Monolith mode benefits from scale-to-zero.*

## Migration Between Modes

### From Serverless to Monolith
1. Export DynamoDB data
2. Deploy container stack
3. Import data to DynamoDB Local
4. Update DNS to point to new CloudFront distribution
5. Decommission Lambda stacks (optional)

### From Monolith to Serverless
1. Export DynamoDB Local data
2. Import to AWS DynamoDB
3. Deploy serverless stacks
4. Configure Cognito user pool
5. Update DNS to point to serverless CloudFront
6. Decommission container stack (optional)

## Troubleshooting

### Serverless Mode
- Check CloudWatch Logs for Lambda execution errors
- Verify IAM roles have correct permissions
- Check API Gateway integration settings
- Verify Cognito configuration

### Monolith Mode
- Check App Runner service logs in CloudWatch
- Verify container health check endpoint `/health`
- Check DynamoDB Local startup logs
- Verify Parameter Store secrets are accessible
- Check IAM role permissions
- Verify Google OAuth redirect URIs

## Further Reading

- [AWS App Runner Documentation](https://docs.aws.amazon.com/apprunner/)
- [DynamoDB Local Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)
- [Passport.js Documentation](http://www.passportjs.org/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
