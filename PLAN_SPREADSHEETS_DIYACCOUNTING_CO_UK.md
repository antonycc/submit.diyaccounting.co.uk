# DIY Accounting Spreadsheets - Repository & Site Plan

**Version**: 1.0 | **Date**: February 2026 | **Status**: Draft

---

## 1. Vision

`spreadsheets.diyaccounting.co.uk` is the product site for DIY Accounting's Excel bookkeeping spreadsheets. It replaces the legacy `www.diyaccounting.co.uk` as the primary way customers browse, select, and download spreadsheet packages.

The site follows the gateway site's minimal design philosophy: static HTML/CSS, no build toolchain, accessible, fast-loading. It adds just enough interactivity (product selection, PayPal donate, download) to serve its purpose.

### What This Site Does

1. **Browse** the product catalogue (Basic Sole Trader, Self Employed, Company Accounts, Taxi Driver, Payslips)
2. **Select** a product and accounting period (year-end date)
3. **Donate** optionally via PayPal before downloading
4. **Download** the zip package containing Excel workbooks and user guides
5. **Read** accounting articles (migrated from the old www site over time)

### What This Site Does Not Do

- No user accounts or authentication
- No shopping cart or payment processing (donations are voluntary)
- No server-side logic (all static, with downloads served from a catalogue container or S3)
- No build step for the site itself (plain HTML/CSS like the gateway)

---

## 2. Repository Structure

### Phase 1: Within the Submit Repository

Phase 1 lives entirely inside the existing `submit.diyaccounting.co.uk` repository, following the same pattern as GatewayStack. New directories are added alongside existing ones:

```
submit.diyaccounting.co.uk/              # Existing repository
+-- .github/
|   +-- workflows/
|   |   +-- deploy-spreadsheets.yml      # NEW: Deploy spreadsheets site to S3/CloudFront
|   |   +-- deploy.yml                   # Existing submit deployment
|   |   +-- deploy-gateway.yml           # Existing gateway deployment
|   |   +-- ...
+-- infra/
|   +-- main/java/.../stacks/
|       +-- SpreadsheetsStack.java       # NEW: S3 + CloudFront (modelled on GatewayStack)
|       +-- GatewayStack.java            # Existing
|       +-- ...
+-- cdk-spreadsheets/
|   +-- cdk.json                         # NEW: CDK context for spreadsheets stack
+-- web/
|   +-- spreadsheets.diyaccounting.co.uk/
|   |   +-- public/
|   |       +-- index.html               # Homepage: product catalogue with screenshots
|   |       +-- product.html             # Product detail (query param: ?product=X)
|   |       +-- download.html            # Period selection + donate/download
|   |       +-- donate.html              # PayPal donation interstitial
|   |       +-- about.html               # Redirect/link to diyaccounting.co.uk/about.html
|   |       +-- spreadsheets.css         # Stylesheet (based on gateway.css)
|   |       +-- spreadsheets.js          # Minimal JS: product selection, lightbox, PayPal
|   |       +-- images/
|   |       |   +-- spreadsheets/        # Product screenshots (from submit)
|   |       |   +-- company/             # Logo, branding
|   |       +-- catalogue.json           # Product metadata (hand-curated or generated)
|   |       +-- favicon.ico, favicon.svg, etc.
|   |       +-- robots.txt
|   |       +-- sitemap.xml
|   |       +-- .well-known/security.txt
|   +-- public/                          # Existing submit site content
|   +-- diyaccounting.co.uk/             # Existing gateway site content
+-- ...existing submit directories...
```

### Phase 2: Separate Repository

When Phase 2 creates the standalone `spreadsheets.diyaccounting.co.uk` repository, the structure expands to include package syncing, catalogue automation, article content, and its own deployment scripts:

