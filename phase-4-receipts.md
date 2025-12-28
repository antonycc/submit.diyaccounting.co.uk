Below is a step‑by‑step guide designed for a December 2025 AI agent working on the `optitwo` branch.  The goal is to move receipt persistence into the VAT return Lambda while leaving the `hmrcReceiptPost` Lambda intact for now (no deletion).  Only changes **1, 3, 4** from the earlier plan are included: integrate receipt saving into `hmrcVatReturnPost.js`, stop calling `/api/v1/hmrc/receipt` from the front‑end, and update tests/docs accordingly.  All modifications should be compatible with both local and AWS deployments.

---

## 1 – Modify the VAT return Lambda to persist receipts

**File:** `app/functions/hmrc/hmrcVatReturnPost.js`

1. **Import the receipt repository**.  Near the top of the file, add:

   ```js
   import { putReceipt } from "../../data/dynamoDbReceiptRepository.js";
   ```

2. **After a successful HMRC submission, save the receipt**.  In the `handler` function, locate the section where `receipt` is returned to the client (currently lines 180‑187).  Just before returning the `http200OkResponse`, insert logic to derive a `receiptId` and call `putReceipt`:

   ```js
   // After obtaining `receipt` and userSub but before returning the response
   const formBundleNumber = receipt?.formBundleNumber ?? receipt?.formBundle;
   if (userSub && formBundleNumber) {
     const timestamp = new Date().toISOString();
     const receiptId = `${timestamp}-${formBundleNumber}`;
     await putReceipt(userSub, receiptId, receipt);
   }
   ```

   This mirrors the logic used in `hmrcReceiptPost.js` to construct a `receiptId` and ensures the receipt is persisted to DynamoDB.  Keep the existing validation of `RECEIPTS_DYNAMODB_TABLE_NAME` at line 78 so the table must be configured in both AWS and local `.env` files.

3. **Return the receipt unchanged**.  The `http200OkResponse` should still include the `receipt` object as `data.receipt`.  Do not alter the response structure so that the front‑end continues to receive the receipt fields (`processingDate`, `formBundleNumber`, `chargeRefNumber`) as before.

4. **Ensure environment variables**.  Both local (`.env.test`) and deployment (`.env.ci` / `.env.prod`) files must include `RECEIPTS_DYNAMODB_TABLE_NAME` so that the Lambda can write to DynamoDB.  This is already present in `optitwo`, but verify the value is set for your new environment.

---

## 3 – Stop calling the receipt POST endpoint from the front‑end

**File:** `web/public/hmrc/vat/submitVat.html` (inline script)

1. **Remove the receipt logging call**.  In the `continueVatSubmission()` function, remove lines that show “Logging submission receipt…” and call `logReceipt()`.  Specifically delete or comment out:

   ```js
   showStatus("Logging submission receipt...", "info");
   await logReceipt(submitResponse.processingDate, submitResponse.formBundleNumber, submitResponse.chargeRefNumber);
   ```

2. **Update status messaging** (optional).  You may replace the removed `showStatus` with a more generic message such as:

   ```js
   showStatus("VAT return submitted. Saving receipt...", "info");
   ```

   or simply rely on the subsequent call to `displayReceipt()` to show success.

3. **Leave `logReceipt()` defined** but unused.  The function can remain for backward compatibility or removal in a later phase, but nothing in the VAT submission flow should invoke it any longer.

4. **No changes to receipt display**.  The `displayReceipt(submitResponse)` call should remain in place; it will display the receipt returned by the server.

---

## 4 – Update tests and documentation

### 4.1 – Adjust unit tests

**File:** `web/unit-tests/vatFlow.frontend.test.js`

1. **Remove or disable the test for `logReceipt`**.  Delete the test block titled `"logReceipt should make correct API call"` or comment it out.  This test currently asserts that a POST request is made to `/api/v1/hmrc/receipt`, which will no longer happen.

2. **Update any tests that expect a separate receipt call**.  For example, if `continueVatSubmission()` tests rely on `logReceipt()`, they should be updated to only verify that `submitVat()` returns a receipt and `displayReceipt()` is called.  The stubbed fetch should not include a `/api/v1/hmrc/receipt` call.

3. **Ensure the receipt display test still passes**.  Tests that check `displayReceipt()` should still work because the receipt returned by `submitVat()` now originates from the server and contains the same fields.

### 4.2 – Documentation and environment files

1. **Update `REPOSITORY_DOCUMENTATION.md`** in the section explaining HMRC VAT returns.  Note that receipts are now saved server‑side by the VAT return Lambda upon successful submission.  Mention that the `/api/v1/hmrc/receipt` endpoint is still deployed for backward compatibility but is no longer called by the front‑end.

2. **Verify environment variables**.  Ensure `RECEIPTS_DYNAMODB_TABLE_NAME` appears in `.env.test`, `.env.ci`, and `.env.prod`.  No changes should be needed if these already exist.

3. **Mention future removal**.  Optionally add a TODO in documentation indicating that the `/api/v1/hmrc/receipt` endpoint will be removed in a later phase once local and deployed testing confirm the new behaviour.

---

## Summary of changes

* Persist VAT receipts inside `hmrcVatReturnPost.js` by calling `putReceipt()` after HMRC submission.
* Stop calling `/api/v1/hmrc/receipt` from the front‑end; rely on the server to save receipts.
* Leave the `hmrcReceiptPost` Lambda and associated route in place but unused for now.
* Update unit tests to remove expectations of a receipt POST call.
* Document the change in repository docs and ensure necessary environment variables are set.

By following these steps, the application will store receipts server‑side at the moment of VAT submission, reducing one HTTP round trip and simplifying the client code while keeping the existing infrastructure for backward compatibility until it is safe to remove.
