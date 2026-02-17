# Compliance Report

**Application**: DIY Accounting Submit
**Version**: 1.0.0
**Target URL**: https://example.com
**Generated**: 2026-02-17T01:23:40.279Z
**Overall Status**: ✅ PASS

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
| npm audit (prod) | ✅ | 0 critical, 0 high, 0 moderate |
| ESLint Security | ✅ | 0 errors, 7 warnings |
| retire.js | ✅ | 0 high, 0 medium, 0 low |
| OWASP ZAP | ✅ | 0 high, 0 medium, 7 low |
| Pa11y (WCAG AA) | ✅ | 35/35 pages passed |
| axe-core | ✅ | 0 violations, 1056 passes |
| axe-core (WCAG 2.2) | ✅ | 0 violations, 614 passes |
| Lighthouse | ✅ | A11y: 100%, Perf: 94%, BP: 96% |
| Text Spacing (1.4.12) | ✅ | 25/25 pages passed |

---

## 1. Security Checks

### 1.1 npm audit (Production Dependency Vulnerabilities)

Scanned with `--omit=dev` — only production dependencies affect compliance status.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |
| **Total** | **0** |

**Status**: ✅ No critical/high vulnerabilities in production dependencies

#### Development Dependencies (Informational — does not affect compliance)

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 4 |
| Moderate | 0 |
| Low | 0 |
| **Total** | **4** |

### 1.2 ESLint Security Analysis

| Metric | Count |
|--------|-------|
| Errors | 0 |
| Warnings | 7 |

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
| Low | 7 |
| Informational | 35 |

**Status**: ✅ No high risk vulnerabilities

#### Alerts

| Alert | Risk | Count |
|-------|------|-------|
| Insufficient Site Isolation Against Spectre Vulnerability | Low (Medium) | 5 |
| Timestamp Disclosure - Unix | Low (Low) | 2 |
| Information Disclosure - Suspicious Comments | Informational (Low) | 12 |
| Modern Web Application | Informational (Medium) | 5 |
| Non-Storable Content | Informational (Medium) | 3 |
| Re-examine Cache-control Directives | Informational (Low) | 5 |
| Retrieved from Cache | Informational (Medium) | 5 |
| Storable and Cacheable Content | Informational (Medium) | 5 |

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
| Pages Passed | 35 |
| Pages Failed | 0 |

**Status**: ✅ All pages comply with WCAG AA

#### Page Results

| Page | Errors |
|------|--------|
| https://submit.diyaccounting.co.uk/ | 0 |
| https://submit.diyaccounting.co.uk/index.html | 0 |
| https://submit.diyaccounting.co.uk/privacy.html | 0 |
| https://submit.diyaccounting.co.uk/terms.html | 0 |
| https://submit.diyaccounting.co.uk/about.html | 0 |
| https://submit.diyaccounting.co.uk/accessibility.html | 0 |
| https://submit.diyaccounting.co.uk/auth/login.html | 0 |
| https://submit.diyaccounting.co.uk/bundles.html | 0 |
| https://submit.diyaccounting.co.uk/usage.html | 0 |
| https://submit.diyaccounting.co.uk/hmrc/vat/submitVat.html | 0 |
| https://submit.diyaccounting.co.uk/hmrc/vat/vatObligations.html | 0 |
| https://submit.diyaccounting.co.uk/hmrc/vat/viewVatReturn.html | 0 |
| https://submit.diyaccounting.co.uk/hmrc/receipt/receipts.html | 0 |
| https://submit.diyaccounting.co.uk/guide.html | 0 |
| https://submit.diyaccounting.co.uk/help.html | 0 |
| https://submit.diyaccounting.co.uk/mcp.html | 0 |
| https://submit.diyaccounting.co.uk/diy-accounting-spreadsheets.html | 0 |
| https://submit.diyaccounting.co.uk/diy-accounting-limited.html | 0 |
| https://submit.diyaccounting.co.uk/spreadsheets.html | 0 |
| https://submit.diyaccounting.co.uk/errors/404-error-distribution.html | 0 |
| https://submit.diyaccounting.co.uk/errors/404-error-origin.html | 0 |
| https://submit.diyaccounting.co.uk/errors/403.html | 0 |
| https://submit.diyaccounting.co.uk/errors/404.html | 0 |
| https://submit.diyaccounting.co.uk/errors/500.html | 0 |
| https://submit.diyaccounting.co.uk/errors/502.html | 0 |
| https://submit.diyaccounting.co.uk/errors/503.html | 0 |
| https://submit.diyaccounting.co.uk/errors/504.html | 0 |
| https://diyaccounting.co.uk/ | 0 |
| https://diyaccounting.co.uk/index.html | 0 |
| https://diyaccounting.co.uk/about.html | 0 |
| https://spreadsheets.diyaccounting.co.uk/ | 0 |
| https://spreadsheets.diyaccounting.co.uk/index.html | 0 |
| https://spreadsheets.diyaccounting.co.uk/download.html | 0 |
| https://spreadsheets.diyaccounting.co.uk/donate.html | 0 |
| https://spreadsheets.diyaccounting.co.uk/knowledge-base.html | 0 |

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
| Performance | 94% |
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

*Generated by `node scripts/generate-compliance-report.js --target https://example.com`*
