# Production Launch & Service Separation Plan

**Version**: 1.0 | **Date**: February 2026 | **Status**: Draft

---

## Current State

Everything runs in the submit-prod AWS account (887764105431). Both gateway and spreadsheets are deployed as CDK stacks within the `submit.diyaccounting.co.uk` repository. CI environments are live and validated:

| Site | CI URL | CF Distribution | Stack |
|------|--------|----------------|-------|
| Gateway | ci-gateway.diyaccounting.co.uk | d2di5r1vxujvjg.cloudfront.net (E1AIEDHRYSUJHK) | ci-gateway-GatewayStack |
| Spreadsheets | ci-spreadsheets.diyaccounting.co.uk | d1w8um5pys16nx.cloudfront.net (E13E50UFAUWZNI) | ci-spreadsheets-SpreadsheetsStack |

Features already built:
- Gateway: static site, about.html (Companies Act), CloudFront Function for URL redirects, sitemaps, security.txt
- Spreadsheets: product catalogue from TOML, package zip hosting on S3, PayPal donate flow, 120-article knowledge base, financial year cutoff logic
- Root DNS: RootDnsStack manages ci-gateway and ci-spreadsheets alias records via deploy-root.yml
- Redirects: CloudFront Function handles old www.diyaccounting.co.uk URLs with 301 redirects to spreadsheets site

### Items from prior plans completed or superseded

| Old Plan Item | Status |
|---|---|
| Package hosting (PLAN_SPREADSHEETS Phase 2) | Done early — build-packages.cjs generates zips, deploy-spreadsheets.yml syncs to S3 |
| Catalogue automation (PLAN_SPREADSHEETS Phase 2) | Done early — build-packages.cjs generates catalogue.toml |
| SEO redirect mapping (PLAN_SPREADSHEETS Phase 3) | Done — redirects.toml + CloudFront Function on gateway |
| robots.txt / sitemap.xml (PLAN_SPREADSHEETS Phase 3) | Done — both sites have robots.txt and generated sitemaps |
| Gateway CloudFront Function redirects (PLAN_WWW Phase 3) | Done — handles article, product, feature URL patterns |
| about.html Companies Act page (PLAN_WWW Section 8) | Done |
| security.txt (PLAN_WWW Section 7) | Done on gateway |

### Items from prior plans still open

| Item | Notes |
|---|---|
| Submit site cutdown | spreadsheets.html and diy-accounting-spreadsheets.html on submit should link out to spreadsheets site |
| Payslip 10 for 2023-24+ | Old repo doesn't have Payslip 10 after 2022-23; check if discontinued |
| security.txt on spreadsheets | Gateway has it, spreadsheets doesn't |
| Google Analytics | Not added to either site; decide if wanted |
| Schema.org JSON-LD on about.html | Check if added |
| Pa11y/axe configs for spreadsheets | PLAN_SPREADSHEETS step 1.12 marked done but verify |

---

## Phase 1: Production domain mapping

**Goal**: Point the live `diyaccounting.co.uk`, `www.diyaccounting.co.uk`, and `spreadsheets.diyaccounting.co.uk` domains to the new sites. No new AWS accounts. No new repos.

