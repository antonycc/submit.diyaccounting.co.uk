# AWS Account & GitHub Repository Separation Plan

**Version**: 2.0 | **Date**: February 2026 | **Status**: In progress

---

## User Assertions (non-negotiable)

1. **Accounts before repos** — account separation happens first, while all code remains in this single repository. It is much easier to search-and-replace globally and synchronise changes in one repository and one commit.
2. **No oidc.antonycc.com** — references to oidc.antonycc.com have been removed from this repository. Each AWS account gets its own OIDC provider trusting GitHub's `token.actions.githubusercontent.com`, scoped to `repo:antonycc/submit.diyaccounting.co.uk:*`.
3. **Migration order**: gateway+spreadsheets accounts first (CI then prod), then submit CI to its own account, then submit prod to a NEW account (proving IaC repeatability), all from this repo. Then root → new repo. Then gateway and spreadsheets → their destination repos.
4. **Repository destinations**: `antonycc/www.diyaccounting.co.uk` for gateway (right name), `antonycc/diy-accounting` for spreadsheets (has existing users/discussions to preserve).
5. **Billing**: management account (887764105431) is the single place to look, but each account should display its own usage.
6. **Console access**: single set of credentials via IAM Identity Center (SSO), not separate IAM users per account.
7. **Backups**: submit-backups account receives copies from submit-ci and submit-prod. Restore testing by standing up a prod-replica in CI (including user sub hash salt).
8. **IaC repeatability** — 887764105431 becomes a clean management account. Submit prod is deployed fresh to a new account from IaC. Salt + backups + code = recovery from total loss. This proves disaster recovery while prod has negligible user data (2 sign-ups and family testers).

---

## Current State

Production is live:
- https://diyaccounting.co.uk/ (gateway)
- https://spreadsheets.diyaccounting.co.uk/
- https://submit.diyaccounting.co.uk/

Everything runs in 887764105431. All four logical services (root DNS, gateway, spreadsheets, submit) are deployed as CDK stacks from this single repository.

### Account structure (current)

```
887764105431 ── everything (submit, gateway, spreadsheets, root DNS)
```

### Account structure (target)

```
AWS Organization Root (887764105431) ── Management
├── gateway ─────────── Workloads OU (Phase 1.1)
├── spreadsheets ────── Workloads OU (Phase 1.2)
├── submit-ci ──────────── Workloads OU (Phase 1.3)
├── submit-prod ─────────── Workloads OU (Phase 1.4)
├── submit-backup ─────── Backup OU (Phase 3)
```

887764105431 retains only: AWS Organizations, IAM Identity Center, Route53 zone (`diyaccounting.co.uk`), consolidated billing, root DNS stack, holding page. No application workloads.

---

## Phase 1: Account separation (single repository)

**Goal**: Move every workload out of 887764105431 into purpose-built accounts while all code remains in this one repository. 887764105431 becomes a clean management account.

**Why accounts before repos**: A single commit can update workflows, CDK config, and environment files atomically. No cross-repo coordination, no version skew, no "deploy repo A before repo B" ordering. Repository separation is safer once each service already deploys to its final account — the repo split is then purely a code extraction with no infrastructure changes.

**Why migrate submit prod to a new account**: This proves the IaC is repeatable. If we can stand up submit prod from scratch in a fresh account using only code + backups + salt, then we have validated disaster recovery. Now is the ideal time — prod has negligible user data (2 sign-ups and family testers), so the cost of re-registration is near zero.

### 1.0: AWS Organization and IAM Identity Center

| Step | Description | Details |
|------|-------------|---------|
| 1.0.1 | Create AWS Organization | From 887764105431. This account becomes the permanent management account. |
| 1.0.2 | Create Organizational Units | `Workloads` OU (for gateway, spreadsheets, submit-ci, submit-prod), `Backup` OU (for submit-backup). |
| 1.0.3 | Enable IAM Identity Center | In 887764105431 (management account). This gives you a single SSO portal for all accounts. |
| 1.0.4 | Create SSO user | Create your identity in IAM Identity Center (or connect an external IdP later). |
| 1.0.5 | Create permission sets | `AdministratorAccess` (full access), `ReadOnlyAccess` (investigation), `DeploymentAccess` (CDK deploys — custom policy). |
| 1.0.6 | Assign permissions | Assign your SSO user + `AdministratorAccess` to 887764105431 and each account as they are created. |

### 1.1: Gateway account separation

Create the gateway account and move gateway stacks (CI first, then prod) from 887764105431 to gateway. All from this repository.

