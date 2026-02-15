# Production Launch & Service Separation Plan

**Version**: 4.0 | **Date**: February 2026 | **Status**: In progress

---

## Current State

Everything runs in the submit-prod AWS account (887764105431). All four logical services (root DNS, gateway, spreadsheets, submit) are deployed as CDK stacks within the `submit.diyaccounting.co.uk` repository. CI environments are live and validated:

| Site | CI URL | CF Distribution | Stack |
|------|--------|----------------|-------|
| Gateway | ci-gateway.diyaccounting.co.uk | d2di5r1vxujvjg.cloudfront.net (E1AIEDHRYSUJHK) | ci-gateway-GatewayStack |
| Spreadsheets | ci-spreadsheets.diyaccounting.co.uk | d1w8um5pys16nx.cloudfront.net (E13E50UFAUWZNI) | ci-spreadsheets-SpreadsheetsStack |

Features already built:
- Gateway: static site, about.html (Companies Act), CloudFront Function for URL redirects, sitemaps, security.txt, GA4 analytics with ecommerce events
- Spreadsheets: product catalogue from TOML, package zip hosting on S3, PayPal donate flow, 120-article knowledge base with citation references, community discussions page (GitHub API), financial year cutoff logic, GA4 analytics with ecommerce events
- Root DNS: RootDnsStack manages ci-gateway, ci-spreadsheets, and submit apex/www CloudFront alias records via deploy-root.yml
- Redirects: CloudFront Function handles old www.diyaccounting.co.uk URLs with 301 redirects to spreadsheets site
- Behaviour tests: Playwright tests for gateway, spreadsheets, and submit — runnable against local (proxy), CI, and prod environments
- Holding page: maintenance page with GA4 analytics at `{env}-holding.diyaccounting.co.uk`
- Domain convention: All services use `{env}-{service}.diyaccounting.co.uk` pattern (e.g., `ci-submit.diyaccounting.co.uk`, `ci-gateway.diyaccounting.co.uk`)
- API Gateway custom domains: Each deployment has a regional custom domain matching the CloudFront forwarded `Host` header
- Resource lookups: `.github/actions/lookup-resources` composite action discovers Cognito, API Gateway, and CloudFront resources by deterministic domain convention — replaces brittle GitHub environment variables
- Fraud prevention: HMRC fraud prevention headers fixed — `Gov-Vendor-Public-IP` detected at Lambda cold start, `Gov-Client-Public-Port` extracted from `CloudFront-Viewer-Address` header

### Items from prior plans completed or superseded

| Old Plan Item | Status |
|---|---|
| Package hosting (PLAN_SPREADSHEETS Phase 2) | Done — build-packages.cjs generates zips, deploy-spreadsheets.yml syncs to S3 |
| Catalogue automation (PLAN_SPREADSHEETS Phase 2) | Done — build-packages.cjs generates catalogue.toml |
| SEO redirect mapping (PLAN_SPREADSHEETS Phase 3) | Done — redirects.toml + CloudFront Function on gateway |
| robots.txt / sitemap.xml (PLAN_SPREADSHEETS Phase 3) | Done — both sites have robots.txt and generated sitemaps |
| Gateway CloudFront Function redirects (PLAN_WWW Phase 3) | Done — handles article, product, feature URL patterns |
| about.html Companies Act page (PLAN_WWW Section 8) | Done |
| security.txt (PLAN_WWW Section 7) | Done on gateway |
| Google Analytics | Done — GA4 on all three sites with ecommerce events, cross-domain tracking, privacy policy |
| CSP headers for analytics | Done — `https://*.google-analytics.com` in connect-src across all stacks |
| Submit domain alignment (PLAN_DOMAIN_ALIGNMENT) | Done — `{env}-submit.diyaccounting.co.uk` convention, API GW custom domains, separate auth/simulator certs |
| HMRC fraud prevention headers (PLAN_HMRC_FRAUD_PREVENTION_HEADERS) | Done — Gov-Vendor-Public-IP, Gov-Client-Public-Port, EdgeStack ORP forwards CloudFront-Viewer-Address |
| Resource lookup by domain convention | Done — `.github/actions/lookup-resources` replaces `vars.COGNITO_*` env vars and CloudFormation output passing |
| Cognito domain alignment | Done — `{env}-auth.diyaccounting.co.uk` (was `{env}-auth.submit.diyaccounting.co.uk`) |
| Simulator domain alignment | Done — `{env}-simulator.diyaccounting.co.uk` (was `{env}-simulator.submit.diyaccounting.co.uk`) |
| Holding page domain alignment | Done — `{env}-holding.diyaccounting.co.uk` (was `{env}-holding.submit.diyaccounting.co.uk`) |

### Items from prior plans still open

| Item | Notes |
|---|---|
| Submit site cutdown | spreadsheets.html and diy-accounting-spreadsheets.html on submit should link out to spreadsheets site |
| Payslip 10 for 2023-24+ | Old repo doesn't have Payslip 10 after 2022-23; check if discontinued |
| security.txt on spreadsheets | Gateway has it, spreadsheets doesn't |
| Cookie consent banner | GA4 defaults to `analytics_storage: 'denied'`; need consent banner to allow opt-in |
| Configure GA4 conversions | Mark `purchase` and `begin_checkout` as conversion events in GA4 console |
| Link Google Ads | Check if remarketing campaigns (conversion ID `1065724931`) are still active |

