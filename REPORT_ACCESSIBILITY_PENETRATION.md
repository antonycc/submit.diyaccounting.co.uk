# Compliance Report

**Application**: DIY Accounting Submit
**Version**: 1.0.0
**Target URL**: https://submit.diyaccounting.co.uk
**Generated**: 2026-02-15T14:29:03.225Z
**Overall Status**: ❌ FAIL

**Source Files**:
```
  ✅ web/public/tests/penetration/npm-audit.json
  ✅ web/public/tests/penetration/eslint-security.txt
  ✅ web/public/tests/penetration/retire.json
  ✅ web/public/tests/penetration/zap-report.json
  ✅ web/public/tests/accessibility/pa11y-report.txt
  ✅ web/public/tests/accessibility/axe-results.json
  ✅ web/public/tests/accessibility/axe-wcag22-results.json
  ✅ web/public/tests/accessibility/lighthouse-results.json
  ✅ web/public/tests/accessibility/text-spacing-results.json
```

---

## Summary

| Check | Status | Summary |
|-------|--------|---------|
| npm audit | ✅ | 0 critical, 0 high, 0 moderate |
| ESLint Security | ✅ | 0 errors, 0 warnings |
| retire.js | ✅ | 0 high, 0 medium, 0 low |
| OWASP ZAP | ✅ | 0 high, 0 medium, 2 low |
| Pa11y (WCAG AA) | ❌ | 34/35 pages passed |
| axe-core | ✅ | 0 violations, 1056 passes |
| axe-core (WCAG 2.2) | ✅ | 0 violations, 614 passes |
| Lighthouse | ✅ | A11y: 100%, Perf: 91%, BP: 96% |
| Text Spacing (1.4.12) | ✅ | 25/25 pages passed |

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
| Medium | 0 |
| Low | 2 |
| Informational | 27 |

**Status**: ✅ No high risk vulnerabilities

#### Alerts

| Alert | Risk | Count |
|-------|------|-------|
| Timestamp Disclosure - Unix | Low (Low) | 2 |
| Information Disclosure - Suspicious Comments | Informational (Low) | 12 |
| Modern Web Application | Informational (Medium) | 5 |
| Re-examine Cache-control Directives | Informational (Low) | 5 |
| Retrieved from Cache | Informational (Medium) | 5 |

#### Accepted Risks (Suppressed)

| Alert | Risk | Reason |
|-------|------|--------|
| CSP: script-src unsafe-inline | Medium (High) | Required for inline event handlers and dynamic script loading. Mitigated by strict CSP directives and input validation. Documented in privacy policy. |
| CSP: style-src unsafe-inline | Medium (High) | Required for dynamic styling and third-party components. Mitigated by strict CSP directives. Documented in privacy policy. |

---

## 2. Accessibility Checks

### 2.1 Pa11y (WCAG 2.1 Level AA)

| Metric | Value |
|--------|-------|
| Pages Tested | 35 |
| Pages Passed | 34 |
| Pages Failed | 1 |

**Status**: ❌ Some pages have accessibility issues

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
| /bundles.html | 0 |
| /usage.html | 0 |
| /hmrc/vat/submitVat.html | 0 |
| /hmrc/vat/vatObligations.html | 0 |
| /hmrc/vat/viewVatReturn.html | 0 |
| /hmrc/receipt/receipts.html | 0 |
| /guide.html | 0 |
| /help.html | 0 |
| /mcp.html | 0 |
| /diy-accounting-spreadsheets.html | 0 |
| /diy-accounting-limited.html | 0 |
| /spreadsheets.html | 0 |
| /errors/404-error-distribution.html | 0 |
| /errors/404-error-origin.html | 0 |
| /errors/403.html | 0 |
| /errors/404.html | 0 |
| /errors/500.html | 0 |
| /errors/502.html | 0 |
| /errors/503.html | 0 |
| /errors/504.html | 0 |
| https://prod-gateway.diyaccounting.co.uk/ | 0 |
| https://prod-gateway.diyaccounting.co.uk/index.html | 0 |
| https://prod-gateway.diyaccounting.co.uk/about.html | 0 |
| https://prod-spreadsheets.diyaccounting.co.uk/ | 0 |
| https://prod-spreadsheets.diyaccounting.co.uk/index.html | 0 |
| https://prod-spreadsheets.diyaccounting.co.uk/download.html | 1 |
| https://prod-spreadsheets.diyaccounting.co.uk/donate.html | 0 |
| https://prod-spreadsheets.diyaccounting.co.uk/knowledge-base.html | 0 |

### 2.2 axe-core (Automated Accessibility)

| Metric | Count |
|--------|-------|
| Violations | 0 |
| Passes | 1056 |
| Incomplete | 33 |

**Status**: ✅ No accessibility violations


### 2.3 axe-core (WCAG 2.2 Level AA)

| Metric | Count |
|--------|-------|
| Violations | 0 |
| Passes | 614 |
| Incomplete | 33 |

**Status**: ✅ No WCAG 2.2 violations


### 2.4 Lighthouse

| Category | Score |
|----------|-------|
| Accessibility | 100% |
| Performance | 91% |
| Best Practices | 96% |
| SEO | 100% |

**Status**: ✅ Accessibility score meets threshold (90%+)

### 2.5 Text Spacing (WCAG 1.4.12)

| Metric | Value |
|--------|-------|
| Pages Tested | 25 |
| Pages Passed | 25 |
| Pages Failed | 0 |
| Errors | 0 |

**Status**: ✅ All pages pass text spacing test

**Test Parameters** (WCAG 1.4.12 minimum values):
- Line height: 1.5 times font size
- Letter spacing: 0.12 times font size
- Word spacing: 0.16 times font size
- Paragraph spacing: 2 times font size


---

## 3. Report Files

| Report | Path | Status |
|--------|------|--------|
| npm audit | web/public/tests/penetration/npm-audit.json | ✅ Found |
| ESLint Security | web/public/tests/penetration/eslint-security.txt | ✅ Found |
| retire.js | web/public/tests/penetration/retire.json | ✅ Found |
| OWASP ZAP | web/public/tests/penetration/zap-report.json | ✅ Found |
| Pa11y | web/public/tests/accessibility/pa11y-report.txt | ✅ Found |
| axe-core | web/public/tests/accessibility/axe-results.json | ✅ Found |
| axe-core (WCAG 2.2) | web/public/tests/accessibility/axe-wcag22-results.json | ✅ Found |
| Lighthouse | web/public/tests/accessibility/lighthouse-results.json | ✅ Found |
| Text Spacing | web/public/tests/accessibility/text-spacing-results.json | ✅ Found |

---

*Generated by `node scripts/generate-compliance-report.js --target https://submit.diyaccounting.co.uk`*