```
spreadsheets.diyaccounting.co.uk/        # New repository
+-- .github/
|   +-- workflows/
|   |   +-- deploy.yml                   # Deploy static site to S3/CloudFront
|   |   +-- synthetic-test.yml           # Basic smoke tests
|   +-- actions/
|       +-- get-names/action.yml         # Copied from submit (simplified)
+-- infra/
|   +-- main/java/.../stacks/
|       +-- SpreadsheetsStack.java       # S3 + CloudFront (migrated from submit repo)
+-- cdk-spreadsheets/
|   +-- cdk.json                         # CDK context (certificateArn, hostedZoneId, etc.)
+-- web/
|   +-- public/
|       +-- index.html                   # Homepage: product catalogue with screenshots
|       +-- product.html                 # Product detail (query param: ?product=X)
|       +-- download.html                # Period selection + donate/download
|       +-- donate.html                  # PayPal donation interstitial
|       +-- articles.html                # Article index (content migration)
|       +-- article.html                 # Individual article (query param: ?article=X)
|       +-- about.html                   # Redirect/link to diyaccounting.co.uk/about.html
|       +-- spreadsheets.css             # Stylesheet (based on gateway.css)
|       +-- spreadsheets.js              # Minimal JS: product selection, lightbox, PayPal
|       +-- images/
|       |   +-- spreadsheets/            # Product screenshots (from submit)
|       |   +-- company/                 # Logo, branding
|       +-- articles/                    # Static article HTML files (migrated)
|       +-- catalogue.json               # Product metadata (generated from diy-accounting)
|       +-- favicon.ico, favicon.svg, etc.
|       +-- robots.txt
|       +-- sitemap.xml
|       +-- .well-known/security.txt
+-- scripts/
|   +-- generate-catalogue.sh            # Build catalogue.json from diy-accounting packages
|   +-- sync-packages-to-s3.sh           # Sync zip packages from diy-accounting to S3
|   +-- aws-assume-spreadsheets-role.sh
+-- pom.xml                              # CDK build (minimal, single module)
+-- package.json                          # npm scripts for deploy, test
+-- .env.ci
+-- .env.prod
```

---

## 3. Design

### Design Principles

- **Gateway-like simplicity**: Same minimal aesthetic as `diyaccounting.co.uk` gateway
- **Familiar touches**: Bring across the product grid image, the PayPal donate button, and the old-site colour palette where it adds warmth without clashing
- **No framework**: Plain HTML, CSS, minimal vanilla JS
- **Accessible**: WCAG 2.1 AA, skip links, focus states, semantic HTML
- **Mobile-first**: 600px responsive breakpoint (same as gateway)

### Stylesheet: `spreadsheets.css`

Based on `gateway.css` (367 lines), extended with:

- Same design tokens: `#2c5aa0` primary, Arial sans-serif, 800px max-width
- Product card styles (from `spreadsheets.html` in submit: white cards, 8px radius, subtle shadow)
- Feature list checkmarks (green tick `\2713` before each feature)
- Download/donate button styles (outlined brand-colour buttons)
- Lightbox for product screenshots (inline `<script>`, no library)
- Gallery section for article thumbnails (later)

### Familiar Elements From Old Site

These elements bridge the gap for existing customers:

1. **Product grid comparison image** (`diyaccounting-spreadsheets-product-grid.png`) - the feature comparison table showing what's in each product
2. **Product screenshots** - the Excel spreadsheet screenshots (profit & loss, VAT returns, payslips, corporation tax)
3. **PayPal Donate button** - same hosted button ID `XTEQ73HM52QQW`, same PayPal Donate SDK flow
4. **"Download without donating" link** - the existing skip-donation path
5. **Product descriptions** - the ACMA-designed accounting language that customers expect
6. **MPL 2.0 license notice** - on download page, with link to GitHub source

### Page Designs

#### `index.html` - Product Catalogue

Gateway-style layout with:

- **Header**: "DIY Accounting Spreadsheets" h1, subtitle "Excel bookkeeping and accounting software for UK small businesses"
- **Intro section**: White card with overview text (from `spreadsheets.html`)
- **Product grid image**: Feature comparison table (clickable, lightbox)
- **Product cards**: One card per product with:
  - Product name (linked to `product.html?product=X`)
  - Short description
  - Feature checklist
  - Screenshot thumbnail (clickable, lightbox)
- **Footer**: Links to privacy/terms/accessibility on submit site, copyright

#### `product.html?product=X` - Product Detail

- Full product description
- All screenshots for that product
- Feature list with explanations
- "Download" button linking to `download.html?product=X`
- Link back to product catalogue

#### `download.html?product=X` - Period Selection & Download

- Product name header
- Period dropdown (populated from `catalogue.json`)
- Excel format selector (2003 vs 2007, where both available)
- "Download" button → `donate.html` with params
- "Download without donating" direct link to zip
- License notice (MPL 2.0)

#### `donate.html` - PayPal Donation