| Step | Description | Details |
|------|-------------|---------|
| 1.1.1 | Create `gateway` account | Via AWS Organizations. Email: `aws-gateway@diyaccounting.co.uk`. Place in Workloads OU. |
| 1.1.2 | Assign SSO access | Add your SSO user + `AdministratorAccess` to the gateway account. Verify console access via the portal. |
| 1.1.3 | CDK bootstrap | Bootstrap CDK in `us-east-1` and `eu-west-2` in the gateway account. |
| 1.1.4 | Create OIDC provider | Create GitHub Actions OIDC provider (`token.actions.githubusercontent.com`) in gateway. Trust policy: `repo:antonycc/submit.diyaccounting.co.uk:*`. |
| 1.1.5 | Create deployment roles | `gateway-github-actions-role` (OIDC assumption) and `gateway-deployment-role` (CDK deploys) in gateway. |
| 1.1.6 | Create ACM cert for gateway | In gateway `us-east-1`. SANs: `ci-gateway.diyaccounting.co.uk`, `prod-gateway.diyaccounting.co.uk`, `diyaccounting.co.uk`, `www.diyaccounting.co.uk`. DNS validation CNAMEs go in 887764105431's Route53 zone (manual one-time copy). |
| 1.1.7 | Add GitHub secrets | `GATEWAY_ACTIONS_ROLE_ARN`, `GATEWAY_DEPLOY_ROLE_ARN`, `GATEWAY_ACCOUNT_ID`, `GATEWAY_CERT_ARN` as repo secrets or in a `gateway` GitHub environment. |
| 1.1.8 | Update `deploy-gateway.yml` | Use the new role ARNs and account ID. The workflow still lives in this repo. |
| 1.1.9 | Update `cdk-gateway/cdk.json` | Point to the new account ID and cert ARN. |
| 1.1.10 | Deploy gateway CI to new account | Run `deploy-gateway.yml` with env=ci targeting gateway. Creates `ci-gateway-GatewayStack` in the new account. |
| 1.1.11 | Validate gateway CI | Run `npm run test:gatewayBehaviour-ci`. DNS still points to 887764105431's CloudFront at this point. |
| 1.1.12 | Update root DNS for gateway CI | Update `ci-gateway.diyaccounting.co.uk` alias record (via `deploy-root.yml`) to point to the new account's CloudFront. |
| 1.1.13 | Re-validate gateway CI | Confirm DNS resolves to the new CloudFront. Run behaviour tests again. |
| 1.1.14 | Deploy gateway prod to new account | Run `deploy-gateway.yml` with env=prod targeting gateway. |
| 1.1.15 | Update root DNS for gateway prod | Update `prod-gateway.diyaccounting.co.uk`, `diyaccounting.co.uk`, and `www.diyaccounting.co.uk` alias records to new account's prod CloudFront. |
| 1.1.16 | Validate gateway prod | Verify all prod domains serve correct content. Test redirects. |
| 1.1.17 | Tear down old gateway stacks | Delete `ci-gateway-GatewayStack` and `prod-gateway-GatewayStack` from 887764105431. |

### 1.2: Spreadsheets account separation

Same pattern as gateway. CI first, then prod.

| Step | Description | Details |
|------|-------------|---------|
| 1.2.1 | Create `spreadsheets` account | Via AWS Organizations. Email: `aws-spreadsheets@diyaccounting.co.uk`. Place in Workloads OU. |
| 1.2.2 | Assign SSO access | Add your SSO user + `AdministratorAccess`. |
| 1.2.3 | CDK bootstrap | Bootstrap CDK in `us-east-1` and `eu-west-2`. |
| 1.2.4 | Create OIDC provider | Trust: `repo:antonycc/submit.diyaccounting.co.uk:*`. |
| 1.2.5 | Create deployment roles | `spreadsheets-github-actions-role` and `spreadsheets-deployment-role`. |
| 1.2.6 | Create ACM cert | In spreadsheets `us-east-1`. SANs: `ci-spreadsheets.diyaccounting.co.uk`, `prod-spreadsheets.diyaccounting.co.uk`, `spreadsheets.diyaccounting.co.uk`. DNS validation via 887764105431 Route53. |
| 1.2.7 | Add GitHub secrets | `SPREADSHEETS_ACTIONS_ROLE_ARN`, `SPREADSHEETS_DEPLOY_ROLE_ARN`, `SPREADSHEETS_ACCOUNT_ID`, `SPREADSHEETS_CERT_ARN`. |
| 1.2.8 | Update `deploy-spreadsheets.yml` | Use new role ARNs and account ID. |
| 1.2.9 | Update `cdk-spreadsheets/cdk.json` | Point to new account and cert ARN. |
| 1.2.10 | Deploy spreadsheets CI | Run `deploy-spreadsheets.yml` with env=ci targeting spreadsheets. |
| 1.2.11 | Validate spreadsheets CI | Run `npm run test:spreadsheetsBehaviour-ci`. |
| 1.2.12 | Update root DNS for spreadsheets CI | Point `ci-spreadsheets.diyaccounting.co.uk` to new CloudFront. |
| 1.2.13 | Re-validate spreadsheets CI | Confirm DNS and run behaviour tests. |
| 1.2.14 | Deploy spreadsheets prod | Run `deploy-spreadsheets.yml` with env=prod. |
| 1.2.15 | Update root DNS for spreadsheets prod | Point `prod-spreadsheets.diyaccounting.co.uk` and `spreadsheets.diyaccounting.co.uk` to new CloudFront. |
| 1.2.16 | Validate spreadsheets prod | Verify content, package downloads, catalogue. |
| 1.2.17 | Tear down old spreadsheets stacks | Delete old stacks from 887764105431. |

### 1.3: Submit CI account separation

Move submit CI deployments into their own account.

