# Dependency Security Update - 2026-02-02

## Summary
Updated dependencies to address low-risk security advisories identified in the security review.

## Changes Made

### ✅ Fixed: fast-xml-parser CVE (High Severity)
**CVE:** CVE-2026-25128 / GHSA-37qj-frw5-hhjh  
**Severity:** High  
**Vulnerability:** RangeError DoS when parsing XML with out-of-range entity code points

**Fix Applied:**
- Added package.json override to force `fast-xml-parser@^5.3.4` (patched version)
- All AWS SDK packages now use the fixed version
- Verified no vulnerable versions remain in dependency tree

**Before:**
- fast-xml-parser: 5.2.5 (vulnerable range: 4.3.6 - 5.3.3)
- Affected AWS SDK packages via transitive dependency

**After:**
- fast-xml-parser: 5.3.4+ (patched)
- All instances updated via npm overrides

### ⚠️ Remaining: eslint CVE (Moderate Severity - Dev Tool Only)
**CVE:** GHSA-p5wg-g6qr-c7cg  
**Severity:** Moderate  
**Vulnerability:** Stack Overflow when serializing objects with circular references

**Status:** Known limitation - cannot be fixed at this time

**Why Not Fixed:**
- Vulnerability is in nested dependency: `@microsoft/eslint-formatter-sarif > eslint@8.57.1`
- Cannot override without conflicting with direct `eslint@9.39.2` dependency
- @microsoft/eslint-formatter-sarif@3.1.0 is latest version but still includes old eslint

**Risk Assessment:**
- **Severity:** Moderate (not high or critical)
- **Scope:** Development tool only (SARIF report formatter)
- **Impact:** Stack overflow only occurs with circular object references in ESLint output
- **Likelihood:** Very low - requires malformed/malicious ESLint plugin output
- **Mitigation:** Not used in production runtime; only in CI/CD for compliance reporting

**Recommendation:** Monitor for @microsoft/eslint-formatter-sarif updates and re-evaluate when new version available.

## Updated Packages

### AWS SDK (all updated to 3.980.0)
- @aws-sdk/client-cloudformation
- @aws-sdk/client-cloudfront
- @aws-sdk/client-cognito-identity-provider
- @aws-sdk/client-dynamodb
- @aws-sdk/client-s3
- @aws-sdk/client-secrets-manager
- @aws-sdk/client-sqs
- @aws-sdk/lib-dynamodb
- @aws-sdk/util-dynamodb

### Direct Dependencies
- fast-xml-parser: added as direct dependency @5.3.4

### Package.json Changes
Added `overrides` section to force secure dependency versions:
```json
"overrides": {
  "fast-xml-parser": "^5.3.4"
}
```

## Audit Results

**Before:**
- 31 vulnerabilities (2 moderate, 29 high)
- Critical issues: fast-xml-parser (high), eslint (moderate)

**After:**
- 2 vulnerabilities (2 moderate)
- Remaining: eslint@8.57.1 in dev tool (accepted as known limitation)

**High-Severity Vulnerabilities:** 0 ✅  
**Production Vulnerabilities:** 0 ✅

## Testing

All tests passing:
- ✅ 685 tests passed
- ✅ 2 tests skipped
- ✅ 70 test files
- ✅ No regressions introduced

## Risk Assessment

**Overall Risk Reduction:** High → Low

The high-severity fast-xml-parser vulnerability in production dependencies has been eliminated. The remaining moderate-severity eslint vulnerability is isolated to development tooling and poses minimal risk.

## Next Steps

1. Monitor @microsoft/eslint-formatter-sarif for updates
2. Re-run `npm audit` periodically to catch new vulnerabilities
3. Consider alternative SARIF formatters if eslint issue persists

---

**Update Completed:** 2026-02-02  
**Implemented By:** GitHub Copilot Security Agent  
**Tests Status:** All Passing ✅