---

## Phase 1: Production domain mapping

**Goal**: Point the live `diyaccounting.co.uk`, `www.diyaccounting.co.uk`, and `spreadsheets.diyaccounting.co.uk` domains to the new sites. No new AWS accounts. No new repos.

### Scoreboard

| Step | Description | Status |
|------|-------------|--------|
| 1.1 | Deploy prod gateway stack | Ready to trigger |
| 1.2 | Deploy prod spreadsheets stack | Ready to trigger |
| 1.3 | Deploy root DNS for prod subdomains | After 1.1/1.2 |
| 1.4 | ACM cert for gateway apex domains | Manual — AWS console |
| 1.5 | ACM cert for spreadsheets prod domain | Manual — AWS console |
| 1.6 | Update GatewayStack domain names + cert ARN | Code change after certs |
| 1.7 | Update SpreadsheetsStack domain names + cert ARN | Code change after certs |
| 1.8 | DNS switchover: apex → gateway | After merge to main |
| 1.9 | DNS switchover: spreadsheets | After merge to main |
| 1.10 | Validate live domains | After DNS switchover |
| 1.11 | Decommission old www distribution | ~1 week after go-live |
| 1.12 | GA4 property + streams | Done |
| 1.12a | Retire old GA4 stream | ~1 week after go-live |
| 1.13 | gtag.js on all sites | Done |
| 1.14 | Ecommerce events (spreadsheets + gateway) | Done |
| 1.15 | Ecommerce events (submit) | Done |
| 1.16 | Configure conversions in GA4 | After events flowing |
| 1.17 | Link Google Ads | Check if campaigns active |
| 1.18 | Cross-domain tracking | Done |
| 1.19 | CSP headers for analytics | Done |
| 1.20 | Privacy policy | Done |

### Steps

| Step | Description | Details |
|------|-------------|---------|
| 1.1 | Deploy prod gateway stack | Dispatch deploy-gateway.yml with env=prod. Creates `prod-gateway-GatewayStack`. |
| 1.2 | Deploy prod spreadsheets stack | Dispatch deploy-spreadsheets.yml with env=prod. Creates `prod-spreadsheets-SpreadsheetsStack`. |
| 1.3 | Deploy root DNS for prod | Run deploy-root.yml to create `prod-gateway.diyaccounting.co.uk` and `prod-spreadsheets.diyaccounting.co.uk` alias records. Verify both respond. |
| 1.4 | New ACM cert for gateway apex domains | Request a new ACM cert in us-east-1 covering: `diyaccounting.co.uk`, `www.diyaccounting.co.uk`, `ci-gateway.diyaccounting.co.uk`, `prod-gateway.diyaccounting.co.uk`. Add DNS validation CNAMEs to root Route53 zone. |
| 1.5 | New ACM cert for spreadsheets prod domain | Request a new ACM cert covering: `spreadsheets.diyaccounting.co.uk`, `ci-spreadsheets.diyaccounting.co.uk`, `prod-spreadsheets.diyaccounting.co.uk`. Add DNS validation CNAMEs. |
| 1.6 | Update GatewayStack domain names for prod | Pass `DOMAIN_NAMES=prod-gateway.diyaccounting.co.uk,diyaccounting.co.uk,www.diyaccounting.co.uk` to the prod gateway deployment. Update `cdk-gateway/cdk.json` certificateArn. Redeploy. |
| 1.7 | Update SpreadsheetsStack domain names for prod | Pass `DOMAIN_NAMES=prod-spreadsheets.diyaccounting.co.uk,spreadsheets.diyaccounting.co.uk` to the prod spreadsheets deployment. Update `cdk-spreadsheets/cdk.json` certificateArn. Redeploy. |
| 1.8 | Update root DNS: apex → gateway | Run deploy-root.yml to update `diyaccounting.co.uk` and `www.diyaccounting.co.uk` A/AAAA alias records to point to prod gateway CloudFront. Replaces old `d2nnnfnriqw5mg.cloudfront.net`. |
| 1.9 | Update root DNS: spreadsheets | Create `spreadsheets.diyaccounting.co.uk` A/AAAA alias record pointing to prod spreadsheets CloudFront. |
| 1.10 | Validate live domains | Verify `https://diyaccounting.co.uk`, `https://www.diyaccounting.co.uk`, and `https://spreadsheets.diyaccounting.co.uk` all serve correct content. Test redirects from old www URLs. |
| 1.11 | Decommission old www distribution | Disable/delete old CloudFront distribution `d2nnnfnriqw5mg.cloudfront.net` and its S3 origin. |

### Go-live execution plan

**Approach**: All sites ready to go to prod while still in a single AWS account and single repository. Merge to main, deploy prod, run deploy-root DNS — that's the full live switchover.

**Merge-to-live sequence**:

