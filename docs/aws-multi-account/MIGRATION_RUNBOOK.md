# Migration Runbook

This document provides step-by-step instructions for migrating DIY Accounting Submit to the multi-account AWS architecture.

## Migration Overview

| Phase | Duration | Downtime |
|-------|----------|----------|
| Pre-migration backup | ~30 min | None |
| CI environment setup | ~2 hours | None |
| Cross-account backup config | ~1 hour | None |
| Production validation | ~30 min | None |
| DNS/CDK updates | ~1 hour | Minimal |

## Prerequisites

Before starting migration:

- [ ] All accounts created (management, ci, backup)
- [ ] IAM Identity Center configured
- [ ] GitHub OIDC roles deployed
- [ ] CDK bootstrapped in all accounts
- [ ] Current production backup verified

## Phase 1: Pre-Migration Backup

### 1.1 Document Current State

```bash
# Run from production account
./scripts/aws-accounts/document-current-state.sh

# This creates:
# - target/migration/dynamodb-tables.json
# - target/migration/lambda-functions.json
# - target/migration/cloudformation-stacks.json
# - target/migration/secrets.json
```

### 1.2 Create On-Demand Backups

```bash
# List all DynamoDB tables
aws dynamodb list-tables --profile submit-prod-admin

# Create backup for each table
for table in $(aws dynamodb list-tables --query 'TableNames[]' --output text --profile submit-prod-admin); do
  aws dynamodb create-backup \
    --table-name $table \
    --backup-name "pre-migration-$(date +%Y%m%d)-$table" \
    --profile submit-prod-admin
done
```

### 1.3 Verify Backups

```bash
# List all backups
aws dynamodb list-backups \
  --profile submit-prod-admin \
  --query 'BackupSummaries[*].[TableName,BackupName,BackupStatus]' \
  --output table
```

All backups should show status `AVAILABLE`.

### 1.4 Export Critical Data (Optional)

For additional safety:

```bash
# Export to S3 (creates point-in-time export)
aws dynamodb export-table-to-point-in-time \
  --table-arn arn:aws:dynamodb:eu-west-2:887764105431:table/prod-submit-tokens \
  --s3-bucket submit-migration-exports \
  --profile submit-prod-admin
```

## Phase 2: CI Environment Setup

### 2.1 Deploy CI Stack

```bash
# Switch to CI account
export AWS_PROFILE=submit-ci-admin

# Deploy CDK stacks
cd /path/to/submit.diyaccounting.co.uk
npm run deploy:ci
```

### 2.2 Verify CI Deployment

```bash
# Check CloudFormation stacks
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --profile submit-ci-admin

# Check Lambda functions
aws lambda list-functions \
  --profile submit-ci-admin \
  --query 'Functions[*].FunctionName'

# Check DynamoDB tables
aws dynamodb list-tables --profile submit-ci-admin
```

### 2.3 Seed CI Test Data

```bash
# Run test data seeder
npm run seed:ci

# Or manually create test records
aws dynamodb put-item \
  --table-name ci-submit-tokens \
  --item file://test-data/sample-token.json \
  --profile submit-ci-admin
```

### 2.4 Run E2E Tests Against CI

```bash
# Update .env.ci with new account endpoints
npm run test:submitVatBehaviour-ci
```

All tests should pass before proceeding.

## Phase 3: Cross-Account Backup Configuration

### 3.1 Create Backup Vault in Backup Account

```bash
# Switch to backup account
export AWS_PROFILE=submit-backup-admin

# Create vault
aws backup create-backup-vault \
  --backup-vault-name submit-cross-account-vault \
  --region eu-west-2

# Set vault access policy (allow prod and ci to copy)
aws backup put-backup-vault-access-policy \
  --backup-vault-name submit-cross-account-vault \
  --policy file://scripts/aws-accounts/trust-policies/backup-vault-policy.json
```

### 3.2 Configure Cross-Account Backup in Production

```bash
# Switch to production account
export AWS_PROFILE=submit-prod-admin

# Create backup plan with cross-account copy
aws backup create-backup-plan \
  --backup-plan file://scripts/aws-accounts/backup-plan-cross-account.json
```

### 3.3 Verify Cross-Account Backup

```bash
# Trigger manual backup job
aws backup start-backup-job \
  --backup-vault-name submit-backup-vault \
  --resource-arn arn:aws:dynamodb:eu-west-2:887764105431:table/prod-submit-tokens \
  --iam-role-arn arn:aws:iam::887764105431:role/AWSBackupDefaultServiceRole \
  --profile submit-prod-admin

# Wait for completion, then verify copy to backup account
aws backup list-copy-jobs --profile submit-backup-admin
```

## Phase 4: Update GitHub Workflows

### 4.1 Add New Secrets

In GitHub repository settings, add:

