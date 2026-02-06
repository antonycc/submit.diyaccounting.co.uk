# Production Launch & Service Separation Plan

**Version**: 2.0 | **Date**: February 2026 | **Status**: In progress

---

```
YOU ARE HERE

You're right — there's a gap. Here's the situation:

What deploy-root.yml / RootDnsStack currently creates:
- ci-gateway.diyaccounting.co.uk → ci gateway CloudFront
- prod-gateway.diyaccounting.co.uk → prod gateway CloudFront
- ci-spreadsheets.diyaccounting.co.uk → ci spreadsheets CloudFront
- prod-spreadsheets.diyaccounting.co.uk → prod spreadsheets CloudFront

What the plan needs for steps 1.8 and 1.9 (the actual go-live DNS switchover):
- diyaccounting.co.uk (apex) → prod gateway CloudFront
- www.diyaccounting.co.uk → prod gateway CloudFront
- spreadsheets.diyaccounting.co.uk → prod spreadsheets CloudFront

These three records don't exist in the code yet. The RootDnsStack needs to be extended with new props and alias records for the bare/apex domains. Then deploy-root.yml and
RootEnvironment.java also need updating to pass those values through.

The plan steps 1.8/1.9 say "Run deploy-root.yml" but gloss over the fact that it's a code change + deploy, not just a deploy. Shall I update the plan to make this explicit,
or would you rather I go ahead and implement the RootDnsStack changes now so it's ready when you need it?

✻ Cooked for 1m 11s

❯ yes, go ahead and implement the RootDnsStack changes now so it's ready and please check my certs, do I need tom add these domains to my existing certs? Or does
assigning the record to cloudfromt automatically find the cert?
```

---

## Current State

Everything runs in the submit-prod AWS account (887764105431). Both gateway and spreadsheets are deployed as CDK stacks within the `submit.diyaccounting.co.uk` repository. CI environments are live and validated:

| Site | CI URL | CF Distribution | Stack |
|------|--------|----------------|-------|
| Gateway | ci-gateway.diyaccounting.co.uk | d2di5r1vxujvjg.cloudfront.net (E1AIEDHRYSUJHK) | ci-gateway-GatewayStack |
| Spreadsheets | ci-spreadsheets.diyaccounting.co.uk | d1w8um5pys16nx.cloudfront.net (E13E50UFAUWZNI) | ci-spreadsheets-SpreadsheetsStack |

Features already built:
- Gateway: static site, about.html (Companies Act), CloudFront Function for URL redirects, sitemaps, security.txt, GA4 analytics with ecommerce events
- Spreadsheets: product catalogue from TOML, package zip hosting on S3, PayPal donate flow, 120-article knowledge base with citation references, community discussions page (GitHub API), financial year cutoff logic, GA4 analytics with ecommerce events
- Root DNS: RootDnsStack manages ci-gateway and ci-spreadsheets alias records via deploy-root.yml
- Redirects: CloudFront Function handles old www.diyaccounting.co.uk URLs with 301 redirects to spreadsheets site
- Behaviour tests: Playwright tests for gateway, spreadsheets, and submit — runnable against local (proxy), CI, and prod environments
- Holding page: maintenance page with GA4 analytics at `{env}-holding.submit.diyaccounting.co.uk`

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

Current certs cover only `ci-*` and `prod-*` prefixed domains. For Phase 1, new certs are needed that also cover the bare production domains.

**Approach**: Request new certs with all needed SANs, update cdk.json ARNs, redeploy. Old certs can be deleted after. ACM doesn't support modifying existing certs — must request new and swap.

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

## Phase 2: Separate AWS accounts

**Goal**: Gateway and spreadsheets each get their own AWS account under the organization. Reduces blast radius, enables independent billing, and prepares for repository separation.

### Account creation

| Account | Email | OU | Resources |
|---|---|---|---|
| diy-gateway | aws-gateway@diyaccounting.co.uk | Workloads | S3, CloudFront, ACM cert |
| diy-spreadsheets | aws-spreadsheets@diyaccounting.co.uk | Workloads | S3, CloudFront, ACM cert |

Neither account needs Route53 — DNS stays in the root zone. Neither needs Lambda, DynamoDB, API Gateway, or Cognito.

### Steps

