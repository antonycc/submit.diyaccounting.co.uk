# HMRC Sandbox Testing Guide

## Overview

This guide provides step-by-step instructions for testing DIY Accounting Submit with HMRC's sandbox environment. Completing these tests is **required** before requesting production credentials.

## Prerequisites

### 1. HMRC Developer Hub Account

1. Register at [HMRC Developer Hub](https://developer.service.hmrc.gov.uk)
2. Sign in with Government Gateway credentials
3. Navigate to "Applications" section

### 2. Create Sandbox Application

1. Click "Add an application to the sandbox"
2. Choose "Web app"
3. Application name: "DIY Accounting Submit (Sandbox)"
4. Redirect URIs:
   - `https://your-ngrok-url.ngrok-free.app/activities/submitVatCallback.html`
   - `https://localhost:3000/activities/submitVatCallback.html`
5. Subscribe to APIs:
   - **VAT (MTD)** - Submit VAT returns
   - **Test Fraud Prevention Headers** - Validate headers
6. Save **Client ID** and **Client Secret**

### 3. Local Environment Setup

Create `.env.sandbox` file:

```bash
# HMRC Sandbox Configuration
HMRC_BASE_URI=https://test-api.service.hmrc.gov.uk
HMRC_CLIENT_ID=your_sandbox_client_id
HMRC_CLIENT_SECRET=your_sandbox_client_secret

# Local URLs
DIY_SUBMIT_BASE_URL=https://your-ngrok-url.ngrok-free.app/

# Optional: Proxy server IP
DIY_SUBMIT_PROXY_SERVER_IP=203.0.113.6
```

Start services:

```bash
# Terminal 1: Start Express server
npm run start

# Terminal 2: Start ngrok
npm run proxy

# Terminal 3: Start mock OAuth (for other testing)
npm run auth

# Terminal 4: Start MinIO (for receipts)
npm run storage
```

## Test Scenarios

### Test 1: Create HMRC Test User

**Purpose**: Create a sandbox organisation with VAT enrollment

**API**: POST `/create-test-user/organisations`

**Steps**:

1. Call HMRC Create Test User API:
   ```bash
   curl -X POST https://test-api.service.hmrc.gov.uk/create-test-user/organisations \
     -H "Content-Type: application/json" \
     -d '{
       "serviceNames": ["mtd-vat"]
     }'
   ```

2. Save response:
   ```json
   {
     "userId": "945350439195",
     "password": "password123",
     "userFullName": "Test User",
     "emailAddress": "test@example.com",
     "organisationDetails": {
       "name": "Test Organisation",
       "vatRegistrationNumber": "999999999"
     }
   }
   ```

3. Document:
   - VRN: `999999999`
   - User ID: `945350439195`
   - Password: `password123`

**Expected Result**: ✅ Test user created successfully

---

### Test 2: OAuth Authorization Flow

**Purpose**: Obtain access token for API calls

**Endpoint**: GET `/api/v1/hmrc/authUrl`

**Steps**:

1. Get authorization URL:
   ```bash
   curl "http://localhost:3000/api/v1/hmrc/authUrl?state=test-state-123"
   ```

2. Copy `authUrl` from response

3. Open in browser and login with test user credentials

4. After redirect, extract authorization code from URL

5. Exchange code for token:
   ```bash
   curl -X POST http://localhost:3000/api/v1/hmrc/token \
     -H "Content-Type: application/json" \
     -d '{"code": "AUTHORIZATION_CODE_HERE"}'
   ```

6. Save `hmrcAccessToken` from response

**Expected Result**: ✅ Access token obtained

**Log Evidence**:
- Screenshot of authorization page
- Screenshot of successful redirect
- Copy of token exchange response

---

### Test 3: Test Fraud Prevention Headers

**Purpose**: Validate fraud prevention headers with HMRC

**Endpoint**: POST `/api/v1/hmrc/test/fraud-prevention-headers`

**Steps**:

1. Collect client headers from browser (use browser console):
   ```javascript
   const headers = {
     'Gov-Client-Browser-JS-User-Agent': navigator.userAgent,
     'Gov-Client-Device-ID': localStorage.getItem('deviceId'),
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
     })
   };
   console.log(headers);
   ```

2. Make API call with headers:
   ```bash
   curl -X POST http://localhost:3000/api/v1/hmrc/test/fraud-prevention-headers \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Gov-Client-Browser-JS-User-Agent: Mozilla/5.0..." \
     -H "Gov-Client-Device-ID: device-123" \
     -H "Gov-Client-Screens: {\"width\":1920,\"height\":1080,\"colorDepth\":24,\"pixelDepth\":24}" \
     -H "Gov-Client-Timezone: Europe/London" \
     -H "Gov-Client-Window-Size: {\"width\":1920,\"height\":937}"
   ```

3. Review response:
   ```json
   {
     "message": "Fraud prevention headers validation successful",
     "validation": {
       "code": "VALID_HEADERS",
       "warnings": []
     },
     "headersValidated": [...]
   }
   ```

**Expected Result**: ✅ All headers valid, no warnings

**Log Evidence**:
- Complete request with all headers
- Complete response
- Screenshot of validation result

**⚠️ Fix Any Warnings**: If warnings present, fix and re-test

---

### Test 4: Retrieve VAT Obligations

**Purpose**: Fetch VAT obligations for test VRN

**Endpoint**: GET `/api/v1/hmrc/vat/obligation`

**Scenarios to Test**:

#### 4a. Open Obligations

```bash
curl -X GET "http://localhost:3000/api/v1/hmrc/vat/obligation?vrn=999999999&status=O" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Gov-Client-Browser-JS-User-Agent: Mozilla/5.0..." \
  # ... other fraud prevention headers
```

**Gov-Test-Scenario**: `QUARTERLY_NONE_MET` (default)

**Expected Result**:
```json
{
  "obligations": [
    {
      "start": "2024-01-01",
      "end": "2024-03-31",
      "due": "2024-05-07",
      "status": "O",
      "periodKey": "24A1",
      "received": null
    }
  ]
}
```

#### 4b. Fulfilled Obligations

```bash
curl -X GET "http://localhost:3000/api/v1/hmrc/vat/obligation?vrn=999999999&status=F" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Gov-Test-Scenario: QUARTERLY_ONE_MET" \
  # ... fraud prevention headers
```

**Expected Result**: ✅ List of fulfilled obligations

#### 4c. All Obligations (Date Range)

```bash
curl -X GET "http://localhost:3000/api/v1/hmrc/vat/obligation?vrn=999999999&from=2024-01-01&to=2024-12-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  # ... fraud prevention headers
```

**Expected Result**: ✅ Obligations within date range

**Log Evidence**: Save all request/response pairs

---

### Test 5: Submit VAT Return

**Purpose**: Submit a VAT return for open obligation

**Endpoint**: POST `/api/v1/hmrc/vat/return`

**Steps**:

1. Get open obligation from Test 4

2. Submit return:
   ```bash
   curl -X POST http://localhost:3000/api/v1/hmrc/vat/return \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -H "Gov-Client-Browser-JS-User-Agent: Mozilla/5.0..." \
     # ... other fraud prevention headers \
     -d '{
       "vatNumber": "999999999",
       "periodKey": "24A1",
       "vatDueSales": 1000.00,
       "vatDueAcquisitions": 0.00,
       "totalVatDue": 1000.00,
       "vatReclaimedCurrPeriod": 250.00,
       "netVatDue": 750.00,
       "totalValueSalesExVAT": 5000,
       "totalValuePurchasesExVAT": 1000,
       "totalValueGoodsSuppliedExVAT": 0,
       "totalAcquisitionsExVAT": 0,
       "finalised": true
     }'
   ```

3. Verify response:
   ```json
   {
     "processingDate": "2024-01-15T10:30:00Z",
     "formBundleNumber": "123456789012",
     "chargeRefNumber": "XM002610011594"
   }
   ```

**Expected Result**: ✅ VAT return submitted successfully

**Log Evidence**:
- Complete request payload
- Complete response
- Form bundle number
- Charge reference number

---

### Test 6: View Submitted VAT Return

**Purpose**: Retrieve previously submitted return

**Endpoint**: GET `/api/v1/hmrc/vat/return/{periodKey}`

**Steps**:

```bash
curl -X GET "http://localhost:3000/api/v1/hmrc/vat/return?vrn=999999999&periodKey=24A1" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  # ... fraud prevention headers
```

**Expected Result**:
```json
{
  "periodKey": "24A1",
  "vatDueSales": 1000.00,
  "vatDueAcquisitions": 0.00,
  "totalVatDue": 1000.00,
  "vatReclaimedCurrPeriod": 250.00,
  "netVatDue": 750.00,
  "totalValueSalesExVAT": 5000,
  "totalValuePurchasesExVAT": 1000,
  "totalValueGoodsSuppliedExVAT": 0,
  "totalAcquisitionsExVAT": 0
}
```

**Expected Result**: ✅ Return details match submitted values

---

### Test 7: Error Handling

**Purpose**: Verify proper error handling

#### 7a. Invalid VRN

```bash
curl -X GET "http://localhost:3000/api/v1/hmrc/vat/obligation?vrn=111111111" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: 400 Bad Request - Invalid VRN format

#### 7b. Expired Token

```bash
curl -X GET "http://localhost:3000/api/v1/hmrc/vat/obligation?vrn=999999999" \
  -H "Authorization: Bearer expired_token_here"
```

**Expected**: 401 Unauthorized

#### 7c. Missing Authorization

```bash
curl -X GET "http://localhost:3000/api/v1/hmrc/vat/obligation?vrn=999999999"
```

**Expected**: 401 Unauthorized - Missing token

#### 7d. Return Not Found

```bash
curl -X GET "http://localhost:3000/api/v1/hmrc/vat/return?vrn=999999999&periodKey=99Z9" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: 404 Not Found

**Expected Result**: ✅ All error scenarios handled correctly

---

### Test 8: Gov-Test-Scenario Header

**Purpose**: Test HMRC sandbox scenarios

**Scenarios**:

| Scenario | Header Value | Expected Result |
|----------|-------------|-----------------|
| No obligations | `QUARTERLY_NONE_MET` | Empty obligations list |
| One obligation | `QUARTERLY_ONE_MET` | One fulfilled obligation |
| Two obligations | `QUARTERLY_TWO_MET` | Two fulfilled obligations |
| Four obligations | `QUARTERLY_FOUR_MET` | Four fulfilled obligations |

**Example**:

```bash
curl -X GET "http://localhost:3000/api/v1/hmrc/vat/obligation?vrn=999999999&status=F" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Gov-Test-Scenario: QUARTERLY_FOUR_MET" \
  # ... other headers
```

**Expected Result**: ✅ Correct number of obligations returned

---

## Test Results Documentation

### Required Evidence

For each test, document:

1. **Request Details**:
   - Full URL with query parameters
   - All headers (including fraud prevention headers)
   - Request body (if applicable)
   - Timestamp of request

2. **Response Details**:
   - HTTP status code
   - Response headers
   - Response body
   - Timestamp of response

3. **Screenshots**:
   - Browser-based flows (OAuth, UI tests)
   - Terminal output for curl commands
   - Postman/Insomnia request/response

4. **Logs**:
   - Server logs showing request processing
   - HMRC API call logs
   - Error logs (if any errors occurred)

### Test Results Template

Create `_developers/SANDBOX_TEST_RESULTS.md`:

```markdown
# HMRC Sandbox Test Results

**Date**: 2025-11-13  
**Tester**: Your Name  
**Environment**: Sandbox  
**Software Version**: 0.0.2-4

## Test 1: Create HMRC Test User
- Status: ✅ PASS
- VRN: 999999999
- Evidence: [Screenshot](./evidence/test1-user-created.png)

## Test 2: OAuth Authorization Flow
- Status: ✅ PASS
- Access Token: ✅ Obtained
- Evidence: [Screenshot](./evidence/test2-oauth-flow.png)

## Test 3: Test Fraud Prevention Headers
- Status: ✅ PASS / ⚠️ WARNINGS / ❌ FAIL
- Warnings: [List any warnings]
- Evidence: [Response JSON](./evidence/test3-headers-validation.json)

... continue for all tests
```

---

## Submission to HMRC

### When to Submit

Submit when:
- ✅ All 8 test scenarios completed
- ✅ No warnings from fraud prevention headers validation
- ✅ All test evidence collected and organized
- ✅ Within 2 weeks of completing tests

### What to Submit

Email to: **SDSTeam@hmrc.gov.uk**

**Subject**: Production Credentials Request - DIY Accounting Submit

**Email Body**:

```
Dear HMRC Software Development Support Team,

I am requesting production credentials for DIY Accounting Submit, a Making Tax Digital for VAT software application.

Application Details:
- Application Name: DIY Accounting Submit
- Sandbox Client ID: [Your Sandbox Client ID]
- Software Version: 0.0.2-4
- Contact Email: admin@diyaccounting.co.uk

Testing Summary:
- Completion Date: [Date]
- Test User VRN: [Test VRN]
- Tests Completed: 8/8
- Fraud Prevention Headers: Validated (No Warnings)

Attached Documentation:
1. Complete test results (SANDBOX_TEST_RESULTS.md)
2. Fraud prevention headers validation response
3. Sample API request/response logs
4. Screenshots of OAuth flow and VAT submission

The software successfully completed all required sandbox tests including:
- OAuth authorization flow
- Fraud prevention headers validation
- VAT obligations retrieval
- VAT return submission
- VAT return viewing
- Error handling scenarios

Please let me know if you require any additional information.

Best regards,
[Your Name]
```

**Attachments**:
1. `SANDBOX_TEST_RESULTS.md`
2. `FRAUD_PREVENTION_HEADERS_VALIDATION.json`
3. `SAMPLE_API_LOGS.txt`
4. `OAUTH_FLOW_SCREENSHOTS.zip`

---

## Expected Timeline

| Step | Expected Duration |
|------|------------------|
| Complete sandbox testing | 1-2 days |
| Organize evidence | 1 day |
| Submit to HMRC | Immediate |
| HMRC review | 10 working days |
| Complete questionnaires | 1 day |
| Sign Terms of Use | 1 day |
| Receive production credentials | 1-2 days |
| **Total** | **~3-4 weeks** |

---

## Troubleshooting

### Issue: Cannot create test user

**Solution**: Ensure you're calling the correct sandbox endpoint
```
https://test-api.service.hmrc.gov.uk/create-test-user/organisations
```

### Issue: 401 Unauthorized on API calls

**Possible Causes**:
1. Token expired (tokens expire after 4 hours)
2. Wrong token used (ensure using hmrcAccessToken, not idToken)
3. Token not in Authorization header

**Solution**: Re-authenticate and obtain fresh token

### Issue: Fraud prevention headers validation warnings

**Common Warnings**:
- Missing Gov-Client-Device-ID → Ensure device ID is generated and stored
- Invalid Gov-Client-Screens format → Use JSON.stringify()
- Missing Gov-Client-Timezone → Ensure Intl API is available

**Solution**: Fix warnings and re-test until no warnings

### Issue: VAT submission returns 403 Forbidden

**Possible Causes**:
1. Token doesn't have write:vat scope
2. VRN not enrolled for MTD VAT
3. Period already submitted

**Solution**: Check OAuth scopes and use correct test VRN

---

## Next Steps After Sandbox Testing

1. ✅ Complete all tests
2. ✅ Collect evidence
3. ✅ Submit to HMRC
4. ⏳ Wait for questionnaires
5. ⏳ Complete questionnaires
6. ⏳ Sign Terms of Use
7. ⏳ Receive production credentials
8. ⏳ Deploy to staging with production credentials
9. ⏳ Make one live VAT return submission
10. ✅ Get listed on GOV.UK

---

**Last Updated**: 2025-11-13  
**Status**: Ready for Sandbox Testing  
**Owner**: DIY Accounting Development Team