```
 Good — plan file cleaned up. Here's where we stand:

  Status right now
  ┌──────────────────────────────────┬────────────────────────────┐
  │               Item               │           Status           │
  ├──────────────────────────────────┼────────────────────────────┤
  │ CI gateway deploy                │ In progress                │
  ├──────────────────────────────────┼────────────────────────────┤
  │ CI spreadsheets deploy           │ In progress                │
  ├──────────────────────────────────┼────────────────────────────┤
  │ Submit deploy                    │ Queued (waiting for tests) │
  ├──────────────────────────────────┼────────────────────────────┤
  │ GA4 ecommerce events (1.14/1.15) │ Background task running    │
  ├──────────────────────────────────┼────────────────────────────┤
  │ Privacy policy (1.20)            │ Done                       │
  ├──────────────────────────────────┼────────────────────────────┤
  │ Plan file cleanup                │ Done                       │
  └──────────────────────────────────┴────────────────────────────┘
  What's next after CI deployments land

  Once CI deploys complete, we can run the new behaviour tests against CI to validate everything works:
  npm run test:gatewayBehaviour-ci
  npm run test:spreadsheetsBehaviour-ci

  Then the remaining steps toward go-live are:
  1. Deploy prod stacks (1.1/1.2) — from this branch
  2. ACM certs (1.4/1.5) — manual in AWS console, you'll need to do this
  3. Update stack domain names (1.6/1.7) — code change with new cert ARNs
  4. Test against prod — behaviour tests
  5. Merge to main — PR
  6. DNS flip — deploy-root.yml

  Do you want me to start on anything else while we wait for the deployments and ecommerce task to finish?

✻ Worked for 4m 7s · 1 agent running in the background

⏺ Agent "Implement GA4 ecommerce events" completed

⏺ Ecommerce events are done and committed. Here's what was added:

  Spreadsheets site

  - view_item_list on product catalogue page
  - view_item when product selected in download dropdown
  - begin_checkout on "Download with donation" click
  - add_to_cart on "Download without donating" click
  - purchase on PayPal donation completion (PayPal Donate SDK doesn't expose transaction ID, so uses timestamp fallback)

  Submit site

  - login after successful Cognito authentication
  - begin_checkout when VAT submission starts
  - purchase when HMRC returns success receipt (uses formBundleNumber as transaction ID)

  Gateway site

  - select_content on clicks to spreadsheets and submit navigation buttons

  Steps 1.14 and 1.15 marked done. All 714 tests pass.

  Let me push and check deployment status.

⏺ Bash(git add -A && git status --short)
  ⎿  (No content)

⏺ Bash(gh run list --branch claude/pre-golive-fixes --limit 8 --json name,status,conclusion,databaseId --jq '.[] | "\(.status) \(.conclusion // "-") \(.name)"')
  ⎿  completed success deploy spreadsheets from claude/pre-golive-fixes
     completed success deploy gateway from claude/pre-golive-fixes
     completed success CodeQL
     … +5 lines (ctrl+o to expand)

⏺ Gateway and spreadsheets CI deployments both succeeded. Submit deploy still in progress.

⏺ Bash(git diff --cached --stat)
  ⎿  (No content)

⏺ Bash(git status)
  ⎿  On branch claude/pre-golive-fixes
     nothing to commit, working tree clean

⏺ The background agent already committed everything. Let me check what's committed and push.

⏺ Bash(git log --oneline -8)
  ⎿  298831c9 feat: add GA4 ecommerce event tracking across all three sites
     d0015de4 feat: update production plan with AWS account and repository transition details
     216823c7 feat: add behaviour tests, GA config, and updated compliance reports
     … +5 lines (ctrl+o to expand)

⏺ I see the ecommerce events agent committed and the plan update too, but my privacy policy changes and plan cleanup are already included in d0015de4 (the plan update commit).
   Let me check if privacy is actually in there or if I need a separate commit.

⏺ Bash(git show --stat d0015de4)
  ⎿  commit d0015de4828476cab85bd1e14906690dd5373119
     Author: Antony at Polycode <antony@polycode.co.uk>
     Date:   Thu Feb 5 21:12:12 2026 +0100
     … +5 lines (ctrl+o to expand)

⏺ That's just your plan edit. Let me check if the privacy HTML and plan cleanup are included in the ecommerce commit.

⏺ Bash(git show --stat 298831c9)
  ⎿  commit 298831c9429453db3dbfc766cf2df6c623c7acd6
     Author: Antony at Polycode <antony@polycode.co.uk>
     Date:   Thu Feb 5 21:15:26 2026 +0100
     … +30 lines (ctrl+o to expand)

⏺ The ecommerce agent included the privacy policy and plan updates in its commit. Everything is committed. Let me push.

⏺ Bash(git push origin claude/pre-golive-fixes)
  ⎿  To github.com:antonycc/submit.diyaccounting.co.uk.git
        216823c7..298831c9  claude/pre-golive-fixes -> claude/pre-golive-fixes

⏺ Pushed. This will trigger new CI deployments with the ecommerce events included.

  Current scoreboard
  ┌─────────────────────────────────────────────────────┬────────────────────────────────┐
  │                    Phase 1 Step                     │             Status             │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.1 Deploy prod gateway                             │ Next — ready to trigger        │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.2 Deploy prod spreadsheets                        │ Next — ready to trigger        │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.3 Deploy root DNS for prod subdomains             │ After 1.1/1.2                  │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.4/1.5 ACM certs for apex domains                  │ Manual — you do in AWS console │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.6/1.7 Update stacks with domain names + cert ARNs │ Code change after certs ready  │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.8/1.9 DNS switchover                              │ After merge to main            │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.10 Validate live domains                          │ After DNS switchover           │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.11 Decommission old www                           │ ~1 week after go-live          │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.12 GA4 property                                   │ Done                           │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.12a Retire old GA4 stream                         │ ~1 week after go-live          │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.13 gtag.js on all sites                           │ Done                           │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.14 Ecommerce events (spreadsheets)                │ Done                           │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.15 Ecommerce events (submit)                      │ Done                           │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.16 Configure conversions in GA4                   │ After events flowing           │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.17 Link Google Ads                                │ Check if campaigns active      │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.18 Cross-domain tracking                          │ Done                           │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.19 CSP headers                                    │ Done                           │
  ├─────────────────────────────────────────────────────┼────────────────────────────────┤
  │ 1.20 Privacy policy                                 │ Done                           │
  └─────────────────────────────────────────────────────┴────────────────────────────────┘
  Want me to trigger the prod deployments (1.1/1.2) now? Or would you prefer to wait for the CI behaviour tests to validate first?

```


