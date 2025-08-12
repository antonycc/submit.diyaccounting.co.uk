Detailed assessment and implementation plan for HMRC VAT and Self‑Employment integration
This document evaluates the current state of the submit.diyaccounting.co.uk repository and lays out a detailed phased plan to add web pages and backend support for all API call variants in the HMRC VAT and Self‑Employment (MTD) APIs. It also describes how to align these additions with the existing product catalogue, backlog and infrastructure. Each phase references specific code locations or API definitions to help an AI engineer implement the changes.

1. Current state of the repository
1.1 Product catalogue and backlog
The product catalogue (product-catalog.toml) defines bundles (default, test, guest, legacy, basic, advanced) and activities. Activities include submit-vat, vat-obligations, self‑employed and demo activities
raw.githubusercontent.com
. Activities are linked to bundles, e.g. submit-vat is enabled for guest, basic and legacy bundles while vat-obligations is enabled for the default bundle
raw.githubusercontent.com
.

The backlog (_developers/backlog/product-catalog-driven-behaviour.md) outlines phase 2 tasks: expose the catalog via /api/catalog, build a central entitlements service, implement /api/request-bundle with qualifiers, update the UI to render activities and bundles from the catalog, and add comprehensive tests
raw.githubusercontent.com
. It also proposes a feature flag CATALOG_DRIVEN_UI and a migration checklist
raw.githubusercontent.com
.

1.2 Existing API functions
submitVat.js implements the Submit VAT return endpoint, building a POST request to /organisations/vat/{vatNumber}/returns and submitting the body with fields such as periodKey and vatDueSales
raw.githubusercontent.com
. It logs details and supports a stubbed environment for testing
raw.githubusercontent.com
.

logReceipt.js writes a receipt to S3 (receipt JSON stored under a receipts/ prefix) and exposes an HTTP handler for /api/log-receipt
raw.githubusercontent.com
. Currently receipts are saved with keys that do not include the user’s Cognito sub and there is no endpoint to list them.
raw.githubusercontent.com
.

bundle.js implements /api/request-bundle but does not consult the product catalogue; it stores the requested bundle as a custom Cognito attribute or, in mock mode, in an in‑memory map
raw.githubusercontent.com
. There is no entitlements service yet.

authUrl.js constructs OAuth URLs for HMRC, Google and a mock provider
raw.githubusercontent.com
. For HMRC it always requests the scopes write:vat read:vat and redirects to submitVatCallback.html
raw.githubusercontent.com
; there is no way to specify self‑assessment scopes.

1.3 UI pages
activities.html is mostly static: it shows a “VAT Return Submission” button and a static list of activities by bundle
raw.githubusercontent.com
. It reads the user’s bundles from localStorage and uses hard‑coded lists to show what activities are available
raw.githubusercontent.com
.

bundles.html displays a few fixed bundles (“HMRC Test API Bundle”, “HMRC Production API Bundle”, etc.) and allows requesting the test bundle via /api/request-bundle
raw.githubusercontent.com
. It does not render from the catalog.

There is no page to retrieve VAT obligations, view VAT returns, view liabilities/payments, or call any self‑employment endpoints. There is also no page to view previously saved receipts.

1.4 Infrastructure (CDK)
WebStack.java creates Lambda functions and exposes them via Lambda URLs. It wires the existing /api/submit-vat, /api/auth-url, /api/exchange-token, /api/log-receipt and /api/request-bundle endpoints through a small Express server in server.js. CloudTrail and X‑Ray can be toggled via environment variables
GitHub
.

There are currently no Lambdas for retrieving VAT obligations or self‑employment data.

1.5 HMRC API specification
The provided OpenAPI YAML files describe multiple endpoints:

VAT API (hmrc-md-vat-api-1.0.yaml) – mandatory endpoints are GET /organisations/vat/{vrn}/obligations (retrieve VAT obligations)
raw.githubusercontent.com
 and POST /organisations/vat/{vrn}/returns (submit VAT return). Additional endpoints include:

GET /organisations/vat/{vrn}/returns/{periodKey} – retrieve a submitted VAT return
raw.githubusercontent.com
.

There are also endpoints to retrieve VAT liabilities, payments and penalties (not shown in the excerpt but listed in the API overview
developer.service.hmrc.gov.uk
).

Self‑Employment Business API (hmrc-mtd-self-employment-business-api-5.0.yaml) – endpoints include:

Annual submission: GET, PUT and DELETE on /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}
raw.githubusercontent.com
.

Create period summary: POST /.../period with a complex request body
raw.githubusercontent.com
.

List period summaries: GET /.../period/{taxYear}
raw.githubusercontent.com
.

Retrieve/amend a period summary: GET and PUT on /.../period/{taxYear}/{periodId}
raw.githubusercontent.com
.

Retrieve/amend cumulative period summary: GET and PUT on /.../cumulative/{taxYear}
raw.githubusercontent.com
.

2. Goals
Complete product catalogue migration: Expose /api/catalog, centralise entitlements, implement /api/request-bundle as described in the backlog.

Implement all VAT API call variants: add server functions and UI pages for retrieving obligations, viewing a return, retrieving liabilities, payments and penalties.

Implement all self‑employment API call variants: add server functions and UI pages for annual submissions, period summaries (create, list, retrieve and amend) and cumulative summaries.

Persist and display past submissions: store receipts in S3 under a user‑specific prefix and provide an endpoint and UI page to list and retrieve them.

Testability: support a “stubbed” mode and local proxy for rapid development and incorporate Gov‑Test‑Scenario headers. Provide automated tests and guidelines for using Playwright to exercise the flows.

3. Phase‑by‑phase implementation plan
Phase 1 – Backend foundations and catalogue exposure
Expose the catalog as JSON – Create a new Lambda getCatalog.js under app/functions and map it to GET /api/catalog. It should parse product-catalog.toml via loadCatalogFromRoot and return { version, bundles, activities }. Cache the result and set ETag headers as described in the backlog
raw.githubusercontent.com
. Wire it through server.js and create a corresponding Lambda URL in WebStack.java.

Build an entitlements service – Implement a new module app/src/lib/entitlementsService.js with functions:

getGrantedBundles(userCtx): return active bundle IDs for a user by checking automatic bundles and stored grants. Grants should be persisted in a new DynamoDB table or S3 object keyed by subject. Use custom:bundles in Cognito for backward compatibility.

isActivityAllowed(activityId, userCtx): return true if any of the user’s active bundles match the catalog’s bundles list for that activity
raw.githubusercontent.com
.

requestBundle(userCtx, bundleId, qualifiers?): enforce allocation rules, cap and timeout; persist a grant; return { granted, expiry, reason }
raw.githubusercontent.com
.

Update /api/request-bundle – Replace the existing bundle logic in bundle.js with calls to the entitlements service. Validate qualifiers according to the catalog
raw.githubusercontent.com
 and store the grant (including expiry) in DynamoDB. Add logic to issue 409/429 when caps are exceeded and return 401 when auth is required but the user is anonymous
raw.githubusercontent.com
.

Add /api/my-bundles – Implement a new handler to return active bundles with expiry dates for the authenticated user; used by the client to hydrate entitlements
raw.githubusercontent.com
.

Guard API endpoints – For each activity (e.g., submit VAT, retrieve obligations), create a wrapper in server.js that resolves the user context from Cognito (if authenticated), calls isActivityAllowed(activityId, userCtx) and returns 403 { error: "not_allowed", activityId } when disallowed
raw.githubusercontent.com
.

Update authUrl.js to allow dynamic scopes – Accept a scope query parameter and pass it through when constructing the HMRC OAuth URL. This enables requesting read:self-assessment/write:self-assessment when calling self‑employment endpoints. The default scope remains write:vat read:vat for VAT
raw.githubusercontent.com
. Update server routing and UI to supply appropriate scopes.

Phase 2 – VAT API endpoints and UI
Create VAT functions:

getVatObligations.js – call GET /organisations/vat/{vrn}/obligations with query parameters from, to and status; include Gov-Test-Scenario header for sandbox scenarios
raw.githubusercontent.com
. Use fetch with the user’s HMRC access token; propagate fraud prevention headers using eventToGovClientHeaders. Return obligations JSON.

getVatReturn.js – call GET /organisations/vat/{vrn}/returns/{periodKey}
raw.githubusercontent.com
.

getVatLiabilities.js, getVatPayments.js and getVatPenalties.js – implement additional endpoints listed in the VAT API overview
developer.service.hmrc.gov.uk
. Follow a pattern similar to getVatReturn.js.
Map each of these functions to new endpoints in server.js (e.g., /api/vat/obligations, /api/vat/returns/:periodKey, etc.). Create corresponding Lambda functions and routes in WebStack.java.