- Thank you message, product info
- PayPal Donate SDK button (hosted_button_id: `XTEQ73HM52QQW`)
- On completion: redirect to download URL
- "Download without donating" fallback link
- Minimal page, focused on the donation action

---

## 4. Product Catalogue

### Source: `../diy-accounting`

The `diy-accounting` repository builds zip packages served via Docker nginx at `/zips/`. The `build/packages.txt` manifest lists all 177 available packages.

### Public Products (shown on site)

| Product | Internal Name | Year-end Pattern | Formats |
|---------|--------------|-----------------|---------|
| Basic Sole Trader | BasicSoleTrader | Apr (tax year) | Excel 2003, 2007 |
| Self Employed | SelfEmployed | Apr (tax year) | Excel 2003, 2007 |
| Company Accounts | Company | Any month (company year-end) | Excel 2003, 2007 |
| Taxi Driver (Cabsmart) | TaxiDriver | Apr (tax year) | Excel 2003, 2007 |
| Payslips (5 employees) | Payslip05 | Apr (tax year) | Excel 2003, 2007 |
| Payslips (10 employees) | Payslip10 | Apr (tax year) | Excel 2003, 2007 |

### Filtered Products (not shown on public site)

- Employee Expenses, Invoice Generator, SE Extra, Business Insurance

### `catalogue.json`

Generated from `packages.txt` by `scripts/generate-catalogue.sh`. Structure:

```json
{
  "products": [
    {
      "id": "BasicSoleTrader",
      "name": "Basic Sole Trader",
      "description": "...",
      "periods": [
        {
          "label": "April 2026",
          "date": "2026-04-05",
          "shortLabel": "Apr26",
          "formats": [
            { "label": "Excel 2007", "filename": "GB Accounts Basic Sole Trader 2026-04-05 (Apr26) Excel 2007.zip" }
          ]
        }
      ]
    }
  ]
}
```

### Download URLs

Downloads are served from the diy-accounting Docker container (`ghcr.io/antonycc/diy-accounting:main`) at `/zips/{filename}`. In Phase 1, the download links point out to the existing diy-accounting Docker container or GitHub releases. In Phase 2, zips are synced to S3 for direct CloudFront delivery from the spreadsheets site's own infrastructure.

---

## 5. PayPal Donation Flow

Adapted from `www.diyaccounting.co.uk/donatepaypal.html`:

1. User selects product and period on `download.html`
2. Clicks "Download" → navigates to `donate.html?product=X&period=Y`
3. `donate.html` renders PayPal Donate SDK button:
   ```html
   <script src="https://www.paypalobjects.com/donate/sdk/donate-sdk.js"></script>
   <script>
     PayPal.Donation.Button({
       env: 'production',
       hosted_button_id: 'XTEQ73HM52QQW',
       onComplete: function() {
         window.location = '/zips/' + filename;
       }
     }).render('#paypal-donate-button');
   </script>
   ```
4. On donation completion: redirect to zip download
5. "Download without donating" link always visible, links directly to zip

---

## 6. Infrastructure (CDK)

### SpreadsheetsStack

Modelled on `GatewayStack.java` -- minimal static site hosting:

| Resource | Configuration |
|----------|--------------|
| S3 bucket | `{env}-spreadsheets-origin`, BLOCK_ALL, S3_MANAGED, DESTROY |
| OAC | S3OriginAccessControl, SIGV4_ALWAYS |
| CloudFront | S3 origin, HTTPS redirect, security headers, `defaultRootObject: index.html` |
| ACM certificate | Referenced by ARN (see phase-specific details below) |
| BucketDeployment | From `web/spreadsheets.diyaccounting.co.uk/public/` (Phase 1) or `web/public/` (Phase 2) |
| Access logging | CloudWatch Logs delivery |

### Phase 1: Deployed Within Submit's AWS Account

In Phase 1, SpreadsheetsStack deploys alongside GatewayStack in the existing submit-prod AWS account (887764105431):

- **CDK app**: `cdk-spreadsheets/cdk.json` in the submit repo, using the same CDK patterns and build toolchain
- **Workflow**: `deploy-spreadsheets.yml` follows the same pattern as `deploy-gateway.yml`
- **ACM certificate**: Uses an existing certificate in the submit account (or creates one via the existing process)
- **DNS**: Route53 record in the root account zone pointing to the CloudFront distribution (same approach as the gateway site)
- **Deployment role**: Reuses `submit-deployment-role` in the submit-prod account
- **No new AWS account** -- everything runs in the same account as submit and gateway

