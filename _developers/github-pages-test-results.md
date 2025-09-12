# GitHub Pages Test Results Publishing

This repository automatically publishes Playwright test results to GitHub Pages after each deployment.

## Overview

When either the `deploy.yml` (production) or `deploy-ci-only.yml` (CI) workflows run, they:

1. **Run Playwright behavior tests** after successful deployment
2. **Generate timestamped test results** with format `YYYY-MM-DD-HHMMSS-{environment}`
3. **Publish to GitHub Pages** with complete HTML reports, videos, traces, and screenshots
4. **Output direct links** to the test results in the GitHub Action summary

## GitHub Pages Structure

```
https://antonycc.github.io/submit.diyaccounting.co.uk/
├── index.html                           # Root page listing all test runs
├── 2025-09-12-143022-prod/             # Production test run
│   ├── index.html                      # Playwright HTML report
│   ├── landing.html                    # Custom landing page
│   ├── data/                           # Report assets (videos, traces)
│   └── test-results/                   # Raw test artifacts
└── 2025-09-12-142855-ci/               # CI test run
    ├── index.html                      # Playwright HTML report
    ├── landing.html                    # Custom landing page
    ├── data/                           # Report assets
    └── test-results/                   # Raw test artifacts
```

## Features

### 📊 **Rich HTML Reports**
- Interactive Playwright HTML reports with full test details
- Embedded videos, traces, and screenshots
- Searchable and filterable test results

### 🕐 **Timestamped Archives**  
- Each test run gets its own timestamped directory
- Easy navigation between different test runs
- Automatic organization by environment (CI vs Production)

### 🔗 **Direct Access Links**
- GitHub Action outputs direct link to test results
- Root index page lists all historical test runs
- Deep linking to specific test runs

### 🎭 **Complete Test Artifacts**
- Full Playwright HTML reports
- Video recordings of test runs (.webm converted to .mp4)
- Trace files for debugging
- Screenshots and other test artifacts

## Usage

### Automatic Publishing

Test results are automatically published when:
- **Production deploys** (main branch pushes to `deploy.yml`)
- **CI deploys** (feature branch pushes to `deploy-ci-only.yml`)

### Accessing Results

1. **From GitHub Action**: Check the build summary for direct links
2. **GitHub Pages Root**: Visit https://antonycc.github.io/submit.diyaccounting.co.uk/
3. **Direct Link Format**: `https://antonycc.github.io/submit.diyaccounting.co.uk/YYYY-MM-DD-HHMMSS-{env}/`

### Example Output

```
## 🎭 Playwright Test Results Published

✅ **Test results have been published to GitHub Pages!**

📊 **Direct Link:** https://antonycc.github.io/submit.diyaccounting.co.uk/2025-09-12-143022-prod/

🏠 **All Test Runs:** https://antonycc.github.io/submit.diyaccounting.co.uk/

🔗 **GitHub Pages URL:** https://antonycc.github.io/submit.diyaccounting.co.uk/2025-09-12-143022-prod/
```

## Configuration

### Workflow Files
- `.github/workflows/publish-test-results.yml` - Reusable workflow for publishing
- `.github/workflows/deploy.yml` - Production deployment with test publishing  
- `.github/workflows/deploy-ci-only.yml` - CI deployment with test publishing

### Prerequisites
- GitHub Pages must be enabled in repository settings
- Pages source should be set to "GitHub Actions"
- Repository must have appropriate permissions for Pages deployment

## Troubleshooting

### GitHub Pages Not Working
1. Check repository Settings > Pages
2. Ensure source is set to "GitHub Actions"
3. Verify workflow permissions include `pages: write` and `id-token: write`

### Missing Test Results
1. Verify tests ran successfully in the GitHub Action
2. Check that artifacts were uploaded (`test-reports-behaviour` and `test-results-behaviour`)
3. Ensure Playwright config generates HTML reports in `target/test-reports/html-report/`

### Broken Links
1. Check that the GitHub Pages workflow completed successfully
2. Verify the timestamped directory structure is correct
3. Ensure artifact names match between upload and download steps

## Manual Testing

To test the GitHub Pages setup locally:

```bash
# Run a simple Playwright test to generate artifacts
npm run test:behaviour

# Use the test script to simulate GitHub Pages publishing
./test-github-pages-setup.sh

# Open the generated pages-build/index.html in a browser
```

---

This system provides comprehensive test result publishing with minimal configuration and maximum accessibility for debugging and auditing test runs.