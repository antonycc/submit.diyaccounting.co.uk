# Fraud Prevention Headers Implementation

## Overview

This document describes the implementation of HMRC's Fraud Prevention Headers in DIY Accounting Submit. These headers are **mandatory** for all MTD VAT API calls and are required for HMRC production approval.

Reference: [HMRC Fraud Prevention Headers Specification](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/)

## Implementation Status

### ✅ Fully Implemented Headers

#### Gov-Client Headers (Client-Side)

These headers describe the client device and are collected from the browser:

| Header | Description | Source | Status |
|--------|-------------|--------|--------|
| `Gov-Client-Connection-Method` | How the client connects | Fixed: `WEB_APP_VIA_SERVER` | ✅ |
| `Gov-Client-Browser-JS-User-Agent` | JavaScript user agent | `navigator.userAgent` | ✅ |
| `Gov-Client-Device-ID` | Unique device identifier | Generated UUID stored in localStorage | ✅ |
| `Gov-Client-Multi-Factor` | Multi-factor authentication method | Default: `type=OTHER` | ✅ |
| `Gov-Client-Public-IP` | Client's public IP address | Server-detected from request | ✅ |
| `Gov-Client-Public-IP-Timestamp` | Timestamp of IP detection | ISO 8601 format | ✅ |
| `Gov-Client-Public-Port` | Client's public port | Detected from request | ✅ |
| `Gov-Client-Screens` | Screen information | `window.screen` properties | ✅ |
| `Gov-Client-Timezone` | Client timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` | ✅ |
| `Gov-Client-User-IDs` | User identifiers | Server-generated | ✅ |
| `Gov-Client-Window-Size` | Browser window dimensions | `window.innerWidth/Height` | ✅ |

#### Gov-Vendor Headers (Server-Side)

These headers describe the vendor software and are set by the server:

| Header | Description | Implementation | Status |
|--------|-------------|----------------|--------|
| `Gov-Vendor-Forwarded` | Proxy forwarding information | `by={proxy-ip}&for={client-ip}` | ✅ Dynamic |
| `Gov-Vendor-License-IDs` | Software license identifier | SHA-256 of `name=version` | ✅ Dynamic |
| `Gov-Vendor-Product-Name` | Software product name | "DIY Accounting Submit" | ✅ |
| `Gov-Vendor-Public-IP` | Vendor server public IP | Detected from request headers | ✅ |
| `Gov-Vendor-Version` | Software version | From package.json | ✅ Dynamic |

### ⚠️ Fallback Values

If headers cannot be determined, the following fallbacks are used:

- **Gov-Client-Multi-Factor**: `type=OTHER`
- **Gov-Client-Public-Port**: `443` (HTTPS default)
- **Gov-Client-Screens**: `{"width":1280,"height":720,"colorDepth":24,"pixelDepth":24}`
- **Gov-Client-Timezone**: `UTC`
- **Gov-Client-User-IDs**: `server=1`
- **Gov-Client-Window-Size**: `{"width":1280,"height":720}`
- **Gov-Vendor-Forwarded**: `by=203.0.113.6&for=198.51.100.0` (RFC 5737 documentation IPs)

## Architecture

### Client-Side Collection (web/public/submit.js)

```javascript
function getGovClientHeaders() {
  return {
    'Gov-Client-Browser-JS-User-Agent': navigator.userAgent,
    'Gov-Client-Device-ID': getOrCreateDeviceId(),
    'Gov-Client-Public-IP': 'SERVER_DETECT', // Server will detect
    'Gov-Client-Screens': JSON.stringify({
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth
    }),
    'Gov-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
    'Gov-Client-Window-Size': JSON.stringify({
      width: window.innerWidth,
      height: window.innerHeight
    }),
    // ... other headers
  };
}
```

### Server-Side Processing (app/lib/eventToGovClientHeaders.js)

```javascript
export default function eventToGovClientHeaders(event, detectedIP) {
  // 1. Extract client headers from request
  // 2. Detect client IP from X-Forwarded-For or similar
  // 3. Add Gov-Vendor headers from package.json
  // 4. Sanitize and validate all values
  // 5. Return complete header set
}
```

### Package Information (app/lib/packageInfo.js)

Dynamically loads package.json and computes:
- **License Hash**: SHA-256 of `"${name}=${version}"`
- **Vendor Version**: `"${name}-${version}"`
- **Caching**: Results cached for performance

## Testing

### Unit Tests

**Location**: `app/unit-tests/`

- `eventToGovClientHeaders.test.js` - Header generation tests
- `packageInfo.test.js` - Package info loading and hashing
- `hmrcTestFraudPreventionHeadersPost.handler.test.js` - HMRC validation endpoint

### Test Fraud Prevention Headers API

**Endpoint**: `POST /api/v1/hmrc/test/fraud-prevention-headers`

**Purpose**: Validates fraud prevention headers against HMRC's test endpoint

**Usage**:
```bash
curl -X POST https://submit.diyaccounting.co.uk/api/v1/hmrc/test/fraud-prevention-headers \
  -H "Authorization: Bearer YOUR_HMRC_ACCESS_TOKEN" \
  -H "Gov-Client-Browser-JS-User-Agent: Mozilla/5.0..." \
  -H "Gov-Client-Device-ID: device-123" \
  # ... other headers