| Step | Description |
|------|-------------|
| 2.1 | Create `diy-gateway` AWS account under organization |
| 2.2 | Bootstrap: CDK bootstrap (us-east-1 + eu-west-2), OIDC provider, github-actions-role, deployment-role |
| 2.3 | Create ACM cert in gateway account. DNS validation via root zone. |
| 2.4 | Update `deploy-gateway.yml` to target the gateway account (new ACTIONS_ROLE_ARN, DEPLOY_ROLE_ARN) |
| 2.5 | Update `cdk-gateway/cdk.json` with new account's cert ARN |
| 2.6 | Deploy gateway to new account. Verify at ci-gateway domain. |
| 2.7 | Update root DNS alias records to point to new account's CloudFront distributions |
| 2.8 | Tear down old gateway stacks in submit-prod account |
| 2.9 | Create `diy-spreadsheets` AWS account under organization |
| 2.10 | Bootstrap: CDK, OIDC, roles (same pattern as 2.2) |
| 2.11 | Create ACM cert in spreadsheets account |
| 2.12 | Update `deploy-spreadsheets.yml` to target the spreadsheets account |
| 2.13 | Update `cdk-spreadsheets/cdk.json` with new account's cert ARN |
| 2.14 | Deploy spreadsheets to new account. Verify at ci-spreadsheets domain. |
| 2.15 | Update root DNS alias records to point to new account's CloudFront distributions |
| 2.16 | Tear down old spreadsheets stacks in submit-prod account |
| 2.17 | Create assume-role scripts: `aws-assume-gateway-role.sh`, `aws-assume-spreadsheets-role.sh` |

### Rollback strategy

Keep the old stacks in submit-prod until the new-account versions are validated. DNS cutover is a single alias record update via deploy-root.yml — rollback is running deploy-root.yml again with the old CloudFront domain.

---

## Phase 3: Separate GitHub repositories

**Goal**: Gateway and spreadsheets each get their own GitHub repository with independent CI/CD, versioning, and deployment pipelines. The submit repo retains only submit-specific code.

### Approach: archive-and-overlay

Work happens in the **existing** GitHub repositories (`antonycc/www.diyaccounting.co.uk` and `antonycc/diy-accounting`). This preserves GitHub Discussions, repo settings, stars, and issue history.

For each repo:
1. Create `archive/` directory and move **all existing repo files** into it (old site content, old build scripts, old README, etc.)
2. Copy the relevant subset of files from the submit repo into the repo root
3. Trim the excess submit code (remove submit-specific and other-site code)
4. Fill gaps from `archive/` — pull back anything useful from the old repo (e.g. older package zips, the original README, historical assets)
5. Clean up `archive/` at leisure — it stays in git for reference

### Target repositories

| Repository | GitHub URL | Content |
|---|---|---|
| `www.diyaccounting.co.uk` | `antonycc/www.diyaccounting.co.uk` | Gateway site |
| `diy-accounting` | `antonycc/diy-accounting` | Spreadsheets site (may rename to `diy-accounting-spreadsheets`) |

**Note**: The `antonycc/diy-accounting` repository already exists and hosts the GitHub Discussions that the community page reads from. The spreadsheets code will land here alongside those discussions.

### What each new repo carries over

The new repositories are this repository with things deleted. Each one keeps:

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

| Script | Purpose | Both repos |
|---|---|---|
| `scripts/update.sh` | General dependency update | Yes |
| `scripts/update-java.sh` | Java/Maven dependency update | Yes |
| npm `update-to-minor` | Upgrade npm packages to latest minor | Yes |
| npm `update-to-greatest` | Upgrade npm packages to latest (excl. alpha) | Yes |
| `.ncurc.json` | npm-check-updates config | Yes |

#### AI assistant configuration

| File/Dir | Purpose | Both repos |
|---|---|---|
| `CLAUDE.md` | Claude Code guidance (trimmed to relevant sections) | Yes |
| `.claude/settings.json` | Claude allowed/denied commands | Yes |
| `.claude/rules/cdk-infrastructure.md` | CDK infrastructure rules | Yes |
| `.junie/guidelines.md` | Junie testing guidelines | Yes |
| `.github/copilot-instructions.md` | GitHub Copilot instructions | Yes |

#### Naming conventions, styles, and CI jobs

| Asset | Purpose | Both repos |
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

#### CDK infrastructure

| Asset | Gateway repo | Spreadsheets repo |
|---|---|---|
| Stack class | `GatewayStack.java` | `SpreadsheetsStack.java` |
| Environment class | `GatewayEnvironment.java` | `SpreadsheetsEnvironment.java` |
| CDK config | `cdk-gateway/cdk.json` | `cdk-spreadsheets/cdk.json` |
| Shared CDK lib | `SubmitSharedNames.java`, `KindCdk.java` | `SubmitSharedNames.java`, `KindCdk.java` |

#### Build scripts

| Script | Gateway repo | Spreadsheets repo |
|---|---|---|
| `scripts/build-gateway-redirects.cjs` | Yes | No |
| `scripts/build-sitemaps.cjs` | Yes (gateway portion) | Yes (spreadsheets portion) |
| `scripts/build-packages.cjs` | No | Yes |
| `scripts/generate-knowledge-base-toml.cjs` | No | Yes |

#### Web content and styles

