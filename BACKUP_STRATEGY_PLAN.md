# Backup Strategy Implementation Plan

**Issue**: #398 - No backups are taken outside AWS internals
**Priority**: Important for HMRC approval
**Author**: Claude
**Date**: January 2026

---

## Overview

This document describes the implementation plan for a comprehensive backup strategy that ensures data durability and disaster recovery capabilities beyond AWS's internal mechanisms.

---

## Current State Assessment

### What Exists Today

| Resource | Current Protection | Gap |
|----------|-------------------|-----|
| DynamoDB Tables | TTL-based expiry only | No PITR, no cross-region backup |
| Secrets Manager | AWS-managed replication | No external backup |
| Cognito User Pool | None | No user export/backup |
| S3 Static Assets | Single region | No cross-region replication |

### Critical Data Assets

| Asset | Criticality | Recovery Priority | Retention Requirement |
|-------|-------------|-------------------|----------------------|
| Receipts Table | **Critical** | RTO: 4 hours | 7 years (HMRC requirement) |
| Bundles Table | High | RTO: 4 hours | Duration of subscription |
| User Sub Hash Salt | **Critical** | RTO: 1 hour | Indefinite (data integrity) |
| HMRC API Requests | Medium | RTO: 24 hours | 90 days |
| Async Request Tables | Low | RTO: 24 hours | 7 days |

---

## Proposed Architecture

```
                        Primary Region (eu-west-2)
                        +------------------------+
                        |                        |
    +-------------------+  DynamoDB Tables       +-------------------+
    |                   |  (with PITR enabled)   |                   |
    |                   +------------------------+                   |
    |                              |                                 |
    |                              | Point-in-Time Recovery          |
    |                              | (35 days continuous)            |
    |                              v                                 |
    |                   +------------------------+                   |
    |                   |  AWS Backup            |                   |
    |                   |  (Daily snapshots)     |                   |
    |                   +------------------------+                   |
    |                              |                                 |
    |                              | Cross-region copy               |
    |                              v                                 |
    |                   +------------------------+                   |
    |                   |  DR Region (eu-west-1) |                   |
    |                   |  Backup Vault          |                   |
    |                   +------------------------+                   |
    |                                                                |
    |   Secrets Manager                                              |
    |   +------------------------+                                   |
    |   |  Salt Secret           +---------------------------------->|
    |   |  (with replica)        |  Multi-region replication        |
    |   +------------------------+                                   |
    |                                                                |
    +----------------------------------------------------------------+
```

---

## Implementation Details

### 1. Enable Point-in-Time Recovery (PITR) on DynamoDB Tables

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java`

#### Changes to Receipts Table (Critical)

```java
// Current:
this.receiptsTable = Table.Builder.create(this, props.resourceNamePrefix() + "-ReceiptsTable")
        .tableName(props.sharedNames().receiptsTableName)
        .partitionKey(...)
        .sortKey(...)
        .billingMode(BillingMode.PAY_PER_REQUEST)
        .timeToLiveAttribute("ttl")
        .removalPolicy(RemovalPolicy.DESTROY)
        .build();

// Updated:
this.receiptsTable = Table.Builder.create(this, props.resourceNamePrefix() + "-ReceiptsTable")
        .tableName(props.sharedNames().receiptsTableName)
        .partitionKey(Attribute.builder()
                .name("hashedSub")
                .type(AttributeType.STRING)
                .build())
        .sortKey(Attribute.builder()
                .name("receiptId")
                .type(AttributeType.STRING)
                .build())
        .billingMode(BillingMode.PAY_PER_REQUEST)
        .timeToLiveAttribute("ttl")
        .pointInTimeRecovery(true)  // <-- Enable PITR
        .removalPolicy(props.envName().equals("prod")
                ? RemovalPolicy.RETAIN   // <-- Retain in production
                : RemovalPolicy.DESTROY)
        .build();