```

**Response**:
```json
{
  "message": "Fraud prevention headers validation successful",
  "validation": {
    "code": "VALID_HEADERS",
    "message": "All fraud prevention headers are valid",
    "warnings": []
  },
  "headersValidated": [
    "Gov-Client-Connection-Method",
    "Gov-Client-Browser-JS-User-Agent",
    // ... list of validated headers
  ]
}
```

### Sandbox Testing

Before HMRC production approval, test with sandbox credentials:

1. Create test user via HMRC Create Test User API
2. Make VAT obligation request with fraud prevention headers
3. Verify headers in HMRC sandbox logs
4. Submit VAT return with fraud prevention headers
5. Run Test Fraud Prevention Headers API validation

## HMRC Approval Process

### Prerequisites

1. ✅ All fraud prevention headers implemented
2. ✅ Test Fraud Prevention Headers API endpoint working
3. ✅ Comprehensive unit tests (all passing)
4. ⏳ Complete sandbox testing
5. ⏳ Document test results

### Steps for Approval

1. **Complete Sandbox Testing**
   - Test all VAT API endpoints with fraud prevention headers
   - Validate headers using Test Fraud Prevention Headers API
   - Document all test scenarios and results

2. **Collect Evidence**
   - Save HMRC sandbox API call logs
   - Save Test Fraud Prevention Headers validation responses
   - Screenshot or save test results

3. **Email HMRC SDS Team**
   - Send to: SDSTeam@hmrc.gov.uk
   - Subject: "Production Credentials Request - DIY Accounting Submit"
   - Include: Test logs, validation results, software description
   - Timeline: Within 2 weeks of completing sandbox tests

4. **Complete Questionnaires**
   - Fraud Prevention Implementation Questionnaire
   - API Testing Questionnaire
   - Expected response: 10 working days

5. **Sign Terms of Use**
   - HMRC will send Terms of Use document
   - Review and sign electronically

6. **Receive Production Credentials**
   - HMRC will issue production Client ID and Secret
   - Update environment variables
   - Test in staging before production

7. **Make Live Submission**
   - Submit one real VAT return using production credentials
   - HMRC will verify the submission
   - Confirmation required before GOV.UK listing

## Configuration

### Environment Variables

```bash
# Proxy server IP for Gov-Vendor-Forwarded header (optional)
DIY_SUBMIT_PROXY_SERVER_IP=203.0.113.6

# HMRC API base URL (required)
HMRC_BASE_URI=https://test-api.service.hmrc.gov.uk  # Sandbox
HMRC_BASE_URI=https://api.service.hmrc.gov.uk       # Production

# HMRC OAuth credentials (required)
HMRC_CLIENT_ID=your_client_id
HMRC_CLIENT_SECRET=your_client_secret
```

### Dynamic vs Static Headers

| Header | Mode | Reason |
|--------|------|--------|
| Gov-Client-* | Dynamic | Collected from actual browser/device |
| Gov-Vendor-License-IDs | Dynamic | Computed from package.json version |
| Gov-Vendor-Version | Dynamic | Read from package.json |
| Gov-Vendor-Forwarded | Dynamic | Uses detected client IP |
| Gov-Vendor-Product-Name | Static | "DIY Accounting Submit" |

## Compliance Notes

### HMRC Requirements

1. **All Headers Required**: Missing or invalid headers will cause API rejection
2. **Accurate Data**: Headers must reflect actual client environment
3. **No Spoofing**: Don't accept vendor headers from client side
4. **Continuous Validation**: Use Test Fraud Prevention Headers API regularly

### Security Considerations

1. **Client Headers**: Collected from browser, potentially untrusted
2. **Server Validation**: Server validates and sanitizes all values
3. **Vendor Headers**: Only set by server, never from client
4. **IP Detection**: Uses X-Forwarded-For with fallback to connection IP

### Privacy Considerations

1. **Device ID**: Stored in localStorage, user can clear
2. **IP Address**: Required for fraud prevention, not stored long-term
3. **User Agent**: Standard browser header, not PII
4. **Screen Info**: Technical data, not personally identifiable

## Troubleshooting

### Common Issues

**Issue**: "Missing fraud prevention headers" error
- **Solution**: Ensure client-side header collection is working
- **Check**: Browser console for JavaScript errors
- **Verify**: Headers are sent in network tab

**Issue**: "Invalid Gov-Client-Screens format" error
- **Solution**: Ensure JSON.stringify() is used for complex headers
- **Format**: `{"width":1920,"height":1080,"colorDepth":24,"pixelDepth":24}`

**Issue**: "Gov-Vendor-License-IDs validation failed" error
- **Solution**: Verify SHA-256 hash is uppercase hexadecimal
- **Format**: `software-name=HEXHASH (64 characters)`

**Issue**: Test Fraud Prevention Headers API returns warnings
- **Solution**: Review warnings and fix missing/incorrect headers
- **Action**: Update client-side collection or server-side processing

### Debug Mode

Enable verbose logging for fraud prevention headers:

```javascript
// In eventToGovClientHeaders.js
logger.debug({
  message: "Fraud prevention headers generated",
  govClientHeaders,
  detectedIP,
  packageInfo
});
```

## Future Enhancements

1. **Header Validation Middleware**: Reject requests with invalid headers
2. **Metrics Collection**: Track header completeness across requests
3. **A/B Testing**: Compare different header collection strategies
4. **Mobile Support**: Enhance headers for mobile web browsers
5. **Desktop App Support**: Add headers for Electron or similar desktop apps

## References

- [HMRC Fraud Prevention Specification](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/)
- [HMRC Test Fraud Prevention Headers API](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/txm-fph-validator-api/1.0)
- [HMRC VAT MTD End-to-End Service Guide](https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/)
- [Making Tax Digital for VAT](https://www.gov.uk/government/publications/making-tax-digital/overview-of-making-tax-digital)

---

**Last Updated**: 2025-11-13  
**Status**: Implementation Complete, Sandbox Testing In Progress  
**Next Milestone**: Complete HMRC Sandbox Testing and Submit for Approval
