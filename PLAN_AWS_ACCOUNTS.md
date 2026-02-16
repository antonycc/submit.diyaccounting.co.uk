# DIY Accounting Submit - AWS Account Overview

**Version**: 4.0 | **Date**: February 2026 | **Status**: Production

---

## Account Structure

```
AWS Organization Root
└── submit-management (Organization Admin)
    ├── submit-backup ─────── Backup OU
    ├── submit-ci ──────────── Workloads OU (planned — future)
    ├── diy-gateway ─────────── Workloads OU (planned — Phase 3)
    ├── diy-spreadsheets ────── Workloads OU (planned — Phase 3)
    └── submit-prod (887764105431) ── Workloads OU
```

**Current state**: All services (submit, gateway, spreadsheets, root DNS) run in submit-prod. Four GitHub repos will deploy here after Phase 2 repo separation (see `PLAN_PRODUCTION_AND_SEPARATION.md` v4.0). Gateway and spreadsheets are static sites (S3 + CloudFront only). Submit has the full application stack (Lambda, API Gateway, Cognito, DynamoDB). Root manages DNS and the holding page.

**Phasing**: Repos separate first (Phase 2), accounts separate later (Phase 3). During Phase 2, all four repos deploy to submit-prod via shared OIDC trust.

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

### Services Hosted

All four logical services currently run in this account (deployed from a single repo today, from four repos after Phase 2):

| Service | CI Domain | Prod Domain | Stacks | Repo (after Phase 2) |
|---------|-----------|-------------|--------|---------------------|
| Submit | `ci-submit.diyaccounting.co.uk` | `prod-submit.diyaccounting.co.uk` + `submit.diyaccounting.co.uk` | ApiStack, AuthStack, EdgeStack, HmrcStack, AccountStack, OpsStack, DevStack, SelfDestructStack | submit |
| Gateway | `ci-gateway.diyaccounting.co.uk` | `prod-gateway.diyaccounting.co.uk` + `diyaccounting.co.uk` + `www.diyaccounting.co.uk` | GatewayStack | gateway |
| Spreadsheets | `ci-spreadsheets.diyaccounting.co.uk` | `prod-spreadsheets.diyaccounting.co.uk` + `spreadsheets.diyaccounting.co.uk` | SpreadsheetsStack | spreadsheets |
| Root DNS | — | — | RootDnsStack, holding page stack | root |

Supporting domains (submit only):

| Purpose | CI Domain | Prod Domain |
|---------|-----------|-------------|
| Cognito auth | `ci-auth.diyaccounting.co.uk` | `prod-auth.diyaccounting.co.uk` |
| Holding page | `ci-holding.diyaccounting.co.uk` | `prod-holding.diyaccounting.co.uk` |
| HMRC simulator | `ci-simulator.diyaccounting.co.uk` | `prod-simulator.diyaccounting.co.uk` |
| Deployment | `{deployment}.submit.diyaccounting.co.uk` | `{deployment}.submit.diyaccounting.co.uk` |

### Compute Resources

| Resource | Description |
|----------|-------------|
| Lambda functions | Submit Lambdas (hmrcVatReturnPost, customAuthorizer, etc.) |
| API Gateway HTTP API | Submit API with regional custom domains per deployment |

### Data Resources

| Resource | Description |
|----------|-------------|
| DynamoDB tables | prod-submit-tokens, prod-submit-bundles, etc. |
| Secrets Manager | HMRC credentials, OAuth secrets |

### Web Resources

| Resource | Description |
|----------|-------------|
| CloudFront (submit) | CDN for submit app, EdgeStack ORP forwards `CloudFront-Viewer-Address` to API GW |
| CloudFront (gateway) | CDN for gateway static site with CloudFront Function redirects |
| CloudFront (spreadsheets) | CDN for spreadsheets static site with S3 package hosting |
| S3 | Static website assets for all three services |
| Route 53 | DNS (`diyaccounting.co.uk` zone — parent domain for all services) |
| ACM (us-east-1) | Main cert (submit CloudFront), auth cert (Cognito), simulator cert |
| ACM (eu-west-2) | Regional cert (API Gateway custom domains) |

**Note**: Route 53 hosted zone for `diyaccounting.co.uk` stays in this account. All services use the `{env}-{service}.diyaccounting.co.uk` domain convention. After Phase 2, RootDnsStack is deployed from the root repo (not submit) but still targets this account. Future consideration: move the zone to a management account.

### Security Resources