1. Merge PR to main
2. Main branch auto-deploys submit (via `deploy.yml`)
3. Manually trigger `deploy-gateway.yml` and `deploy-spreadsheets.yml` from main with `environment-name=prod`
4. Verify `prod-gateway.diyaccounting.co.uk` and `prod-spreadsheets.diyaccounting.co.uk`
5. Trigger `deploy-root.yml` — this flips DNS. **You're live.**

Rollback is instant: run `deploy-root.yml` again with the old CloudFront domain.

### ACM cert strategy

Submit's cert strategy is now multi-cert:

| Cert | Region | SANs | Used by |
|------|--------|------|---------|
| Main cert (`d340de40`) | us-east-1 | `submit.diyaccounting.co.uk`, `*.submit.diyaccounting.co.uk`, `ci-submit.diyaccounting.co.uk`, `prod-submit.diyaccounting.co.uk`, `ci-holding.diyaccounting.co.uk`, `prod-holding.diyaccounting.co.uk` | EdgeStack, ApexStack |
| Auth cert (`8750ac93`) | us-east-1 | `ci-auth.diyaccounting.co.uk`, `prod-auth.diyaccounting.co.uk` | IdentityStack (Cognito custom domain) |
| Simulator cert (`5b8afa59`) | us-east-1 | `ci-simulator.diyaccounting.co.uk`, `prod-simulator.diyaccounting.co.uk` | SimulatorStack |
| Regional cert (`1f9c9a57`) | eu-west-2 | `submit.diyaccounting.co.uk`, `*.submit.diyaccounting.co.uk`, `ci-submit.diyaccounting.co.uk`, `prod-submit.diyaccounting.co.uk` | ApiStack (API Gateway custom domain) |

For gateway and spreadsheets, new certs are needed that also cover the bare production domains. ACM doesn't support modifying existing certs — must request new and swap.

### Google Analytics 4 and conversion tracking

GA4 property "DIY Accounting" (ID `523400333`) with three data streams. Measurement IDs in `google-analytics.toml`. An old GA4 stream (`G-PJPVQWRWJZ` on `www.diyaccounting.co.uk`) is still receiving traffic — retire ~1 week after go-live.

Ecommerce events implemented: `view_item_list`, `view_item`, `begin_checkout`, `add_to_cart`, `purchase` on spreadsheets; `login`, `begin_checkout`, `purchase` on submit; `select_content` on gateway.

CSP headers updated across all stacks to allow `https://*.google-analytics.com` (connect-src), `https://www.googletagmanager.com` (script-src, connect-src), and pixel domains (img-src).

### Consent and privacy

- Default consent mode: `analytics_storage: 'denied'` (all sites)
- Privacy policy updated with GA4 section
- Still needed: cookie consent banner for opt-in
- GA4 data retention: 14 months
- IP anonymization: on by default in GA4

---

## Phase 2: Separate GitHub repositories

**Goal**: Each service gets its own GitHub repository with independent CI/CD, versioning, and deployment pipelines. Four repositories total: root (DNS/org-level), gateway, spreadsheets, and submit. All continue deploying to submit-prod initially — account separation is Phase 3.

**Prerequisite**: Phase 1 complete (production domains live and validated).

**Why repos before accounts**: Repository separation is lower risk than account separation — repos can deploy to the same AWS account using different OIDC trust entries. This lets us validate each repo's CI/CD pipeline independently before adding the complexity of cross-account roles and new ACM certs.

### Target repositories

| Repository | GitHub URL | Content | Source |
|---|---|---|---|
| Root | TBD — new repo (see naming below) | Route53 zone, RootDnsStack, holding page | Created fresh from submit |
| Gateway | `antonycc/www.diyaccounting.co.uk` | Gateway static site, CloudFront Function redirects | Archive-and-overlay existing repo |
| Spreadsheets | `antonycc/diy-accounting` | Spreadsheets site, package hosting, knowledge base, community discussions | Archive-and-overlay existing repo |
| Submit | `antonycc/submit.diyaccounting.co.uk` | Submit application (Lambda, Cognito, DynamoDB, API GW) | This repo — remove migrated code |

**Repository naming — root repo (open decision)**:

Both existing old repos (`www.diyaccounting.co.uk` for gateway, `diy-accounting` for spreadsheets) are needed for their intended services, so the root repo must be new. Options:
1. `antonycc/diyaccounting-root` — descriptive, matches its purpose
2. `antonycc/diyaccounting-web` — "web" grouping name
3. `antonycc/diy-accounting-infrastructure` — explicit infrastructure focus
4. Decide at implementation time

**Note**: The `antonycc/diy-accounting` repository already exists and hosts the GitHub Discussions that the community page reads from. The spreadsheets code will land here alongside those discussions.

### Approach

**Root repo**: Created fresh. Copy relevant files from submit, set up minimal CDK project.

**Gateway and spreadsheets repos**: Archive-and-overlay into the **existing** GitHub repositories. This preserves GitHub Discussions, repo settings, stars, and issue history.