### Prerequisites

- Deploy prod gateway and prod spreadsheets stacks (same pattern as CI, triggered from main branch)
- Verify prod sites at `prod-gateway.diyaccounting.co.uk` and `prod-spreadsheets.diyaccounting.co.uk`

### Steps

| Step | Description | Details |
|------|-------------|---------|
| 1.1 | Deploy prod gateway stack | Merge gateway branch to main or dispatch deploy-gateway.yml with env=prod. Creates `prod-gateway-GatewayStack`. |
| 1.2 | Deploy prod spreadsheets stack | Dispatch deploy-spreadsheets.yml with env=prod. Creates `prod-spreadsheets-SpreadsheetsStack`. |
| 1.3 | Deploy root DNS for prod | Run deploy-root.yml to create `prod-gateway.diyaccounting.co.uk` and `prod-spreadsheets.diyaccounting.co.uk` alias records. Verify both respond. |
| 1.4 | New ACM cert for gateway apex domains | Request a new ACM cert (or add SANs to existing) in us-east-1 covering: `diyaccounting.co.uk`, `www.diyaccounting.co.uk`, `ci-gateway.diyaccounting.co.uk`, `prod-gateway.diyaccounting.co.uk`. Add DNS validation CNAMEs to root Route53 zone. Wait for validation. |
| 1.5 | New ACM cert for spreadsheets prod domain | Request a new ACM cert (or add SANs to existing) covering: `spreadsheets.diyaccounting.co.uk`, `ci-spreadsheets.diyaccounting.co.uk`, `prod-spreadsheets.diyaccounting.co.uk`. Add DNS validation CNAMEs. Wait for validation. |
| 1.6 | Update GatewayStack domain names for prod | Pass `DOMAIN_NAMES=prod-gateway.diyaccounting.co.uk,diyaccounting.co.uk,www.diyaccounting.co.uk` to the prod gateway deployment. Update `cdk-gateway/cdk.json` certificateArn to the new cert. Redeploy. |
| 1.7 | Update SpreadsheetsStack domain names for prod | Pass `DOMAIN_NAMES=prod-spreadsheets.diyaccounting.co.uk,spreadsheets.diyaccounting.co.uk` to the prod spreadsheets deployment. Update `cdk-spreadsheets/cdk.json` certificateArn to the new cert. Redeploy. |
| 1.8 | Update root DNS: apex → gateway | Run deploy-root.yml (or extend RootDnsStack) to update `diyaccounting.co.uk` and `www.diyaccounting.co.uk` A/AAAA alias records to point to the prod gateway CloudFront distribution. This replaces the old `d2nnnfnriqw5mg.cloudfront.net`. |
| 1.9 | Update root DNS: spreadsheets | Create `spreadsheets.diyaccounting.co.uk` A/AAAA alias record pointing to the prod spreadsheets CloudFront distribution. |
| 1.10 | Validate live domains | Verify `https://diyaccounting.co.uk`, `https://www.diyaccounting.co.uk`, and `https://spreadsheets.diyaccounting.co.uk` all serve the correct content. Test redirects from old www URLs. |
| 1.11 | Decommission old www distribution | Once validated, disable/delete the old CloudFront distribution `d2nnnfnriqw5mg.cloudfront.net` and its S3 origin. |