| Resource | Description |
|----------|-------------|
| Cognito | User authentication at `{env}-auth.diyaccounting.co.uk` |
| WAF | Web application firewall |
| KMS (salt encryption) | Encrypts salt backup in DynamoDB (DataStack). **Must move to submit-backup during account separation.** |

### Backup Resources

| Resource | Description |
|----------|-------------|
| AWS Backup (local vault) | 35-day retention, copies to backup account |

### Deployment Resources

| Resource | Description |
|----------|-------------|
| GitHub OIDC provider | For GitHub Actions |
| github-actions-role | OIDC assumption — trusts all 4 repos after Phase 2 |
| github-deploy-role | CDK deployments |
| CDK bootstrap | CloudFormation deployment bucket |
| Resource lookups | `.github/actions/lookup-resources` discovers Cognito/API GW/CloudFront by domain convention |

**OIDC trust (Phase 2 intermediate state)**: After repo separation, the `submit-github-actions-role` trust policy allows assumptions from four repos:
```
repo:antonycc/submit.diyaccounting.co.uk:*
repo:antonycc/www.diyaccounting.co.uk:*
repo:antonycc/diy-accounting:*
repo:antonycc/<root-repo-name>:*
```
In Phase 3, gateway and spreadsheets entries move to their own accounts.

---

## 3. submit-ci (Planned Account — Future)

**Purpose**: CI/CD testing — feature branch deployments. Currently runs in submit-prod alongside production. Lower priority than repo separation (Phase 2) and static site account separation (Phase 3) — this is the most complex separation because it requires duplicating environment stacks, secrets, and Cognito pools.

### Services (same as prod, CI environment)

| Service | CI Domain |
|---------|-----------|
| Submit | `ci-submit.diyaccounting.co.uk` |
| Gateway | `ci-gateway.diyaccounting.co.uk` |
| Spreadsheets | `ci-spreadsheets.diyaccounting.co.uk` |

### Compute Resources

| Resource | Description |
|----------|-------------|
| Lambda functions | CI versions of all submit Lambdas |
| API Gateway HTTP API | CI API with regional custom domains per deployment |

### Data Resources

| Resource | Description |
|----------|-------------|
| DynamoDB tables | ci-submit-tokens, ci-submit-bundles, etc. (test data) |
| Secrets Manager | Test/sandbox HMRC credentials |

### Web Resources

| Resource | Description |
|----------|-------------|
| CloudFront (submit) | CI CDN for submit app |
| CloudFront (gateway) | CI CDN for gateway static site |
| CloudFront (spreadsheets) | CI CDN for spreadsheets static site |
| S3 | CI static assets for all three services |

### Security Resources

| Resource | Description |
|----------|-------------|
| Cognito | CI user pool at `ci-auth.diyaccounting.co.uk` |

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
- Feature branch deployments create per-deployment stacks (`{deployment}-app-*`)

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

### Planned Resources (Account Separation)

| Resource | Description |
|----------|-------------|
| KMS key (salt encryption) | Moved from submit-prod DataStack. Encrypts salt backup in DynamoDB. |

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

### Current state (single repo)

```
GitHub Actions (submit.diyaccounting.co.uk repo)
        │
        ▼ OIDC
┌───────────────────────────────────────────────────────┐
│    submit-prod (887764105431)                          │
│                                                        │
│  deploy-environment.yml → {env}-env-* stacks          │
│  deploy.yml → {deployment}-app-* stacks               │
│  deploy-gateway.yml → {env}-gateway-GatewayStack      │
│  deploy-spreadsheets.yml → {env}-spreadsheets-*Stack  │
│  deploy-root.yml → {env}-env-RootDnsStack             │
│  deploy-holding.yml → {env}-holding stack             │
└───────────────────────────────────────────────────────┘
```

### After Phase 2 (four repos, same account)

```
┌──────────────────┐  ┌──────────────────┐
│  root repo       │  │  gateway repo    │
│  deploy.yml      │  │  deploy.yml      │
│  (DNS + holding) │  │  (static site)   │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
┌──────────────────┐  ┌──────────────────┐
│  spreadsheets    │  │  submit repo     │
│  repo deploy.yml │  │  deploy.yml +    │
│  (static site)   │  │  deploy-env.yml  │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         └──────┬──────┬───────┘
                │ OIDC │
                ▼      ▼
┌───────────────────────────────────────────────────────┐
│    submit-prod (887764105431)                          │
│                                                        │
│  root repo → RootDnsStack, holding stack              │
│  gateway repo → GatewayStack                          │
│  spreadsheets repo → SpreadsheetsStack                │
│  submit repo → env stacks + app stacks                │
│                                                        │
│  Shared: OIDC provider, github-actions-role trusts    │
│  all 4 repos. Same deployment-role for all.           │
└───────────────────────────────────────────────────────┘
```

