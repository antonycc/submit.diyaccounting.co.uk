# Compliance Report

**Application**: DIY Accounting Submit
**Version**: 1.0.0
**Target URL**: https://wanted-finally-anteater.ngrok-free.app
**Generated**: 2026-01-19T19:38:51.197Z
**Overall Status**: ❌ FAIL

---

## Summary

| Check | Status | Summary |
|-------|--------|---------|
| npm audit | ✅ | 0 critical, 0 high, 0 moderate |
| ESLint Security | ✅ | 0 errors, 54 warnings |
| retire.js | ✅ | 0 high, 0 medium, 0 low |
| OWASP ZAP | ✅ | 0 high, 6 medium, 5 low |
| Pa11y (WCAG AA) | ✅ | 16/16 pages passed |
| axe-core | ❌ | 13 violations, 239 passes |
| axe-core (WCAG 2.2) | ❌ | 10 violations, 148 passes |
| Lighthouse | ❌ | A11y: 0%, Perf: 0%, BP: 0% |

---

## 1. Security Checks

### 1.1 npm audit (Dependency Vulnerabilities)

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 3 |
| **Total** | **3** |

**Status**: ✅ No critical/high vulnerabilities

### 1.2 ESLint Security Analysis

| Metric | Count |
|--------|-------|
| Errors | 0 |
| Warnings | 54 |

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
| Medium | 6 |
| Low | 5 |
| Informational | 5 |

**Status**: ✅ No high risk vulnerabilities

#### Alerts

| Alert | Risk | Count |
|-------|------|-------|
| Content Security Policy (CSP) Header Not Set | Medium (High) | 1 |
| Sub Resource Integrity Attribute Missing | Medium (High) | 5 |
| Cross-Domain JavaScript Source File Inclusion | Low (Medium) | 1 |
| Permissions Policy Header Not Set | Low (Medium) | 1 |
| Strict-Transport-Security Header Not Set | Low (High) | 3 |
| Modern Web Application | Informational (Medium) | 1 |
| Storable and Cacheable Content | Informational (Medium) | 4 |

---

## 2. Accessibility Checks

### 2.1 Pa11y (WCAG 2.1 Level AA)

| Metric | Value |
|--------|-------|
| Pages Tested | 16 |
| Pages Passed | 16 |
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
| /help/index.html | 0 |
| /errors/404-error-distribution.html | 0 |
| /errors/404-error-origin.html | 0 |

### 2.2 axe-core (Automated Accessibility)

| Metric | Count |
|--------|-------|
| Violations | 13 |
| Passes | 239 |
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

### 2.3 axe-core (WCAG 2.2 Level AA)

| Metric | Count |
|--------|-------|
| Violations | 10 |
| Passes | 148 |
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

### 2.4 Lighthouse

| Category | Score |
|----------|-------|
| Accessibility | 0% |
| Performance | 0% |
| Best Practices | 0% |
| SEO | 0% |

**Status**: ❌ Accessibility score below 90% threshold

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

*Generated by `node scripts/generate-compliance-report.js --target https://wanted-finally-anteater.ngrok-free.app`*
