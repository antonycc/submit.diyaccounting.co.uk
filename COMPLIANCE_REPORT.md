# Compliance Report

**Application**: DIY Accounting Submit
**Version**: 1.0.0
**Target URL**: https://submit.diyaccounting.co.uk
**Generated**: 2026-01-21T20:12:07.689Z
**Overall Status**: ❌ FAIL

**Source Files**:
```
  ✅ target/penetration/npm-audit.json
  ✅ target/penetration/eslint-security.txt
  ✅ target/penetration/retire.json
  ✅ target/penetration/zap-report.json
  ✅ target/accessibility/pa11y-report.txt
  ✅ target/accessibility/axe-results.json
  ✅ target/accessibility/axe-wcag22-results.json
  ✅ target/accessibility/lighthouse-results.json
```

---

## Summary

| Check | Status | Summary |
|-------|--------|---------|
| npm audit | ✅ | 0 critical, 0 high, 0 moderate |
| ESLint Security | ❌ | 2 errors, 63 warnings |
| retire.js | ✅ | 0 high, 0 medium, 0 low |
| OWASP ZAP | ✅ | 0 high, 10 medium, 14 low |
| Pa11y (WCAG AA) | ✅ | 15/15 pages passed |
| axe-core | ❌ | 7 violations, 375 passes |
| axe-core (WCAG 2.2) | ❌ | 1 violations, 231 passes |
| Lighthouse | ✅ | A11y: 95%, Perf: 99%, BP: 100% |

---

## 1. Security Checks

### 1.1 npm audit (Dependency Vulnerabilities)

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 1 |
| **Total** | **1** |

**Status**: ✅ No critical/high vulnerabilities

### 1.2 ESLint Security Analysis

| Metric | Count |
|--------|-------|
| Errors | 2 |
| Warnings | 63 |

**Status**: ❌ Security errors require attention

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
| Medium | 10 |
| Low | 14 |
| Informational | 32 |

**Status**: ✅ No high risk vulnerabilities

#### Alerts

| Alert | Risk | Count |
|-------|------|-------|
| CSP: script-src unsafe-inline | Medium (High) | 5 |
| CSP: style-src unsafe-inline | Medium (High) | 5 |
| Insufficient Site Isolation Against Spectre Vulnerability | Low (Medium) | 9 |
| Server Leaks Version Information via "Server" HTTP Response Header Field | Low (High) | 5 |
| Information Disclosure - Suspicious Comments | Informational (Low) | 12 |
| Modern Web Application | Informational (Medium) | 5 |
| Re-examine Cache-control Directives | Informational (Low) | 5 |
| Retrieved from Cache | Informational (Medium) | 5 |
| Storable and Cacheable Content | Informational (Medium) | 5 |

---

## 2. Accessibility Checks

### 2.1 Pa11y (WCAG 2.1 Level AA)

| Metric | Value |
|--------|-------|
| Pages Tested | 15 |
| Pages Passed | 15 |
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
| /account/bundles.html | 0 |
| /hmrc/vat/submitVat.html | 0 |
| /hmrc/vat/vatObligations.html | 0 |
| /hmrc/vat/viewVatReturn.html | 0 |
| /hmrc/receipt/receipts.html | 0 |
| /guide/index.html | 0 |
| /help/index.html | 0 |
| /errors/404-error-distribution.html | 0 |
| /errors/404-error-origin.html | 0 |

### 2.2 axe-core (Automated Accessibility)

| Metric | Count |
|--------|-------|
| Violations | 7 |
| Passes | 375 |
| Incomplete | 10 |

**Status**: ❌ Accessibility violations require attention

#### Violations

| Rule | Impact | Description | Nodes |
|------|--------|-------------|-------|
| region | moderate | Ensure all page content is contained by landmarks | 1 |
| skip-link | moderate | Ensure all skip links have a focusable target | 1 |
| region | moderate | Ensure all page content is contained by landmarks | 1 |
| skip-link | moderate | Ensure all skip links have a focusable target | 1 |
| region | moderate | Ensure all page content is contained by landmarks | 1 |
| skip-link | moderate | Ensure all skip links have a focusable target | 1 |
| color-contrast | serious | Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds | 1 |

### 2.3 axe-core (WCAG 2.2 Level AA)

| Metric | Count |
|--------|-------|
| Violations | 1 |
| Passes | 231 |
| Incomplete | 10 |

**Status**: ❌ WCAG 2.2 violations detected

#### Violations

| Rule | Impact | Description | Nodes |
|------|--------|-------------|-------|
| color-contrast | serious | Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds | 1 |

### 2.4 Lighthouse

| Category | Score |
|----------|-------|
| Accessibility | 95% |
| Performance | 99% |
| Best Practices | 100% |
| SEO | 100% |

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