For each existing repo:
1. Create `archive/` directory and move **all existing repo files** into it (old site content, old build scripts, old README, etc.)
2. Copy the relevant subset of files from the submit repo into the repo root
3. Trim the excess submit code (remove submit-specific and other-site code)
4. Fill gaps from `archive/` — pull back anything useful from the old repo (e.g. older package zips, the original README, historical assets)
5. Clean up `archive/` at leisure — it stays in git for reference

### Execution order

Root first (thinnest slice, establishes the pattern), then gateway, then spreadsheets, then submit cleanup. Each repo is independently deployable and testable before moving to the next.

### Steps

| Step | Description |
|------|-------------|
| | **Root — new repository** |
| 2.1 | Create new GitHub repository for root |
| 2.2 | Set up minimal project: `pom.xml` (CDK infra module only), `package.json` (Playwright, Vitest, prettier, eslint, ncu) |
| 2.3 | Copy root-relevant files from submit repo (see "What goes in the root repo" below) |
| 2.4 | Adapt `deploy-root.yml` → `deploy.yml` (main workflow), keep `deploy-holding.yml` |
| 2.5 | Add OIDC trust for the new repo in submit-prod account's GitHub Actions role |
| 2.6 | Deploy from root repo. Verify DNS records resolve correctly for all services. |
| 2.7 | Verify holding page deploys from root repo (`{env}-holding.diyaccounting.co.uk`) |
| | **Gateway — `antonycc/www.diyaccounting.co.uk`** |
| 2.8 | In existing repo: `mkdir archive && git mv` all current files into `archive/` |
| 2.9 | Copy relevant submit repo files into the repo root (see "What each site repo carries over") |
| 2.10 | Remove submit-specific and spreadsheets-specific code (see "What to remove" below) |
| 2.11 | Trim `package.json` — remove submit-specific deps (aws-sdk, dynamodb, cognito, ngrok, etc.), keep Playwright, Vitest, prettier, eslint, ncu |
| 2.12 | Trim `pom.xml` — single CDK module, remove Lambda/Docker modules |
| 2.13 | Trim `CLAUDE.md` — remove submit-specific sections (HMRC obligations, Lambda conventions, system tests, Docker, behaviour test proxy mode), keep CDK rules, git workflow, test commands, deployment workflow |
| 2.14 | Adapt `playwright.config.js` — keep only `gatewayBehaviour` project |
| 2.15 | Adapt deploy workflow — rename to `deploy.yml`, remove submit-specific jobs |
| 2.16 | Fill gaps from `archive/` — pull back useful old assets (README history, any old content worth preserving) |
| 2.17 | Add OIDC trust for `antonycc/www.diyaccounting.co.uk` in submit-prod account |
| 2.18 | Deploy from gateway repo. Run `test:gatewayBehaviour-ci`. Verify. |
| | **Spreadsheets — `antonycc/diy-accounting`** |
| 2.19 | In existing repo: `mkdir archive && git mv` all current files into `archive/` (preserves GitHub Discussions) |
| 2.20 | Copy relevant submit repo files into the repo root |
| 2.21 | Remove submit-specific and gateway-specific code (see "What to remove" below) |
| 2.22 | Trim `package.json` — same approach as 2.11 |
| 2.23 | Trim `pom.xml` — single CDK module |
| 2.24 | Trim `CLAUDE.md` — keep spreadsheets-specific sections |
| 2.25 | Adapt `playwright.config.js` — keep only `spreadsheetsBehaviour` project |
| 2.26 | Adapt deploy workflow — rename to `deploy.yml`, remove submit-specific jobs |
| 2.27 | Fill gaps from `archive/` — pull back old packages, README, build scripts, any historical assets |
| 2.28 | Add OIDC trust for `antonycc/diy-accounting` in submit-prod account |
| 2.29 | Deploy from spreadsheets repo. Run `test:spreadsheetsBehaviour-ci`. Verify. |
| | **Submit repo cleanup** |
| 2.30 | Remove root files: `RootDnsStack`, `deploy-root.yml`, `deploy-holding.yml`, `web/holding/` |
| 2.31 | Remove gateway files: `GatewayStack`, `deploy-gateway.yml`, `cdk-gateway/`, `web/www.diyaccounting.co.uk/` |
| 2.32 | Remove spreadsheets files: `SpreadsheetsStack`, `deploy-spreadsheets.yml`, `cdk-spreadsheets/`, `web/spreadsheets.diyaccounting.co.uk/`, `packages/` |
| 2.33 | Remove gateway and spreadsheets behaviour tests from submit |
| 2.34 | Clean up submit `package.json`, `pom.xml` — remove gateway/spreadsheets/root build references |
| 2.35 | Remove OIDC trust entries for submit repo that targeted gateway/spreadsheets/root deployments (if any were shared) |

### What goes in the root repo

The root repo is thin — it manages the DNS zone and the holding/maintenance page:

| Asset | Purpose |
|---|---|
| `RootDnsStack.java` | Route53 alias records for all services (submit, gateway, spreadsheets) |
| Holding page stack | CloudFront + S3 for `{env}-holding.diyaccounting.co.uk` |
| `web/holding/` | Holding page content (maintenance page with GA4 analytics) |
| `deploy.yml` (adapted from `deploy-root.yml`) | DNS deployment workflow |
| `deploy-holding.yml` | Holding/maintenance page workflow |
| `cdk-root/cdk.json` | CDK app configuration |
| Shared CDK lib | `SubmitSharedNames.java`, `KindCdk.java` (subset needed) |
| `pom.xml` | Minimal — CDK infra module only |
| `package.json` | Minimal — Playwright (if holding test), Vitest, prettier |
| `.env.ci`, `.env.prod` | Environment configs (trimmed to DNS/holding vars) |
| AI assistant configs | `CLAUDE.md` (trimmed), `.claude/`, `.junie/`, copilot instructions |

**What root does NOT have**: Lambda functions, DynamoDB, Cognito, API Gateway, Docker, ngrok, HMRC anything.

**Cross-repo coordination**: All four repos depend on root for DNS. When gateway or spreadsheets change their CloudFront distribution (e.g., during account migration in Phase 3), root must update the alias records. This is the one cross-repo coordination point. A deploy of root does NOT require redeployment of gateway, spreadsheets, or submit — it only updates DNS pointers.

### What each site repo carries over

The site repositories are this repository with things deleted. Each one keeps:

#### Behaviour tests (run against local or deployed)

Each repo keeps its own behaviour test and the full test infrastructure needed to run it against any environment:

| Asset | Gateway repo | Spreadsheets repo |
|---|---|---|
| Behaviour test file | `behaviour-tests/gateway.behaviour.test.js` | `behaviour-tests/spreadsheets.behaviour.test.js` |
| Playwright config | `playwright.config.js` (trimmed to one project) | `playwright.config.js` (trimmed to one project) |
| Test helpers | `behaviour-tests/helpers/` (subset needed) | `behaviour-tests/helpers/` (subset needed) |
| Video reporter | `scripts/playwright-video-reporter.js` | `scripts/playwright-video-reporter.js` |
| Report generator | `scripts/generate-test-reports.js` | `scripts/generate-test-reports.js` |

npm scripts to keep:
```
test:gatewayBehaviour           test:spreadsheetsBehaviour
test:gatewayBehaviour-ci        test:spreadsheetsBehaviour-ci
test:gatewayBehaviour-prod      test:spreadsheetsBehaviour-prod
```

Environment files: `.env.ci`, `.env.prod` (trimmed to relevant vars only: `GATEWAY_BASE_URL` / `SPREADSHEETS_BASE_URL`, `ENVIRONMENT_NAME`).

#### Library update scripts

| Script | Purpose | All site repos |
|---|---|---|
| `scripts/update.sh` | General dependency update | Yes |
| `scripts/update-java.sh` | Java/Maven dependency update | Yes |
| npm `update-to-minor` | Upgrade npm packages to latest minor | Yes |
| npm `update-to-greatest` | Upgrade npm packages to latest (excl. alpha) | Yes |
| `.ncurc.json` | npm-check-updates config | Yes |

#### AI assistant configuration

| File/Dir | Purpose | All site repos |
|---|---|---|
| `CLAUDE.md` | Claude Code guidance (trimmed to relevant sections) | Yes |
| `.claude/settings.json` | Claude allowed/denied commands | Yes |
| `.claude/rules/cdk-infrastructure.md` | CDK infrastructure rules | Yes |
| `.junie/guidelines.md` | Junie testing guidelines | Yes |
| `.github/copilot-instructions.md` | GitHub Copilot instructions | Yes |

#### Naming conventions, styles, and CI jobs

| Asset | Purpose | All site repos |
|---|---|---|
| `.prettierrc` | Code formatting (double quotes, trailing commas, 140 width) | Yes |
| `.editorconfig` | Editor settings (UTF-8, LF, 140 max line for Java) | Yes |
| `.gitignore` | Source control ignore patterns | Yes |
| `.retireignore.json` | Vulnerability scanner ignore list | Yes |
| `.pa11yci.*.json` | Accessibility testing configs | Yes |
| `.zap-rules.tsv` | OWASP ZAP security rules | Yes |

GitHub Actions workflow conventions carried over:
- Job naming: `params`, `names`, `deploy-{component}`, `test-{component}`
- `params` job: normalises `(auto)` inputs into concrete values
- `names` job: computes deployment name, environment name, base URLs from branch
- Environment name derivation: `ci` for feature branches, `prod` for main
- CDK stack naming: `{env}-{app}-{StackName}`
- Domain convention: `{env}-{service}.diyaccounting.co.uk` (e.g., `ci-gateway.diyaccounting.co.uk`, `ci-spreadsheets.diyaccounting.co.uk`)

#### CDK infrastructure

| Asset | Root repo | Gateway repo | Spreadsheets repo |
|---|---|---|---|
| Stack class | `RootDnsStack.java`, holding stack | `GatewayStack.java` | `SpreadsheetsStack.java` |
| Environment class | `RootEnvironment.java` (new) | `GatewayEnvironment.java` | `SpreadsheetsEnvironment.java` |
| CDK config | `cdk-root/cdk.json` (new) | `cdk-gateway/cdk.json` | `cdk-spreadsheets/cdk.json` |
| Shared CDK lib | `SubmitSharedNames.java`, `KindCdk.java` | `SubmitSharedNames.java`, `KindCdk.java` | `SubmitSharedNames.java`, `KindCdk.java` |