| Step | Description | Details |
|------|-------------|---------|
| 1.3.1 | Create `submit-ci` account | Via AWS Organizations. Email: `aws-ci@diyaccounting.co.uk`. Place in Workloads OU. |
| 1.3.2 | Assign SSO access | Add your SSO user + `AdministratorAccess`. |
| 1.3.3 | CDK bootstrap | Bootstrap in `us-east-1` and `eu-west-2`. |
| 1.3.4 | Create OIDC provider | Trust: `repo:antonycc/submit.diyaccounting.co.uk:*`. |
| 1.3.5 | Create deployment roles | `submit-ci-github-actions-role` and `submit-ci-deployment-role`. |
| 1.3.6 | Create ACM certs for CI | Replicate the main cert, auth cert, simulator cert, and regional cert — all scoped to `ci-*` SANs only. DNS validation via 887764105431 Route53. |
| 1.3.7 | Replicate Secrets Manager entries | Copy HMRC sandbox credentials, Stripe test keys, Telegram bot token, etc. into submit-ci's Secrets Manager. Script this. |
| 1.3.8 | Add GitHub secrets | `CI_ACTIONS_ROLE_ARN`, `CI_DEPLOY_ROLE_ARN`, `CI_ACCOUNT_ID`, plus CI cert ARNs. |
| 1.3.9 | Update `deploy.yml` | Feature branches deploy to submit-ci account. Main branch still deploys to 887764105431 (until Phase 1.4). |
| 1.3.10 | Update `deploy-environment.yml` | CI environment stacks deploy to submit-ci. Prod environment stacks still deploy to 887764105431. |
| 1.3.11 | Update CDK context | Add account ID mapping in `cdk-application/cdk.json` and `cdk-environment/cdk.json`. |
| 1.3.12 | Deploy CI environment stacks | Deploy `ci-env-IdentityStack`, `ci-env-DataStack`, `ci-env-ObservabilityStack`, etc. to submit-ci. |
| 1.3.13 | Deploy CI application stacks | Deploy a CI feature branch to submit-ci. |
| 1.3.14 | Update root DNS for CI submit | Point `ci-submit.diyaccounting.co.uk`, `ci-auth.diyaccounting.co.uk`, `ci-simulator.diyaccounting.co.uk`, `ci-holding.diyaccounting.co.uk` to submit-ci's CloudFront distributions. |
| 1.3.15 | Validate CI | Run `npm run test:submitVatBehaviour-ci`. Test auth flow, HMRC simulator, payment flow. |
| 1.3.16 | Tear down old CI stacks | Delete all `ci-*` stacks from 887764105431 (environment stacks, app stacks, simulator, holding). |

### 1.4: Submit prod to new account (IaC repeatability proof)

Create a NEW submit-prod account and deploy the full production stack from IaC. Restore data from backups. This proves disaster recovery: salt + backups + code = full recovery.

**Pre-requisites**: Back up everything from 887764105431 before starting. The existing prod in 887764105431 stays live until the new account is validated and DNS is switched.

| Step | Description | Details |
|------|-------------|---------|
| | **Preparation** | |
| 1.4.1 | Back up prod data | Take on-demand DynamoDB backups of all prod tables in 887764105431. Export the salt (encrypted). Script: `scripts/backup-prod-for-migration.sh`. |
| 1.4.2 | Document secrets | Script to list all Secrets Manager secret names and their descriptions (NOT values) in 887764105431. Values will be re-entered or copied via CLI. Script: `scripts/list-prod-secrets.sh`. |
| 1.4.3 | Document ACM certs | Record all cert ARNs and their SANs. New certs will be created in the new account. |
| | **Account creation** | |
| 1.4.4 | Create `submit-prod` account | Via AWS Organizations. Email: `aws-prod@diyaccounting.co.uk`. Place in Workloads OU. |
| 1.4.5 | Assign SSO access | Add your SSO user + `AdministratorAccess`. |
| 1.4.6 | CDK bootstrap | Bootstrap in `us-east-1` and `eu-west-2`. |
| 1.4.7 | Create OIDC provider | Trust: `repo:antonycc/submit.diyaccounting.co.uk:*`. |
| 1.4.8 | Create deployment roles | `submit-github-actions-role` and `submit-deployment-role`. |
| | **Certificates** | |
| 1.4.9 | Create ACM certs | In new submit-prod account. Replicate all four cert sets (main, auth, simulator, regional) with prod SANs. DNS validation via 887764105431 Route53. |
| | **Secrets** | |
| 1.4.10 | Copy Secrets Manager entries | Script to copy HMRC prod credentials, Stripe live keys, Telegram bot token, OAuth secrets, etc. into new submit-prod. Script: `scripts/copy-secrets-to-account.sh`. |
| | **Deploy from IaC** | |
| 1.4.11 | Add GitHub secrets | `PROD_ACTIONS_ROLE_ARN`, `PROD_DEPLOY_ROLE_ARN`, `PROD_ACCOUNT_ID`, plus prod cert ARNs for the new account. |
| 1.4.12 | Update `deploy.yml` | Main branch deploys to the new submit-prod account (not 887764105431). |
| 1.4.13 | Update `deploy-environment.yml` | Prod environment stacks deploy to new submit-prod. |
| 1.4.14 | Update CDK context | Point prod account ID to the new account in `cdk-application/cdk.json` and `cdk-environment/cdk.json`. |
| 1.4.15 | Deploy prod environment stacks | Deploy `prod-env-IdentityStack`, `prod-env-DataStack`, `prod-env-ObservabilityStack`, etc. to new submit-prod. Fresh Cognito user pool, fresh DynamoDB tables. |
| 1.4.16 | Deploy prod application stacks | Deploy submit prod from main to new submit-prod. Fresh Lambda, API Gateway, CloudFront, S3. |
| | **Data restoration** | |
| 1.4.17 | Restore DynamoDB tables | Restore prod tables from backup into new submit-prod. Script: `scripts/restore-tables-from-backup.sh`. Tables: `prod-submit-tokens`, `prod-submit-bundles`, `prod-submit-hmrc-api-requests`, `prod-submit-receipts`. |
| 1.4.18 | Restore salt | Copy the encrypted salt into the new DataStack's DynamoDB table. Grant the new account's KMS key access or re-encrypt with the new key. Script: `scripts/restore-salt.sh`. |
| | **DNS cutover** | |
| 1.4.19 | Update root DNS for prod submit | Point `prod-submit.diyaccounting.co.uk` and `submit.diyaccounting.co.uk` to new account's CloudFront. Point `prod-auth.diyaccounting.co.uk` to new Cognito. Point `prod-simulator.diyaccounting.co.uk`, `prod-holding.diyaccounting.co.uk` to new CloudFront distributions. |
| 1.4.20 | Validate prod | Run `npm run test:submitVatBehaviour-prod`. Test auth flow (new Cognito — users re-register), HMRC submission, payment flow. Verify salt decrypts and user sub hashing works with restored data. |
| 1.4.21 | Notify users | Inform the 2 sign-ups + family testers that they need to re-register (new Cognito pool). |

