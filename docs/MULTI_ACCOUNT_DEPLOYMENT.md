# Multi-Account AWS Deployment Guide

This guide explains how to deploy the DIY Accounting Submit application to multiple AWS accounts, with separate accounts for CI and production environments, plus a dedicated backup account.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Account Setup](#account-setup)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Backup Account](#backup-account)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Cost Estimates](#cost-estimates)

## Overview

The multi-account setup provides:

- **Isolation**: CI and prod environments in separate AWS accounts
- **Security**: Reduced blast radius for security incidents
- **Compliance**: Better audit trails and access control
- **Flexibility**: Different account limits and quotas per environment
- **Cost Control**: Separate billing and budget tracking

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Root AWS Account                         │
│                    (887764105431)                             │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Primary Domain: diyaccounting.co.uk                   │  │
│  │  - Route53 Hosted Zone                                 │  │
│  │  - DNS Delegation to environment accounts              │  │
│  │  - GitHub Actions OIDC provider                        │  │
│  │  - Root IAM roles for account provisioning             │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────┬──────────────────────────────────────┘
                        │
        ┌───────────────┴──────────────┐
        │                              │
┌───────▼──────────┐          ┌────────▼─────────┐
│   CI Account     │          │  Prod Account    │
│ (configurable)   │          │ (configurable)   │
│                  │          │                  │
│ Environment:     │          │ Environment:     │
│ - ci             │          │ - prod           │
│                  │          │                  │
│ Domain:          │          │ Domain:          │
│ - ci.submit.*    │          │ - submit.*       │
│                  │          │                  │
│ Resources:       │          │ Resources:       │
│ - CloudFront     │          │ - CloudFront     │
│ - S3 Buckets     │          │ - S3 Buckets     │
│ - Lambda         │          │ - Lambda         │
│ - Cognito        │          │ - Cognito        │
│ - Route53 Zone   │          │ - Route53 Zone   │
│ - ACM Certs      │          │ - ACM Certs      │
└────────┬─────────┘          └─────────┬────────┘
         │                              │
         │         Backups              │
         └────────────┬─────────────────┘
                      │
              ┌───────▼────────┐
              │ Backup Account │
              │ (configurable) │
              │                │
              │ Resources:     │
              │ - S3 Bucket    │
              │ - KMS Key      │
              │ - Lifecycle    │
              │ - Monitoring   │
              │                │
              │ Zero Knowledge │
              │ Push Model     │
              └────────────────┘
```

## Prerequisites

### Required

1. **AWS Accounts**: 
   - Root account (existing: 887764105431)
   - CI account (new or existing)
   - Prod account (new or existing)
   - Backup account (new or existing)

2. **AWS CLI**: Version 2.x with credentials configured

3. **Tools**:
   - Node.js 22+ (for CDK)
   - Java 21+ (for CDK)
   - Terraform 1.0+ (for backup account)
   - jq (for JSON processing)

4. **Permissions**:
   - IAM role/user in root account with Organizations access
   - IAM user/role in each target account with AdministratorAccess

5. **GitHub**:
   - Repository admin access
   - Ability to create environments and secrets

### Optional

- **AWS Organizations**: For automated account creation
- **AWS SSO**: For multi-account console access

## Quick Start

For those who want to get started quickly:

```bash
# 1. Provision a new CI account
./.github/workflows/provision-aws-account.yml \
  --environment ci \
  --aws-account-id 111111111111 \
  --aws-region eu-west-2

# 2. Set GitHub Environment variables
# Settings → Environments → ci
AWS_ACCOUNT_ID=111111111111
AWS_REGION=eu-west-2
AWS_HOSTED_ZONE_ID=Z1234567890ABC

# 3. Deploy to CI account
# Just push to any branch - deploy workflow runs automatically
git push origin feature/my-changes

# 4. Repeat for prod account
# Use 'prod' environment and push to main branch
```

## Account Setup

### Option 1: Automated Setup (GitHub Actions)

The `provision-aws-account` workflow automates most of the setup:

1. **Navigate to GitHub Actions**:
   - Go to Actions → provision-aws-account
   - Click "Run workflow"

2. **Fill in parameters**:
   ```
   environment: ci (or prod)
   aws-account-id: 111111111111
   aws-region: eu-west-2
   create-new-account: false (true if using Organizations)
   account-email: aws+ci@example.com (if creating new)
   root-domain: diyaccounting.co.uk
   ```

3. **Run and monitor**:
   - Workflow creates IAM roles, Route53 zones, DNS delegation
   - Bootstraps CDK in primary and us-east-1 regions
   - Outputs configuration values for next steps

### Option 2: Manual Setup (Script)

For more control or when Organizations API isn't available:

```bash
# 1. Clone repository
git clone git@github.com:antonycc/submit.diyaccounting.co.uk.git
cd submit.diyaccounting.co.uk

# 2. Run provisioning script
./scripts/provision-account.sh 111111111111 ci eu-west-2

# 3. Script will:
#    - Create OIDC provider for GitHub Actions
#    - Create submit-github-actions-role
#    - Create submit-deployment-role
#    - Create Route53 hosted zone
#    - Bootstrap CDK
#    - Output nameservers for DNS delegation

# 4. Create DNS delegation in root account
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0315522208PWZSSBI9AL \
  --change-batch file://delegation-change-batch.json
```

### Option 3: Manual Setup (Console)

For those who prefer AWS Console:

1. **Create OIDC Provider**:
   - Navigate to IAM → Identity providers
   - Add provider: `token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`

2. **Create GitHub Actions Role**:
   - Role name: `submit-github-actions-role`
   - Trust relationship: OIDC provider
   - Policy: Allow AssumeRole to `submit-deployment-role`

3. **Create Deployment Role**:
   - Role name: `submit-deployment-role`
   - Trust relationship: `submit-github-actions-role`
   - Policies: AdministratorAccess (or custom restrictive policy)

4. **Create Route53 Hosted Zone**:
   - Zone name: `ci.submit.diyaccounting.co.uk` (or `submit.diyaccounting.co.uk` for prod)
   - Type: Public hosted zone
   - Note the nameservers

5. **Delegate DNS**:
   - In root account, create NS record
   - Point to environment account's nameservers

6. **Bootstrap CDK**:
   ```bash
   npx cdk bootstrap aws://111111111111/eu-west-2
   npx cdk bootstrap aws://111111111111/us-east-1
   ```

## Configuration

### GitHub Environment Setup

1. **Create Environment**:
   - Settings → Environments → New environment
   - Name: `ci` or `prod`

2. **Add Environment Variables**:
   ```
   AWS_ACCOUNT_ID=111111111111
   AWS_REGION=eu-west-2
   AWS_HOSTED_ZONE_ID=Z1234567890ABC
   BACKUP_AWS_ACCOUNT_ID=999999999999
   ```

3. **Add Environment Secrets**:
   ```
   GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
   HMRC_CLIENT_SECRET=<hmrc-api-client-secret>
   NGROK_AUTH_TOKEN=<ngrok-token-for-testing>
   ```

### Local Environment Files

Update `.env.ci` and `.env.prod`:

```bash
# .env.ci
AWS_ACCOUNT_ID=111111111111
AWS_REGION=eu-west-2
AWS_HOSTED_ZONE_ID=Z1234567890ABC
BACKUP_AWS_ACCOUNT_ID=999999999999

# .env.prod
AWS_ACCOUNT_ID=222222222222
AWS_REGION=eu-west-2
AWS_HOSTED_ZONE_ID=Z9876543210XYZ
BACKUP_AWS_ACCOUNT_ID=999999999999
```

### AWS Profile Configuration

For local development, set up AWS CLI profiles:

```ini
# ~/.aws/config
[profile root]
region = eu-west-2
output = json

[profile ci]
region = eu-west-2
role_arn = arn:aws:iam::111111111111:role/submit-deployment-role
source_profile = root

[profile prod]
region = eu-west-2
role_arn = arn:aws:iam::222222222222:role/submit-deployment-role
source_profile = root

[profile backup]
region = eu-west-2
role_arn = arn:aws:iam::999999999999:role/backup-admin-role
source_profile = root
```

## Deployment

### Automatic Deployment

Deployments happen automatically on push:

- **CI Environment**: Any branch except `main`
- **Prod Environment**: `main` branch only

The workflow:
1. Detects environment from branch
2. Loads GitHub Environment variables
3. Assumes correct AWS account roles
4. Deploys infrastructure via CDK

### Manual Deployment

To deploy manually:

```bash
# 1. Set environment
export ENVIRONMENT_NAME=ci  # or prod

# 2. Load environment variables
source .env.${ENVIRONMENT_NAME}

# 3. Build
npm install
./mvnw clean package

# 4. Deploy environment stack
cd cdk-environment
npx cdk deploy ${ENVIRONMENT_NAME}-env-* --all

# 5. Deploy application stack
cd ../cdk-application
npx cdk deploy ${ENVIRONMENT_NAME}-app-* --all

# 6. Deploy delivery stack
cd ../cdk-delivery
npx cdk deploy ${ENVIRONMENT_NAME}-del-* --all
```

### Deployment Verification

After deployment:

1. **Check CloudFormation stacks**:
   ```bash
   aws cloudformation list-stacks \
     --profile ci \
     --query "StackSummaries[?StackStatus=='CREATE_COMPLETE' || StackStatus=='UPDATE_COMPLETE'].StackName"
   ```

2. **Test endpoints**:
   ```bash
   curl https://ci.submit.diyaccounting.co.uk/
   ```

3. **Check DNS propagation**:
   ```bash
   dig ci.submit.diyaccounting.co.uk
   ```

4. **View CloudWatch logs**:
   - Navigate to CloudWatch in AWS Console
   - Filter by log group: `/aws/lambda/ci-*`

## Backup Account

### Setup

The backup account uses Terraform for infrastructure-as-code:

```bash
# 1. Navigate to backup infrastructure
cd infra/backup-account

# 2. Copy and edit variables
cp terraform.tfvars.example terraform.tfvars
vim terraform.tfvars

# 3. Initialize Terraform
terraform init \
  -backend-config="bucket=my-terraform-state" \
  -backend-config="key=backup-account/terraform.tfstate" \
  -backend-config="region=eu-west-2"

# 4. Review plan
terraform plan

# 5. Apply infrastructure
terraform apply
```

### Configure Source Accounts

In each source account (ci/prod), create backup writer role:

```bash
# 1. Create trust policy
cat > backup-writer-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "backup.amazonaws.com"
    },
    "Action": "sts:AssumeRole"
  }]
}
EOF