#### Build scripts

| Script | Root repo | Gateway repo | Spreadsheets repo |
|---|---|---|---|
| `scripts/build-gateway-redirects.cjs` | No | Yes | No |
| `scripts/build-sitemaps.cjs` | No | Yes (gateway portion) | Yes (spreadsheets portion) |
| `scripts/build-packages.cjs` | No | No | Yes |
| `scripts/generate-knowledge-base-toml.cjs` | No | No | Yes |

#### Web content and styles

| Asset | Root repo | Gateway repo | Spreadsheets repo |
|---|---|---|---|
| Doc root | `web/holding/` | `web/www.diyaccounting.co.uk/public/` | `web/spreadsheets.diyaccounting.co.uk/public/` |
| CSS | N/A | `gateway.css` | `spreadsheets.css` |
| Analytics | Holding page GA4 | `lib/analytics.js` (G-C76HK806F1) | `lib/analytics.js` (G-X4ZPD99X2K) |

#### GitHub Actions workflows

| Workflow | Root repo | Gateway repo | Spreadsheets repo |
|---|---|---|---|
| `deploy.yml` | DNS alias records + holding page | Build redirects + sitemaps, CDK deploy, smoke test | Build sitemaps + packages, CDK deploy, S3 sync zips, smoke test |
| `synthetic-test.yml` | N/A (or holding page smoke test) | Run `gatewayBehaviour` against deployed env | Run `spreadsheetsBehaviour` against deployed env |
| `test.yml` | N/A | Unit tests (if any) | Unit tests (web/unit-tests) |
| `compliance.yml` | N/A | Pa11y accessibility, retire.js, eslint security | Pa11y accessibility, retire.js, eslint security |
| `codeql.yml` | Code scanning | Code scanning | Code scanning |

### What stays in the submit repo

After Phase 2 cleanup, submit retains only submit-specific code:

- All submit application code (Lambda, API Gateway, Cognito, DynamoDB)
- Submit web content (`web/public/`)
- Submit CDK stacks and workflows (with API Gateway custom domains, EdgeStack ORP forwarding CloudFront-Viewer-Address)
- `deploy-environment.yml` (submit environment stacks: IdentityStack, DataStack, ObservabilityStack, SimulatorStack)
- `.github/actions/lookup-resources` (domain-convention-based resource discovery — submit-specific)
- `.github/actions/get-names` (deployment/environment name computation)
- `.github/actions/set-origins` (CloudFront alias + API GW custom domain transfer)
- Submit behaviour tests (submitVat, auth, bundles, tokenEnforcement, payment)

**No longer in submit**: `deploy-root.yml`, `RootDnsStack`, `deploy-gateway.yml`, `GatewayStack`, `deploy-spreadsheets.yml`, `SpreadsheetsStack`, `deploy-holding.yml`, `web/holding/`, `web/www.diyaccounting.co.uk/`, `web/spreadsheets.diyaccounting.co.uk/`, `packages/`, `cdk-gateway/`, `cdk-spreadsheets/`.

### What each repo looks like after separation

| Aspect | Root repo | Gateway repo | Spreadsheets repo | Submit repo |
|---|---|---|---|---|
| CDK stacks | 2 (RootDnsStack, holding) | 1 (GatewayStack) | 1 (SpreadsheetsStack) | ~8 (Auth, Api, Edge, Hmrc, etc.) |
| Lambda | 0 | 0 | 0 | ~15 |
| Java modules | 1 (infra) | 1 (infra) | 1 (infra) | 3 (infra, app, shared) |
| Workflows | 1-2 (deploy, maybe codeql) | 3 (deploy, synthetic-test, compliance) | 3 (deploy, synthetic-test, compliance) | ~10 (deploy, test, env, etc.) |
| Behaviour tests | 0 | 1 (gateway) | 1 (spreadsheets) | 4+ (submitVat, auth, bundles, etc.) |
| Test environments | ci, prod | ci, prod | ci, prod | ci, prod |
| Build scripts | 0 | redirects, sitemaps | packages, sitemaps, knowledge-base TOML | N/A |
| npm deps | ~5 | ~15 | ~15 | ~40 |

### What to remove from the copied submit code

After copying submit repo files into site repos, remove this submit-specific and other-site code. The repo's own old files are already safe in `archive/`.

**From gateway repo** (remove these after copying from submit):
- `app/` — all Lambda functions, services, middleware
- `web/public/` — submit frontend
- `web/spreadsheets.diyaccounting.co.uk/` — spreadsheets frontend
- `web/holding/` — holding page (now in root repo)
- `packages/` — spreadsheet zip files
- `infra/.../` — all stacks except GatewayStack, GatewayEnvironment, shared CDK utils
- `cdk-application/`, `cdk-environment/`, `cdk-spreadsheets/` — submit and spreadsheets CDK configs
- `behaviour-tests/` — all except gateway.behaviour.test.js and needed helpers
- `scripts/build-packages.cjs`, `scripts/generate-knowledge-base-toml.cjs`
- `.github/workflows/deploy.yml`, `deploy-spreadsheets.yml`, `deploy-root.yml`, `deploy-environment.yml`, `deploy-holding.yml`
- `.env.test`, `.env.proxy` — submit-specific env files
- Docker files, ngrok config, HMRC-related test fixtures

