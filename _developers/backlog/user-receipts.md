## Goals

- **Per‑user receipts** – adjust `logReceipt.js` to save receipts under `receipts/{userSub}/{timestamp}-{bundleId}.json` so each user’s receipts are isolated:contentReference[oaicite:35]{index=35}.
- **Listing and retrieval** – implement `GET /api/my-receipts` to list a user’s receipts with metadata (timestamp, period, amount) and `GET /api/my-receipts/{key}` to fetch the full receipt JSON.  Restrict access to the authenticated user’s own prefix.
- **Receipts page** – create `receipts.html` to display a table of past submissions with links to view/download receipts.  Integrate with the rest of the UI so users can easily find their submission history.
- **Testability** – write unit and integration tests for listing and retrieving receipts, and extend e2e tests to verify receipts appear after submissions.

## Current state

`logReceipt.js` writes receipts to a single S3 prefix without separating by user or enabling retrieval:contentReference[oaicite:36]{index=36}.  There are no endpoints or pages to list or view receipts.

## Implementation plan

### Back‑end changes

1. **Update logReceipt.js** – Change the S3 key to `receipts/${userSub}/${timestamp}-${bundleId}.json` where `userSub` comes from the Cognito token.  Write the same receipt JSON and set `ContentType: 'application/json'`.
2. **listReceipts.js** – Use `ListObjectsV2Command` with `Prefix: 'receipts/${userSub}/'` to list objects.  For each object, parse the key to extract timestamp and bundle.  Optionally read the first few bytes to pull period and amount.  Return an array sorted by timestamp.
3. **getReceipt.js** – Validate that the requested `key` starts with `receipts/${userSub}/`.  If not, return `403`.  Use `GetObjectCommand` to fetch the object and return its JSON content.
4. **Routes** – Add `app.get('/api/my-receipts', requireAuth, listReceipts)` and `app.get('/api/my-receipts/:key', requireAuth, getReceipt)` to `server.js`.  Create corresponding Lambdas in CDK and set IAM policies for listing and getting objects in the receipts prefix.
5. **IAM & CDK** – Update the policy attached to the new Lambdas to allow `s3:ListBucket` and `s3:GetObject` on `receipts/${userSub}/*`.  In non‑prod, set `autoDeleteObjects` and `removalPolicy=DESTROY` for the receipts prefix.

### Front‑end changes

1. **receipts.html** – Add a navigation link for authenticated users.  On page load, call `/api/my-receipts` and render a table with columns like Date, VRN/NINO, Period, Amount, Actions.  Provide a **View** button that fetches `/api/my-receipts/{key}` and displays the JSON in a modal or new page.  Offer a **Download** option.
2. **Integration** – After submitting a VAT or self‑employment return, call `logReceipt` and redirect the user to the receipts page or show a success banner with a link.  This encourages users to review receipts.
3. **Pagination** – If necessary, implement lazy loading (e.g. show 10 receipts at a time) to avoid long lists.

### Suggested libraries

- **AWS SDK v3** – Already used in the project; reuse `S3Client`, `ListObjectsV2Command` and `GetObjectCommand`.
- **CSV export** – Use `json2csv` to allow users to download their receipts list as CSV.

## Testing & iteration strategy

1. **Unit tests:** Mock S3 using `aws-sdk-client-mock`.  Test that `logReceipt` writes to the correct key.  Test `listReceipts` returns the correct list and that `getReceipt` returns the correct JSON and rejects keys outside the prefix.
2. **Integration tests:** Use `supertest` to call the new endpoints with a mock Cognito token.  Verify that unauthenticated requests return `401` and that cross‑user access returns `403`.
3. **Playwright tests:** After submitting a return in a test run, navigate to the receipts page and verify that the new receipt appears.  Click **View** and confirm the JSON matches the submission.  Submit multiple returns and verify sorting.
4. **Manual tests:** Deploy to a dev environment, submit returns via the HMRC sandbox, then verify receipts in S3.  Use the AWS console to ensure objects are stored under the correct prefix.
5. **Repeat cycles:** Re‑run unit, integration and Playwright tests after each change.  Deploy to stage and test with real users if possible.

## HMRC context

Under Making Tax Digital, businesses must keep digital records and preserve them for several years.  HMRC’s APIs do not supply receipts; therefore, generating and storing your own receipts in S3 per user helps meet compliance requirements and provides users with a clear audit trail of their submissions.
