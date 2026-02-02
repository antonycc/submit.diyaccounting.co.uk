# Compliance Report

**Application**: DIY Accounting Submit
**Version**: 1.0.0
**Target URL**: https://submit.diyaccounting.co.uk
**Generated**: 2026-02-02T03:21:14.420Z
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

 Here's a summary of where we left off:                                                                                                                           
                                                                                                                                                                               
  Completed this session:                                                                                                                                                      
  - Fixed the submission-submit.png image (was nearly blank, now shows all 9 VAT boxes + declaration checkbox with dev tools removed)                                          
  - Committed and pushed all refresh changes to refresf branch (commit 6794a0cb)                                                                                               
  - All 685 tests passing                                                                                                                                                      
                                                                                                                                                                               
  Next time:                                                                                                                                                                   
  - Run the local accessibility/penetration tests that contributed to REPORT_ACCESSIBILITY_PENETRATION.md and verify the fixes (Pa11y, axe-core, ESLint security, Lighthouse,  
  text-spacing, npm audit, etc.)            



---

## Summary

| Check | Status | Summary |
|-------|--------|---------|
| npm audit | ❌ | 0 critical, 29 high, 2 moderate |
| ESLint Security | ❌ | 33 errors, 57 warnings |
| retire.js | ✅ | 0 high, 0 medium, 0 low |
| OWASP ZAP | ✅ | 0 high, 0 medium, 11 low |
| Pa11y (WCAG AA) | ❌ | 22/23 pages passed |
| axe-core | ❌ | 25 violations, 551 passes |
| axe-core (WCAG 2.2) | ❌ | 22 violations, 340 passes |
| Lighthouse | ✅ | A11y: 100%, Perf: 98%, BP: 100% |
| Text Spacing (1.4.12) | ✅ | 22/22 pages passed |

---

## 1. Security Checks

### 1.1 npm audit (Dependency Vulnerabilities)

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 29 |
| Moderate | 2 |
| Low | 0 |
| **Total** | **31** |

**Status**: ❌ Critical/high vulnerabilities require attention

### 1.2 ESLint Security Analysis

| Metric | Count |
|--------|-------|
| Errors | 33 |
| Warnings | 57 |

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
| Medium | 0 |
| Low | 11 |
| Informational | 34 |

**Status**: ✅ No high risk vulnerabilities

#### Alerts

| Alert | Risk | Count |
|-------|------|-------|
| Insufficient Site Isolation Against Spectre Vulnerability | Low (Medium) | 9 |
| Timestamp Disclosure - Unix | Low (Low) | 2 |
| Information Disclosure - Suspicious Comments | Informational (Low) | 12 |
| Modern Web Application | Informational (Medium) | 5 |
| Non-Storable Content | Informational (Medium) | 3 |
| Re-examine Cache-control Directives | Informational (Low) | 4 |
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
| Pages Tested | 23 |
| Pages Passed | 22 |
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
| /bundles.html | 2 |
| /hmrc/vat/submitVat.html | 0 |
| /hmrc/vat/vatObligations.html | 0 |
| /hmrc/vat/viewVatReturn.html | 0 |
| /hmrc/receipt/receipts.html | 0 |
| /guide.html | 0 |
| /help.html | 0 |
| /mcp.html | 0 |
| /errors/404-error-distribution.html | 0 |
| /errors/404-error-origin.html | 0 |
| /errors/403.html | 0 |
| /errors/404.html | 0 |
| /errors/500.html | 0 |
| /errors/502.html | 0 |
| /errors/503.html | 0 |
| /errors/504.html | 0 |

### 2.2 axe-core (Automated Accessibility)

| Metric | Count |
|--------|-------|
| Violations | 25 |
| Passes | 551 |
| Incomplete | 0 |

**Status**: ❌ Accessibility violations require attention

#### Violations

| Rule | Impact | Description | Nodes |
|------|--------|-------------|-------|
| document-title | serious | Ensure each HTML document contains a non-empty <title> element | 1 |
| landmark-one-main | moderate | Ensure the document has a main landmark | 1 |
| page-has-heading-one | moderate | Ensure that the page, or at least one of its frames contains a level-one heading | 1 |
| document-title | serious | Ensure each HTML document contains a non-empty <title> element | 1 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |

### 2.3 axe-core (WCAG 2.2 Level AA)

| Metric | Count |
|--------|-------|
| Violations | 22 |
| Passes | 340 |
| Incomplete | 0 |

**Status**: ❌ WCAG 2.2 violations detected

#### Violations

| Rule | Impact | Description | Nodes |
|------|--------|-------------|-------|
| document-title | serious | Ensure each HTML document contains a non-empty <title> element | 1 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |
| link-in-text-block | serious | Ensure links are distinguished from surrounding text in a way that does not rely on color | 2 |

### 2.4 Lighthouse

| Category | Score |
|----------|-------|
| Accessibility | 100% |
| Performance | 98% |
| Best Practices | 100% |
| SEO | 100% |

**Status**: ✅ Accessibility score meets threshold (90%+)

### 2.5 Text Spacing (WCAG 1.4.12)

| Metric | Value |
|--------|-------|
| Pages Tested | 22 |
| Pages Passed | 22 |
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
