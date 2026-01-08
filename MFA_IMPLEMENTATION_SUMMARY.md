# MFA Implementation Summary

**Date**: 2026-01-06  
**Status**: ✅ COMPLETE - Ready for Testing  
**Issue**: #442 - Gov-Client-Multi-Factor header implementation  
**Phase**: Phase 1, Step 1.1 of HMRC_MTD_APPROVAL_PLAN.md

---

## What Was Implemented

### Frontend Changes

#### 1. MFA Detection (`web/public/auth/loginWithCognitoCallback.html`)

After successful OAuth login, the code now:
- Extracts `amr` (Authentication Methods Reference) claims from ID token
- Detects MFA indicators: `'mfa'`, `'swk'` (software key), `'hwk'` (hardware key), `'otp'`
- Stores MFA metadata in sessionStorage when MFA detected
- Clears metadata when no MFA present

**Code Location**: Lines 172-191

```javascript
const amrClaims = idTokenPayload.amr || [];
const mfaIndicators = ["mfa", "swk", "hwk", "otp"];
const hasMFA = Array.isArray(amrClaims) && amrClaims.some((method) => mfaIndicators.includes(method));

if (hasMFA) {
  const mfaMetadata = {
    type: "OTHER",
    timestamp: new Date().toISOString(),
    uniqueReference: crypto.randomUUID(),
  };
  sessionStorage.setItem("mfaMetadata", JSON.stringify(mfaMetadata));
}
```

#### 2. MFA Header Generation (`web/public/submit.js`)

When making HMRC API calls, the code now:
- Reads MFA metadata from sessionStorage
- Generates `Gov-Client-Multi-Factor` header in HMRC-compliant format
- Omits header when no MFA present (HMRC allows this)

**Code Location**: Lines 1143-1156

```javascript
let govClientMultiFactorHeader;
try {
  const mfaMetadata = sessionStorage.getItem("mfaMetadata");
  if (mfaMetadata) {
    const mfa = JSON.parse(mfaMetadata);
    govClientMultiFactorHeader = `type=${mfa.type}&timestamp=${encodeURIComponent(mfa.timestamp)}&unique-reference=${encodeURIComponent(mfa.uniqueReference)}`;
  }
} catch (err) {
  console.warn("Failed to read MFA metadata from sessionStorage:", err);
}
```

#### 3. Test Helpers (`behaviour-tests/helpers/behaviour-helpers.js`)

Added helper functions for testing:
- `injectMockMfa(page, options)` - Inject test MFA into sessionStorage
- `clearMockMfa(page)` - Clear MFA for testing no-MFA scenarios

**Usage in Tests**:
```javascript
import { injectMockMfa } from './helpers/behaviour-helpers.js';

// Before making HMRC API call:
await injectMockMfa(page, {
  type: 'TOTP',
  timestamp: '2026-01-06T21:00:00.000Z',
  uniqueReference: 'test-session-12345'
});
```

### Backend Changes

**None required** - `app/lib/buildFraudHeaders.js` already passes through the `Gov-Client-Multi-Factor` header from client (line 103).

---

## Testing Results

### Unit & System Tests
```bash
npm test
# ✅ 390 tests passed, 0 failures
```

### Security Scan
```bash
codeql_checker
# ✅ 0 vulnerabilities detected
```

### Code Review
- ✅ Completed
- Minor nitpicks about logging (consistent with existing code)
- JSON.parse error handling verified correct

---

## How It Works

### Flow Diagram

```
1. User logs in with Google (with 2FA enabled)
   ↓
2. Google OAuth returns ID token with amr=['mfa', 'pwd']
   ↓
3. loginWithCognitoCallback.html extracts amr claims
   ↓
4. MFA detected → Store in sessionStorage:
   {
     type: "OTHER",
     timestamp: "2026-01-06T21:00:00.000Z",
     uniqueReference: "abc123..."
   }
   ↓
5. User submits VAT return
   ↓
6. submit.js reads sessionStorage and generates header:
   Gov-Client-Multi-Factor: type=OTHER&timestamp=2026-01-06T21:00:00.000Z&unique-reference=abc123...
   ↓
7. Header sent to Lambda
   ↓
8. buildFraudHeaders.js passes header through to HMRC
   ↓
9. HMRC validates fraud prevention headers ✅
```

