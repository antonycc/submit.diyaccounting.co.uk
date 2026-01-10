#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Setup dedicated backup AWS account with multi-region storage
#
# The backup account handles multi-region redundancy so deployment accounts
# only need local backups. This simplifies DR: account loss and region loss
# are treated identically - deploy fresh from backup archives.
#
# See BACKUP_STRATEGY_PLAN.md for full architecture documentation.

set -e

BACKUP_ACCOUNT_ID="${1:-}"
PRIMARY_REGION="${2:-eu-west-2}"
REPLICA_REGION="${3:-eu-west-1}"

if [ -z "$BACKUP_ACCOUNT_ID" ]; then
    echo "Usage: $0 <backup-account-id> [primary-region] [replica-region]"
    echo ""
    echo "This creates a multi-region backup account that receives backups"
    echo "from deployment accounts (CI, PROD) and stores them with"
    echo "cross-region redundancy."
    exit 1
fi

echo "=============================================="
echo "Setting up Backup Account: $BACKUP_ACCOUNT_ID"
echo "Primary Region: $PRIMARY_REGION"
echo "Replica Region: $REPLICA_REGION"
echo "=============================================="
echo ""

# Assume role in backup account (requires cross-account access)
# You'll need to configure AWS credentials for the backup account

echo "1. Creating KMS key for backup encryption (primary region)..."
KMS_KEY_ARN=$(aws kms create-key \
    --description "Central backup encryption key (primary)" \
    --region "$PRIMARY_REGION" \
    --query 'KeyMetadata.Arn' \
    --output text)

aws kms create-alias \
    --alias-name "alias/central-backup-key" \
    --target-key-id "$KMS_KEY_ARN" \
    --region "$PRIMARY_REGION"

echo "   KMS Key (primary): $KMS_KEY_ARN"

echo "2. Creating KMS key in replica region..."
REPLICA_KMS_KEY_ARN=$(aws kms create-key \
    --description "Central backup encryption key (replica)" \
    --region "$REPLICA_REGION" \
    --query 'KeyMetadata.Arn' \
    --output text)

aws kms create-alias \
    --alias-name "alias/central-backup-key" \
    --target-key-id "$REPLICA_KMS_KEY_ARN" \
    --region "$REPLICA_REGION"

echo "   KMS Key (replica): $REPLICA_KMS_KEY_ARN"

echo "3. Creating central backup vault (primary region)..."
aws backup create-backup-vault \
    --backup-vault-name "central-backup-vault" \
    --encryption-key-arn "$KMS_KEY_ARN" \
    --region "$PRIMARY_REGION" \
    --backup-vault-tags Purpose=central-backups,ManagedBy=scripts

echo "4. Creating central backup vault (replica region)..."
aws backup create-backup-vault \
    --backup-vault-name "central-backup-vault" \
    --encryption-key-arn "$REPLICA_KMS_KEY_ARN" \
    --region "$REPLICA_REGION" \
    --backup-vault-tags Purpose=central-backups-replica,ManagedBy=scripts

echo "5. Creating S3 bucket for DynamoDB exports (with cross-region replication)..."
BUCKET_NAME="diyaccounting-central-backups-${BACKUP_ACCOUNT_ID}"

# Create bucket with Object Lock enabled (for WORM compliance)
# Note: Object Lock must be enabled at bucket creation time
aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$PRIMARY_REGION" \
    --create-bucket-configuration LocationConstraint="$PRIMARY_REGION" \
    --object-lock-enabled-for-bucket

# Enable versioning (required for replication)
aws s3api put-bucket-versioning \
    --bucket "$BUCKET_NAME" \
    --versioning-configuration Status=Enabled

# Create replica bucket
REPLICA_BUCKET_NAME="${BUCKET_NAME}-replica"
aws s3api create-bucket \
    --bucket "$REPLICA_BUCKET_NAME" \
    --region "$REPLICA_REGION" \
    --create-bucket-configuration LocationConstraint="$REPLICA_REGION" \
    --object-lock-enabled-for-bucket