| Secret | Value |
|--------|-------|
| `AWS_CI_ACCOUNT_ID` | (CI account ID) |
| `AWS_PROD_ACCOUNT_ID` | `887764105431` |
| `AWS_CI_ACTIONS_ROLE_ARN` | `arn:aws:iam::CI_ID:role/github-actions-role` |
| `AWS_PROD_ACTIONS_ROLE_ARN` | `arn:aws:iam::887764105431:role/github-actions-role` |

### 4.2 Update Workflow Files

Workflows should now:
- Deploy feature branches to CI account
- Deploy main branch to production account

See updated workflow files in `.github/workflows/`.

### 4.3 Test Workflow

```bash
# Create test branch
git checkout -b test/multi-account-deploy
git push origin test/multi-account-deploy

# Monitor GitHub Actions
gh run list --branch test/multi-account-deploy
gh run watch
```

Verify deployment goes to CI account, not production.

## Phase 5: Production Cutover (Minimal Downtime)

### 5.1 Pre-Cutover Checklist

- [ ] CI environment fully tested
- [ ] Cross-account backup working
- [ ] GitHub workflows updated and tested
- [ ] DNS TTL lowered (if changing endpoints)
- [ ] Maintenance page ready (optional)

### 5.2 Start Maintenance Window

Optional: Enable maintenance mode

```bash
# Update CloudFront behavior to serve maintenance page
aws cloudfront update-distribution \
  --id DISTRIBUTION_ID \
  --default-root-object maintenance.html \
  --profile submit-prod-admin
```

### 5.3 Final Backup

```bash
# Take final backup of all tables
./scripts/aws-accounts/final-backup.sh
```

### 5.4 Verify No Active Sessions

```bash
# Check for active sessions
aws dynamodb scan \
  --table-name prod-submit-tokens \
  --filter-expression "attribute_exists(sessionId)" \
  --profile submit-prod-admin
```

If active sessions exist, decide whether to wait or proceed.

### 5.5 Update CDK Configuration

Update `cdk.json` with multi-account settings:

```json
{
  "context": {
    "accounts": {
      "ci": "CI_ACCOUNT_ID",
      "prod": "887764105431"
    }
  }
}
```

### 5.6 Deploy Updated Stacks

```bash
# Deploy to production with new configuration
npm run deploy:prod
```

### 5.7 Verify Production

```bash
# Quick smoke test
curl https://submit.diyaccounting.co.uk/health

# Full test suite
npm run test:submitVatBehaviour-prod
```

### 5.8 End Maintenance Window

```bash
# Restore normal CloudFront behavior
aws cloudfront update-distribution \
  --id DISTRIBUTION_ID \
  --default-root-object index.html \
  --profile submit-prod-admin
```

## Phase 6: Post-Migration Verification

### 6.1 Verify All Systems

| System | Test Command | Expected Result |
|--------|--------------|-----------------|
| API | `curl https://submit.diyaccounting.co.uk/health` | 200 OK |
| Auth | Login via OAuth | Redirect works |
| VAT Submit | Full submission test | Success |
| Backup | Check backup job history | Recent backup present |

### 6.2 Monitor for 24 Hours

- Watch CloudWatch alarms
- Check error rates in logs
- Monitor user feedback

### 6.3 Verify Cross-Account Backup

```bash
# In backup account, verify recent backup exists
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name submit-cross-account-vault \
  --profile submit-backup-admin
```

## Rollback Procedures

### Scenario 1: CI Deployment Issues

Simply fix and redeploy to CI. No impact on production.

### Scenario 2: Production Deployment Fails

```bash
# Rollback CloudFormation stack
aws cloudformation rollback-stack \
  --stack-name submit-prod-stack \
  --profile submit-prod-admin
```

### Scenario 3: Data Corruption

```bash
# Restore from pre-migration backup
aws dynamodb restore-table-from-backup \
  --target-table-name prod-submit-tokens \
  --backup-arn arn:aws:dynamodb:eu-west-2:887764105431:backup/... \
  --profile submit-prod-admin
```

### Scenario 4: Complete Rollback

1. Revert CDK configuration changes
2. Redeploy previous version
3. Restore DNS if changed
4. Notify users if service was interrupted

## Post-Migration Cleanup

After 30 days of stable operation:

### Remove Old Resources (If Any)

```bash
# List old Lambda versions
aws lambda list-versions-by-function \
  --function-name submit-function \
  --profile submit-prod-admin

# Remove old versions (keep last 2)
```

### Update Documentation

- [ ] Update CLAUDE.md with new account IDs
- [ ] Update runbooks with new procedures
- [ ] Archive old single-account documentation

### Delete Pre-Migration Backups

```bash
# After 30 days, clean up migration-specific backups
aws dynamodb delete-backup \
  --backup-arn arn:aws:dynamodb:... \
  --profile submit-prod-admin
```

---

## Emergency Contacts

| Role | Contact |
|------|---------|
| Infrastructure Owner | antony@diyaccounting.co.uk |
| AWS Support | (if support plan active) |

---

*Document Version: 1.0*
*Last Updated: 2026-01-15*