# 2. Create role
aws iam create-role \
  --role-name submit-backup-writer-role \
  --assume-role-policy-document file://backup-writer-trust-policy.json \
  --profile ci

# 3. Attach policy (see infra/backup-account/README.md for full policy)
aws iam put-role-policy \
  --role-name submit-backup-writer-role \
  --policy-name BackupWriteAccess \
  --policy-document file://backup-writer-policy.json \
  --profile ci
```

### Testing Backups

```bash
# 1. Manually trigger backup
aws backup start-backup-job \
  --backup-vault-name default \
  --resource-arn arn:aws:dynamodb:eu-west-2:111111111111:table/ci-user-data \
  --iam-role-arn arn:aws:iam::111111111111:role/submit-backup-writer-role \
  --profile ci

# 2. Verify backup in backup account
aws s3 ls s3://diy-submit-backups-999999999999/ --profile backup

# 3. Check CloudWatch alarms
aws cloudwatch describe-alarms --profile backup
```

## Testing

### Unit Tests

Always run locally before pushing:

```bash
npm run test:unit
npm run test:integration
npm run test:system
```

### Integration Tests

Test against deployed environment:

```bash
# Set environment
export DIY_SUBMIT_BASE_URL=https://ci.submit.diyaccounting.co.uk/

# Run integration tests
npm run test:behaviour
```

### Multi-Account Tests

Verify cross-account functionality:

```bash
# Test CI deployment
AWS_PROFILE=ci npm run test:integration

