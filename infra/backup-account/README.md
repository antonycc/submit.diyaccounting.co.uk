# DIY Accounting Submit - Backup Account Infrastructure

This directory contains Terraform configuration for provisioning a dedicated backup AWS account.

## Overview

The backup account is designed with the following principles:

- **Zero Knowledge**: The backup account has no awareness of ci/prod accounts
- **Push Model**: CI and prod accounts push backups to this account
- **Encryption**: All backups are encrypted at rest using KMS
- **Lifecycle Management**: Automated tiering to Glacier and Deep Archive
- **Immutable Backups**: Versioning enabled for backup history
- **Monitoring**: CloudWatch alarms and SNS notifications

## Architecture

```
┌─────────────┐
│ CI Account  │──┐
└─────────────┘  │
                 │  Cross-account
┌─────────────┐  │  S3 PutObject
│ Prod Account│──┼──────────────→  ┌──────────────────┐
└─────────────┘  │                 │ Backup Account   │
                 │                 │                  │
┌─────────────┐  │                 │ ┌──────────────┐ │
│ Root Account│──┘                 │ │ S3 Bucket    │ │
└─────────────┘                    │ │ (Encrypted)  │ │
                                   │ └──────────────┘ │
                                   │ ┌──────────────┐ │
                                   │ │ KMS Key      │ │
                                   │ └──────────────┘ │
                                   │ ┌──────────────┐ │
                                   │ │ Lifecycle    │ │
                                   │ │ Policies     │ │
                                   │ └──────────────┘ │
                                   └──────────────────┘
```

## Prerequisites

1. **AWS Account**: A dedicated AWS account for backups
2. **Terraform**: Version >= 1.0
3. **AWS CLI**: Configured with credentials for the backup account
4. **S3 Backend** (optional): For storing Terraform state

## Setup Instructions

### 1. Configure Variables

Copy the example variables file:

```bash
cd infra/backup-account
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
backup_account_id = "YOUR_BACKUP_ACCOUNT_ID"
aws_region        = "eu-west-2"

source_account_ids = [
  "YOUR_CI_ACCOUNT_ID",
  "YOUR_PROD_ACCOUNT_ID"
]

backup_retention_days          = 90
transition_to_glacier_days     = 30
transition_to_deep_archive_days = 60
```

### 2. Initialize Terraform

```bash
terraform init
```

If using S3 backend for state:

```bash
terraform init \
  -backend-config="bucket=my-terraform-state-bucket" \
  -backend-config="key=backup-account/terraform.tfstate" \
  -backend-config="region=eu-west-2" \
  -backend-config="encrypt=true"
```

### 3. Review Plan

```bash
terraform plan
```

### 4. Apply Configuration

```bash
terraform apply
```

### 5. Note the Outputs

After applying, note these important outputs:

- `backup_bucket_name`: S3 bucket name for backups
- `backup_bucket_arn`: ARN to reference in source accounts
- `kms_key_arn`: KMS key ARN for encryption
- `required_source_role_name`: IAM role name source accounts must create

## Configuring Source Accounts

Each source account (ci/prod) needs an IAM role to push backups:

### 1. Create IAM Role in Source Account

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "backup.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### 2. Attach Policy to Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::BACKUP_BUCKET_NAME",
        "arn:aws:s3:::BACKUP_BUCKET_NAME/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "KMS_KEY_ARN"
    }
  ]
}
```

### 3. Configure Backup Jobs

In each source account's CDK/CloudFormation:

```typescript
// Add to cdk-environment or cdk-application stacks
const backupVault = new backup.BackupVault(this, 'BackupVault', {
  backupVaultName: `${environmentName}-vault`,
});