### 1.5: Clean up 887764105431 (make it management-only)

| Step | Description | Details |
|------|-------------|---------|
| 1.5.1 | Tear down old prod stacks | Delete all `prod-*` application and environment stacks from 887764105431 (Lambda, API GW, Cognito, DynamoDB, CloudFront for submit). |
| 1.5.2 | Delete old ACM certs | Remove submit/auth/simulator/regional certs from 887764105431 (new certs are in the new submit-prod). |
| 1.5.3 | Delete old Secrets Manager entries | Remove HMRC, Stripe, Telegram, OAuth secrets (they've been copied to new submit-prod). |
| 1.5.4 | Remove old OIDC provider and roles | Delete `submit-github-actions-role` and `submit-deployment-role` from 887764105431 (GitHub Actions now deploys to other accounts). |
| 1.5.5 | Verify management-only state | 887764105431 should now contain ONLY: AWS Organizations, IAM Identity Center, Route53 zone, RootDnsStack, holding page stacks. No application workloads. |
| 1.5.6 | Update OIDC trust for root DNS | Create OIDC provider in 887764105431 for the root DNS/holding page deployments (trust: `repo:antonycc/submit.diyaccounting.co.uk:*`, later updated to root repo in Phase 2). |

### Cross-account DNS validation

All new accounts' ACM certs need DNS validation. The Route53 zone stays in 887764105431 (management account) — this is architecturally correct.

1. Request the cert in the new account
2. Copy the ACM DNS validation CNAME values
3. Create them in 887764105431's Route53 zone (via `deploy-root.yml` or manually)
4. ACM validates and issues the cert

One-time operation per cert. ACM certs are rarely recreated.

### OIDC trust

Each new account gets its own GitHub Actions OIDC provider pointing to `token.actions.githubusercontent.com`. The trust policy is scoped to `repo:antonycc/submit.diyaccounting.co.uk:*` — because during Phase 1, this is the only repo deploying anywhere. In Phase 2 (repo separation), OIDC trust policies are updated to trust each service's own repo.

### S3 bucket name migration

S3 bucket names are globally unique across all AWS accounts. All stacks had hardcoded bucket names (e.g., `ci-gateway-origin`), which collide when deploying the same stack to a new account while the old account still has the bucket.

**Fix applied (commit `1715f2bf`):** Removed `.bucketName()` from all 7 stacks. CDK auto-generates unique names per account. For EdgeStack, the cross-stack reference (PublishStack and SelfDestructStack looked up the bucket by name via `sharedNames`) was replaced with an explicit prop passed from SubmitApplication.

**Migration pattern for each phase:**
1. Old stacks in 887764105431 remain untouched (still have hardcoded names — deployed from `main`)
2. New stacks deploy fresh to the new account with CDK-generated names — no collision
3. Old stacks are torn down after validation and DNS cutover

**Safety rule:** Do not deploy the `accounts` branch to 887764105431. The bucket name removal would cause CloudFormation to replace existing buckets. Keep 887764105431 deployments on `main` until the relevant stacks are being torn down.

See `PLAN_AWS_CLICKS.md` → "S3 bucket rename impact" for the per-stack breakdown.

### Rollback strategy

- Keep old stacks in 887764105431 until new-account versions are validated
- DNS cutover is a single alias record update via `deploy-root.yml` — rollback is running the workflow again with the old CloudFront domain
- For submit prod: old prod stays live in 887764105431 until the new account is fully validated. DNS switch is the final step. Revert DNS to roll back.

### Scripts to create

| Script | Purpose |
|--------|---------|
| `scripts/backup-prod-for-migration.sh` | On-demand backup of all prod DynamoDB tables + export salt |
| `scripts/list-prod-secrets.sh` | List Secrets Manager secret names/descriptions (not values) |
| `scripts/copy-secrets-to-account.sh` | Copy secrets from one account to another via CLI |
| `scripts/restore-tables-from-backup.sh` | Restore DynamoDB tables from backup into target account |
| `scripts/restore-salt.sh` | Copy encrypted salt to new DataStack table, re-encrypt if needed |
| `scripts/bootstrap-account.sh` | CDK bootstrap + OIDC provider + deployment roles for a new account |

---

## Phase 2: Repository separation

**Goal**: Each service gets its own GitHub repository with independent CI/CD, versioning, and deployment pipelines. By this point, each service already deploys to its final AWS account. The repo split is purely a code extraction — no infrastructure changes.

**Prerequisite**: Phase 1 complete (accounts separated, all deployments stable from this repo).

**Order**: Root first (thinnest slice), then gateway, then spreadsheets, then submit cleanup.

### Target repositories

| Repository | GitHub URL | Content | Source |
|---|---|---|---|
| Root | TBD — new repo | Route53 zone, RootDnsStack, holding page | Created fresh from submit |
| Gateway | `antonycc/www.diyaccounting.co.uk` | Gateway static site, CloudFront Function redirects | Archive-and-overlay existing repo |
| Spreadsheets | `antonycc/diy-accounting` | Spreadsheets site, package hosting, knowledge base, community discussions | Archive-and-overlay existing repo |
| Submit | `antonycc/submit.diyaccounting.co.uk` | Submit application (Lambda, Cognito, DynamoDB, API GW) | This repo — remove migrated code |

**Repository naming — root repo (open decision)**:
1. `antonycc/diyaccounting-root` — descriptive, matches its purpose
2. `antonycc/diyaccounting-web` — "web" grouping name
3. `antonycc/diy-accounting-infrastructure` — explicit infrastructure focus
4. Decide at implementation time

**Note**: `antonycc/www.diyaccounting.co.uk` is being kept because it has the right name for gateway. `antonycc/diy-accounting` is being kept because it has existing users with posts in discussions that should be preserved.

### 2.1: Root → new repository

Root is the thinnest slice — just Route53 alias records and the holding page. Deploys to 887764105431 (management account).

| Step | Description |
|------|-------------|
| 2.1.1 | Create new GitHub repository for root |
| 2.1.2 | Set up minimal project: `pom.xml` (CDK infra module only), `package.json` (Playwright, Vitest, prettier, eslint, ncu) |
| 2.1.3 | Copy root-relevant files from submit repo (see "What goes in the root repo" below) |
| 2.1.4 | Adapt `deploy-root.yml` → `deploy.yml` (main workflow), keep `deploy-holding.yml` |
| 2.1.5 | Update OIDC trust in 887764105431: change to `repo:antonycc/<root-repo-name>:*` |
| 2.1.6 | Deploy from root repo. Verify DNS records resolve correctly. |
| 2.1.7 | Verify holding page deploys from root repo |
| 2.1.8 | Remove `deploy-root.yml`, `deploy-holding.yml`, `RootDnsStack`, `web/holding/` from submit repo |

### 2.2: Gateway → `antonycc/www.diyaccounting.co.uk`

Archive-and-overlay into the existing repo. Preserves repo settings, stars, and issue history.

| Step | Description |
|------|-------------|
| 2.2.1 | In existing repo: `mkdir archive && git mv` all current files into `archive/` |
| 2.2.2 | Copy relevant submit repo files into the repo root |
| 2.2.3 | Remove submit-specific and spreadsheets-specific code |
| 2.2.4 | Trim `package.json`, `pom.xml`, `CLAUDE.md` |
| 2.2.5 | Adapt `playwright.config.js` — keep only `gatewayBehaviour` project |
| 2.2.6 | Adapt deploy workflow — rename to `deploy.yml` |
| 2.2.7 | Fill gaps from `archive/` — pull back useful old assets |
| 2.2.8 | Update OIDC trust in gateway: change to `repo:antonycc/www.diyaccounting.co.uk:*` |
| 2.2.9 | Deploy from gateway repo. Run `test:gatewayBehaviour-ci`. Verify. |
| 2.2.10 | Remove `deploy-gateway.yml`, `GatewayStack`, `cdk-gateway/`, `web/www.diyaccounting.co.uk/` from submit repo |

### 2.3: Spreadsheets → `antonycc/diy-accounting`

Same archive-and-overlay pattern. Preserves GitHub Discussions.

| Step | Description |
|------|-------------|
| 2.3.1 | In existing repo: `mkdir archive && git mv` all current files into `archive/` |
| 2.3.2 | Copy relevant submit repo files into the repo root |
| 2.3.3 | Remove submit-specific and gateway-specific code |
| 2.3.4 | Trim `package.json`, `pom.xml`, `CLAUDE.md` |
| 2.3.5 | Adapt `playwright.config.js` — keep only `spreadsheetsBehaviour` project |
| 2.3.6 | Adapt deploy workflow |
| 2.3.7 | Fill gaps from `archive/` — old packages, README, build scripts |
| 2.3.8 | Update OIDC trust in spreadsheets: change to `repo:antonycc/diy-accounting:*` |
| 2.3.9 | Deploy from spreadsheets repo. Run `test:spreadsheetsBehaviour-ci`. Verify. |
| 2.3.10 | Remove `deploy-spreadsheets.yml`, `SpreadsheetsStack`, `cdk-spreadsheets/`, `web/spreadsheets.diyaccounting.co.uk/`, `packages/` from submit repo |

### 2.4: Submit repo cleanup

| Step | Description |
|------|-------------|
| 2.4.1 | Remove gateway and spreadsheets behaviour tests from submit |
| 2.4.2 | Clean up `package.json`, `pom.xml` — remove gateway/spreadsheets/root build references |
| 2.4.3 | Remove submit repo's OIDC trust from 887764105431 (only root repo deploys there now) |
| 2.4.4 | Verify submit deploys and tests still pass |

### What goes in the root repo

| Asset | Purpose |
|---|---|
| `RootDnsStack.java` | Route53 alias records for all services |
| Holding page stack | CloudFront + S3 for `{env}-holding.diyaccounting.co.uk` |
| `web/holding/` | Holding page content |
| `deploy.yml` (adapted from `deploy-root.yml`) | DNS deployment workflow |
| `deploy-holding.yml` | Holding/maintenance page workflow |
| `cdk-root/cdk.json` | CDK app configuration |
| Shared CDK lib | `SubmitSharedNames.java`, `KindCdk.java` (subset needed) |

**What root does NOT have**: Lambda, DynamoDB, Cognito, API Gateway, Docker, ngrok, HMRC anything.

**Cross-repo coordination**: All four repos depend on root for DNS. When a service changes its CloudFront distribution, root must update the alias records. This is the one cross-repo coordination point.

### What to remove from copied submit code

**From gateway repo**: `app/`, `web/public/`, `web/spreadsheets.diyaccounting.co.uk/`, `web/holding/`, `packages/`, `infra/.../` (all stacks except GatewayStack), `cdk-application/`, `cdk-environment/`, `cdk-spreadsheets/`, non-gateway behaviour tests, `scripts/build-packages.cjs`, `scripts/generate-knowledge-base-toml.cjs`, non-gateway workflows, `.env.test`, `.env.proxy`, Docker/ngrok/HMRC files.

**From spreadsheets repo**: `app/`, `web/public/`, `web/www.diyaccounting.co.uk/`, `web/holding/`, `infra/.../` (all stacks except SpreadsheetsStack), `cdk-application/`, `cdk-environment/`, `cdk-gateway/`, non-spreadsheets behaviour tests, `scripts/build-gateway-redirects.cjs`, non-spreadsheets workflows, `.env.test`, `.env.proxy`, Docker/ngrok/HMRC files.

---

## Phase 3: Backup strategy (submit-backups)

**Goal**: Ship backups from submit-ci and submit-prod into submit-backups. Validate restores by standing up a prod-replica in CI, including the user sub hash salt.

**When**: Can start alongside Phase 1 (account separation) — the backup account is independent.

### 3.1: Backup account setup

| Step | Description | Details |
|------|-------------|---------|
| 3.1.1 | Create `submit-backup` account | Via AWS Organizations. Email: `aws-backup@diyaccounting.co.uk`. Place in Backup OU. |
| 3.1.2 | Assign SSO access | `AdministratorAccess` for setup, then downgrade to a restricted policy. |
| 3.1.3 | Create cross-account vault | `submit-cross-account-vault` in submit-backup (eu-west-2). |
| 3.1.4 | Set vault access policy | Allow `submit-prod` and `submit-ci` to copy backups into the vault. |
| 3.1.5 | Create KMS key | For encrypting backup copies at rest in the backup account. |

### 3.2: Cross-account backup shipping

| Step | Description | Details |
|------|-------------|---------|
| 3.2.1 | Update BackupStack in this repo | Add cross-account copy rules to the existing backup plans. Daily backups copy to submit-backup. |
| 3.2.2 | Create IAM roles | In submit-prod and submit-ci: backup service role with `backup:CopyIntoBackupVault` permission for the backup account's vault. |
| 3.2.3 | Deploy updated BackupStack | To both CI and prod environments. |
| 3.2.4 | Verify backup shipping | Trigger a manual backup, wait for cross-account copy to complete. Check the vault in submit-backup. |

**What gets backed up**: DynamoDB tables (`{env}-submit-tokens`, `{env}-submit-bundles`, `{env}-submit-hmrc-api-requests`, `{env}-submit-receipts`). Existing schedules: Daily (35-day local), Weekly (90-day local), Monthly compliance (7 years for HMRC). Cross-account copies: Daily → submit-backup vault (90-day retention — longer than source).

### 3.3: Restore testing (prod-replica in CI)

Prove backups work by restoring production data into CI and verifying the application functions correctly — including the user sub hash salt.

| Step | Description | Details |
|------|-------------|---------|
| 3.3.1 | Copy prod backup to CI | From submit-backup vault, restore prod DynamoDB tables into submit-ci with target table names like `ci-submit-tokens-restored`. |
| 3.3.2 | Restore the salt | Copy encrypted salt from prod backup. Grant submit-ci `kms:Decrypt` on submit-prod's salt encryption key. |
| 3.3.3 | Swap tables | Point CI environment at the restored tables. |
| 3.3.4 | Run behaviour tests | `npm run test:submitVatBehaviour-ci` against the restored data. Verify salt decrypts correctly and user sub hashing works. |
| 3.3.5 | Clean up | Delete restored tables and revert CI config. |

### 3.4: Automated restore testing (future)

Monthly scheduled GitHub Actions workflow: copy prod backup → restore to CI → run tests → clean up → report.

---

## Reference: Per-account resource inventory

### 887764105431 (management account)

After Phase 1 completion, this account is management-only:

| Category | Resources |
|----------|-----------|
| Organization | AWS Organizations, OUs, IAM Identity Center, Consolidated Billing |
| DNS | Route 53 (`diyaccounting.co.uk` zone), RootDnsStack, holding page stacks |
| Deployment | GitHub OIDC provider (for root repo only), CDK bootstrap |
| NOT here | No Lambda, DynamoDB, Cognito, API Gateway, Secrets Manager, application CloudFront |

### submit-prod (NEW account)

| Category | Resources |
|----------|-----------|
| Compute | Lambda functions (submit), API Gateway HTTP API |
| Data | DynamoDB (prod-submit-tokens, prod-submit-bundles, etc.), Secrets Manager |
| Web | CloudFront (submit), S3 |
| Certs | ACM us-east-1 (main, auth, simulator), ACM eu-west-2 (regional API GW) |
| Security | Cognito, WAF, KMS (salt encryption) |
| Backup | AWS Backup local vault (35-day daily, 90-day weekly), copies to submit-backup |
| Deployment | GitHub OIDC provider, submit-github-actions-role, submit-deployment-role, CDK bootstrap |

### gateway

| Category | Resources |
|----------|-----------|
| Web | CloudFront (with CloudFront Function redirects), S3 |
| Certs | ACM us-east-1 (`ci-gateway`, `prod-gateway`, `diyaccounting.co.uk`, `www.diyaccounting.co.uk`) |
| Deployment | GitHub OIDC provider, gateway-github-actions-role, gateway-deployment-role, CDK bootstrap |
| NOT here | No Lambda, DynamoDB, Cognito, API Gateway, Route53 |

### spreadsheets

| Category | Resources |
|----------|-----------|
| Web | CloudFront, S3 (static assets + package zip hosting) |
| Certs | ACM us-east-1 (`ci-spreadsheets`, `prod-spreadsheets`, `spreadsheets.diyaccounting.co.uk`) |
| Deployment | GitHub OIDC provider, spreadsheets-github-actions-role, spreadsheets-deployment-role, CDK bootstrap |
| NOT here | No Lambda, DynamoDB, Cognito, API Gateway, Route53 |

### submit-ci

| Category | Resources |
|----------|-----------|
| Compute | Lambda functions (CI submit), API Gateway HTTP API |
| Data | DynamoDB (ci-submit-tokens, etc. — test data), Secrets Manager (sandbox credentials) |
| Web | CloudFront (submit CI), S3 |
| Certs | ACM us-east-1 (CI-scoped main, auth, simulator), ACM eu-west-2 (CI regional) |
| Security | Cognito (CI user pool) |
| Backup | AWS Backup local vault (shorter retention), copies to submit-backup |
| Deployment | GitHub OIDC provider, submit-ci-github-actions-role, submit-ci-deployment-role, CDK bootstrap |
| Differences | HMRC sandbox APIs, test data only, feature branch per-deployment stacks |

### submit-backup

| Category | Resources |
|----------|-----------|
| Backup | submit-cross-account-vault (90-day retention), KMS key |
| IAM | Vault access policy (allows submit-prod and submit-ci to copy in) |
| Audit | CloudTrail |
| NOT here | No application code, receive-only (plus outbound copies for restore testing) |

---

## Reference: Deployment flow

### Current (single repo, single account)

```
GitHub Actions (submit.diyaccounting.co.uk repo)
        │
        ▼ OIDC
┌───────────────────────────────────────────────────────┐
│    887764105431 (everything)                           │
│                                                        │
│  deploy-environment.yml → {env}-env-* stacks          │
│  deploy.yml → {deployment}-app-* stacks               │
│  deploy-gateway.yml → {env}-gateway-GatewayStack      │
│  deploy-spreadsheets.yml → {env}-spreadsheets-*Stack  │
│  deploy-root.yml → {env}-env-RootDnsStack             │
│  deploy-holding.yml → {env}-holding stack             │
└───────────────────────────────────────────────────────┘
```

### After Phase 1 (single repo, multiple accounts)

```
GitHub Actions (submit.diyaccounting.co.uk repo)
        │
        ├── deploy-gateway.yml ──OIDC──► gateway
        │                                (S3 + CloudFront)
        │
        ├── deploy-spreadsheets.yml ──OIDC──► spreadsheets
        │                                     (S3 + CloudFront)
        │
        ├── deploy.yml (CI branches) ──OIDC──► submit-ci
        │   deploy-environment.yml (CI)        (Lambda, DDB, Cognito)
        │
        ├── deploy.yml (main) ──OIDC──► submit-prod (NEW account)
        │   deploy-environment.yml (prod)      (Lambda, DDB, Cognito)
        │
        └── deploy-root.yml ──OIDC──► 887764105431 (management)
            deploy-holding.yml         (Route53, holding page only)
```

### After Phase 2 (multiple repos, multiple accounts)

```
root repo ─────────OIDC──► 887764105431 (DNS + holding only)
submit repo ───────OIDC──► submit-prod (prod) + submit-ci (CI)
gateway repo ──────OIDC──► gateway (S3 + CloudFront)
spreadsheets repo ─OIDC──► spreadsheets (S3 + CloudFront)
```

---

## Reference: Data flow

```
┌─────────────────┐     ┌─────────────────┐
│   submit-ci     │     │  submit-prod    │
│                 │     │  (NEW account)  │
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
        └───────────┬───────────┘
                    │
                    │  Restore Testing
                    │  (copy back to CI)
                    ▼
        ┌───────────────────────┐
        │   submit-ci           │
        │   (restored tables)   │
        │   → behaviour tests   │
        └───────────────────────┘
```

---

## Reference: Console access (IAM Identity Center)

Single portal for all accounts. No separate IAM users, no multiple sets of credentials.

1. Log into the SSO portal once: `https://d-9c67480c02.awsapps.com/start/`
2. Portal shows all accounts with their permission sets
3. Click any account → choose permission set → opens AWS console
4. For CLI: click "Command line or programmatic access" → copy temporary credentials

**CLI profiles** (`~/.aws/config`):

```ini
[sso-session diyaccounting]
sso_start_url = https://d-9c67480c02.awsapps.com/start/
sso_region = eu-west-2
sso_registration_scopes = sso:account:access

[profile management]
sso_session = diyaccounting
sso_account_id = 887764105431
sso_role_name = AdministratorAccess
region = eu-west-2

[profile gateway]
sso_session = diyaccounting
sso_account_id = 283165661847
sso_role_name = AdministratorAccess
region = eu-west-2

[profile spreadsheets]
sso_session = diyaccounting
sso_account_id = 064390746177
sso_role_name = AdministratorAccess
region = eu-west-2

[profile submit-ci]
sso_session = diyaccounting
sso_account_id = 367191799875
sso_role_name = AdministratorAccess
region = eu-west-2

[profile submit-prod]
sso_session = diyaccounting
sso_account_id = 972912397388
sso_role_name = AdministratorAccess
region = eu-west-2

[profile submit-backup]
sso_session = diyaccounting
sso_account_id = 914216784828
sso_role_name = AdministratorAccess
region = eu-west-2
```

**Daily workflow**: `aws sso login --sso-session diyaccounting` opens browser for auth. Credentials last ~8-12 hours across all profiles.

**Transition from assume-role scripts**: Existing `scripts/aws-assume-submit-deployment-role.sh` will need updating to target the new submit-prod account. SSO profiles are the preferred approach for new accounts.

---

## Reference: Billing

AWS Organizations provides consolidated billing automatically.

| What | Where |
|------|-------|
| Single bill for everything | 887764105431 (management account) — Billing console |
| Per-account breakdown | 887764105431 → Cost Explorer → filter by "Linked Account" |
| Individual account view | Each member account → Cost Explorer shows only its own usage |
| Budget alerts | Set per-account in management → SNS notifications |

**Expected costs**:

| Account | Expected Cost | Main Drivers |
|---------|---------------|--------------|
| 887764105431 (management) | ~$5-10/month | Route53 zone, IAM Identity Center (free), holding page CloudFront |
| submit-prod | Current prod costs | Lambda, DynamoDB, CloudFront, API GW, Cognito |
| submit-ci | ~30-50% of prod | Same services, less traffic |
| gateway | ~$1-5/month | S3 + CloudFront (static site) |
| spreadsheets | ~$1-10/month | S3 + CloudFront (static site + package zips) |
| submit-backup | ~$5-20/month | Vault storage for backup copies |

---

## Reference: Domain convention

| Service | CI | Prod | Prod alias | Account | Repo (final) |
|---------|-----|------|------------|---------|-------------|
| Submit | `ci-submit.diyaccounting.co.uk` | `prod-submit.diyaccounting.co.uk` | `submit.diyaccounting.co.uk` | submit-ci / submit-prod | submit |
| Gateway | `ci-gateway.diyaccounting.co.uk` | `prod-gateway.diyaccounting.co.uk` | `diyaccounting.co.uk`, `www.diyaccounting.co.uk` | gateway | www.diyaccounting.co.uk |
| Spreadsheets | `ci-spreadsheets.diyaccounting.co.uk` | `prod-spreadsheets.diyaccounting.co.uk` | `spreadsheets.diyaccounting.co.uk` | spreadsheets | diy-accounting |
| Cognito | `ci-auth.diyaccounting.co.uk` | `prod-auth.diyaccounting.co.uk` | — | submit-ci / submit-prod | submit |
| Holding | `ci-holding.diyaccounting.co.uk` | `prod-holding.diyaccounting.co.uk` | — | 887764105431 | root |
| Simulator | `ci-simulator.diyaccounting.co.uk` | `prod-simulator.diyaccounting.co.uk` | — | submit-ci / submit-prod | submit |
| DNS zone | — | — | `diyaccounting.co.uk` | 887764105431 | root |

---

## Reference: Account table

| Account | ID | Email | OU | Purpose | Phase |
|---------|-----|-------|-----|---------|-------|
| 887764105431 | 887764105431 | admin@diyaccounting.co.uk | Management (org root) | Org admin, Route53, IAM Identity Center, billing, holding page | Phase 1.0 ✅ |
| gateway | 283165661847 | admin+aws-gateway@diyaccounting.co.uk | Workloads | Gateway (S3 + CloudFront) | Phase 1.1 (in progress — bootstrapped, cert issued, CI deploying) |
| spreadsheets | 064390746177 | admin+aws-spreadsheets@diyaccounting.co.uk | Workloads | Spreadsheets (S3 + CloudFront) | Phase 1.2 |
| submit-ci | 367191799875 | admin+aws-submit-ci@diyaccounting.co.uk | Workloads | Submit CI (Lambda, DDB, Cognito, API GW) | Phase 1.3 |
| submit-prod | 972912397388 | admin+aws-submit-prod@diyaccounting.co.uk | Workloads | Submit prod (Lambda, DDB, Cognito, API GW) | Phase 1.4 |
| submit-backup | 914216784828 | admin+aws-submit-backup@diyaccounting.co.uk | Backup | Cross-account backup vault | Phase 3.1 |

### Repository → Account mapping progression

| Phase | This repo deploys to | Root repo | Gateway repo | Spreadsheets repo |
|-------|---------------------|-----------|-------------|-------------------|
| Current | 887764105431 (everything) | N/A | N/A | N/A |
| Phase 1.1 | 887764105431 + gateway | N/A | N/A | N/A |
| Phase 1.2 | 887764105431 + gateway + spreadsheets | N/A | N/A | N/A |
| Phase 1.3 | 887764105431 + submit-ci + gateway + spreadsheets | N/A | N/A | N/A |
| Phase 1.4 | submit-prod + submit-ci + gateway + spreadsheets + 887764105431 (root DNS) | N/A | N/A | N/A |
| Phase 1.5 | submit-prod + submit-ci + gateway + spreadsheets + 887764105431 (root DNS only) | N/A | N/A | N/A |
| Phase 2 | submit-prod + submit-ci | 887764105431 | gateway | spreadsheets |

---

## Risk summary

| Risk | Mitigation |
|---|---|
| DNS cutover causes downtime | CloudFront alias changes propagate in seconds. Old distributions kept until verified. Rollback via `deploy-root.yml`. |
| ACM cert validation delay | Request certs days before planned cutover. DNS validation typically completes in minutes. |
| New account missing permissions | Bootstrap follows proven pattern. Test with CI deployment first. |
| Account separation breaks workflows | All changes are in one repo — test on feature branch before merging. Revert is one commit. |
| Submit prod migration loses data | Full DynamoDB backup before migration. Old prod stays live until new is validated. Backup restoration is scripted and tested. |
| Cognito users must re-register | Only 2 sign-ups + family testers. Notify them directly. New Cognito pool from IaC proves repeatability. |
| Salt restoration fails | Test salt restore in CI first (Phase 3.3). Script handles re-encryption if needed. |
| Repository migration breaks builds | Each repo deployed and tested before removing from submit. Archive-and-overlay preserves working state. |
| Old www URLs break | CloudFront Function handles redirects. 301s preserve SEO. |
| Root repo becomes SPOF for DNS | DNS records are durable — a broken root deploy doesn't affect existing records. |
| Backup account compromised | Vault is receive-only. No application code. Restricted SSO after setup. |

---

## Future considerations

| Item | Notes |
|---|---|
| Automated restore testing | Monthly workflow: copy prod backup → restore to CI → test → report (Phase 3.4). |
| `diy-accounting` repo rename | If renamed to `diy-accounting-spreadsheets`, update OIDC trust. GitHub supports renames with redirects but OIDC `sub` claims use current name. |

---

*Created: February 2026 (v2.0 — 887764105431 becomes clean management account, submit-prod migrates to new account, IaC repeatability proof)*