```

#### Changes to Bundles Table (High)

```java
// Updated:
this.bundlesTable = Table.Builder.create(this, props.resourceNamePrefix() + "-BundlesTable")
        .tableName(props.sharedNames().bundlesTableName)
        .partitionKey(Attribute.builder()
                .name("hashedSub")
                .type(AttributeType.STRING)
                .build())
        .sortKey(Attribute.builder()
                .name("bundleId")
                .type(AttributeType.STRING)
                .build())
        .billingMode(BillingMode.PAY_PER_REQUEST)
        .timeToLiveAttribute("ttl")
        .pointInTimeRecovery(true)  // <-- Enable PITR
        .removalPolicy(props.envName().equals("prod")
                ? RemovalPolicy.RETAIN
                : RemovalPolicy.DESTROY)
        .build();
```

#### Changes to HMRC API Requests Table (Medium)

```java
// Updated:
this.hmrcApiRequestsTable = Table.Builder.create(this, props.resourceNamePrefix() + "-HmrcApiRequestsTable")
        .tableName(props.sharedNames().hmrcApiRequestsTableName)
        .partitionKey(Attribute.builder()
                .name("hashedSub")
                .type(AttributeType.STRING)
                .build())
        .sortKey(Attribute.builder()
                .name("id")
                .type(AttributeType.STRING)
                .build())
        .billingMode(BillingMode.PAY_PER_REQUEST)
        .timeToLiveAttribute("ttl")
        .pointInTimeRecovery(true)  // <-- Enable PITR
        .removalPolicy(props.envName().equals("prod")
                ? RemovalPolicy.RETAIN
                : RemovalPolicy.DESTROY)
        .build();
```

---

### 2. AWS Backup Integration

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/BackupStack.java`