Add activities to the catalogue: update product-catalog.toml to include new activities:

vat-obligations (already exists) – ensure it remains linked to default bundle.

vat-view-return – link to guest, basic and legacy bundles (similar to submit-vat).

vat-liability, vat-payment, vat-penalties – define with appropriate names and link to basic/legacy bundles (or as per business rules).

UI pages for VAT:

obligations.html – form with fields: VRN, from date, to date, status (drop‑down), Gov‑Test‑Scenario (optional). On submit, call /api/vat/obligations and display obligations in a table with period start/end dates and status. Use entitlements to hide this page if the user lacks vat-obligations activity.

viewVatReturn.html – form with VRN and period key; call /api/vat/returns/{periodKey} and display the VAT return fields described in the spec
raw.githubusercontent.com
.

liability.html, payment.html, penalties.html – similar pattern: collect VRN and date range; call respective endpoints; show results.

Integrate into activities.html – When CATALOG_DRIVEN_UI is true, fetch /api/catalog and compute the list of activities the user can access using my-bundles. Render dynamic buttons linking to the new VAT pages. Remove hard‑coded lists
raw.githubusercontent.com
.

Phase 3 – Self‑employment API endpoints and UI
Create self‑employment functions:

Annual submission – getSelfEmploymentAnnual.js (GET), putSelfEmploymentAnnual.js (PUT), deleteSelfEmploymentAnnual.js (DELETE). Each function should accept path parameters nino, businessId and taxYear
raw.githubusercontent.com
. For PUT, build a request body according to the schema; for DELETE, call HMRC and handle 204/404 responses.

Period summaries – createSelfEmploymentPeriod.js (POST /period), listSelfEmploymentPeriods.js (GET /period/{taxYear}
raw.githubusercontent.com
), getSelfEmploymentPeriod.js (GET /period/{taxYear}/{periodId}
raw.githubusercontent.com
), putSelfEmploymentPeriod.js (PUT /period/{taxYear}/{periodId}).

Cumulative summary – getSelfEmploymentCumulative.js and putSelfEmploymentCumulative.js (GET/PUT /cumulative/{taxYear}
raw.githubusercontent.com
).
Use the same pattern as the VAT functions: call HMRC with the user’s access token, propagate fraud‑prevention headers and support stubbed mode.

Add self‑employment activities to the catalogue: For example:

self-employment-annual-get, self-employment-annual-put, self-employment-annual-delete (link to basic and legacy bundles).

self-employment-period-create, self-employment-period-list, self-employment-period-get, self-employment-period-put.

self-employment-cumulative-get, self-employment-cumulative-put.
Each activity should specify kind = "actual" and may have qualifiers if certain tax years require additional attributes (e.g., requiresTransactionId).

UI pages for self‑employment:

selfEmploymentAnnual.html – multi‑tab or multi‑step page allowing the user to view, create/amend and delete an annual submission. Provide a form to input NINO, business ID and tax year. When in create/amend mode, display fields according to the annual submission schema (income/expenses/deductions). Call respective endpoints.

selfEmploymentPeriods.html – list existing period summaries for a given NINO/business/taxYear (calling /period/{taxYear})
raw.githubusercontent.com
. Provide buttons to view or amend each period summary and to create a new one. Use the complex schema lines to build the form (turnover, other income, consolidated expenses, etc.)
raw.githubusercontent.com
.

selfEmploymentCumulative.html – display and edit the cumulative period summary.
As with VAT, hide pages the user cannot access. Use dynamic scopes (read:self-assessment, write:self-assessment) when starting the HMRC OAuth flow.

Phase 4 – Receipts and submission history
Update receipt storage – Modify logReceipt.js so that the S3 key includes the user’s Cognito sub and a timestamp, e.g., receipts/{userSub}/{timestamp}-{formBundleNumber}.json. This ensures receipts are segregated per user.

Add list/get receipt endpoints:

listReceipts.js – use the AWS SDK ListObjectsV2 to list objects under receipts/{userSub}/. Return metadata (key, lastModified, size) and optionally an S3 pre‑signed URL for download.

getReceipt.js – given a receipt key (validated to ensure it belongs to the user), retrieve the JSON from S3 and return it.
Expose these as /api/my-receipts (GET) and /api/my-receipts/{key} (GET). Add guards so a user can only access their own receipts.