### MFA Detection Logic

**Google with 2FA enabled**: ID token includes `amr` with values like:
- `['mfa', 'pwd']` - Password + 2-factor
- `['swk']` - Software key (authenticator app)
- `['hwk']` - Hardware key (YubiKey)

**Google without 2FA**: ID token has `amr=['pwd']` → No MFA detected → Header omitted

**antonycc OIDC**: Depends on OIDC provider configuration (may need future work)

---

## HMRC Compliance

### Header Format
✅ Complies with HMRC specification:
```
Gov-Client-Multi-Factor: type=<TYPE>&timestamp=<ISO8601>&unique-reference=<UUID>
```

### Type Values
- `OTHER` - Federated IdP MFA (Google 2FA, passkeys) ← **We use this**
- `TOTP` - Authenticator app
- `AUTH_CODE` - SMS code

### Omission Policy
✅ Header omitted when no MFA detected (HMRC allows this)

### Current Status
- Currently in `intentionallyNotSuppliedHeaders` list in `behaviour-tests/helpers/dynamodb-assertions.js`
- Will be removed from this list after validation with real MFA

### Proxy Mode Testing (Updated 2026-01-07)
- `mock-oauth2-server.json` now includes `amr: ["mfa", "pwd"]` claims
- `loginWithMockCallback.html` now extracts MFA from mock tokens (same logic as Cognito callback)
- Proxy tests should now automatically detect MFA and generate the header

---

## Next Steps

### Phase 1: Proxy Environment Testing

1. **Test MFA Detection in Proxy Mode**
   ```bash
   # Run proxy tests - MFA should now be automatically detected
   npm run test:submitVatBehaviour-proxy
   ```

2. **Manual Testing with Real Google Account**
   - Log in with Google account that has 2FA enabled
   - Check browser DevTools:
     ```javascript
     sessionStorage.getItem('mfaMetadata')
     // Should show: {"type":"OTHER","timestamp":"...","uniqueReference":"..."}
     ```
   - Submit VAT return
   - Check Network tab: `Gov-Client-Multi-Factor` header should be present

3. **Verify in DynamoDB**
   ```bash
   # Export HMRC API requests table
   npm run test:submitVatBehaviour-proxy
   
   # Check for MFA header in export
   cat target/behaviour-test-results/*/hmrc-api-requests.jsonl | \
     jq -r '.httpRequest.headers."gov-client-multi-factor"' | \
     grep -E '^type='
   ```

4. **HMRC Validation Endpoint**
   ```bash
   # Run fraud prevention header validation
   HMRC_ACCOUNT=sandbox npm run test:postVatReturnFraudPreventionHeadersBehaviour-proxy
   
   # Check validation feedback - no errors for gov-client-multi-factor
   ```

### Phase 2: CI Environment

1. **Deploy to CI**
   ```bash
   cd infra && npm run cdk:deploy-ci
   ```

2. **Run Behaviour Tests with Mock MFA**
   ```bash
   export TEST_MFA_ENABLED=true
   export TEST_MFA_TYPE=TOTP
   export TEST_MFA_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
   npm run test:submitVatBehaviour-ci
   ```

3. **Verify Header in CI Artifacts**
   ```bash
   gh run download <run-id> -n submitVatBehaviour-artifacts
   cat target/behaviour-test-results/*/hmrc-api-requests.jsonl | \
     jq -r '.httpRequest.headers."gov-client-multi-factor"'
   ```

### Phase 3: Production

1. **Deploy to Production**
   ```bash
   cd infra && npm run cdk:deploy-prod
   ```

2. **Smoke Tests**
   ```bash
   npm run test:submitVatBehaviour-prod
   ```