```java
/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.backup.BackupPlan;
import software.amazon.awscdk.services.backup.BackupPlanRule;
import software.amazon.awscdk.services.backup.BackupResource;
import software.amazon.awscdk.services.backup.BackupSelection;
import software.amazon.awscdk.services.backup.BackupVault;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.constructs.Construct;

public class BackupStack extends Stack {

    public BackupVault primaryVault;
    public BackupVault drVault;
    public BackupPlan dailyBackupPlan;

    @Value.Immutable
    public interface BackupStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        // DR region for cross-region backups
        String drRegion();

        // Retention settings
        int dailyBackupRetentionDays();
        int weeklyBackupRetentionDays();
        int monthlyBackupRetentionDays();

        static ImmutableBackupStackProps.Builder builder() {
            return ImmutableBackupStackProps.builder();
        }
    }

    public BackupStack(Construct scope, String id, BackupStackProps props) {
        this(scope, id, null, props);
    }

    public BackupStack(Construct scope, String id, StackProps stackProps, BackupStackProps props) {
        super(scope, id, stackProps);

        // ============================================================================
        // Backup Vaults
        // ============================================================================

        // Primary vault in the main region
        this.primaryVault = BackupVault.Builder.create(this, props.resourceNamePrefix() + "-PrimaryVault")
                .backupVaultName(props.resourceNamePrefix() + "-primary-vault")
                .removalPolicy(props.envName().equals("prod")
                        ? RemovalPolicy.RETAIN
                        : RemovalPolicy.DESTROY)
                .build();

        // Note: DR vault must be created in the DR region separately
        // This is a placeholder for documentation purposes
        // Cross-region copy is configured in the backup rules

        // ============================================================================
        // IAM Role for AWS Backup
        // ============================================================================

        Role backupRole = Role.Builder.create(this, props.resourceNamePrefix() + "-BackupRole")
                .roleName(props.resourceNamePrefix() + "-backup-role")
                .assumedBy(new ServicePrincipal("backup.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSBackupServiceRolePolicyForBackup"),
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSBackupServiceRolePolicyForRestores")))
                .build();

        // ============================================================================
        // Backup Plan - Daily
        // ============================================================================

        this.dailyBackupPlan = BackupPlan.Builder.create(this, props.resourceNamePrefix() + "-DailyBackupPlan")
                .backupPlanName(props.resourceNamePrefix() + "-daily-backup")
                .backupPlanRules(List.of(
                        // Daily backup at 02:00 UTC, retained for configured days
                        BackupPlanRule.Builder.create()
                                .ruleName("DailyBackup")
                                .backupVault(this.primaryVault)
                                .scheduleExpression(Schedule.cron(software.amazon.awscdk.services.events.CronOptions.builder()
                                        .hour("2")
                                        .minute("0")
                                        .build()))
                                .deleteAfter(Duration.days(props.dailyBackupRetentionDays()))
                                .startWindow(Duration.hours(1))
                                .completionWindow(Duration.hours(2))
                                // Cross-region copy for disaster recovery
                                .copyActions(List.of(software.amazon.awscdk.services.backup.BackupPlanCopyActionProps.builder()
                                        .destinationBackupVault(BackupVault.fromBackupVaultArn(
                                                this,
                                                "DRVault",
                                                String.format("arn:aws:backup:%s:%s:backup-vault:%s-dr-vault",
                                                        props.drRegion(),
                                                        this.getAccount(),
                                                        props.resourceNamePrefix())))
                                        .deleteAfter(Duration.days(props.dailyBackupRetentionDays()))
                                        .build()))
                                .build(),

                        // Weekly backup (Sundays), retained longer
                        BackupPlanRule.Builder.create()
                                .ruleName("WeeklyBackup")
                                .backupVault(this.primaryVault)
                                .scheduleExpression(Schedule.cron(software.amazon.awscdk.services.events.CronOptions.builder()
                                        .weekDay("SUN")
                                        .hour("3")
                                        .minute("0")
                                        .build()))
                                .deleteAfter(Duration.days(props.weeklyBackupRetentionDays()))
                                .startWindow(Duration.hours(1))
                                .completionWindow(Duration.hours(3))
                                .build(),

                        // Monthly backup (1st of month), retained for compliance
                        BackupPlanRule.Builder.create()
                                .ruleName("MonthlyBackup")
                                .backupVault(this.primaryVault)
                                .scheduleExpression(Schedule.cron(software.amazon.awscdk.services.events.CronOptions.builder()
                                        .day("1")
                                        .hour("4")
                                        .minute("0")
                                        .build()))
                                .deleteAfter(Duration.days(props.monthlyBackupRetentionDays()))
                                .startWindow(Duration.hours(1))
                                .completionWindow(Duration.hours(4))
                                .build()))
                .build();

        // ============================================================================
        // Backup Selection - Critical Tables
        // ============================================================================

        // Import existing tables by ARN
        ITable receiptsTable = Table.fromTableArn(
                this,
                "ImportedReceiptsTable",
                String.format("arn:aws:dynamodb:%s:%s:table/%s",
                        this.getRegion(),
                        this.getAccount(),
                        props.sharedNames().receiptsTableName));

        ITable bundlesTable = Table.fromTableArn(
                this,
                "ImportedBundlesTable",
                String.format("arn:aws:dynamodb:%s:%s:table/%s",
                        this.getRegion(),
                        this.getAccount(),
                        props.sharedNames().bundlesTableName));

        ITable hmrcApiRequestsTable = Table.fromTableArn(
                this,
                "ImportedHmrcApiRequestsTable",
                String.format("arn:aws:dynamodb:%s:%s:table/%s",
                        this.getRegion(),
                        this.getAccount(),
                        props.sharedNames().hmrcApiRequestsTableName));

        // Create backup selection for critical tables
        BackupSelection.Builder.create(this, props.resourceNamePrefix() + "-CriticalTablesSelection")
                .backupPlan(this.dailyBackupPlan)
                .role(backupRole)
                .resources(List.of(
                        BackupResource.fromDynamoDbTable(receiptsTable),
                        BackupResource.fromDynamoDbTable(bundlesTable),
                        BackupResource.fromDynamoDbTable(hmrcApiRequestsTable)))
                .backupSelectionName(props.resourceNamePrefix() + "-critical-tables")
                .build();

        // ============================================================================
        // Outputs
        // ============================================================================
        cfnOutput(this, "PrimaryVaultArn", this.primaryVault.getBackupVaultArn());
        cfnOutput(this, "BackupPlanId", this.dailyBackupPlan.getBackupPlanId());

        infof(
                "BackupStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
```

---