aws s3api put-bucket-versioning \
    --bucket "$REPLICA_BUCKET_NAME" \
    --versioning-configuration Status=Enabled

echo "   Primary bucket: $BUCKET_NAME"
echo "   Replica bucket: $REPLICA_BUCKET_NAME"

echo "6. Creating IAM role for S3 replication..."
cat > /tmp/s3-replication-trust.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {"Service": "s3.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

REPLICATION_ROLE_ARN=$(aws iam create-role \
    --role-name "S3BackupReplicationRole" \
    --assume-role-policy-document file:///tmp/s3-replication-trust.json \
    --query 'Role.Arn' \
    --output text 2>/dev/null || \
    aws iam get-role --role-name "S3BackupReplicationRole" --query 'Role.Arn' --output text)

cat > /tmp/s3-replication-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": ["s3:GetReplicationConfiguration", "s3:ListBucket"],
            "Resource": "arn:aws:s3:::${BUCKET_NAME}"
        },
        {
            "Effect": "Allow",
            "Action": ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl"],
            "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
        },
        {
            "Effect": "Allow",
            "Action": ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"],
            "Resource": "arn:aws:s3:::${REPLICA_BUCKET_NAME}/*"
        }
    ]
}
EOF

aws iam put-role-policy \
    --role-name "S3BackupReplicationRole" \
    --policy-name "S3ReplicationPolicy" \
    --policy-document file:///tmp/s3-replication-policy.json

echo "7. Configuring S3 cross-region replication..."
cat > /tmp/s3-replication-config.json << EOF
{
    "Role": "$REPLICATION_ROLE_ARN",
    "Rules": [
        {
            "ID": "BackupReplication",
            "Status": "Enabled",
            "Priority": 1,
            "DeleteMarkerReplication": {"Status": "Disabled"},
            "Filter": {"Prefix": ""},
            "Destination": {
                "Bucket": "arn:aws:s3:::${REPLICA_BUCKET_NAME}",
                "ReplicationTime": {"Status": "Enabled", "Time": {"Minutes": 15}},
                "Metrics": {"Status": "Enabled", "EventThreshold": {"Minutes": 15}}
            }
        }
    ]
}
EOF

aws s3api put-bucket-replication \
    --bucket "$BUCKET_NAME" \
    --replication-configuration file:///tmp/s3-replication-config.json

echo "8. Creating IAM policy for cross-account backup copy..."
cat > /tmp/backup-account-policy.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowCrossAccountBackupCopy",
            "Effect": "Allow",
            "Principal": {
                "AWS": [
                    "arn:aws:iam::PROD_ACCOUNT_ID:root",
                    "arn:aws:iam::CI_ACCOUNT_ID:root"
                ]
            },
            "Action": "backup:CopyIntoBackupVault",
            "Resource": "arn:aws:backup:*:BACKUP_ACCOUNT_ID:backup-vault:*"
        }
    ]
}
EOF

echo ""
echo "=============================================="
echo "BACKUP ACCOUNT SETUP COMPLETE"
echo "=============================================="
echo ""
echo "Multi-region storage configured:"
echo "  - Primary vault:  central-backup-vault ($PRIMARY_REGION)"
echo "  - Replica vault:  central-backup-vault ($REPLICA_REGION)"
echo "  - Primary S3:     $BUCKET_NAME"
echo "  - Replica S3:     $REPLICA_BUCKET_NAME (auto-replicated)"
echo ""
echo "Next steps:"
echo "1. Replace PROD_ACCOUNT_ID and CI_ACCOUNT_ID in /tmp/backup-account-policy.json"
echo "2. Apply the backup vault access policy"
echo "3. Configure source accounts to ship backups here"
echo "4. Test cross-account backup copy"
