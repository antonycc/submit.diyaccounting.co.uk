# DIY Accounting Submit

This project allows UK businesses to submit tax returns to HMRC under the Making Tax Digital (MTD) framework. It simplifies interactions through HMRC’s official APIs, providing streamlined VAT submissions initially via a straightforward web interface.

---

# Build and run locally

## Clone the Repository

```bash

git clone git@github.com:antonycc/submit.diyaccounting.co.uk.git
cd submit.diyaccounting.co.uk.git
```

## Install Node.js dependencies and test

```bash

npm install
npm test
```

## Run the website locally

```bash

npx http-server public/ --port 3000
```

Access via [http://127.0.0.1:3000](http://127.0.0.1:3000)

Continued in [SETUP.md](programmers/SETUP.md).

---

## 🎯 MVP (Initial Release)

### Features:

* Basic HTML form to submit VAT returns.
* No persistent identity—OAuth performed per submission.
* Submission status and receipts stored securely in AWS S3.

### Tech Stack:

* **Frontend:** HTML5, JavaScript
* **Backend:** Node.js (Express.js), AWS Lambda
* **Infrastructure:** AWS CDK (Java), AWS S3, AWS SQS
* **Authentication:** HMRC OAuth 2.0 (Authorization Code Grant)

### ⚡ Step-by-step User Journey (Simplest VAT Submission)

### Step 1: Open Submission Page

* User opens the **submission webpage** you provide (your MVP site).
* Presented with a simple HTML form to input VAT details:

    * **VAT registration number** (VRN)
    * **Period Key** (the identifier for the VAT period they're submitting for)
    * **Total VAT Due**
    * (Other minimum fields depending on obligation)

---

### Step 2: User Completes the VAT Submission Form

User fills in the form fields, e.g.:

| Field                   | Example Input |
| ----------------------- | ------------- |
| VAT Registration Number | 123456789     |
| Period Key              | 24A1          |
| VAT Due                 | £2,400.00     |

Then clicks **Submit VAT Return**.

---

### Step 3: Redirect to HMRC for Authentication

Since no retained tokens exist, the system initiates a fresh HMRC OAuth flow:

* User is redirected automatically to HMRC’s **OAuth consent screen**.
* URL example:

```
https://api.service.hmrc.gov.uk/oauth/authorize
  ?response_type=code
  &client_id=YOUR_HMRC_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &scope=write:vat+read:vat
  &state=randomly-generated-string
```

---

### Step 4: User Logs in at HMRC (Government Gateway)

User sees HMRC's official login screen:

* User enters their HMRC **Government Gateway ID and password**.
* HMRC prompts user to **consent** to allow your app to submit VAT returns.

---

### Step 5: HMRC Redirects Back to Your App with an Auth Code

After login and consent, HMRC sends the user back to your app at your configured `redirect_uri`:

* Example redirect:

```
https://yourapp.com/callback?code=AUTHORIZATION_CODE&state=randomly-generated-string
```

* Your app verifies the state matches the one sent initially.

---

### Step 6: Your App Exchanges Auth Code for Access Token

Your backend makes a server-to-server request (user sees nothing):

* Request:

```http
POST https://api.service.hmrc.gov.uk/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
client_id=YOUR_HMRC_CLIENT_ID&
client_secret=YOUR_HMRC_SECRET&
redirect_uri=https://yourapp.com/callback&
code=AUTHORIZATION_CODE
```

* Response (example):

```json
{
  "access_token": "ACCESS_TOKEN",
  "refresh_token": "REFRESH_TOKEN",
  "expires_in": 14400,
  "token_type": "Bearer",
  "scope": "write:vat read:vat"
}
```

> You won't retain tokens here, as per your MVP scenario.

---

### Step 7: Your App Calls HMRC VAT API to Retrieve Obligations (optional but recommended)

Typically, first, confirm the period you're submitting for is correct:

* GET obligations:

```http
GET https://api.service.hmrc.gov.uk/organisations/vat/123456789/obligations
Authorization: Bearer ACCESS_TOKEN
```

This confirms available periods, and statuses, e.g.:

```json
{
  "obligations": [
    {
      "start": "2025-01-01",
      "end": "2025-03-31",
      "due": "2025-05-07",
      "status": "O",
      "periodKey": "24A1"
    }
  ]
}
```

---

### Step 8: Submit VAT Return to HMRC via API

Use the data from the form to POST to HMRC's API:

* POST VAT return:

```http
POST https://api.service.hmrc.gov.uk/organisations/vat/123456789/returns
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{
  "periodKey": "24A1",
  "vatDueSales": 2400.00,
  "vatDueAcquisitions": 0.00,
  "totalVatDue": 2400.00,
  "vatReclaimedCurrPeriod": 0.00,
  "netVatDue": 2400.00,
  "totalValueSalesExVAT": 12000.00,
  "totalValuePurchasesExVAT": 0.00,
  "totalValueGoodsSuppliedExVAT": 0.00,
  "totalAcquisitionsExVAT": 0.00,
  "finalised": true
}
```

* HMRC Response (success example):

```json
{
  "processingDate": "2025-07-14T20:20:20Z",
  "paymentIndicator": "BANK",
  "formBundleNumber": "123456789012",
  "chargeRefNumber": "XZ1234567890"
}
```

---

### Step 9: Display Submission Result to User

Your app shows the result clearly:

* Confirmation page with **Processing date**, **Form Bundle Number**, and **Charge Ref**.

Example:

```
✅ VAT Return Submitted Successfully!

Date processed: 14 July 2025
Form bundle number: 123456789012
Charge reference: XZ1234567890
```

---

### Step 10: (Optional) Log the Submission Receipt

* Store a copy of the submission receipt securely (e.g., AWS S3 bucket), providing user with a link to view/download the official HMRC acknowledgment.

---

## 🔒 HMRC API & OAuth Summary Reference:

* OAuth docs: [HMRC OAuth guide](https://developer.service.hmrc.gov.uk/api-documentation/docs/authorisation)
* VAT docs: [HMRC VAT MTD API docs](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api)
* Sandbox Test Users: [Creating HMRC test users](https://developer.service.hmrc.gov.uk/api-test-user)

---

## License

This project is licensed under the GNU General Public License (GPL). See [LICENSE](LICENSE) for details.

License notice:
```
DIY Accounting Submit - submit.diyaccounting.co.uk
Copyright (C) 2025 DIY Accounting Limited

DIY Accounting Submit is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License v3.0 (GPL‑3).
along with this program. If not, see <https://www.gnu.org/licenses/>.

IMPORTANT: Any derived work must include the following attribution:
"This work is derived from https://github.com/xn-intenton-z2a/agentic-lib"
```