### Phase 2: Own AWS Account & Self-Hosting

When Phase 2 creates the standalone repository, infrastructure moves to its own AWS account:

- **New AWS account** under the organization in Workloads OU:
  - Account name: `spreadsheets`
  - Email: `aws-spreadsheets@diyaccounting.co.uk`
  - Resources: S3, CloudFront, Route53 hosted zone, ACM cert
  - No Lambda, DynamoDB, API Gateway, or Cognito

- **DNS (Route53 zone delegation)**:
  - Root account Route53 zone gets NS delegation: `spreadsheets.diyaccounting.co.uk` -> spreadsheets account hosted zone
  - Spreadsheets account creates own Route53 hosted zone ($0.50/month)
  - Spreadsheets account creates own ACM wildcard cert (free, self-validated in own zone)
  - Fully self-managing: no dependency on root account for DNS records

- **CDK bootstrap**: OIDC provider, deployment role, CDK toolkit stack -- all in the new account
- **SpreadsheetsStack migrated**: Same Java class, different `cdk.json` context pointing to the new account's resources

---

## 7. Content Migration (Articles)

The old `www.diyaccounting.co.uk` has 121 articles covering accounting topics. These are currently served as HTML rendered from markdown via a CMS.

### Migration Strategy

**Not in Phase 1 or Phase 2 launch.** Articles migrate gradually in Phase 3:

1. **Phase 1 (design proof in submit repo)**: No articles. Product catalogue and download flow only.
2. **Phase 2 (own repo & self-hosting)**: No articles yet. Focus is on package hosting and catalogue automation.
3. **Phase 3 (content migration)**: Convert high-value articles to static HTML in `web/public/articles/`. Start with articles linked from product pages. Eventually all 121 articles migrated, `articles.html` index page, old www URLs redirect via gateway CloudFront Function.

### Article Format

Static HTML files in `web/public/articles/`:
```
articles/
+-- accounting-for-vat-with-making-tax-digital.html
+-- basic-accounts-bookkeeping-save-assessment-tax.html
+-- bookkeeping-records-cash-or-accrual-accounting-basis.html
+-- ...
```

Each article uses the same `spreadsheets.css` stylesheet with an article-specific content area. No templating system — just plain HTML.

### Submit Site Cutdown

Once the spreadsheets site is live:

- `submit.diyaccounting.co.uk/spreadsheets.html` becomes a brief overview with a prominent link: "Visit spreadsheets.diyaccounting.co.uk for the full product range and downloads"
- `submit.diyaccounting.co.uk/diy-accounting-spreadsheets.html` similarly cut down
- Product screenshots and detailed descriptions move to the spreadsheets site
- Submit retains a minimal "Spreadsheets" nav link pointing to the external site

---

## 8. Phased Delivery

### Phase 1: Design & Technology Proof (in Submit Repo)

Everything needed to see the design working and get the technology right. The spreadsheets site is deployed as a new stack within the existing `submit.diyaccounting.co.uk` repository, following the same pattern as GatewayStack. No separate AWS account yet -- deploys to the same submit-prod account.

| Step | Description |
|------|-------------|
| 1.1 | Create `SpreadsheetsStack.java` in submit's `infra/` (copy GatewayStack, adapt) |
| 1.2 | Create `cdk-spreadsheets/cdk.json` in submit repo |
| 1.3 | Create `web/spreadsheets.diyaccounting.co.uk/public/` content directory |
| 1.4 | Build `index.html` -- product catalogue page with screenshots |
| 1.5 | Build `spreadsheets.css` (extend gateway.css) |
| 1.6 | Copy product screenshots to `web/spreadsheets.diyaccounting.co.uk/public/images/spreadsheets/` |
| 1.7 | Hand-curate `catalogue.json` for the initial product set |
| 1.8 | Build `download.html` -- period selection page |
| 1.9 | Build `donate.html` -- PayPal donation interstitial |
| 1.10 | Build `deploy-spreadsheets.yml` workflow (modelled on `deploy-gateway.yml`) |
| 1.11 | Deploy to CI within submit's account, validate the design and technology |
| 1.12 | Deploy to prod, set up DNS record in root account zone |

