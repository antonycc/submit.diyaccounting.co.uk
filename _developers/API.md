# DIY Accounting Submit - API

---

## REST API Specification (`/api`)

All endpoints expect and return JSON.

### **`GET /api/hmrc/auth-url?state={state}`**

Returns a URL to redirect users to the HMRC OAuth consent page.

#### Request

* **Query parameter:**

    * `state`: random string for CSRF protection.

#### Response

```json
{
  "authUrl": "https://api.service.hmrc.gov.uk/oauth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=https://yourapp.com&scope=write:vat+read:vat&state=providedState"
}
```

---

### **`POST /api/exchange-token`**

Exchanges the OAuth authorization code for an HMRC access token.

#### Request

```json
{
  "code": "authorization_code_from_hmrc"
}
```

#### Response

```json
{
  "access_token": "hmrc_access_token"
}
```

---

### **`POST /api/submit-vat`**

Submits the VAT return details to HMRC.

#### Request

```json
{
  "vatNumber": "193054661",
  "periodKey": "24A1",
  "vatDue": "2400.00",
  "accessToken": "hmrc_access_token"
}
```

#### Response

```json
{
  "processingDate": "2025-07-14T20:20:20Z",
  "formBundleNumber": "123456789012",
  "chargeRefNumber": "XZ1234567890"
}
```

---

### **`POST /api/log-receipt`**

Logs/stores submission receipts securely (e.g., in AWS S3).

#### Request

```json
{
  "processingDate": "2025-07-14T20:20:20Z",
  "formBundleNumber": "123456789012",
  "chargeRefNumber": "XZ1234567890"
}
```

#### Response

```json
{
  "status": "receipt logged"
}
```