### Go-live execution plan

**Approach**: All sites ready to go to prod while still in a single AWS account and single repository, all on branch `claude/pre-golive-fixes`. Merge to main, deploy prod, run deploy-root DNS — that's the full live switchover. AWS account split and repository split come later (Phase 2/3).

**Merge-to-live sequence** (DNS switchover happens after merge to main):

1. Merge PR to main
2. Main branch auto-deploys submit (via `deploy.yml`)
3. Manually trigger `deploy-gateway.yml` and `deploy-spreadsheets.yml` from main with `environment-name=prod`
4. Verify `prod-gateway.diyaccounting.co.uk` and `prod-spreadsheets.diyaccounting.co.uk`
5. Trigger `deploy-root.yml` — this flips DNS. **You're live.**

Rollback is instant: run `deploy-root.yml` again with the old CloudFront domain.

### RootDnsStack changes for Phase 1

Add props and records for apex domains:

```java
// New props
String apexCloudFrontDomain();         // same as prodGatewayCloudFrontDomain
String spreadsheetsCloudFrontDomain(); // same as prodSpreadsheetsCloudFrontDomain

// New records
diyaccounting.co.uk          A/AAAA alias → prod gateway CF
www.diyaccounting.co.uk      A/AAAA alias → prod gateway CF
spreadsheets.diyaccounting.co.uk A/AAAA alias → prod spreadsheets CF
```

### ACM cert strategy

Current certs cover only `ci-*` and `prod-*` prefixed domains. For Phase 1, new certs are needed that also cover the bare production domains. Two options:

**Option A** (recommended): Request new certs with all needed SANs, update cdk.json ARNs, redeploy. Old certs can be deleted after.