**From spreadsheets repo** (remove these after copying from submit):
- `app/` — all Lambda functions, services, middleware
- `web/public/` — submit frontend
- `web/www.diyaccounting.co.uk/` — gateway frontend
- `web/holding/` — holding page (now in root repo)
- `infra/.../` — all stacks except SpreadsheetsStack, SpreadsheetsEnvironment, shared CDK utils
- `cdk-application/`, `cdk-environment/`, `cdk-gateway/` — submit and gateway CDK configs
- `behaviour-tests/` — all except spreadsheets.behaviour.test.js and needed helpers
- `scripts/build-gateway-redirects.cjs`
- `.github/workflows/deploy.yml`, `deploy-gateway.yml`, `deploy-root.yml`, `deploy-environment.yml`, `deploy-holding.yml`
- `.env.test`, `.env.proxy` — submit-specific env files
- Docker files, ngrok config, HMRC-related test fixtures

Add `archive/` to CDK and build tool ignore patterns so it doesn't interfere with deploys, but keep it tracked in git for reference.

### OIDC trust management

During Phase 2, all four repos deploy to the same AWS account (submit-prod). The existing `submit-github-actions-role` trust policy must be updated to allow OIDC assumptions from each new repo:

```
repo:antonycc/www.diyaccounting.co.uk:*
repo:antonycc/diy-accounting:*
repo:antonycc/<root-repo-name>:*
```

The existing `repo:antonycc/submit.diyaccounting.co.uk:*` entry stays. Each repo's deploy workflow uses the same OIDC provider and role chain (`github-actions-role` → `deployment-role`).

In Phase 3, when gateway and spreadsheets get their own AWS accounts, their OIDC entries move to the new accounts and are removed from submit-prod.

### Repository naming

| Repo | GitHub URL | Notes |
|---|---|---|
| Root | TBD (new) | Manages DNS zone and holding page. Name candidates: `diyaccounting-root`, `diyaccounting-web` |
| Gateway | `antonycc/www.diyaccounting.co.uk` | Named after the primary domain it serves |
| Spreadsheets | `antonycc/diy-accounting` | Uses existing repo (has GitHub Discussions). May rename to `diy-accounting-spreadsheets` to avoid ambiguity |
| Submit | `antonycc/submit.diyaccounting.co.uk` | Unchanged |

If `diy-accounting` is renamed to `diy-accounting-spreadsheets`, the OIDC trust policy and workflow references need updating. GitHub supports repository renames with automatic redirects, but OIDC `sub` claims use the current name.

---

## Phase 3: Separate AWS accounts

**Goal**: Move gateway and spreadsheets into their own AWS accounts under the organization. Reduces blast radius, enables independent billing. Submit CI/prod separation is a future consideration.

**Prerequisite**: Phase 2 complete (each service in its own repo, deploying independently to submit-prod).

**Why this is lower priority**: Gateway and spreadsheets are just S3 + CloudFront (tiny blast radius, ~$5/month each). The repos already deploy independently after Phase 2. Account separation adds operational overhead (new OIDC providers, new ACM certs, cross-account DNS validation) for modest security benefit on static sites. The higher-value account separation would be submit CI vs submit prod (shared Lambda, DynamoDB, Cognito) — but that's a much larger undertaking.

### Account creation

| Account | Email | OU | Resources |
|---|---|---|---|
| diy-gateway | aws-gateway@diyaccounting.co.uk | Workloads | S3, CloudFront, ACM cert |
| diy-spreadsheets | aws-spreadsheets@diyaccounting.co.uk | Workloads | S3, CloudFront, ACM cert |