### 3. DR Vault Setup (Manual One-Time Setup)

The DR vault must be created in the DR region before the main stack deployment:

```bash
#!/bin/bash
# scripts/create-dr-vault.sh

DR_REGION="eu-west-1"
VAULT_NAME="prod-submit-dr-vault"

echo "Creating DR backup vault in $DR_REGION..."

aws backup create-backup-vault \
    --backup-vault-name "$VAULT_NAME" \
    --region "$DR_REGION" \
    --backup-vault-tags Environment=prod,Purpose=disaster-recovery

echo "DR vault created: $VAULT_NAME in $DR_REGION"
```

---

### 4. Secrets Manager Multi-Region Replication

**File**: Update secret creation in deploy workflows

```yaml
# In deploy-environment.yml, update secret creation step:

- name: Create or update salt secret with replication
  run: |
    SECRET_NAME="${{ needs.names.outputs.environment-name }}/submit/user-sub-hash-salt"

    # Check if secret exists
    if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" 2>/dev/null; then
      echo "Secret exists, checking replication..."

      # Add replica if not present (for prod only)
      if [ "${{ needs.names.outputs.environment-name }}" == "prod" ]; then
        aws secretsmanager replicate-secret-to-regions \
          --secret-id "$SECRET_NAME" \
          --add-replica-regions Region=eu-west-1 \
          --force-overwrite-replica-secret || true
      fi
    else
      echo "Creating new secret..."
      SALT=$(openssl rand -hex 32)

      if [ "${{ needs.names.outputs.environment-name }}" == "prod" ]; then
        # Create with replica for prod
        aws secretsmanager create-secret \
          --name "$SECRET_NAME" \
          --secret-string "$SALT" \
          --add-replica-regions Region=eu-west-1
      else
        # Create without replica for non-prod
        aws secretsmanager create-secret \
          --name "$SECRET_NAME" \
          --secret-string "$SALT"
      fi
    fi
```

---

### 5. Backup Verification Script

**File**: `scripts/verify-backups.sh`

```bash
#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd

# Verify backup configuration and recent backup jobs

set -e

ENV_NAME="${1:-prod}"
REGION="${AWS_REGION:-eu-west-2}"

echo "=== Backup Verification Report ==="
echo "Environment: $ENV_NAME"
echo "Region: $REGION"
echo "Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Check PITR status on critical tables
echo "=== DynamoDB Point-in-Time Recovery Status ==="
for TABLE in "${ENV_NAME}-submit-receipts" "${ENV_NAME}-submit-bundles" "${ENV_NAME}-submit-hmrc-api-requests"; do
    PITR_STATUS=$(aws dynamodb describe-continuous-backups \
        --table-name "$TABLE" \
        --region "$REGION" \
        --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
        --output text 2>/dev/null || echo "TABLE_NOT_FOUND")

    if [ "$PITR_STATUS" == "ENABLED" ]; then
        echo "  [OK] $TABLE: PITR enabled"
    else
        echo "  [WARN] $TABLE: PITR status = $PITR_STATUS"
    fi
done
echo ""

# Check recent backup jobs
echo "=== Recent Backup Jobs (last 7 days) ==="
aws backup list-backup-jobs \
    --by-resource-type DynamoDB \
    --by-created-after "$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
    --region "$REGION" \
    --query 'BackupJobs[*].[ResourceArn,State,CreationDate,CompletionDate]' \
    --output table

echo ""

# Check backup vault status
echo "=== Backup Vault Status ==="
VAULT_NAME="${ENV_NAME}-submit-primary-vault"
aws backup describe-backup-vault \
    --backup-vault-name "$VAULT_NAME" \
    --region "$REGION" \
    --query '{Name:BackupVaultName,RecoveryPoints:NumberOfRecoveryPoints,CreationDate:CreationDate}' \
    --output table 2>/dev/null || echo "Vault not found: $VAULT_NAME"

echo ""

# Check secret replication (prod only)
if [ "$ENV_NAME" == "prod" ]; then
    echo "=== Secret Replication Status ==="
    SECRET_NAME="${ENV_NAME}/submit/user-sub-hash-salt"
    aws secretsmanager describe-secret \
        --secret-id "$SECRET_NAME" \
        --region "$REGION" \
        --query '{Name:Name,ReplicationStatus:ReplicationStatus}' \
        --output table 2>/dev/null || echo "Secret not found: $SECRET_NAME"
fi

echo ""
echo "=== Verification Complete ==="
```