# Test prod deployment
AWS_PROFILE=prod npm run test:integration

# Test backup functionality
./scripts/test-backup-cross-account.sh
```

## Troubleshooting

### Common Issues

#### 1. Role Assumption Fails

**Error**: `User: ... is not authorized to perform: sts:AssumeRole`

**Solution**:
- Verify OIDC provider exists in target account
- Check trust policy on `submit-github-actions-role`
- Ensure repository name matches trust policy condition

#### 2. DNS Delegation Not Working

**Error**: DNS queries return NXDOMAIN

**Solution**:
```bash
# Check nameservers in environment account
aws route53 get-hosted-zone --id Z1234567890ABC --profile ci

# Verify NS records in root account
dig NS ci.submit.diyaccounting.co.uk @8.8.8.8
```

#### 3. CDK Bootstrap Fails

**Error**: `CDKToolkit stack not found`

**Solution**:
```bash
# Re-bootstrap with explicit trust
npx cdk bootstrap \
  aws://111111111111/eu-west-2 \
  --trust 111111111111 \
  --trust 222222222222 \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

#### 4. Backup Upload Fails

**Error**: Access Denied when uploading to backup bucket

**Solution**:
- Verify `submit-backup-writer-role` exists in source account
- Check S3 bucket policy in backup account
- Ensure KMS key policy allows source account