| Asset | Gateway repo | Spreadsheets repo |
|---|---|---|
| Doc root | `web/www.diyaccounting.co.uk/public/` | `web/spreadsheets.diyaccounting.co.uk/public/` |
| CSS | `gateway.css` | `spreadsheets.css` |
| Analytics | `lib/analytics.js` (G-C76HK806F1) | `lib/analytics.js` (G-X4ZPD99X2K) |

#### GitHub Actions workflows

Each repo gets its own deploy workflow (adapted from the current `deploy-gateway.yml` / `deploy-spreadsheets.yml`) and synthetic test workflow (adapted from `synthetic-test.yml`):

| Workflow | Gateway repo | Spreadsheets repo |
|---|---|---|
| `deploy.yml` | Build redirects + sitemaps, CDK deploy, smoke test | Build sitemaps + packages, CDK deploy, S3 sync zips, smoke test |
| `synthetic-test.yml` | Run `gatewayBehaviour` against deployed env | Run `spreadsheetsBehaviour` against deployed env |
| `test.yml` | Unit tests (if any) | Unit tests (web/unit-tests) |
| `compliance.yml` | Pa11y accessibility, retire.js, eslint security | Pa11y accessibility, retire.js, eslint security |
| `codeql.yml` | Code scanning | Code scanning |

### Steps

| Step | Description |
|------|-------------|
| | **Gateway — `antonycc/www.diyaccounting.co.uk`** |
| 3.1 | In existing `antonycc/www.diyaccounting.co.uk` repo: `mkdir archive && git mv` all current files into `archive/` |
| 3.2 | Copy relevant submit repo files into the repo root (see "What each new repo carries over" above) |
| 3.3 | Remove submit-specific and spreadsheets-specific code (see "What to remove" below) |
| 3.4 | Trim `package.json` — remove submit-specific deps (aws-sdk, dynamodb, cognito, ngrok, etc.), keep Playwright, Vitest, prettier, eslint, ncu |
| 3.5 | Trim `pom.xml` — single CDK module, remove Lambda/Docker modules |
| 3.6 | Trim `CLAUDE.md` — remove submit-specific sections (HMRC obligations, Lambda conventions, system tests, Docker, behaviour test proxy mode), keep CDK rules, git workflow, test commands, deployment workflow |
| 3.7 | Adapt `playwright.config.js` — keep only `gatewayBehaviour` project |
| 3.8 | Adapt deploy workflow — rename to `deploy.yml`, remove submit-specific jobs |
| 3.9 | Fill gaps from `archive/` — pull back useful old assets (README history, any old content worth preserving) |
| 3.10 | Configure OIDC trust for `antonycc/www.diyaccounting.co.uk` in gateway AWS account |
| 3.11 | Deploy from gateway repo. Run `test:gatewayBehaviour-ci`. Verify. |
| | **Spreadsheets — `antonycc/diy-accounting`** |
| 3.12 | In existing `antonycc/diy-accounting` repo: `mkdir archive && git mv` all current files into `archive/` (preserves GitHub Discussions) |
| 3.13 | Copy relevant submit repo files into the repo root |
| 3.14 | Remove submit-specific and gateway-specific code |
| 3.15 | Trim `package.json` — same approach as 3.4 |
| 3.16 | Trim `pom.xml` — single CDK module |
| 3.17 | Trim `CLAUDE.md` — same approach as 3.6, keep spreadsheets-specific sections |
| 3.18 | Adapt `playwright.config.js` — keep only `spreadsheetsBehaviour` project |
| 3.19 | Adapt deploy workflow — rename to `deploy.yml`, remove submit-specific jobs |
| 3.20 | Fill gaps from `archive/` — pull back old packages, README, build scripts, any historical assets |
| 3.21 | Configure OIDC trust for `antonycc/diy-accounting` in spreadsheets AWS account |
| 3.22 | Deploy from spreadsheets repo. Run `test:spreadsheetsBehaviour-ci`. Verify. |
| | **Submit repo cleanup** |
| 3.23 | Remove migrated files from submit repo (GatewayStack, SpreadsheetsStack, web dirs, cdk-gateway, cdk-spreadsheets, packages, related scripts, gateway/spreadsheets workflows) |
| 3.24 | Clean up submit repo: remove deploy-gateway.yml, deploy-spreadsheets.yml, gateway/spreadsheets behaviour tests |

### What stays in the submit repo

- All submit application code (Lambda, API Gateway, Cognito, DynamoDB)
- Submit web content (`web/public/`)
- Submit CDK stacks and workflows
- `deploy-root.yml` and `RootDnsStack` (manages DNS for all services)
- `deploy-environment.yml` (submit environment stacks)
- Submit behaviour tests (submitVat, auth, bundles, tokenEnforcement)
- Holding page (`web/holding/`)

### What each new repo looks like

