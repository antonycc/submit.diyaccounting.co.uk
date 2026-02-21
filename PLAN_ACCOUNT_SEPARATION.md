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
- https://diyaccounting.co.uk/ (gateway) — **migrated to 283165661847** ✅
- https://spreadsheets.diyaccounting.co.uk/ — **migrated to 064390746177** ✅
- https://submit.diyaccounting.co.uk/ — still in 887764105431 (CI migration in progress)

Gateway and spreadsheets (CI + prod) fully migrated. **Submit CI migration complete** — all stacks deployed to 367191799875, all 18 CI synthetic tests passing, DNS live. Next: Phase 1.4 (submit prod to new account 972912397388).

### Account structure (current)

```
887764105431 ── submit (prod only), root DNS, holding page
283165661847 ── gateway (CI + prod) ✅
064390746177 ── spreadsheets (CI + prod) ✅
367191799875 ── submit-ci ✅
972912397388 ── submit-prod (created, not yet used)
914216784828 ── submit-backup (created, Phase 3)
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

### 1.1: Gateway account separation ✅ COMPLETE

Gateway (CI + prod) fully migrated to 283165661847. See `PLAN_AWS_CLICKS.md` Phase 1.1 for detailed clickthrough log.

### 1.2: Spreadsheets account separation ✅ COMPLETE

Spreadsheets (CI + prod) fully migrated to 064390746177. See `PLAN_AWS_CLICKS.md` Phase 1.2 for detailed clickthrough log.

### 1.3: Submit CI account separation ✅ COMPLETE

Move submit CI deployments into their own account (367191799875).

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| 1.3.1 | Create `submit-ci` account | ✅ | Account 367191799875, Workloads OU |
| 1.3.2 | Assign SSO access | ✅ | AdministratorAccess assigned |
| 1.3.3 | CDK bootstrap | ✅ | us-east-1 and eu-west-2 bootstrapped |
| 1.3.4 | Create OIDC provider | ✅ | Trust: `repo:antonycc/submit.diyaccounting.co.uk:*` |
| 1.3.5 | Create deployment roles | ✅ | `submit-ci-github-actions-role` and `submit-ci-deployment-role` |
| 1.3.6 | Create ACM certs | ✅ | us-east-1: `bd4b7bf4...` (*.submit, ci-submit, ci-holding), eu-west-2: `de2a24a1...` (*.submit, ci-submit) |
| 1.3.7 | Replicate Secrets Manager entries | ✅ | Not needed — `deploy-environment.yml` `create-secrets` job creates all secrets automatically from GitHub Actions secrets |
| 1.3.8 | Add GitHub environment variables | ✅ | Environment-scoped `SUBMIT_*` vars (ci + prod envs), repo-level `ROOT_*` vars |
| 1.3.9 | Update ALL workflow files | ✅ | Removed every hardcoded 887764105431 reference from ~20 workflow files. Uses `vars.SUBMIT_*` (environment-scoped) and `vars.ROOT_*` (repo-level). `ROOT_HOSTED_ZONE_ID` for Route53 zone. |
| 1.3.10 | Update CDK context + .env.ci | ✅ | `.env.ci`: all Secrets Manager ARNs → 367191799875, added cert ARN env vars. Java CDK: added `envOr()` for cert ARNs in `SubmitEnvironment.java` and `SubmitApplication.java`. CI test fixtures updated. CLAUDE.md: added accounts table, switched to SSO profiles. |
| 1.3.11 | Deploy CI environment stacks | ✅ | Deployed to submit-ci (367191799875). All env stacks live. |
| 1.3.12 | Deploy CI application stacks | ✅ | All app stacks deployed (`ci-accounts-app-*`). |
| 1.3.13 | Update root DNS for CI submit | ✅ | `set-origins` job passed. Fixed cross-account Route53: action now switches from submit credentials to root credentials for Route53, then restores submit credentials for API Gateway. |
| 1.3.14 | Validate CI | ✅ | All 18 CI synthetic behaviour tests passing. All 17 simulator tests passing. Run #22208132155 clean (only `npm test cdk prod` fails — expected, Phase 1.4). |
| 1.3.15 | Tear down old CI stacks | ✅ | All CI stacks already deleted from 887764105431 |
| 1.3.16 | Merge `accounts` to `main` | BLOCKED by 1.4 prod validation | **Cannot merge yet.** Prod GitHub env vars (`SUBMIT_*`) still point to 887764105431. Merging to `main` triggers a prod deploy which would apply the `accounts` branch's bucket name changes to the existing prod stacks — CloudFormation would replace live S3 buckets, destroying the prod site. **Strategy**: run Phase 1.4 workflows from the `accounts` branch targeting prod (new account 972912397388), validate prod, then merge to `main`. |

**Issues found and fixed during CI validation:**

| Issue | Root cause | Fix | Commit |
|-------|-----------|-----|--------|
| CDK build: cross-environment bucket reference | `OriginBucket` in EdgeStack (us-east-1) had no explicit physical name. SelfDestructStack (eu-west-2) couldn't resolve it cross-region. | Added `PhysicalName.GENERATE_IF_NEEDED` to the bucket. | `1715f2bf` |
| Route53 AccessDenied in `set-origins` | `deploy.yml` used submit-ci credentials for everything, but Route53 is in the management account (887764105431). | Added cross-account credential switching to the `set-origins` composite action. | `3f40cacd` |
| API Gateway domain conflict | `ci-submit.diyaccounting.co.uk` custom domain already existed in 887764105431 (globally unique per region). | Manually deleted from old account via `aws apigatewayv2 delete-domain-name`. | Manual |
| S3 bucket name mismatch in workflows | Workflows constructed bucket names as `${deployment}-app-origin-us-east-1` but CDK now generates unique names with `PhysicalName.GENERATE_IF_NEEDED`. | Replaced hardcoded names with CloudFormation output lookup from EdgeStack in 4 files. | `11b6ab70` |
| Simulator tests: missing `hmrcTokenScope` | HMRC scope enforcement (PLAN_HMRC_SCOPES_REQUIRED.md) added scope checking but simulator injection didn't set `hmrcTokenScope` in sessionStorage. | Added `hmrcTokenScope` to simulator demo user injection. | `4e0b3c5b` |
| CI synthetic tests: HMRC auth redirect missed | Scope enforcement fetches catalogue asynchronously before OAuth redirect (~7s). Inline test code waited only 1s, missing the redirect entirely. | Replaced fixed timeout with locator wait for HMRC auth page or receipt. | `7b141936` |
| CDK prod test: Cognito lookup fails | `npm test cdk prod` looks up `prod-auth.diyaccounting.co.uk` Cognito domain, which doesn't exist yet in submit-prod (972912397388). | Will resolve itself when prod is deployed (Phase 1.4). Not blocking CI. | — |

**Key design decision**: `SUBMIT_*` variables are GitHub Actions **environment-scoped** (different values for `ci` vs `prod` environments), while `ROOT_*`, `GATEWAY_*`, `SPREADSHEETS_*` are **repo-level** (same account for CI and prod). This means workflow code uses `vars.SUBMIT_ACCOUNT_ID` everywhere — no conditionals needed.

**ROOT workflow migration**: Done as part of step 1.3.9. `deploy-root.yml` and `deploy-holding.yml` now use `vars.ROOT_ACTIONS_ROLE_ARN` / `vars.ROOT_DEPLOY_ROLE_ARN`, ensuring they are unaffected when `SUBMIT_*` vars change for Phase 1.4.

**Issues found and fixed during prod validation (Phase 1.4):**

| Issue | Root cause | Fix | Alternatives considered | Commit |
|-------|-----------|-----|------------------------|--------|
| Wrong AWS credentials (ci instead of prod) | Every job's `environment:` key used `github.ref == 'refs/heads/main' && 'prod' || 'ci'`. When deploying from the `accounts` branch with `environment-name=prod`, all jobs resolved to `ci` environment, getting submit-ci (367191799875) credentials instead of submit-prod (972912397388). CDK used the wrong account, ACM certs not found. | `params` job now resolves `github-environment` from the explicit `environment-name` input (falling back to branch). All downstream jobs reference `needs.params.outputs.github-environment` or `needs.names.outputs.environment-name` instead of re-deriving from `github.ref`. Applied to `deploy-environment.yml` and `deploy-cdk-stack.yml`. ~47 occurrences in other workflows remain (will be fixed when those workflows are used for prod). | Could have merged to `main` first so branch-based logic works, but that risks deploying to old prod in 887764105431 before new account is validated. | `491d8b04` |
| CloudFront CNAME conflict (simulator + holding) | CloudFront CNAME aliases are globally unique. Old prod distributions in 887764105431 still owned `prod-simulator.diyaccounting.co.uk` (dist `EXVMGISUNTRHN`) and `prod-holding.diyaccounting.co.uk` (dist `E21CED3ZEMERBD`). New stacks in 972912397388 couldn't create distributions with the same CNAMEs. | Removed CNAME aliases from the two old distributions in 887764105431 (set aliases to empty, switched to CloudFront default certificate). Old distributions still exist but are no longer reachable by custom domain. | Could have torn down old prod stacks entirely (Phase 1.5), but that's premature — old prod should stay until new is fully validated. Could have changed the new stacks to use different CNAMEs temporarily, but that defeats the purpose of proving IaC repeatability. | Manual (AWS CLI) |
| Cross-account Route53 access denied | ApexStack and SimulatorStack create Route53 A/AAAA alias records via CDK `AwsCustomResource`. The Lambda runs in 972912397388 but Route53 is in 887764105431. The code already supports cross-account via `ROOT_ROUTE53_ROLE_ARN` env var, but `.env.prod` was missing this variable. `.env.ci` had it (added during Phase 1.3). | Added `ROOT_ROUTE53_ROLE_ARN=arn:aws:iam::887764105431:role/root-route53-record-delegate` to `.env.prod`. The role already trusts both 367191799875 and 972912397388. | Could have removed DNS record creation from env stacks and handled via `set-origins` job, but the existing cross-account role pattern is cleaner and keeps DNS creation atomic with the stack. | Pending commit |
| BackupStack: DynamoDB GSI still creating | BackupStack depends on DataStack and re-deploys it. The `prod-env-passes` table's `issuedBy-index` GSI was still being created when BackupStack tried to update DataStack. Transient timing issue — GSI creation takes a few minutes. | Resolved on third run — by then the GSI had finished creating. No code change needed. | Could add a wait/retry in the CDK custom resource, but the issue is transient and self-healing on re-run. |  — |
| Cognito custom domain conflict | Cognito custom domains are globally unique (like CloudFront CNAMEs). Old prod user pool in 887764105431 (`eu-west-2_MJovvw6mL`) owned `prod-auth.diyaccounting.co.uk`. New IdentityStack in 972912397388 couldn't create a user pool with the same custom domain. | Removed custom domain from old Cognito user pool in 887764105431 via `aws cognito-idp delete-user-pool-domain`. Old user pool still exists but is no longer reachable by custom domain. | Could wait for Phase 1.5 teardown, but IdentityStack is blocking the rest of the deployment. | Manual (AWS CLI) |
| Cognito domain: stale Route53 records | After removing the custom domain from the old user pool, Route53 A/AAAA records for `prod-auth.diyaccounting.co.uk` still pointed to the old (now defunct) Cognito CloudFront distribution `d1yuj3kt2v4b8h.cloudfront.net`. Cognito returned "Invalid request provided: AWS::Cognito::UserPoolDomain" when creating the new custom domain. | Deleted the stale A/AAAA alias records from Route53 in 887764105431. CDK `Route53AliasUpsert` re-creates them pointing to the new Cognito CloudFront endpoint. | Could wait for DNS TTL expiry, but Cognito validates DNS state on domain creation. | Manual (AWS CLI) |

### 1.4: Submit prod to new account (IaC repeatability proof)

Create a NEW submit-prod account and deploy the full production stack from IaC. Restore data from backups. This proves disaster recovery: salt + backups + code = full recovery.

**Pre-requisites**: Back up everything from 887764105431 before starting. The existing prod in 887764105431 stays live until the new account is validated and DNS is switched.

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| | **Preparation** | | |
| 1.4.1 | Back up prod data | ✅ | 11/11 tables backed up (prefix `pre-migration-20260221`), all AVAILABLE. Salt metadata exported. No Path 3 DynamoDB salt item in prod (not configured yet — Path 1 Secrets Manager is primary). Script: `scripts/aws-accounts/backup-prod-for-migration.sh`. |
| 1.4.2 | Document secrets | ✅ | 9 prod secrets found in 887764105431 matching expected list. 2 customer-managed KMS keys (`prod-env-backup`, `prod-env-salt-encryption`). Script: `scripts/aws-accounts/list-prod-secrets.sh`. |
| 1.4.3 | Document ACM certs | ✅ | Old account has 4 certs in us-east-1 (main `d340de40`, auth `8750ac93`, simulator `5b8afa59`, wildcard `b23cd904`) and 4 in eu-west-2 (main `1f9c9a57`, auth `2b09cb4f`, simulator `7ae3bc98`, wildcard `77810f99`). Old certs bundle CI+prod SANs together; new account gets prod-only certs. |
| | **Account creation** | | |
| 1.4.4 | Create `submit-prod` account | ✅ | Account 972912397388, Workloads OU. |
| 1.4.5 | Assign SSO access | ✅ | AdministratorAccess assigned, `submit-prod` SSO profile working. |
| 1.4.6 | CDK bootstrap | ✅ | us-east-1 and eu-west-2 bootstrapped. |
| 1.4.7 | Create OIDC provider | ✅ | Trust: `repo:antonycc/submit.diyaccounting.co.uk:*`. |
| 1.4.8 | Create deployment roles | ✅ | `arn:aws:iam::972912397388:role/submit-prod-github-actions-role`, `arn:aws:iam::972912397388:role/submit-prod-deployment-role`. |
| | **Certificates** | | |
| 1.4.9 | Create ACM certs | ✅ | us-east-1: `arn:aws:acm:us-east-1:972912397388:certificate/e465ad23-baf8-4b5c-94a4-33f73a266ec6` (*.submit, prod-submit, submit, prod-auth, prod-holding, prod-simulator). eu-west-2: `arn:aws:acm:eu-west-2:972912397388:certificate/eea7a266-4b80-42d9-9d10-39af2455ce5b` (*.submit, prod-submit, submit). Both ISSUED. |
| | **Secrets** | | |
| 1.4.10 | Copy Secrets Manager entries | ✅ | 9/9 secrets copied from 887764105431 to 972912397388. Note: Stripe webhook secrets may need updating after deployment (new CloudFront URLs). Script: `scripts/aws-accounts/copy-secrets-to-account.sh`. |
| | **Deploy from IaC** | | |
| 1.4.11 | Update GitHub environment variables | ✅ | All 5 `prod` environment variables updated: `SUBMIT_ACCOUNT_ID` (972912397388), `SUBMIT_ACTIONS_ROLE_ARN` (`submit-prod-github-actions-role`), `SUBMIT_DEPLOY_ROLE_ARN` (`submit-prod-deployment-role`), `SUBMIT_CERTIFICATE_ARN` (`e465ad23...`), `SUBMIT_REGIONAL_CERTIFICATE_ARN` (`eea7a266...`). Previous values (887764105431) replaced. |
| 1.4.12 | Update `deploy.yml` | ✅ | No code changes needed — already uses `vars.SUBMIT_*` (environment-scoped). Step 1.4.11 variable update is sufficient. |
| 1.4.13 | Update `deploy-environment.yml` | ✅ | No code changes needed — already uses `vars.SUBMIT_*` (environment-scoped). Step 1.4.11 variable update is sufficient. |
| 1.4.14 | Update CDK context + .env.prod | ✅ | Updated `cdk-application/cdk.json` (3 cert ARNs), `cdk-environment/cdk.json` (3 cert ARNs), `.env.prod` (8 Secrets Manager ARNs) from 887764105431 → 972912397388. All use single us-east-1 cert (all SANs combined). `npm test` (949 passed) and `./mvnw clean verify` (BUILD SUCCESS) both pass. |
| 1.4.15 | Deploy prod environment stacks | ✅ | All 10 environment stacks deployed to 972912397388: ObservabilityStack, ObservabilityUE1Stack, DataStack, EcrStack, EcrUE1Stack, ActivityStack, BackupStack, SimulatorStack, ApexStack, IdentityStack. Run #22248369483 (30/30 jobs passed). See "Issues found and fixed during prod validation" above for 5 issues resolved. |
| 1.4.16 | Deploy prod application stacks | | Deploy submit prod from main to new submit-prod. Fresh Lambda, API Gateway, CloudFront, S3. |
| | **Data restoration** | | |
| 1.4.17 | Restore DynamoDB tables | | Restore prod tables from backup into new submit-prod. Script: `scripts/aws-accounts/restore-tables-from-backup.sh`. Critical tables: `prod-env-receipts`, `prod-env-bundles`, `prod-env-hmrc-api-requests`, `prod-env-passes`, `prod-env-subscriptions`. Ephemeral async-request tables and `prod-env-bundle-capacity` (rebuilt by Lambda) do not need restoring. |
| 1.4.18 | Restore salt | | Copy the encrypted salt into the new DataStack's DynamoDB table. Grant the new account's KMS key access or re-encrypt with the new key. Script: `scripts/aws-accounts/restore-salt.sh`. |
| | **DNS cutover** | | |
| 1.4.19 | Update root DNS for prod submit | | Point `prod-submit.diyaccounting.co.uk` and `submit.diyaccounting.co.uk` to new account's CloudFront. Point `prod-auth.diyaccounting.co.uk` to new Cognito. Point `prod-simulator.diyaccounting.co.uk`, `prod-holding.diyaccounting.co.uk` to new CloudFront distributions. |
| 1.4.20 | Validate prod | | Run `npm run test:submitVatBehaviour-prod`. Test auth flow (new Cognito — users re-register), HMRC submission, payment flow. Verify salt decrypts and user sub hashing works with restored data. |
| 1.4.21 | Notify users | | Inform the 2 sign-ups + family testers that they need to re-register (new Cognito pool). |

### 1.5: Clean up 887764105431 (make it management-only)

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| 1.5.0 | Export root zone and organization structure | ✅ | Exported 236 Route53 records to `root-zone/` (zone.json, zone.bind, manual-records.json, organization.json). Identified 5 manually-managed records (email MX/SPF/DKIM, webmail CNAME, Google site verification) not in any CDK stack. Export script: `scripts/aws-accounts/export-root-zone.sh`. |
| 1.5.1 | Tear down old prod stacks | | Delete all `prod-*` application and environment stacks from 887764105431 (Lambda, API GW, Cognito, DynamoDB, CloudFront for submit). |
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

**Fix applied (commit `1715f2bf`):** Removed `.bucketName()` from all 7 stacks. CDK auto-generates unique names per account. For EdgeStack, the cross-stack reference (PublishStack and SelfDestructStack looked up the bucket by name via `sharedNames`) was replaced with an explicit prop passed from SubmitApplication. **Additional fix:** EdgeStack's OriginBucket required `PhysicalName.GENERATE_IF_NEEDED` because it's created in us-east-1 but referenced by SelfDestructStack in eu-west-2 — CDK can't resolve auto-generated tokens cross-environment without an explicit physical name.

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
| `scripts/aws-accounts/backup-prod-for-migration.sh` | On-demand backup of all prod DynamoDB tables + export salt |
| `scripts/aws-accounts/list-prod-secrets.sh` | List Secrets Manager secret names/descriptions (not values) |
| `scripts/aws-accounts/copy-secrets-to-account.sh` | Copy secrets from one account to another via CLI |
| `scripts/aws-accounts/restore-tables-from-backup.sh` | Restore DynamoDB tables from backup into target account |
| `scripts/aws-accounts/restore-salt.sh` | Copy encrypted salt to new DataStack table, re-encrypt if needed |
| `scripts/aws-accounts/bootstrap-account.sh` | CDK bootstrap + OIDC provider + deployment roles for a new account |

---

## Phase 2: Repository separation

**Goal**: Each service gets its own GitHub repository with independent CI/CD, versioning, and deployment pipelines. By this point, each service already deploys to its final AWS account. The repo split is purely a code extraction — no infrastructure changes.

**Prerequisite**: Phase 1 complete (accounts separated, all deployments stable from this repo).

**Order**: Root first (thinnest slice), then gateway, then spreadsheets, then submit cleanup.

### Target repositories

| Repository | GitHub URL | Content | Source |
|---|---|---|---|
| Root | `antonycc/root.diyaccounting.co.uk` | Route53 zone, RootDnsStack, holding page | Created fresh from submit |
| Gateway | `antonycc/www.diyaccounting.co.uk` | Gateway static site, CloudFront Function redirects | Archive-and-overlay existing repo |
| Spreadsheets | `antonycc/diy-accounting` | Spreadsheets site, package hosting, knowledge base, community discussions | Archive-and-overlay existing repo |
| Submit | `antonycc/submit.diyaccounting.co.uk` | Submit application (Lambda, Cognito, DynamoDB, API GW) | This repo — remove migrated code |

**Repository naming — root repo (decided)**: `antonycc/root.diyaccounting.co.uk` — checked out at `../root.diyaccounting.co.uk`

**Note**: `antonycc/www.diyaccounting.co.uk` is being kept because it has the right name for gateway. `antonycc/diy-accounting` is being kept because it has existing users with posts in discussions that should be preserved.

### 2.1: Root → new repository

Root is the thinnest slice — just Route53 alias records and the holding page. Deploys to 887764105431 (management account).

| Step | Description |
|------|-------------|
| 2.1.1 | Create new GitHub repository for root — ✅ `antonycc/root.diyaccounting.co.uk` |
| 2.1.2 | Set up minimal project: `pom.xml` (CDK infra module only), `package.json` (Playwright, Vitest, prettier, eslint, ncu) |
| 2.1.3 | Copy root-relevant files from submit repo (see "What goes in the root repo" below) |
| 2.1.4 | Adapt `deploy-root.yml` → `deploy.yml` (main workflow), keep `deploy-holding.yml` |
| 2.1.5 | Update OIDC trust in 887764105431: change to `repo:antonycc/root.diyaccounting.co.uk:*` |
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

**What gets backed up**: DynamoDB tables (`{env}-env-receipts`, `{env}-env-bundles`, `{env}-env-hmrc-api-requests`, `{env}-env-passes`, `{env}-env-subscriptions`). Existing schedules: Daily (35-day local), Weekly (90-day local), Monthly compliance (7 years for HMRC). Cross-account copies: Daily → submit-backup vault (90-day retention — longer than source).

### 3.3: Restore testing (prod-replica in CI)

Prove backups work by restoring production data into CI and verifying the application functions correctly — including the user sub hash salt.

| Step | Description | Details |
|------|-------------|---------|
| 3.3.1 | Copy prod backup to CI | From submit-backup vault, restore prod DynamoDB tables into submit-ci with target table names like `ci-env-bundles-restored`. |
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
| Data | DynamoDB (prod-env-receipts, prod-env-bundles, etc.), Secrets Manager |
| Web | CloudFront (submit), S3 |
| Certs | ACM us-east-1 (main, auth, simulator), ACM eu-west-2 (regional API GW) |
| Security | Cognito, WAF, KMS (salt encryption) |
| Backup | AWS Backup local vault (35-day daily, 90-day weekly), copies to submit-backup |
| Deployment | GitHub OIDC provider, submit-prod-github-actions-role, submit-prod-deployment-role, CDK bootstrap |

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
| Data | DynamoDB (ci-env-receipts, ci-env-bundles, etc. — test data), Secrets Manager (sandbox credentials) |
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
root.diyaccounting.co.uk ──OIDC──► 887764105431 (DNS + holding only)
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
| gateway | 283165661847 | admin+aws-gateway@diyaccounting.co.uk | Workloads | Gateway (S3 + CloudFront) | Phase 1.1 ✅ |
| spreadsheets | 064390746177 | admin+aws-spreadsheets@diyaccounting.co.uk | Workloads | Spreadsheets (S3 + CloudFront) | Phase 1.2 ✅ |
| submit-ci | 367191799875 | admin+aws-submit-ci@diyaccounting.co.uk | Workloads | Submit CI (Lambda, DDB, Cognito, API GW) | Phase 1.3 (code changes done, deploy pending) |
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
