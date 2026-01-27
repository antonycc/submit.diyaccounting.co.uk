# DIY Accounting Submit - AWS Account Overview

**Version**: 2.0 | **Date**: January 2026 | **Status**: Production

---

## Account Structure

```
AWS Organization Root
└── submit-management (Organization Admin)
    ├── submit-backup ─────── Backup OU
    ├── submit-ci ──────────── Workloads OU
    └── submit-prod (887764105431) ── Workloads OU
```

---

## 1. submit-management (New Account)

**Purpose**: Organization administration only - no workloads

### Resources

| Resource | Description |
|----------|-------------|
| AWS Organizations | Organization root, OUs, SCPs |
| IAM Identity Center | SSO users, permission sets, account assignments |
| CloudTrail (org-wide) | Aggregated audit logs |
| Billing | Consolidated billing for all accounts |

### What's NOT Here

- No Lambda functions
- No DynamoDB tables
- No CloudFront distributions
- No application code

---

## 2. submit-prod (887764105431)

**Purpose**: Production workloads - your live application

### Compute Resources

| Resource | Description |
|----------|-------------|
| Lambda functions | All production Lambdas (hmrcVatReturnPost, customAuthorizer, etc.) |
| API Gateway | Production API endpoints |

### Data Resources

| Resource | Description |
|----------|-------------|
| DynamoDB tables | prod-submit-tokens, prod-submit-bundles, etc. |
| Secrets Manager | HMRC credentials, OAuth secrets |

### Web Resources

| Resource | Description |
|----------|-------------|
| CloudFront | Production CDN distribution |
| S3 | Static website assets |
| Route 53 | DNS (diyaccounting.co.uk zone - parent domain) |
| ACM | SSL certificates |

**Note**: Route 53 hosted zone for `diyaccounting.co.uk` stays in this account. The `submit.diyaccounting.co.uk` subdomain records can be delegated to management account if desired.

### Security Resources

| Resource | Description |
|----------|-------------|
| Cognito | User authentication |
| WAF | Web application firewall |

### Backup Resources

| Resource | Description |
|----------|-------------|
| AWS Backup (local vault) | 35-day retention, copies to backup account |

### Deployment Resources

| Resource | Description |
|----------|-------------|
| GitHub OIDC provider | For GitHub Actions |
| github-actions-role | OIDC assumption |
| github-deploy-role | CDK deployments |
| CDK bootstrap | CloudFormation deployment bucket |

---

## 3. submit-ci (New Account)

**Purpose**: CI/CD testing - feature branch deployments

### Compute Resources

| Resource | Description |
|----------|-------------|
| Lambda functions | CI versions of all Lambdas |
| API Gateway | CI API endpoints |

### Data Resources

| Resource | Description |
|----------|-------------|
| DynamoDB tables | ci-submit-tokens, ci-submit-bundles, etc. (test data) |
| Secrets Manager | Test/sandbox HMRC credentials |

### Web Resources

| Resource | Description |
|----------|-------------|
| CloudFront | CI CDN distribution |
| S3 | CI static assets |

### Security Resources

| Resource | Description |
|----------|-------------|
| Cognito | CI user pool (test accounts) |

### Backup Resources

| Resource | Description |
|----------|-------------|
| AWS Backup (local vault) | Shorter retention, optional cross-account copy |

### Deployment Resources

| Resource | Description |
|----------|-------------|
| GitHub OIDC provider | For GitHub Actions |
| github-actions-role | OIDC assumption |
| github-deploy-role | CDK deployments |
| CDK bootstrap | CloudFormation deployment bucket |

### Key Differences from Production

- Uses HMRC sandbox APIs
- Test data only, no real user PII
- Shorter backup retention

---

## 4. submit-backup (New Account)

**Purpose**: Isolated backup storage - ransomware protection

### Backup Resources

| Resource | Description |
|----------|-------------|
| submit-cross-account-vault | Receives copies from prod and ci |
| Backup retention policies | 90-day retention (longer than source) |

### Audit Resources

| Resource | Description |
|----------|-------------|
| CloudTrail | Backup account audit logs |

### IAM Resources

| Resource | Description |
|----------|-------------|
| Vault access policy | Allows prod/ci to copy in |

### What's NOT Here

- No application code
- No direct user access
- Receive-only (no outbound data)

---

## Data Flow

```
┌─────────────────┐     ┌─────────────────┐
│   submit-ci     │     │  submit-prod    │
│                 │     │                 │
│  CI DynamoDB    │     │ Prod DynamoDB   │
│       │         │     │       │         │
│  Local Backup   │     │  Local Backup   │
│       │         │     │       │         │
└───────┼─────────┘     └───────┼─────────┘
        │                       │
        │   Cross-Account Copy  │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │    submit-backup      │
        │                       │
        │  Cross-Account Vault  │
        │  (90-day retention)   │
        └───────────────────────┘
```