### After Phase 3 (four repos, separate accounts)

```
root + submit repos ──OIDC──► submit-prod (DNS, submit app, holding)
gateway repo ─────────OIDC──► diy-gateway (S3 + CloudFront only)
spreadsheets repo ────OIDC──► diy-spreadsheets (S3 + CloudFront only)
```

**Note**: Both CI and prod currently deploy to the same AWS account (submit-prod, 887764105431). Account separation is Phase 3, after repo separation (Phase 2). See `PLAN_PRODUCTION_AND_SEPARATION.md` for full phasing.

---

## IAM Role Structure

### Current State (Single Account)

All roles live in submit-prod (887764105431). All four services (submit, gateway, spreadsheets, root) deploy here. After Phase 2 repo separation, four repos share this OIDC trust:

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
| submit-prod | Current costs | Lambda, DynamoDB, CloudFront (x3 services), API Gateway, Cognito |
| submit-ci | ~30-50% of prod | Same services, less traffic, smaller capacity |
| diy-gateway | ~$1-5/month | S3, CloudFront only (static site) |
| diy-spreadsheets | ~$1-10/month | S3, CloudFront only (static site + package zips) |
| submit-backup | ~$5-20/month | S3 storage for backup copies |

---

## Account Reference Table

| Account | ID | Email | OU | Purpose | Phase |
|---------|-----|-------|-----|---------|-------|
| submit-prod | 887764105431 | (existing) | Workloads | All services (submit + root DNS + gateway + spreadsheets) | Current |
| diy-gateway | TBD | aws-gateway@diyaccounting.co.uk | Workloads | Gateway static site (S3 + CloudFront) | Phase 3 |
| diy-spreadsheets | TBD | aws-spreadsheets@diyaccounting.co.uk | Workloads | Spreadsheets static site (S3 + CloudFront) | Phase 3 |
| submit-management | TBD | aws-management@diyaccounting.co.uk | Root | Org admin (Route53 zone, future) | Future |
| submit-ci | TBD | aws-ci@diyaccounting.co.uk | Workloads | CI/CD (submit only) | Future |
| submit-backup | TBD | aws-backup@diyaccounting.co.uk | Backup | DR | Future |

*Update this table with actual account IDs after creation.*

### Repository ↔ Account mapping progression

| Phase | root repo | gateway repo | spreadsheets repo | submit repo |
|-------|-----------|-------------|-------------------|-------------|
| Current | N/A (in submit) | N/A (in submit) | N/A (in submit) | submit-prod |
| Phase 2 (repos) | submit-prod | submit-prod | submit-prod | submit-prod |
| Phase 3 (accounts) | submit-prod | diy-gateway | diy-spreadsheets | submit-prod |
| Future | submit-management | diy-gateway | diy-spreadsheets | submit-prod |

---

## Domain Convention

All services follow the `{env}-{service}.diyaccounting.co.uk` naming pattern:

```
diyaccounting.co.uk                          (Route53 hosted zone)
├── {env}-submit.diyaccounting.co.uk         (submit apex — CloudFront)
├── {deployment}.submit.diyaccounting.co.uk  (submit deployment — CloudFront + API GW custom domain)
├── {env}-auth.diyaccounting.co.uk           (Cognito custom domain)
├── {env}-holding.diyaccounting.co.uk        (holding page — CloudFront)
├── {env}-simulator.diyaccounting.co.uk      (HMRC simulator — CloudFront)
├── {env}-gateway.diyaccounting.co.uk        (gateway — CloudFront)
└── {env}-spreadsheets.diyaccounting.co.uk   (spreadsheets — CloudFront)
```

Resource discovery uses this convention: the `lookup-resources` composite action finds Cognito User Pools via `describe-user-pool-domain`, API Gateway via `get-api-mappings` on the custom domain, and CloudFront via the `OriginFor` resource tag.

---

## Security Benefits

| Risk | Single Account | Multi-Account |
|------|---------------|---------------|
| CI deployment breaks prod | High | Eliminated |
| Ransomware destroys backups | High | Mitigated |
| Accidental data exposure | Medium | Reduced |
| Service limit exhaustion | Medium | Eliminated |
| Cost overrun visibility | Medium | Clear |
| Gateway/spreadsheets blast radius | Medium | Eliminated (own accounts) |

---

*Updated: February 2026 (v4.0 — aligned with 4-repo direction, repos-before-accounts phasing)*