**Downloads**: In Phase 1, download links point out to the existing diy-accounting Docker container endpoint or GitHub releases. No zip packages are hosted on the spreadsheets site itself.

**What Phase 1 proves**: The static site design works, the CloudFront/S3 hosting pattern is sound, the PayPal donation flow functions, and the product catalogue is navigable. All without creating a new AWS account or repository.

### Phase 2: Own Repository, Account & Package Hosting

When it is worth the overhead of a separate repository -- probably when bringing the downloadable packages over (syncing zips to S3, catalogue automation, article migration). This phase creates the standalone `spreadsheets.diyaccounting.co.uk` repository with its own AWS account and self-hosted infrastructure.

| Step | Description |
|------|-------------|
| 2.1 | Create repository `spreadsheets.diyaccounting.co.uk` |
| 2.2 | Migrate SpreadsheetsStack, web content, and workflow from submit repo |
| 2.3 | Create spreadsheets AWS account in Workloads OU |
| 2.4 | Bootstrap CDK, OIDC provider, deployment role in new account |
| 2.5 | Create ACM cert for `spreadsheets.diyaccounting.co.uk` in new account |
| 2.6 | Create Route53 hosted zone in spreadsheets account |
| 2.7 | `deploy-root.yml` adds NS delegation from root zone to spreadsheets zone |
| 2.8 | Deploy SpreadsheetsStack to spreadsheets account |
| 2.9 | Build `scripts/generate-catalogue.sh` to auto-generate `catalogue.json` from diy-accounting packages |
| 2.10 | Build `scripts/sync-packages-to-s3.sh` to sync zip packages to S3 |
| 2.11 | Sync zip packages to S3 for direct CloudFront download |
| 2.12 | Update download links to point to self-hosted S3/CloudFront zips |
| 2.13 | Remove SpreadsheetsStack and spreadsheets content from submit repo |

### Phase 3: Content Migration

| Step | Description |
|------|-------------|
| 3.1 | Migrate top 20 most-linked articles from old www site to `web/public/articles/` |
| 3.2 | Build `articles.html` index page |
| 3.3 | Set up redirects from old www URLs via gateway CloudFront Function |
| 3.4 | Cut down submit spreadsheet pages to link to the spreadsheets site |
| 3.5 | Migrate remaining articles (121 total) |

---

## 9. Differences From Submit Repository (Phase 2 Onwards)

When Phase 2 creates the standalone repository, the spreadsheets repo is a drastically cut-down version of submit:

| Aspect | Submit | Spreadsheets |
|--------|--------|-------------|
| CDK stacks | 12+ (Auth, API, Edge, HmrcStack, etc.) | 1 (SpreadsheetsStack) |
| Lambda functions | 20+ | 0 |
| DynamoDB tables | 5+ | 0 |
| API Gateway | Yes | No |
| Cognito | Yes | No |
| Docker images | Yes (Lambda containers) | No |
| Java modules | 3 (infra, app, web) | 1 (infra only) |
| npm packages | 50+ | Minimal (CDK CLI, dotenv) |
| Test tiers | 4 (unit, system, browser, behaviour) | 1 (smoke tests only) |
| JavaScript | Complex SPA-like app | Minimal vanilla JS |
| CSS | 2,112 lines (submit.css) | ~400 lines (spreadsheets.css) |
| Workflows | 6+ | 2 (deploy + smoke test) |
| Environment stacks | Observability, Data, Backup, Identity, Simulator | None (single stack) |

---

## 10. Open Items

| Item | Status | Notes |
|------|--------|-------|
| Download source in Phase 1 | TBD | GitHub releases, Docker container endpoint, or pre-synced S3? |
| Catalogue update automation | TBD | How to trigger catalogue.json rebuild when diy-accounting releases new year-end |
| SEO redirect mapping | TBD | Map old www.diyaccounting.co.uk URLs to new spreadsheets site paths |
| Ireland products | TBD | IE Accounts (2007-2009) available but may not be worth featuring |
| Payslip 20 variant | TBD | Only 05 and 10 in packages.txt; check if 20-employee version exists |
| Product images from old site | TBD | Old site has additional product images in `/assets/` and `/images/` |
| Google Analytics | TBD | Whether to add analytics (UA-1035014-1 from old site, or new GA4 property) |
| Friendly welcome note | Planned | Note with picture of spreadsheets to help existing customers find their way |

---

*Generated: February 2026*