### Getting Help

1. Check CloudWatch logs in relevant account
2. Review GitHub Actions workflow logs
3. Consult AWS documentation
4. Open GitHub issue with:
   - Account ID (anonymized)
   - Error messages
   - Steps to reproduce

## Cost Estimates

### Per Account

**CI Account** (light usage):
- CloudFront: $1-5/month
- Lambda: $0-2/month
- S3: $1/month
- Route53: $0.50/month
- Total: ~$3-9/month

**Prod Account** (moderate usage):
- CloudFront: $10-50/month
- Lambda: $5-20/month
- S3: $5-10/month
- Route53: $0.50/month
- Cognito: $0-5/month
- Total: ~$20-85/month

**Backup Account**:
- S3 Standard: $0.023/GB/month (0-30 days)
- S3 Glacier: $0.004/GB/month (30-60 days)
- S3 Deep Archive: $0.00099/GB/month (60-90 days)
- Total: ~$3-10/month for 100GB

### Total Cost Range

- **Minimal**: $25-50/month (3 accounts, light usage)
- **Typical**: $50-100/month (3 accounts, moderate usage)
- **High**: $100-200/month (3 accounts, heavy usage + backup)

### Cost Optimization

1. **Use lifecycle policies**: Move old data to cheaper storage
2. **Enable S3 Intelligent-Tiering**: Automatic cost optimization
3. **Set CloudWatch log retention**: Delete old logs automatically
4. **Use reserved capacity**: For predictable Lambda usage
5. **Monitor with AWS Cost Explorer**: Track and optimize spending

## Best Practices

### Security

- [ ] Enable MFA on all accounts
- [ ] Use least-privilege IAM policies
- [ ] Rotate secrets regularly
- [ ] Enable CloudTrail logging
- [ ] Set up GuardDuty

### Operations

- [ ] Tag all resources consistently
- [ ] Set up billing alerts
- [ ] Document runbooks
- [ ] Test disaster recovery
- [ ] Monitor key metrics

### Development

- [ ] Use feature flags for gradual rollout
- [ ] Deploy to CI before prod
- [ ] Run integration tests on each deploy
- [ ] Keep dependencies up to date
- [ ] Review security advisories

## References

- [AWS Multi-Account Strategy](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/organizing-your-aws-environment.html)
- [AWS CDK Best Practices](https://docs.aws.amazon.com/cdk/latest/guide/best-practices.html)
- [GitHub Actions with AWS](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS Backup](https://docs.aws.amazon.com/aws-backup/)

---

**Last Updated**: 2025-11-03

**Maintained By**: DIY Accounting Team

**Support**: Create an issue on GitHub