**Option B**: Add SANs to existing certs (ACM doesn't support modifying certs — must request new ones and swap).

Either way, this is a one-time manual operation in the AWS console, same as the original cert creation.

### Google Analytics 4 and conversion tracking

The old `www.diyaccounting.co.uk` used Universal Analytics (`UA-1035014-1`) with basic pageview tracking only — no event tracking, no ecommerce, no GA4. UA stopped collecting data in July 2023. The old site also had a Google Ads remarketing pixel (conversion ID `1065724931`).

An existing GA4 property was found with an active stream for `www.diyaccounting.co.uk` (Measurement ID `G-PJPVQWRWJZ`, stream ID `5793048524`) that is currently receiving traffic. A new GA4 property (ID `523400333`) has been created with three data streams for the new sites. See `google-analytics.toml` for all IDs.

**Goal**: Implement GA4 across all three sites with full ecommerce event tracking and conversion tracking, using the new property. Run the old and new properties in parallel for ~1 week post go-live, then retire the old stream once traffic levels match.

#### Steps

| Step | Description |
|------|-------------|
| 1.12 | **Create GA4 property** — DONE. Property "DIY Accounting" (ID `523400333`) created in account `1035014` with three web data streams. Measurement IDs recorded in `google-analytics.toml`. |
| 1.12a | **Retire old GA4 stream** (~1 week after go-live). Compare traffic levels between old stream (`G-PJPVQWRWJZ` on `www.diyaccounting.co.uk`) and new gateway stream (`G-C76HK806F1` on `diyaccounting.co.uk`). Once comparable, delete the old stream from the old property. |
| 1.13 | **Add gtag.js snippet to all three sites** — DONE. External `lib/analytics.js` on each site initialises dataLayer, sets `consent: 'denied'` default, configures the measurement ID, and dynamically loads gtag.js. Script tag added to every HTML page. |
| 1.14 | **Implement GA4 ecommerce events on spreadsheets site** — DONE. Added `view_item_list` on index.html (product catalogue), `view_item` on product selection in download-page.js, `begin_checkout` on donate link click and donate page load, `add_to_cart` on direct download click, and `purchase` on PayPal donation completion in donate-page.js. Gateway site also has `select_content` events on navigation buttons. |
| 1.15 | **Implement GA4 ecommerce events on submit site** — DONE. Added `login` event on Cognito callback, `begin_checkout` on VAT return form submission, and `purchase` with HMRC receipt reference on successful submission. |
| 1.16 | **Configure conversions in GA4 console**. Mark `purchase` (donation completed) and `begin_checkout` (download initiated) as conversion events. |
| 1.17 | **Link Google Ads account** if the remarketing pixel (conversion ID `1065724931`) is still in use. Set up GA4 audiences for remarketing. |
| 1.18 | **Set up cross-domain tracking** — DONE. All three domains configured in GA4 tag settings so cross-site sessions are linked. Referral exclusions set. |
| 1.19 | **Update CSP headers** — DONE. Added `https://www.googletagmanager.com` to `script-src` and `connect-src`, and `https://www.google-analytics.com` to `connect-src` and `img-src` in GatewayStack, SpreadsheetsStack, EdgeStack, and ApexStack. |
| 1.20 | **Update privacy policy** — DONE. Added GA4 section to privacy.html covering data collected, consent model, retention (14 months), Google as data processor, ICO disclosure updated. |

#### GA4 ecommerce event mapping — spreadsheets site

The product catalogue and donation flow map to GA4's recommended retail ecommerce events:

| User action | GA4 event | Parameters |
|---|---|---|
| Views product catalogue (index.html) | `view_item_list` | `item_list_name: "Products"`, items array |
| Selects product on download page | `view_item` | `item_id`, `item_name`, `price`, `currency: "GBP"` |
| Selects period/clicks "Download with donation" | `begin_checkout` | `item_id`, `item_name`, `price`, `currency: "GBP"` |
| Completes PayPal donation | `purchase` | `transaction_id` (from PayPal), `value` (donation amount), `currency: "GBP"`, item details |
| Clicks "Download without donating" | `add_to_cart` | `item_id`, `item_name`, `price: 0`, `currency: "GBP"` |

#### Product pricing for ecommerce tracking

Current products are free with voluntary donations. For GA4 ecommerce events, use `price: 0` and `currency: "GBP"` for all current products. When paid tiers are introduced (e.g. `resident-pro` at £12.99), add them to the catalogue with pricing:

```toml
# Example future paid product in catalogue.toml
[[products]]
id = "ResidentPro"
name = "Resident Pro"
description = "..."
price = "12.99"
currency = "GBP"
```

The gtag `purchase` event should capture the actual PayPal donation amount (available from the PayPal Donate SDK `onComplete` callback) as the `value` parameter, even for voluntary donations. This provides real revenue tracking regardless of whether products have a set price.

#### GA4 event mapping — submit site

| User action | GA4 event | Parameters |
|---|---|---|
| Lands on submit home page | `page_view` | (automatic) |
| Logs in via Cognito | `login` | `method: "cognito"` |
| Starts VAT return submission | `begin_checkout` | `item_name: "VAT Return"`, `item_id: "vat-return"` |
| Submits VAT return to HMRC | `purchase` | `transaction_id` (HMRC receipt ref), `value: 0`, `currency: "GBP"` |

#### GA4 event mapping — gateway site

| User action | GA4 event | Parameters |
|---|---|---|
| Lands on gateway | `page_view` | (automatic) |
| Clicks through to spreadsheets | `select_content` | `content_type: "product_link"`, `item_id: "spreadsheets"` |
| Clicks through to submit | `select_content` | `content_type: "product_link"`, `item_id: "submit"` |

#### Carry forward from old www.diyaccounting.co.uk

Check and bring across these tracking assets from the old site where still relevant:

| Asset | Old site location | Action |
|---|---|---|
| Google Ads remarketing pixel (ID `1065724931`) | `footer.html` | Evaluate if Google Ads campaigns are still active. If so, link to GA4 audiences instead of legacy remarketing tag. If not, skip. |
| Google site verification files (`googleXXX.html`) | 4 files in site root | Check if needed for Google Search Console access. If the same Google account is used, verify via DNS TXT record instead (already have `_domainkey` etc.). |
| Facebook `fb:admins` meta tag | All pages | Check if a Facebook page (`DIY.Accounting.Software`) is still maintained. Add Open Graph meta tags to new sites if so. |
| Open Graph image/URL tags | All pages | Add `og:image`, `og:url`, `og:site_name`, `og:type` meta tags to spreadsheets and gateway for social sharing. Use product screenshots for spreadsheets pages. |
| Schema.org JSON-LD Product markup | index.html | Already present on spreadsheets `index.html`. Extend with `offers.price` when paid products are introduced. |
| Google Search Console | (external) | Register all three production domains in Google Search Console. Submit sitemaps. Monitor indexing of new URLs and crawl of 301 redirects from old URLs. |

#### Consent and privacy

GA4 must respect GDPR/UK data protection:
- Default consent mode: `analytics_storage: 'denied'`
- Cookie banner on all three sites (can be a shared component or inline)
- On acceptance: `gtag('consent', 'update', { analytics_storage: 'granted' })`
- Cookie policy documented in privacy page
- GA4 data retention: set to 14 months (maximum) in GA4 admin
- IP anonymization: on by default in GA4 (no action needed)
- Google Signals: enable for cross-device tracking if desired

---

## Phase 2: Separate AWS accounts

**Goal**: Gateway and spreadsheets each get their own AWS account under the organization. Reduces blast radius, enables independent billing, and prepares for repository separation.

### Account creation

| Account | Email | OU | Resources |
|---|---|---|---|
| diy-gateway | aws-gateway@diyaccounting.co.uk | Workloads | S3, CloudFront, ACM cert |
| diy-spreadsheets | aws-spreadsheets@diyaccounting.co.uk | Workloads | S3, CloudFront, ACM cert |

Neither account needs Route53 — DNS stays in the root zone (centralised, Option 1 from PLAN_WWW). Neither needs Lambda, DynamoDB, API Gateway, or Cognito.

### Steps

| Step | Description |
|------|-------------|
| 2.1 | Create `diy-gateway` AWS account under organization |
| 2.2 | Bootstrap: CDK bootstrap (us-east-1 + eu-west-2), OIDC provider, github-actions-role, deployment-role |
| 2.3 | Create ACM cert in gateway account for `diyaccounting.co.uk`, `www.diyaccounting.co.uk`, `ci-gateway.diyaccounting.co.uk`, `prod-gateway.diyaccounting.co.uk`. DNS validation via root zone. |
| 2.4 | Update `deploy-gateway.yml` to target the gateway account (new ACTIONS_ROLE_ARN, DEPLOY_ROLE_ARN) |
| 2.5 | Update `cdk-gateway/cdk.json` with new account's cert ARN |
| 2.6 | Deploy gateway to new account. Verify at ci-gateway domain. |
| 2.7 | Update root DNS alias records to point to new account's CloudFront distributions |
| 2.8 | Tear down old gateway stacks in submit-prod account |
| 2.9 | Create `diy-spreadsheets` AWS account under organization |
| 2.10 | Bootstrap: CDK, OIDC, roles (same pattern as 2.2) |
| 2.11 | Create ACM cert in spreadsheets account for `spreadsheets.diyaccounting.co.uk`, `ci-spreadsheets.diyaccounting.co.uk`, `prod-spreadsheets.diyaccounting.co.uk` |
| 2.12 | Update `deploy-spreadsheets.yml` to target the spreadsheets account |
| 2.13 | Update `cdk-spreadsheets/cdk.json` with new account's cert ARN |
| 2.14 | Deploy spreadsheets to new account. Verify at ci-spreadsheets domain. |
| 2.15 | Update root DNS alias records to point to new account's CloudFront distributions |
| 2.16 | Tear down old spreadsheets stacks in submit-prod account |
| 2.17 | Create assume-role scripts: `aws-assume-gateway-role.sh`, `aws-assume-spreadsheets-role.sh` |

### Cross-account DNS (no delegation needed)

Gateway and spreadsheets domains are at the root level or one level deep — no subdomain delegation is required. Route53 alias records in the root zone can point to CloudFront distributions in any AWS account. The existing `deploy-root.yml` / `RootDnsStack` pattern handles this.

### Rollback strategy

Keep the old stacks in submit-prod until the new-account versions are validated. DNS cutover is a single alias record update via deploy-root.yml — rollback is running deploy-root.yml again with the old CloudFront domain.

---

## Phase 3: Separate GitHub repositories

**Goal**: Gateway and spreadsheets each get their own GitHub repository with independent CI/CD, versioning, and deployment pipelines. The submit repo retains only submit-specific code.

### New repositories

| Repository | Content migrated from submit repo |
|---|---|
| `gateway.diyaccounting.co.uk` | `web/www.diyaccounting.co.uk/`, `infra/.../GatewayStack.java`, `infra/.../GatewayEnvironment.java`, `cdk-gateway/`, gateway portion of `deploy-root.yml`, `scripts/build-gateway-redirects.cjs`, `scripts/build-sitemaps.cjs` (gateway portion), `web/www.diyaccounting.co.uk/redirects.toml` |
| `spreadsheets.diyaccounting.co.uk` | `web/spreadsheets.diyaccounting.co.uk/`, `infra/.../SpreadsheetsStack.java`, `infra/.../SpreadsheetsEnvironment.java`, `cdk-spreadsheets/`, `packages/`, `scripts/build-packages.cjs`, `scripts/build-sitemaps.cjs` (spreadsheets portion), `scripts/generate-knowledge-base-toml.cjs` |

### Steps

| Step | Description |
|------|-------------|
| 3.1 | Create `gateway.diyaccounting.co.uk` repository |
| 3.2 | Migrate gateway files: web content, CDK stack, workflow, build scripts |
| 3.3 | Set up minimal pom.xml (single CDK module) and package.json |
| 3.4 | Configure OIDC trust for new repo in gateway AWS account (update github-actions-role trust policy to include new repo name) |
| 3.5 | Deploy from new repo. Verify. |
| 3.6 | Create `spreadsheets.diyaccounting.co.uk` repository |
| 3.7 | Migrate spreadsheets files: web content, packages, CDK stack, workflow, build scripts |
| 3.8 | Set up minimal pom.xml and package.json |
| 3.9 | Configure OIDC trust for new repo in spreadsheets AWS account |
| 3.10 | Deploy from new repo. Verify. |
| 3.11 | Remove migrated files from submit repo (GatewayStack, SpreadsheetsStack, web dirs, cdk-gateway, cdk-spreadsheets, packages, related scripts) |
| 3.12 | Update deploy-root.yml: keep it in submit repo (or move to its own repo?) since it manages root account DNS for all services |
| 3.13 | Clean up submit repo workflows (remove deploy-gateway.yml, deploy-spreadsheets.yml) |

### What stays in the submit repo

- All submit application code (Lambda, API Gateway, Cognito, DynamoDB)
- Submit web content (`web/public/`)
- Submit CDK stacks and workflows
- `deploy-root.yml` and `RootDnsStack` (manages DNS for all services)
- `deploy-environment.yml` (submit environment stacks)

### What each new repo looks like

Drastically simpler than submit:

| Aspect | Gateway repo | Spreadsheets repo |
|---|---|---|
| CDK stacks | 1 (GatewayStack) | 1 (SpreadsheetsStack) |
| Lambda | 0 | 0 |
| Java modules | 1 (infra) | 1 (infra) |
| Workflows | 1 (deploy.yml) | 1 (deploy.yml) |
| Test tiers | Smoke only | Smoke only |
| npm packages | Minimal | Minimal |

### deploy-root.yml ownership

`deploy-root.yml` stays in the submit repo for now. It manages root account DNS for gateway, spreadsheets, and submit. Moving it to its own repo is a future consideration when/if submit itself splits into ci/prod accounts.

---

## Risk summary

| Risk | Mitigation |
|---|---|
| DNS cutover causes downtime | CloudFront alias changes propagate in seconds. Old distributions kept until verified. Rollback is a single deploy-root.yml run. |
| ACM cert validation delay | Request certs days before planned cutover. DNS validation typically completes in minutes. |
| New account missing permissions | Bootstrap script follows proven pattern from submit-prod. Test with CI deployment before touching prod. |
| Repository migration breaks builds | Phase 3 happens after Phase 2 is stable. Each repo is deployed independently before removing from submit. |
| Old www URLs break | CloudFront Function already handles redirects. 301s preserve SEO link equity. Sitemaps guide crawlers to new URLs. |

---

*Generated: February 2026*