Create receipts.html – page that displays a table of past submissions with a “view” or “download” link for each. Show the receipt fields (e.g., form bundle number, period, net VAT due) to aid the user in reconciling their history.

Phase 5 – Infrastructure and configuration changes
CDK modifications:

For each new backend function, add a corresponding Lambda (Node runtime) and a FunctionUrl resource in WebStack.java. Follow the pattern used for submitVatLambdaUrl. Give each function an IAM policy allowing it to access S3 (for receipts) or call HMRC via the internet. Inject necessary environment variables (DIY_SUBMIT_HMRC_BASE_URI, DIY_SUBMIT_SELF_ASSESS_BASE_URI, DIY_SUBMIT_HMRC_CLIENT_ID, etc.).

Update server.js routing: add new paths for each function. Use values from cdk.json for path names (e.g., vatObligationsLambdaUrlPath, selfEmploymentAnnualGetLambdaUrlPath). Ensure CORS headers are included for GET/POST responses.

Add DynamoDB table (or S3 object) for storing bundle grants; grant read/write permissions to the entitlements Lambda.

Extend the receipts bucket to allow listObjects and getObject for the my-receipts functions. Ensure appropriate IAM policies and cross‑account access if necessary.

Environment variables:

Introduce new variables in .env / cdk.json for the self‑employment base URI, scopes, and DynamoDB table name.

For stubbed mode, provide DIY_SUBMIT_TEST_ANNUAL_RESPONSE, DIY_SUBMIT_TEST_PERIOD_RESPONSE, etc., to return canned JSON during local testing.

Product catalogue updates: After adding new activities, ensure product-catalog.schema.json is updated accordingly and run the catalog validation script (to be added)
raw.githubusercontent.com
.

Phase 6 – Testing and dry‑run scenarios
Stubbed mode for rapid iteration: Continue to support NODE_ENV=stubbed and DIY_SUBMIT_TEST_RECEIPT to avoid calling HMRC. For new functions, check process.env.NODE_ENV and, when stubbed, return canned responses from environment variables (e.g., DIY_SUBMIT_TEST_VAT_OBLIGATIONS, DIY_SUBMIT_TEST_SELF_EMP_PERIOD_LIST). This allows frontend development without hitting real HMRC APIs.

Local proxy environment: Use npm run proxy (ngrok) and npm run auth (mock OAuth2) to test the flows end‑to‑end locally. In this setup, DIY_SUBMIT_HOME_URL will point to the ngrok URL, and the Cognito/Google flows can be simulated. To test self‑employment scopes, update the authUrl call to include scope=read:self-assessment%20write:self-assessment and verify that the HMRC sandbox issues tokens with those scopes.

Automated tests:

Unit tests – Add tests for each new function using Jest. Mock fetch and aws-sdk clients; verify the correct HMRC URL is constructed and headers are set. Test error handling (e.g., missing VRN, missing token) and stubbed responses.

Entitlements tests – Validate that automatic bundles are always granted; on‑request bundles require grants; qualifiers are enforced; caps and expiry work. Use the catalog to check isActivityAllowed results.
raw.githubusercontent.com

Playwright tests – Extend the existing Playwright suite in behaviour-tests to cover new pages. Simulate anonymous and authenticated users; request bundles via UI; verify that the correct pages appear after adding a bundle. Use the stubbed environment for determinism. For example, test that a guest cannot access submit-vat until requesting the guest bundle and that the obligations page appears for default users.

Snapshot tests – Capture snapshots of /api/catalog, /api/my-bundles and sample HMRC responses to detect regressions.

Manual HMRC sandbox testing: For final verification, deploy to a non‑production environment and run through the flows with a real HMRC test user. Use the Gov‑Test‑Scenario headers (e.g., QUARTERLY_NONE_MET, INVALID_PERIODKEY
raw.githubusercontent.com
) to test error scenarios. Record receipts and ensure they appear in S3 and in the receipts page.

4. Summary
This plan brings the DIY Accounting Submit project closer to a complete MTD solution. It leverages the existing CDK and Express infrastructure to add numerous HMRC endpoints, introduces an entitlements service and dynamic UI rendering driven by the product catalogue, and ensures receipts are stored and discoverable by users. By executing the phases in order and using the stubbed/test environments, the team can iterate rapidly and validate functionality without hitting live HMRC systems. The final product will allow users to retrieve obligations, submit and view VAT returns, manage self‑employment period and annual submissions, and review their submission history, all governed by a flexible bundle and activity model.