const backupPlan = new backup.BackupPlan(this, 'BackupPlan', {
  backupPlanRules: [
    {
      ruleName: 'DailyBackups',
      scheduleExpression: cdk.Schedule.cron({ hour: '3', minute: '0' }),
      moveToColdStorageAfter: cdk.Duration.days(30),
      deleteAfter: cdk.Duration.days(90),
      copyActions: [
        {
          destinationBackupVault: backup.BackupVault.fromBackupVaultArn(
            this,
            'CrossAccountVault',
            'arn:aws:backup:REGION:BACKUP_ACCOUNT_ID:backup-vault:backup-vault-name'
          ),
        },
      ],
    },
  ],
});
```

## Backup Types

The following resources should be backed up to this account:

1. **DynamoDB Tables**: User data, bundles, entitlements
2. **S3 Buckets**: Receipt uploads, user documents
3. **Secrets Manager**: Client secrets (encrypted)
4. **RDS/Aurora** (if added in future)

## Monitoring

### CloudWatch Alarms

- **Backup Failures**: Alerts on S3 4xx errors > 10/5min
- **Missing Backups**: Custom metric for expected vs actual backups

### SNS Notifications

Subscribe to `diy-submit-backup-notifications` topic:

```bash
aws sns subscribe \
  --topic-arn TOPIC_ARN \
  --protocol email \
  --notification-endpoint your-email@example.com
```

## Restoring from Backup

To restore backups:

1. **Access Backup Account**: Switch to backup account in AWS Console
2. **Navigate to S3**: Open the backup bucket
3. **Find Backup**: Locate backup by timestamp and environment prefix
4. **Cross-Account Copy**: Use IAM role to copy to source account
5. **Restore**: Use AWS Backup or manual restore process

Example restore command:

```bash
# From backup account
aws s3 cp \
  s3://BACKUP_BUCKET/ci/dynamodb/table-name/backup-timestamp.tar.gz \
  s3://SOURCE_ACCOUNT_BUCKET/restore/ \
  --sse aws:kms \
  --sse-kms-key-id SOURCE_ACCOUNT_KMS_KEY
```

## Cost Optimization

### Storage Costs

- **Standard**: $0.023/GB/month (0-30 days)
- **Glacier**: $0.004/GB/month (30-60 days)
- **Deep Archive**: $0.00099/GB/month (60-90 days)

### Estimated Monthly Cost

For 100GB of backups:

- Days 0-30: 100GB × $0.023 = $2.30
- Days 30-60: 100GB × $0.004 = $0.40
- Days 60-90: 100GB × $0.00099 = $0.10

**Total**: ~$2.80/month for 100GB with tiering

## Security Considerations

1. **Encryption**: All backups encrypted with KMS
2. **Access Control**: Only specific source accounts can write
3. **Versioning**: Enabled for backup history and protection
4. **Audit Trail**: CloudTrail logs all S3 access
5. **Immutability**: Optional object lock for compliance

## Disaster Recovery

### RPO (Recovery Point Objective)

- **Daily Backups**: 24-hour RPO
- **Real-time Replication**: < 1 hour RPO (if configured)

### RTO (Recovery Time Objective)

- **Standard Storage**: Minutes
- **Glacier**: 3-5 hours
- **Deep Archive**: 12-48 hours

## Maintenance

### Regular Tasks

1. **Monthly**: Review backup success rates
2. **Quarterly**: Test restore procedures
3. **Annually**: Review retention policies
4. **As Needed**: Update source account IDs

### Terraform Updates

To update the infrastructure:

```bash
# Pull latest changes
git pull

# Review changes
terraform plan

# Apply updates
terraform apply
```

## Troubleshooting

### Backup Upload Failures

1. Check IAM role in source account
2. Verify KMS key permissions
3. Review S3 bucket policy
4. Check CloudWatch logs

### High Storage Costs

1. Review lifecycle policies
2. Check for failed transitions
3. Verify deletion of old backups
4. Consider adjusting retention periods

### Missing Backups

1. Verify backup job scheduling
2. Check source account IAM permissions
3. Review CloudWatch alarms
4. Test cross-account assume role

## References

- [AWS Backup Documentation](https://docs.aws.amazon.com/aws-backup/)
- [S3 Lifecycle Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- [Cross-Account S3 Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-walkthroughs-managing-access-example2.html)
- [KMS Key Policies](https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html)

## Support

For issues or questions:

1. Check CloudWatch logs and alarms
2. Review Terraform plan output
3. Consult AWS documentation
4. Open GitHub issue

---

**Note**: This is infrastructure-as-code. Always review changes with `terraform plan` before applying. Never commit `terraform.tfvars` with sensitive data to version control.