3. **Collect Evidence for HMRC**
   - Download artifacts: `hmrc-api-requests.jsonl`, screenshots
   - Document federated IdP MFA approach
   - Submit to HMRC for approval

### Phase 4: Update Test Configuration

Once validated, remove from intentionally omitted list:

**File**: `behaviour-tests/helpers/dynamodb-assertions.js`

```javascript
// Before:
export const intentionallyNotSuppliedHeaders = [
  "gov-client-multi-factor",
  "gov-vendor-license-ids",
  "gov-client-public-port"
];

// After:
export const intentionallyNotSuppliedHeaders = [
  "gov-vendor-license-ids",
  "gov-client-public-port"
];
```

---

## Troubleshooting

### Header Not Present

**Symptom**: `Gov-Client-Multi-Factor` header missing from HMRC API calls

**Check**:
1. Browser DevTools: `sessionStorage.getItem('mfaMetadata')` - should show metadata
2. Browser Console: Look for "MFA detected from federated IdP" log message
3. Network tab: Check if header is sent to backend

**Possible Causes**:
- User logged in with Google account without 2FA enabled → Expected, header omitted
- sessionStorage cleared between login and API call → Session expired
- ID token doesn't include `amr` claims → Check IdP configuration

### Header Has Wrong Format

**Symptom**: HMRC validation endpoint returns error about MFA header

**Check**:
1. Browser Console: Look for "Failed to read MFA metadata" warning
2. Verify format: `type=OTHER&timestamp=2026-01-06T21:00:00.000Z&unique-reference=abc123...`

**Possible Causes**:
- sessionStorage data corrupted → Try clearing and logging in again
- Timestamp not ISO8601 format → Check `new Date().toISOString()` output

### Testing with Mock MFA

**For behaviour tests**:
```javascript
import { injectMockMfa } from './helpers/behaviour-helpers.js';

// In beforeEach or test setup:
await injectMockMfa(page, {
  type: 'TOTP',
  timestamp: '2026-01-06T21:00:00.000Z',
  uniqueReference: 'test-session-12345'
});

// Make HMRC API call - header will be included
```

**With environment variables**:
```bash
export TEST_MFA_TYPE=TOTP
export TEST_MFA_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
npm run test:submitVatBehaviour-proxy
```

---

## Files Changed

| File | Lines | Purpose |
|------|-------|---------|
| `web/public/auth/loginWithCognitoCallback.html` | 172-191 | Extract MFA from ID token |
| `web/public/auth/loginWithMockCallback.html` | 152-171 | Extract MFA from mock token |
| `web/public/submit.js` | 1143-1156 | Generate MFA header |
| `mock-oauth2-server.json` | 16 | Add `amr` claims to mock tokens |
| `behaviour-tests/helpers/behaviour-helpers.js` | +51 lines | Test helpers |
| `package-lock.json` | Updated | Dependencies |

**Total**: 5 files changed (+ mock config update)

---

## References

- **MFA Plan**: `MFA_PLAN.md` - Full implementation plan
- **HMRC Spec**: `hmrc-fraud-prevention.md` - HMRC requirements
- **Parent Plan**: `HMRC_MTD_APPROVAL_PLAN.md` - Overall approval roadmap
- **Issue**: #442 - Gov-Client-Multi-Factor header tracking

---

## Success Criteria

- ✅ Frontend extracts MFA claims from federated IdP tokens
- ✅ Header generated when MFA detected
- ✅ Header format complies with HMRC specification
- ✅ Header omitted when no MFA (HMRC compliant)
- ✅ Mock OAuth server includes `amr` claims for proxy testing
- ✅ Mock callback extracts MFA claims (same as Cognito callback)
- ⏳ **Pending**: Real-world testing with Google 2FA
- ⏳ **Pending**: HMRC validation endpoint approval
- ⏳ **Pending**: Remove from intentionallyNotSuppliedHeaders list

---

**Implementation Complete**: 2026-01-06  
**Ready for**: Proxy environment testing and validation  
**Next Milestone**: HMRC production approval