---

## Deployment Flow

```
GitHub Actions (feature branch)
        │
        ▼ OIDC
┌───────────────────┐
│    submit-ci      │  ◄── Feature branches deploy here
└───────────────────┘

GitHub Actions (main branch)
        │
        ▼ OIDC
┌───────────────────┐
│   submit-prod     │  ◄── Main branch deploys here
└───────────────────┘
```

---

## IAM Role Structure

### Current State (Single Account)

All roles live in submit-prod (887764105431):

```
┌─────────────────────────────────────────────────────────────────────┐
│  submit-prod (887764105431)                                         │
│                                                                     │
│  GitHub Actions OIDC Provider                                       │
│         │                                                           │
│         ▼                                                           │
│  submit-github-actions-role  ◄── GitHub Actions assumes via OIDC   │
│         │                                                           │
│         ▼ (role chaining)                                           │
│  submit-deployment-role  ◄── CDK deploys, CloudFormation executes  │
│                                                                     │
│  Local Developer                                                    │
│         │                                                           │
│         ▼ (sts:AssumeRole)                                          │
│  submit-deployment-role  ◄── scripts/aws-assume-submit-deployment-role.sh │
└─────────────────────────────────────────────────────────────────────┘
```

**Local assume role scripts:**
- `scripts/aws-assume-submit-deployment-role.sh` - Direct assumption of deployment role
- `scripts/aws-assume-user-provisioning-role.sh` - External user provisioning (different account)

### Target State (Multi-Account)

Bastion pattern with role chaining across accounts:

```
┌─────────────────────────────────────────────────────────────────────┐
│  submit-management (Organization Admin)                             │
│                                                                     │
│  GitHub Actions OIDC Provider                                       │
│         │                                                           │
│         ▼                                                           │
│  submit-github-actions-role  ◄── GitHub Actions assumes via OIDC   │
│         │                                                           │
│  Local Developer (IAM User or SSO)                                  │
│         │                                                           │
│         ▼                                                           │
│  submit-bastion-role  ◄── "Jump" role for cross-account access     │
│         │                                                           │
└─────────┼───────────────────────────────────────────────────────────┘
          │
          │ (sts:AssumeRole - cross-account)
          │
          ├──────────────────────────────────┐
          │                                  │
          ▼                                  ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│  submit-ci              │    │  submit-prod            │
│                         │    │                         │
│  submit-deployment-role │    │  submit-deployment-role │
│  (trust: bastion-role,  │    │  (trust: bastion-role,  │
│   actions-role)         │    │   actions-role)         │
└─────────────────────────┘    └─────────────────────────┘
```

**Planned assume role scripts:**
```bash
# Step 1: Assume bastion role in management account
. ./scripts/aws-assume-bastion-role.sh

# Step 2: Assume deployment role in target account
. ./scripts/aws-assume-deployment-role.sh ci    # or 'prod'
```

### Role Trust Policies

**submit-bastion-role** (in submit-management):
```json
{
  "Principal": {
    "AWS": [
      "arn:aws:iam::MANAGEMENT_ACCOUNT:user/developer",
      "arn:aws:iam::MANAGEMENT_ACCOUNT:role/github-actions-role"
    ],
    "Federated": "arn:aws:iam::MANAGEMENT_ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
  }
}
```

**submit-deployment-role** (in each workload account):
```json
{
  "Principal": {
    "AWS": "arn:aws:iam::MANAGEMENT_ACCOUNT:role/submit-bastion-role"
  }
}
```

---

## Cost Attribution

| Account | Expected Cost | Main Drivers |
|---------|---------------|--------------|
| submit-management | ~$0-5/month | IAM Identity Center (free), minimal CloudTrail |
| submit-prod | Current costs | Lambda, DynamoDB, CloudFront, API Gateway |
| submit-ci | ~30-50% of prod | Same services, less traffic, smaller capacity |
| submit-backup | ~$5-20/month | S3 storage for backup copies |

---

## Account Reference Table

| Account | ID | Email | OU | Purpose |
|---------|-----|-------|-----|---------|
| submit-management | TBD | aws-management@diyaccounting.co.uk | Root | Org admin |
| submit-prod | 887764105431 | (existing) | Workloads | Production |
| submit-ci | TBD | aws-ci@diyaccounting.co.uk | Workloads | CI/CD |
| submit-backup | TBD | aws-backup@diyaccounting.co.uk | Backup | DR |

*Update this table with actual account IDs after creation.*

---

## Security Benefits

| Risk | Single Account | Multi-Account |
|------|---------------|---------------|
| CI deployment breaks prod | High | Eliminated |
| Ransomware destroys backups | High | Mitigated |
| Accidental data exposure | Medium | Reduced |
| Service limit exhaustion | Medium | Eliminated |
| Cost overrun visibility | Medium | Clear |

---

*Generated: January 2026*
