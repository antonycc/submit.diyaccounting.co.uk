Thanks for clarifying! Keeping your current functionality intact, and adding the new functionality as **"service bundles"** (e.g., VAT submission as one possible bundle), here's a detailed, instructional guide for your **agentic AI system** to implement these service bundles into your existing system, while keeping everything **ultra-simple and fully serverless**:

---

## ✅ **Goal:**

Extend your existing DIY Accounting web platform to add:

* **Service bundles**: sets of features like VAT submission.
* Users can self-request service bundles through the web interface.
* Bundles are immediately granted if the total user limit isn't reached and the expiry date hasn't passed.
* Store assigned bundles directly on the user's Cognito profile (no additional DB required).

---

## 🚧 **Minimal Architectural Changes:**

Keep your current setup, and simply add:

* Cognito user pool (with federation, if not already implemented).
* A new Lambda function (via Lambda URL) specifically for service bundle management.
* Store assigned bundles in **Cognito custom attributes**.

You will not remove existing HMRC OAuth logic or VAT submission handlers, as these are still valid and used within some of the bundles you plan to offer.

---

## 📋 **Step-by-Step Instructional Changes:**

### 1. **Update Cognito User Pool**

* Add a **custom user attribute** (String) named `custom:serviceBundles`, max 2048 chars.
* This attribute will store the user's granted service bundles as pipe-separated values, e.g.:
  `"VAT_SUBMISSION|EXPIRY=2025-12-31"`

---

### 2. **Create a new Lambda URL Handler (Service Bundle API)**

* Add this to your existing CDK Java files (`WebStack.java` or `LambdaUrlOrigin.java`):

    * Create a Lambda function (`Function`) that has access to Cognito (via IAM permissions).
    * Enable a Lambda URL endpoint (`FunctionUrl`).

**Lambda URL (REST) Endpoints**:

* `POST /api/request-service-bundle`
* Users call this endpoint (authenticated via Cognito JWT token) to request a specific bundle.

---

### 3. **Implement the Lambda Function Logic (JavaScript, minimal dependencies)**

Lambda logic overview (`main.js` or a new dedicated file like `serviceBundles.js`):

**Algorithmic steps (not literal)**:

```javascript
async function requestServiceBundle(event) {
  // 1. Extract Cognito JWT from the Authorization header
  const token = event.headers.authorization?.split(" ")[1];
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  // 2. Decode JWT to get user's Cognito ID (sub)
  const userId = decodeJwt(token).sub;

  // 3. Fetch current bundles from Cognito custom attribute
  const user = await cognito.adminGetUser({ UserPoolId, Username: userId });
  let bundles = user.UserAttributes["custom:serviceBundles"]?.split("|") || [];

  // 4. Validate requested bundle against total user limit and expiry
  const requestedBundle = JSON.parse(event.body).bundleId;
  
  const expiryDate = process.env.BUNDLE_EXPIRY_DATE;
  if (new Date() > new Date(expiryDate))
    return { statusCode: 403, body: "This bundle has expired." };

  const currentCount = await getCurrentUserCountForBundle(requestedBundle);
  if (currentCount >= process.env.BUNDLE_USER_LIMIT)
    return { statusCode: 403, body: "User limit reached for this bundle." };

  // 5. If valid, update user's Cognito attributes to assign the bundle
  bundles.push(`${requestedBundle}|EXPIRY=${expiryDate}`);
  await cognito.adminUpdateUserAttributes({
    UserPoolId,
    Username: userId,
    UserAttributes: [{ Name: "custom:serviceBundles", Value: bundles.join("|") }]
  });

  // 6. Increment global bundle usage count (store in environment or SSM)
  await incrementUserCountForBundle(requestedBundle);

  return { statusCode: 200, body: JSON.stringify({ status: "granted", expiryDate }) };
}
```

---

### 4. **Frontend Integration (index.html & existing JS logic)**

* Keep your existing VAT form untouched (`index.html`).

* Add a simple UI (button/form) for requesting bundles.
  Example: add to HTML:

  ```html
  <button id="requestVatBundleBtn">Request VAT Submission Bundle</button>
  ```

* Implement JavaScript logic for requesting bundles:

```js
document.getElementById("requestVatBundleBtn").addEventListener("click", async () => {
  const token = /* Retrieve Cognito JWT from user session */;
  
  const response = await fetch("/api/request-service-bundle", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bundleId: "VAT_SUBMISSION" })
  });

  const result = await response.json();
  if (response.ok) {
    alert(`Bundle granted, expires on: ${result.expiryDate}`);
  } else {
    alert(`Error: ${result.body}`);
  }
});
```

---

### 5. **Adjust CDK Java Files**

Instruct the AI agent:

* Add Lambda Function construct (`WebStack.java`) to handle the new endpoint `/api/request-service-bundle`.
* Configure Lambda environment variables (`BUNDLE_EXPIRY_DATE`, `BUNDLE_USER_LIMIT`).

Example pseudo-instruction:

> "Add a new Lambda function to WebStack that runs the bundle-request logic, accessible via Lambda URL."

---

### 6. **Update Documentation**

Instruct the agent to:

* Update `API.md` to document the new endpoint `/api/request-service-bundle`.
* Update `README.md` to describe how users can request and manage bundles.

---

## 🛠️ **Final Architecture Overview (for clarity):**

```
[User Web UI]
    ├── /api/request-service-bundle  ──▶ [Lambda URL]
    │                                      ├── Cognito (read/update user attributes)
    │                                      └── Environment vars (limits, expiry)
    │
    └── existing HMRC OAuth flow ──▶ [Existing Lambda handlers]
                                          ├── HMRC API integration
                                          └── S3 receipt logging
```

---

## 💰 **Cost Impact (1,000 users/month)**:

* Cognito: Free tier (50k MAU free).
* Lambda URL: Free tier (1M invocations/month free).
* S3, CloudFront: Negligible (< \$1/month).

**Overall:** <\$1/month total, effectively within AWS Free Tier limits.

---

## 🚀 **Final Instructions for Agentic AI:**

* Clearly separate new functionality (service bundle logic) from existing logic.
* Do **not remove existing features** (HMRC OAuth flow, VAT submission).
* Leverage Cognito custom attributes for state management (no DynamoDB).
* Maintain simplicity and readability for easy maintenance and scaling.

This approach retains all your existing functionality, elegantly extends it with minimal complexity, and ensures everything remains fully serverless and cost-effective.
