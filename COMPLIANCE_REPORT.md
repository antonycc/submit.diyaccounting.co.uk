# Compliance Report

**Application**: DIY Accounting Submit
**Version**: 1.0.0
**Target URL**: https://submit.diyaccounting.co.uk
**Generated**: 2026-01-14T22:07:52.290Z
**Overall Status**: ❌ FAIL

---

## Summary

| Check | Status | Summary |
|-------|--------|---------|
| npm audit | ✅ | 0 critical, 0 high, 0 moderate |
| ESLint Security | ✅ | 0 errors, 0 warnings |
| retire.js | ✅ | 0 high, 0 medium, 0 low |
| OWASP ZAP | ✅ | 0 high, 14 medium, 29 low |
| Pa11y (WCAG AA) | ✅ | 17/17 pages passed |
| axe-core | ❌ | 8 violations, 242 passes |
| axe-core (WCAG 2.2) | ✅ | 0 violations, 150 passes |
| Lighthouse | ✅ | A11y: 95%, Perf: 99%, BP: 100% |

---

## 1. Security Checks

### 1.1 npm audit (Dependency Vulnerabilities)

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |
| **Total** | **0** |

**Status**: ✅ No critical/high vulnerabilities

### 1.2 ESLint Security Analysis

| Metric | Count |
|--------|-------|
| Errors | 0 |
| Warnings | 0 |

**Status**: ✅ No security errors

### 1.3 retire.js (Known Vulnerabilities)

| Severity | Count |
|----------|-------|
| High | 0 |
| Medium | 0 |
| Low | 0 |

**Status**: ✅ No high severity vulnerabilities

### 1.4 OWASP ZAP (Dynamic Security Scan)

| Risk Level | Count |
|------------|-------|
| High | 0 |
| Medium | 14 |
| Low | 29 |
| Informational | 35 |

**Status**: ✅ No high risk vulnerabilities

#### Alerts

| Alert | Risk | Count |
|-------|------|-------|
| CSP: Failure to Define Directive with No Fallback | Medium (High) | 3 |
| CSP: script-src unsafe-inline | Medium (High) | 3 |
| CSP: style-src unsafe-inline | Medium (High) | 3 |
| Missing Anti-clickjacking Header | Medium (Medium) | 5 |
| Insufficient Site Isolation Against Spectre Vulnerability | Low (Medium) | 9 |
| Permissions Policy Header Not Set | Low (Medium) | 5 |
| Server Leaks Version Information via "Server" HTTP Response Header Field | Low (High) | 5 |
| Strict-Transport-Security Header Not Set | Low (High) | 5 |
| X-Content-Type-Options Header Missing | Low (Medium) | 5 |
| Information Disclosure - Suspicious Comments | Informational (Low) | 12 |
| Modern Web Application | Informational (Medium) | 5 |
| Non-Storable Content | Informational (Medium) | 3 |
| Re-examine Cache-control Directives | Informational (Low) | 5 |
| Retrieved from Cache | Informational (Medium) | 5 |
| Storable and Cacheable Content | Informational (Medium) | 5 |

---

## 2. Accessibility Checks

### 2.1 Pa11y (WCAG 2.1 Level AA)

| Metric | Value |
|--------|-------|
| Pages Tested | 17 |
| Pages Passed | 17 |
| Pages Failed | 0 |

**Status**: ✅ All pages comply with WCAG AA

#### Page Results

| Page | Errors |
|------|--------|
| / | 0 |
| /index.html | 0 |
| /privacy.html | 0 |
| /terms.html | 0 |
| /about.html | 0 |
| /accessibility.html | 0 |
| /auth/login.html | 0 |
| /account/bundles.html | 0 |
| /hmrc/vat/submitVat.html | 0 |
| /hmrc/vat/vatObligations.html | 0 |
| /hmrc/vat/viewVatReturn.html | 0 |
| /hmrc/receipt/receipts.html | 0 |
| /guide/index.html | 0 |
| /docs/index.html | 0 |
| /errors/404-error-distribution.html | 0 |
| /errors/404-error-origin.html | 0 |
| /tests/index.html | 0 |

### 2.2 axe-core (Automated Accessibility)

| Metric | Count |
|--------|-------|
| Violations | 8 |
| Passes | 242 |
| Incomplete | 7 |

**Status**: ❌ Accessibility violations require attention

#### Violations

| Rule | Impact | Description | Nodes |
|------|--------|-------------|-------|
| landmark-one-main | moderate | Ensure the document has a main landmark | 1 |
| region | moderate | Ensure all page content is contained by landmarks | 4 |
| landmark-one-main | moderate | Ensure the document has a main landmark | 1 |
| region | moderate | Ensure all page content is contained by landmarks | 2 |
| landmark-one-main | moderate | Ensure the document has a main landmark | 1 |
| region | moderate | Ensure all page content is contained by landmarks | 5 |
| landmark-one-main | moderate | Ensure the document has a main landmark | 1 |
| page-has-heading-one | moderate | Ensure that the page, or at least one of its frames contains a level-one heading | 1 |

### 2.3 axe-core (WCAG 2.2 Level AA)

| Metric | Count |
|--------|-------|
| Violations | 0 |
| Passes | 150 |
| Incomplete | 7 |

**Status**: ✅ No WCAG 2.2 violations


### 2.4 Lighthouse

| Category | Score |
|----------|-------|
| Accessibility | 95% |
| Performance | 99% |
| Best Practices | 100% |
| SEO | 90% |

**Status**: ✅ Accessibility score meets threshold (90%+)

---

## 3. Report Files

| Report | Path | Status |
|--------|------|--------|
| npm audit | target/penetration/npm-audit.json | ✅ Found |
| ESLint Security | target/penetration/eslint-security.txt | ✅ Found |
| retire.js | target/penetration/retire.json | ✅ Found |
| OWASP ZAP | target/penetration/zap-report.json | ✅ Found |
| Pa11y | target/accessibility/pa11y-report.txt | ✅ Found |
| axe-core | target/accessibility/axe-results.json | ✅ Found |
| axe-core (WCAG 2.2) | target/accessibility/axe-wcag22-results.json | ✅ Found |
| Lighthouse | target/accessibility/lighthouse-results.json | ✅ Found |

---

*Generated by `node scripts/generate-compliance-report.js --target https://submit.diyaccounting.co.uk`*