---

## Recovery Procedures

### Scenario 1: Accidental Data Deletion (DynamoDB)

**Using PITR** (within 35 days):

```bash
# 1. Find the restore point
aws dynamodb describe-continuous-backups \
    --table-name prod-submit-receipts \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription'

# 2. Restore to a new table
aws dynamodb restore-table-to-point-in-time \
    --source-table-name prod-submit-receipts \
    --target-table-name prod-submit-receipts-restored \
    --restore-date-time "2026-01-08T12:00:00Z"

# 3. Verify data, then swap tables (application update required)
```

### Scenario 2: Region Failure

**Using Cross-Region Backups**:

```bash
# 1. List recovery points in DR vault
aws backup list-recovery-points-by-backup-vault \
    --backup-vault-name prod-submit-dr-vault \
    --region eu-west-1

# 2. Start restore job
aws backup start-restore-job \
    --recovery-point-arn "arn:aws:backup:eu-west-1:ACCOUNT:recovery-point:ID" \
    --iam-role-arn "arn:aws:iam::ACCOUNT:role/prod-submit-backup-role" \
    --metadata '{"targetTableName":"prod-submit-receipts"}' \
    --region eu-west-1
```

### Scenario 3: Salt Secret Corruption

**Using Multi-Region Replica**:

```bash
# 1. Check replica status
aws secretsmanager describe-secret \
    --secret-id "prod/submit/user-sub-hash-salt" \
    --query 'ReplicationStatus'

# 2. If primary is corrupted, promote replica
aws secretsmanager stop-replication-to-replica \
    --secret-id "prod/submit/user-sub-hash-salt" \
    --region eu-west-1
```

---

## Cost Estimate

| Resource | Monthly Cost (estimate) |
|----------|------------------------|
| DynamoDB PITR (3 tables) | ~$0.20/GB stored |
| AWS Backup (daily, 35-day retention) | ~$0.05/GB |
| Cross-region data transfer | ~$0.02/GB |
| Secrets Manager replica | ~$0.40/secret |
| **Total (assuming 1GB data)** | **~$5-10/month** |

---

## Compliance Mapping

| HMRC Requirement | Solution |
|-----------------|----------|
| 7-year VAT record retention | Monthly backups with 7-year retention |
| Data integrity | PITR enables point-in-time recovery |
| Business continuity | Cross-region backups in eu-west-1 |
| Audit trail | AWS Backup job history |

---

## Implementation Checklist

### Phase 1: Enable PITR (Quick Win)

- [ ] Update DataStack.java to enable PITR on receiptsTable
- [ ] Update DataStack.java to enable PITR on bundlesTable
- [ ] Update DataStack.java to enable PITR on hmrcApiRequestsTable
- [ ] Update DataStack.java to use RETAIN removal policy for prod
- [ ] Deploy to CI environment
- [ ] Verify PITR status via AWS console
- [ ] Deploy to prod environment

### Phase 2: AWS Backup Integration

- [ ] Create DR vault in eu-west-1 (manual one-time)
- [ ] Create BackupStack.java
- [ ] Update SubmitSharedNames.java with backup-related names
- [ ] Update SubmitApplication.java to include BackupStack
- [ ] Add backup configuration to deploy.yml
- [ ] Deploy to CI environment
- [ ] Verify backup jobs execute
- [ ] Deploy to prod environment

### Phase 3: Secret Replication

- [ ] Update deploy-environment.yml to add secret replication
- [ ] Verify replication status in AWS console
- [ ] Document recovery procedure

### Phase 4: Verification & Documentation

- [ ] Create verify-backups.sh script
- [ ] Add backup verification to CI pipeline
- [ ] Document recovery procedures
- [ ] Conduct DR drill (restore from backup)