Neither account needs Route53 — DNS stays in submit-prod (managed by the root repo's RootDnsStack). Neither needs Lambda, DynamoDB, API Gateway, or Cognito.

### Steps

| Step | Description |
|------|-------------|
| | **Gateway account** |
| 3.1 | Create `diy-gateway` AWS account under organization |
| 3.2 | Bootstrap: CDK bootstrap (us-east-1 + eu-west-2), OIDC provider, github-actions-role, deployment-role |
| 3.3 | Create ACM cert in gateway account. DNS validation via root zone in submit-prod. |
| 3.4 | Update gateway repo's `deploy.yml` to target the gateway account (new ACTIONS_ROLE_ARN, DEPLOY_ROLE_ARN) |
| 3.5 | Update gateway repo's `cdk.json` with new account's cert ARN |
| 3.6 | Deploy gateway to new account from gateway repo. Verify at ci-gateway domain. |
| 3.7 | Update root DNS alias records (via root repo) to point to new account's CloudFront distributions |
| 3.8 | Tear down old gateway stacks in submit-prod account |
| 3.9 | Remove gateway OIDC trust entry from submit-prod's github-actions-role |
| | **Spreadsheets account** |
| 3.10 | Create `diy-spreadsheets` AWS account under organization |
| 3.11 | Bootstrap: CDK, OIDC, roles (same pattern as 3.2) |
| 3.12 | Create ACM cert in spreadsheets account |
| 3.13 | Update spreadsheets repo's `deploy.yml` to target the spreadsheets account |
| 3.14 | Update spreadsheets repo's `cdk.json` with new account's cert ARN |
| 3.15 | Deploy spreadsheets to new account from spreadsheets repo. Verify at ci-spreadsheets domain. |
| 3.16 | Update root DNS alias records to point to new account's CloudFront distributions |
| 3.17 | Tear down old spreadsheets stacks in submit-prod account |
| 3.18 | Remove spreadsheets OIDC trust entry from submit-prod's github-actions-role |
| | **Local tooling** |
| 3.19 | Create assume-role scripts: `aws-assume-gateway-role.sh`, `aws-assume-spreadshsheets-role.sh` (in respective repos) |

### Cross-account DNS validation

Gateway and spreadsheets ACM certs need DNS validation, but the Route53 zone is in submit-prod. Two approaches:

1. **Manual CNAME**: Copy the ACM validation CNAME values from the new account and create them in submit-prod's Route53 zone (via root repo or manually). One-time operation per cert.
2. **Cross-account delegation**: Grant the new accounts' CDK limited Route53 access in submit-prod. More automated but more complex IAM.

Recommend option 1 for simplicity — ACM certs are rarely recreated.

### Rollback strategy

Keep the old stacks in submit-prod until the new-account versions are validated. DNS cutover is a single alias record update via the root repo — rollback is running the root repo's deploy workflow again with the old CloudFront domain.

### Future considerations

| Item | Notes |
|---|---|
| Submit CI/prod account separation | Higher security value (shared Lambda, DynamoDB, Cognito) but much larger effort. Would require a `submit-ci` account, duplicating environment stacks, secrets, and Cognito pools. |
| Route53 zone to management account | Logically the DNS zone belongs in the org management account. Would require cross-account alias record permissions for all service accounts. Low priority while only one person operates the infrastructure. |
| Root repo to management account | If a management account is created, the root repo could deploy there instead of submit-prod. Same trade-off as Route53 migration. |

---

## Risk summary

| Risk | Mitigation |
|---|---|
| DNS cutover causes downtime | CloudFront alias changes propagate in seconds. Old distributions kept until verified. Rollback is a single deploy from root repo. |
| ACM cert validation delay | Request certs days before planned cutover. DNS validation typically completes in minutes. |
| New account missing permissions | Bootstrap script follows proven pattern from submit-prod. Test with CI deployment before touching prod. |
| Repository migration breaks builds | Each repo deployed independently and tested before removing from submit. Archive-and-overlay preserves working state. |
| Old www URLs break | CloudFront Function already handles redirects. 301s preserve SEO link equity. Sitemaps guide crawlers to new URLs. |
| `diy-accounting` repo rename breaks OIDC | Update OIDC trust policy in AWS account before renaming. Verify workflow runs after rename. |
| Behaviour tests break in new repo | Tests are environment-agnostic (configurable base URL). Same Playwright config and helpers preserved. Test against CI from new repo before removing from submit. |
| Submit domain alignment breaks existing bookmarks | `submit.diyaccounting.co.uk` kept as prod alias. CI uses `ci-submit.diyaccounting.co.uk`. |
| Root repo becomes single point of failure for DNS | Root repo changes are infrequent (only when CloudFront distributions change). DNS records are durable — a broken root repo deploy doesn't affect existing records. |
| Four repos increase maintenance burden | All four share the same conventions (prettier, editorconfig, CI patterns). Library updates can be scripted across repos. Static site repos are very low-maintenance. |

---

## Domain Convention Reference

All services follow the `{env}-{service}.diyaccounting.co.uk` pattern:

| Service | CI | Prod | Prod alias | Repo |
|---------|-----|------|------------|------|
| Submit | `ci-submit.diyaccounting.co.uk` | `prod-submit.diyaccounting.co.uk` | `submit.diyaccounting.co.uk` | submit |
| Gateway | `ci-gateway.diyaccounting.co.uk` | `prod-gateway.diyaccounting.co.uk` | `diyaccounting.co.uk`, `www.diyaccounting.co.uk` | gateway |
| Spreadsheets | `ci-spreadsheets.diyaccounting.co.uk` | `prod-spreadsheets.diyaccounting.co.uk` | `spreadsheets.diyaccounting.co.uk` | spreadsheets |
| Cognito | `ci-auth.diyaccounting.co.uk` | `prod-auth.diyaccounting.co.uk` | — | submit |
| Holding | `ci-holding.diyaccounting.co.uk` | `prod-holding.diyaccounting.co.uk` | — | root |
| Simulator | `ci-simulator.diyaccounting.co.uk` | `prod-simulator.diyaccounting.co.uk` | — | submit |

---

*Updated: February 2026 (v4.0 — added root repo, reordered repos-before-accounts)*