| Aspect | Gateway repo | Spreadsheets repo |
|---|---|---|
| CDK stacks | 1 (GatewayStack) | 1 (SpreadsheetsStack) |
| Lambda | 0 | 0 |
| Java modules | 1 (infra) | 1 (infra) |
| Workflows | 3 (deploy, synthetic-test, compliance) | 3 (deploy, synthetic-test, compliance) |
| Behaviour tests | 1 (gateway.behaviour.test.js) | 1 (spreadsheets.behaviour.test.js) |
| Test environments | ci, prod | ci, prod |
| Build scripts | redirects, sitemaps | packages, sitemaps, knowledge-base TOML |
| AI assistants | CLAUDE.md, .claude/, .junie/, copilot | CLAUDE.md, .claude/, .junie/, copilot |
| npm deps | ~15 (Playwright, Vitest, ncu, prettier) | ~15 (Playwright, Vitest, ncu, prettier) |

### What to remove from the copied submit code

After copying submit repo files in, remove this submit-specific and other-site code. The repo's own old files are already safe in `archive/`.

**From gateway repo** (remove these after copying from submit):
- `app/` — all Lambda functions, services, middleware
- `web/public/` — submit frontend
- `web/spreadsheets.diyaccounting.co.uk/` — spreadsheets frontend
- `web/holding/` — holding page
- `packages/` — spreadsheet zip files
- `infra/.../` — all stacks except GatewayStack, GatewayEnvironment, shared CDK utils
- `cdk-application/`, `cdk-environment/`, `cdk-spreadsheets/` — submit and spreadsheets CDK configs
- `behaviour-tests/` — all except gateway.behaviour.test.js and needed helpers
- `scripts/build-packages.cjs`, `scripts/generate-knowledge-base-toml.cjs`
- `.github/workflows/deploy.yml`, `deploy-spreadsheets.yml`, `deploy-root.yml`, `deploy-environment.yml`
- `.env.test`, `.env.proxy` — submit-specific env files
- Docker files, ngrok config, HMRC-related test fixtures

**From spreadsheets repo** (remove these after copying from submit):
- `app/` — all Lambda functions, services, middleware
- `web/public/` — submit frontend
- `web/www.diyaccounting.co.uk/` — gateway frontend
- `web/holding/` — holding page
- `infra/.../` — all stacks except SpreadsheetsStack, SpreadsheetsEnvironment, shared CDK utils
- `cdk-application/`, `cdk-environment/`, `cdk-gateway/` — submit and gateway CDK configs
- `behaviour-tests/` — all except spreadsheets.behaviour.test.js and needed helpers
- `scripts/build-gateway-redirects.cjs`
- `.github/workflows/deploy.yml`, `deploy-gateway.yml`, `deploy-root.yml`, `deploy-environment.yml`
- `.env.test`, `.env.proxy` — submit-specific env files
- Docker files, ngrok config, HMRC-related test fixtures

Add `archive/` to CDK and build tool ignore patterns so it doesn't interfere with deploys, but keep it tracked in git for reference.

### deploy-root.yml ownership

`deploy-root.yml` stays in the submit repo. It manages root account DNS for gateway, spreadsheets, and submit. Moving it to its own repo is a future consideration when/if submit itself splits into ci/prod accounts.

### Repository naming

| Current plan | GitHub URL | Notes |
|---|---|---|
| Gateway | `antonycc/www.diyaccounting.co.uk` | Named after the primary domain it serves |
| Spreadsheets | `antonycc/diy-accounting` | Uses existing repo (has GitHub Discussions). May rename to `diy-accounting-spreadsheets` to avoid ambiguity |

If `diy-accounting` is renamed to `diy-accounting-spreadsheets`, the OIDC trust policy and workflow references need updating. GitHub supports repository renames with automatic redirects, but OIDC `sub` claims use the current name.

---

## Risk summary

| Risk | Mitigation |
|---|---|
| DNS cutover causes downtime | CloudFront alias changes propagate in seconds. Old distributions kept until verified. Rollback is a single deploy-root.yml run. |
| ACM cert validation delay | Request certs days before planned cutover. DNS validation typically completes in minutes. |
| New account missing permissions | Bootstrap script follows proven pattern from submit-prod. Test with CI deployment before touching prod. |
| Repository migration breaks builds | Each repo deployed independently and tested before removing from submit. Fork-and-delete preserves working state. |
| Old www URLs break | CloudFront Function already handles redirects. 301s preserve SEO link equity. Sitemaps guide crawlers to new URLs. |
| `diy-accounting` repo rename breaks OIDC | Update OIDC trust policy in AWS account before renaming. Verify workflow runs after rename. |
| Behaviour tests break in new repo | Tests are environment-agnostic (configurable base URL). Same Playwright config and helpers preserved. Test against CI from new repo before removing from submit. |

---

*Updated: February 2026*
