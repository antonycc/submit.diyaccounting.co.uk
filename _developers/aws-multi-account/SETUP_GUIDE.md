# AWS Multi-Account Setup Guide

This guide walks through setting up the DIY Accounting Submit multi-account AWS Organization structure.

## Prerequisites

- AWS CLI v2 installed and configured
- Access to create new AWS accounts
- Root email addresses for each new account
- MFA device ready for security setup

## Architecture Overview

```
AWS Organization Root
└── submit-management (Organization management)
    ├── submit-backup (Cross-account backup vault)
    ├── submit-ci (CI/CD deployments)
    └── submit-prod (Production - existing 887764105431)
```

## Phase 1: Create Organization Management Account

### Step 1.1: Create New AWS Account

1. Go to https://portal.aws.amazon.com/billing/signup
2. Create account with email: `aws-management@diyaccounting.co.uk` (or your preferred email)
3. Account name: `submit-management`
4. Complete verification and billing setup
5. **Important**: Enable MFA on root user immediately

### Step 1.2: Enable AWS Organizations

1. Sign into submit-management account
2. Go to **AWS Organizations** > **Create organization**
3. Select **Enable all features** (recommended)
4. Verify the organization was created:
   ```bash
   aws organizations describe-organization
   ```

### Step 1.3: Create Organizational Units

1. In AWS Organizations console, go to **AWS accounts**
2. Click **Root** > **Actions** > **Create new**
3. Create OU: `Workloads`
4. Create OU: `Backup`

Verify structure:
```bash
aws organizations list-roots
aws organizations list-organizational-units-for-parent --parent-id r-XXXX
```

## Phase 2: Invite Existing Production Account

### Step 2.1: Send Invitation

From submit-management account:

```bash
aws organizations invite-account-to-organization \
  --target Id=887764105431,Type=ACCOUNT \
  --notes "Joining DIY Accounting AWS Organization as production account"
```

### Step 2.2: Accept Invitation

1. Sign into the production account (887764105431)
2. Go to **AWS Organizations**
3. Accept the invitation
4. Verify membership:
   ```bash
   aws organizations list-accounts
   ```

### Step 2.3: Move to Workloads OU

```bash
# Get the OU ID for Workloads
aws organizations list-organizational-units-for-parent --parent-id r-XXXX

# Move the account (replace ou-XXXX with actual OU ID)
aws organizations move-account \
  --account-id 887764105431 \
  --source-parent-id r-XXXX \
  --destination-parent-id ou-XXXX-workloads
```

## Phase 3: Create Member Accounts

### Step 3.1: Create Backup Account

```bash
aws organizations create-account \
  --email aws-backup@diyaccounting.co.uk \
  --account-name submit-backup \
  --iam-user-access-to-billing DENY

# Check creation status
aws organizations describe-create-account-status --create-account-request-id car-XXXXX
```

Wait for status to become `SUCCEEDED`, then move to Backup OU:

```bash
# Get new account ID
aws organizations list-accounts | grep submit-backup

# Move to Backup OU
aws organizations move-account \
  --account-id NEW_BACKUP_ACCOUNT_ID \
  --source-parent-id r-XXXX \
  --destination-parent-id ou-XXXX-backup
```

### Step 3.2: Create CI Account

```bash
aws organizations create-account \
  --email aws-ci@diyaccounting.co.uk \
  --account-name submit-ci \
  --iam-user-access-to-billing DENY

# Wait for creation, then move to Workloads OU
aws organizations move-account \
  --account-id NEW_CI_ACCOUNT_ID \
  --source-parent-id r-XXXX \
  --destination-parent-id ou-XXXX-workloads
```

### Step 3.3: Verify Final Structure

```bash
aws organizations list-accounts-for-parent --parent-id ou-XXXX-workloads
aws organizations list-accounts-for-parent --parent-id ou-XXXX-backup
```

Expected output:
- Workloads OU: submit-ci, submit-prod (887764105431)
- Backup OU: submit-backup

## Phase 4: Enable IAM Identity Center

See [IAM_IDENTITY_CENTER.md](./IAM_IDENTITY_CENTER.md) for detailed SSO setup.

### Quick Setup Summary

1. Go to **IAM Identity Center** in management account
2. **Enable** IAM Identity Center (eu-west-2 region)
3. Create **Permission sets**:
   - AdministratorAccess
   - PowerUserAccess
   - ReadOnlyAccess
4. Create **User**: antony@diyaccounting.co.uk
5. Assign permission sets to all accounts

## Phase 5: Configure GitHub OIDC Roles

Run the setup scripts in each workload account:

```bash
# For CI account
./infra/aws-accounts/setup-oidc-roles.sh submit-ci CI_ACCOUNT_ID

# For Production account
./infra/aws-accounts/setup-oidc-roles.sh submit-prod 887764105431
```

See individual script documentation for details.

## Phase 6: Bootstrap CDK

```bash
# Bootstrap each account with cross-account trust
./infra/aws-accounts/bootstrap-cdk.sh
```

## Verification Checklist

- [ ] Organization created with all features enabled
- [ ] All 4 accounts exist and are in correct OUs
- [ ] IAM Identity Center enabled with user created
- [ ] Can SSO login to all accounts
- [ ] GitHub OIDC provider created in CI and Prod
- [ ] GitHub Actions role can be assumed
- [ ] CDK bootstrapped in all accounts

## Account Reference

| Account | ID | Email | OU |
|---------|-----|-------|-----|
| submit-management | TBD | aws-management@diyaccounting.co.uk | Root |
| submit-prod | 887764105431 | (existing) | Workloads |
| submit-ci | TBD | aws-ci@diyaccounting.co.uk | Workloads |
| submit-backup | TBD | aws-backup@diyaccounting.co.uk | Backup |

Update this table with actual account IDs after creation.

## Next Steps

1. Configure cross-account backup - see [MIGRATION_RUNBOOK.md](./MIGRATION_RUNBOOK.md)
2. Update GitHub workflows - see Phase 4 in main plan
3. Test deployment pipeline end-to-end
