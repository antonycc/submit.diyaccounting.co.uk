# DIY Accounting Submit - API Documentation

Complete API reference for the DIY Accounting Submit application.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Base URLs](#base-urls)
- [Rate Limits](#rate-limits)
- [Error Handling](#error-handling)
- [Authentication Endpoints](#authentication-endpoints)
- [VAT Submission Endpoints](#vat-submission-endpoints)
- [Bundle Management](#bundle-management)
- [Receipt Management](#receipt-management)
- [Testing with Sandbox](#testing-with-sandbox)

## Overview

The DIY Accounting Submit API provides endpoints for:
- HMRC OAuth2 authentication
- VAT return submissions to HMRC
- VAT obligations and return retrieval
- Bundle-based access control
- Receipt storage and retrieval

All endpoints expect and return JSON unless otherwise specified.

## Authentication

The API uses two authentication mechanisms:

### Cognito JWT Authentication
Most endpoints require a Cognito JWT token in the Authorization header:
```
Authorization: Bearer <COGNITO_JWT_TOKEN>
```

### HMRC OAuth2 Authentication
HMRC-specific operations require an HMRC access token, obtained via:
1. Call `/api/v1/hmrc/authUrl` to get authorization URL
2. User completes HMRC OAuth flow
3. Exchange authorization code for access token via `/api/v1/hmrc/token`

## Base URLs

- **Production**: `https://submit.diyaccounting.co.uk/api/v1/`
- **Test/Sandbox**: Use HMRC_BASE_URI environment variable

## Rate Limits

HMRC API rate limits apply:
- 3 requests per second per application
- Retry with exponential backoff on 429 responses
- Use request IDs for debugging rate limit issues

## Error Handling

All errors return a consistent JSON format:

```json
{
  "message": "Human-readable error description",
  "error": {
    "responseCode": 400,
    "responseBody": {
      "detail": "Additional error context"
    }
  }
}
```

### Common HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Validation error, missing required fields |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient bundle access or permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded, retry with backoff |
| 500 | Internal Server Error | Check CloudWatch logs with request ID |

## Authentication Endpoints

### Get HMRC Authorization URL

**Endpoint**: `GET /api/v1/hmrc/authUrl`

Returns a URL to redirect users to the HMRC OAuth consent page.

**Query Parameters**:
- `state` (required): Random string for CSRF protection

**Request Example**:
```
GET /api/v1/hmrc/authUrl?state=csrf-random-12345
```

**Response**:
```json
{
  "authUrl": "https://api.service.hmrc.gov.uk/oauth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=https://yourapp.com&scope=write:vat+read:vat&state=csrf-random-12345"
}
```

**Usage Flow**:
1. Generate random state string for CSRF protection
2. Call this endpoint with state parameter
3. Redirect user to returned authUrl
4. User completes HMRC OAuth flow
5. HMRC redirects back with authorization code
6. Exchange code for access token (see next endpoint)

---

### Exchange HMRC Authorization Code

**Endpoint**: `POST /api/v1/hmrc/token`

Exchanges an HMRC authorization code for an access token.

**Request Body**:
```json
{
  "code": "AUTHORIZATION_CODE_FROM_HMRC"
}
```

**Response**:
```json
{
  "accessToken": "hmrc_access_token_xyz",
  "expiresIn": 3600,
  "tokenType": "Bearer",
  "scope": "write:vat read:vat"
}
```

**Error Example**:
```json
{
  "message": "Token exchange failed",
  "error": {
    "responseCode": 400,
    "responseBody": {
      "error": "invalid_grant",
      "error_description": "Authorization code expired"
    }
  }
}
```

---

### Get Cognito Authorization URL

**Endpoint**: `GET /api/v1/cognito/authUrl`

Returns the Cognito OAuth2 authorization URL for user login.

**Query Parameters**:
- `state` (required): Random string for CSRF protection

**Response**:
```json
{
  "authUrl": "https://auth.submit.diyaccounting.co.uk/oauth2/authorize?client_id=..."
}
```

---

### Exchange Cognito Authorization Code

**Endpoint**: `POST /api/v1/cognito/token`

Exchanges a Cognito authorization code for JWT tokens.

**Content-Type**: `application/x-www-form-urlencoded`

**Request Body**:
```
code=AUTHORIZATION_CODE
```

**Response**:
```json
{
  "accessToken": "cognito_access_token",
  "idToken": "jwt_id_token",
  "refreshToken": "refresh_token",
  "expiresIn": 3600
}
```

## VAT Submission Endpoints

### Submit VAT Return

**Endpoint**: `POST /api/v1/hmrc/vat/return`

Submits a VAT return to HMRC on behalf of the authenticated user.

**Authentication**: Cognito JWT (for bundle enforcement) + HMRC access token (in body)

**Request Headers**:
- `Authorization: Bearer <COGNITO_JWT>`
- `Gov-Test-Scenario` (optional, sandbox only): Test scenario name

**Required Gov-Client Headers** (automatically added by server):
- `Gov-Client-Connection-Method`: Connection method (WEB_APP_VIA_SERVER)
- `Gov-Client-Public-IP`: Client's public IP address
- `Gov-Vendor-Version`: Application version

**Request Body**:
```json
{
  "vatNumber": "176540158",
  "periodKey": "24A1",
  "vatDue": 2400.00,
  "accessToken": "hmrc_access_token"
}
```

**Field Validation**:
- `vatNumber`: Must be exactly 9 digits
- `periodKey`: 3-5 characters, alphanumeric or # (e.g., "24A1", "#001")
- `vatDue`: Numeric value, can be 0 or positive
- `accessToken`: Valid HMRC OAuth2 access token

**Response**:
```json
{
  "processingDate": "2025-07-14T20:20:20Z",
  "formBundleNumber": "123456789012",
  "chargeRefNumber": "XZ1234567890"
}
```

**Error Examples**:

Validation error (400):
```json
{
  "message": "Invalid vatNumber format - must be 9 digits, Invalid periodKey format"
}
```

Unauthorized (401):
```json
{
  "message": "Unauthorized - invalid or expired HMRC access token"
}
```

Forbidden - Bundle access (403):
```json
{
  "message": "Forbidden: Missing required bundle",
  "requiredBundles": ["test"]
}
```

---

### Get VAT Obligations

**Endpoint**: `GET /api/v1/hmrc/vat/obligation`

Retrieves VAT obligations from HMRC.

**Authentication**: Cognito JWT + HMRC access token (query parameter)

**Query Parameters**:
- `vrn` (required): VAT Registration Number (9 digits)
- `from` (optional): From date (YYYY-MM-DD)
- `to` (optional): To date (YYYY-MM-DD)
- `status` (optional): "O" (Open) or "F" (Fulfilled)
- `Gov-Test-Scenario` (optional, sandbox): Test scenario

**Request Example**:
```
GET /api/v1/hmrc/vat/obligation?vrn=176540158&status=O
Authorization: Bearer <COGNITO_JWT>
```

**Response**:
```json
{
  "obligations": [
    {
      "periodKey": "24A1",
      "start": "2024-01-01",
      "end": "2024-03-31",
      "due": "2024-05-07",
      "status": "O",
      "received": null
    }
  ]
}
```

---

### Get VAT Return

**Endpoint**: `GET /api/v1/hmrc/vat/return/{periodKey}`

Retrieves a previously submitted VAT return from HMRC.

**Authentication**: Cognito JWT + HMRC access token (query parameter)

**Path Parameters**:
- `periodKey`: The VAT period to retrieve (e.g., "24A1")

**Query Parameters**:
- `vrn` (required): VAT Registration Number (9 digits)
- `Gov-Test-Scenario` (optional, sandbox): Test scenario

**Request Example**:
```
GET /api/v1/hmrc/vat/return/24A1?vrn=176540158
Authorization: Bearer <COGNITO_JWT>
```

**Response**:
```json
{
  "periodKey": "24A1",
  "vatDueSales": 2400.00,
  "vatDueAcquisitions": 0.00,
  "totalVatDue": 2400.00,
  "vatReclaimedCurrPeriod": 1000.00,
  "netVatDue": 1400.00,
  "totalValueSalesExVAT": 12000,
  "totalValuePurchasesExVAT": 5000,
  "totalValueGoodsSuppliedExVAT": 0,
  "totalAcquisitionsExVAT": 0
}
```

## Bundle Management

### Get Product Catalog

**Endpoint**: `GET /api/v1/catalog`

Retrieves the product catalog with available bundles and activities.

**Authentication**: None required

**Response**:
```json
{
  "version": "1.1.0",
  "bundles": [
    {
      "id": "default",
      "name": "Default",
      "allocation": "automatic",
      "auth": "none"
    },
    {
      "id": "test",
      "name": "Test",
      "allocation": "on-request",
      "auth": "required",
      "cap": 10,
      "timeout": "P1D"
    }
  ],
  "activities": [
    {
      "id": "submit-vat-sandbox",
      "name": "Submit VAT (Sandbox API)",
      "bundles": ["test"],
      "paths": ["activities/submitVat.html", "^/api/v1/hmrc/vat.*"]
    }
  ]
}
```

---

### Request Bundle

**Endpoint**: `POST /api/v1/bundle`

Requests access to a bundle for the authenticated user.

**Authentication**: Cognito JWT

**Request Body**:
```json
{
  "bundleId": "test",
  "qualifiers": {
    "transactionId": "TX-12345"
  }
}
```

**Response**:
```json
{
  "granted": true,
  "expiry": "2025-09-01T00:00:00Z",
  "bundleId": "test"
}
```

**Error - Cap Reached (403)**:
```json
{
  "granted": false,
  "message": "Bundle cap reached",
  "cap": 10,
  "currentUsers": 10
}
```

**Error - Missing Qualifier (400)**:
```json
{
  "message": "Bundle qualification failed: missing_transactionId"
}
```

---

### Get User Bundles

**Endpoint**: `GET /api/v1/bundle`

Retrieves all bundles granted to the authenticated user.

**Authentication**: Cognito JWT

**Response**:
```json
{
  "bundles": [
    {
      "bundleId": "test",
      "granted": "2025-01-15T10:30:00Z",
      "expiry": "2025-01-16T10:30:00Z"
    }
  ]
}
```

---

### Delete Bundle

**Endpoint**: `DELETE /api/v1/bundle?bundleId={bundleId}`

or

**Endpoint**: `DELETE /api/v1/bundle/{id}`

Removes a bundle from the authenticated user's account.

**Authentication**: Cognito JWT

**Query Parameters** (first form):
- `bundleId` (optional): Specific bundle to remove
- `removeAll` (optional): "true" to remove all bundles

**Response**:
```json
{
  "message": "Bundle removed successfully",
  "bundleId": "test"
}
```

## Receipt Management

### Log Receipt

**Endpoint**: `POST /api/v1/hmrc/receipt`

Logs/stores submission receipts securely to AWS DynamoDb.

**Authentication**: Cognito JWT

**Request Body**:
```json
{
  "receipt": {
    "formBundleNumber": "123456789012",
    "chargeRefNumber": "XZ1234567890",
    "processingDate": "2025-07-14T20:20:20Z"
  }
}
```

**Response**:
```json
{
  "receipt": {
    "formBundleNumber": "123456789012",
    "chargeRefNumber": "XZ1234567890",
    "processingDate": "2025-07-14T20:20:20Z"
  },
  "key": "receipts/user-id/2025-07-14-123456789012.json"
}
```

**Validation Errors**:
```json
{
  "message": "Missing receipt parameter from body, Missing formBundleNumber in receipt body"
}
```

---

### Get Receipts

**Endpoint**: `GET /api/v1/hmrc/receipt`

Retrieves stored receipts for the authenticated user.

**Authentication**: Cognito JWT

**Query Parameters**:
- `name` (optional): Specific receipt filename (e.g., "2025-03-31-123456789012.json")
- `key` (optional): Full DynamoDb key (e.g., "receipts/user-id/2025-03-31-123456789012.json")

**Request Example**:
```
GET /api/v1/hmrc/receipt?name=2025-03-31-123456789012.json
Authorization: Bearer <COGNITO_JWT>
```

**Response** (list):
```json
{
  "receipts": [
    {
      "key": "receipts/user-id/2025-03-31-123456789012.json",
      "lastModified": "2025-03-31T15:30:00Z",
      "size": 256
    }
  ]
}
```

**Response** (single receipt):
```json
{
  "formBundleNumber": "123456789012",
  "chargeRefNumber": "XZ1234567890",
  "processingDate": "2025-03-31T15:30:00Z"
}
```

---

### Get Receipt by Name

**Endpoint**: `GET /api/v1/hmrc/receipt/{name}`

Retrieves a specific receipt by filename.

**Authentication**: Cognito JWT

**Path Parameters**:
- `name`: Receipt filename including .json extension

**Request Example**:
```
GET /api/v1/hmrc/receipt/2025-03-31-123456789012.json
Authorization: Bearer <COGNITO_JWT>
```

**Response**: Same as single receipt response above.

## Testing with Sandbox

### HMRC Sandbox Environment

Use HMRC's sandbox for testing without affecting production data.

**Sandbox Base URL**: `https://test-api.service.hmrc.gov.uk`

**Test Scenarios**: Pass via `Gov-Test-Scenario` header:
- `QUARTERLY_NONE_MET`: No obligations met
- `QUARTERLY_ONE_MET`: One obligation fulfilled
- `MONTHLY_NONE_MET`: Monthly filing, no obligations met

**Test VRN**: Use `176540158` for sandbox testing

### Example Sandbox Flow

1. Set environment to use sandbox:
```bash
export HMRC_BASE_URI=https://test-api.service.hmrc.gov.uk
export HMRC_CLIENT_ID=your_sandbox_client_id
export HMRC_CLIENT_SECRET=your_sandbox_secret
```

2. Request test bundle:
```bash
curl -X POST https://submit.diyaccounting.co.uk/api/v1/bundle \
  -H "Authorization: Bearer $COGNITO_TOKEN" \
  -d '{"bundleId":"test"}'
```

3. Get HMRC auth URL and complete OAuth flow

4. Submit test VAT return:
```bash
curl -X POST https://submit.diyaccounting.co.uk/api/v1/hmrc/vat/return \
  -H "Authorization: Bearer $COGNITO_TOKEN" \
  -H "Gov-Test-Scenario: QUARTERLY_ONE_MET" \
  -d '{
    "vatNumber":"176540158",
    "periodKey":"24A1",
    "vatDue":2400.00,
    "accessToken":"$HMRC_ACCESS_TOKEN"
  }'
```

## OpenAPI Specification

Full OpenAPI 3.0 specification available at:
- YAML: `/docs/openapi.yaml`
- JSON: `/docs/openapi.json`
- Swagger UI: `/docs/` (when deployed)

## Related Documentation

- [Main README](../README.md): Application overview and setup
- [User Guide](../USERGUIDE.md): End-user documentation
- [Developer Setup](SETUP.md): Local development environment
- [GitHub Workflows](../.github/workflows/README.md): CI/CD documentation
