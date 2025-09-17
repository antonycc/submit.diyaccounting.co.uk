Based on a deep review of the `submit.diyaccounting.co.uk` repository and the backlog documentation, the project’s goal is to provide an open‑source, developer‑friendly web app and AWS‑based stack that allows small businesses to submit UK VAT returns via HMRC’s Making Tax Digital (MTD) APIs.  It currently runs locally with mock OAuth2 and MinIO, and deploys to AWS using CloudFront, S3, Lambda back‑ends and Cognito/Google sign‑in.  The existing user flow collects a VAT number, period key and VAT due, initiates HMRC OAuth, exchanges the code for an access token and submits the return, then shows the processing date, bundle number and charge reference.  A product catalogue defines bundles such as “test”, “guest” and “basic” and maps them to activities like `submit-vat`, `submit-vat-sandbox`, `vat-obligations-sandbox` and `view-vat-return-sandbox`, but only `submit-vat` is fully implemented.  The backlog notes that operations to view obligations, view VAT returns, retrieve liabilities, payments and penalties are missing, and the current entitlements service is in‑memory; route guards, persistence and UI integration are incomplete.  Security prompts highlight many hardening tasks around OAuth flows, fraud‑prevention headers, secrets management and compliance with HMRC’s fraud‑prevention guidance.  The `submitVat.js` function performs validation, constructs the HMRC POST request and logs receipts, while new handlers for obligations and returns exist but are not wired into the front‑end.  Fraud‑prevention headers are currently hard‑coded with static IPs and licence IDs.

### Observations and quality/completeness issues

* **Core capability limited to VAT submission.** Only the submit return operation is production‑ready; obligations, returns viewing, liabilities, payments and penalties are planned but incomplete.
* **Entitlements and product catalogue gaps.** The catalogue defines activities across tiers, but route guards and UI integration exist only for `submit‑vat`; entitlements are held in an in‑memory map rather than persistent storage.
* **Fraud prevention data missing.** HMRC requires dynamic `Gov‑Client-*` and `Gov‑Vendor-*` headers; the current code uses placeholders and TODOs.
* **Security and compliance tasks.** OAuth flows, secrets management, data retention, rate limiting, XSS/CSRF and logging/audit need hardening.
* **Test coverage and documentation.** Backlog docs call for generating clients from HMRC OpenAPI specs and improving tests; documentation needs refreshing and aligning with current code.
* **User experience and CI/CD.** UI is minimal and developer‑oriented.  CI matrix covers unit, integration and browser tests, but there is no test pipeline for obligations/returns or advanced flows.

### Plan to close the gaps and prepare for HMRC approval

**Phase1 – Stabilise and polish the existing VAT submission flow**

1. **Refine input validation and error handling.** Ensure `submitVat.js` enforces numeric formats, period‑key validity and VRN checksum; provide clear user feedback for API errors and connectivity issues.  Add server‑side and client‑side tests for boundary conditions (nil/zero VAT, wrong period key, large numbers).
2. **Implement dynamic fraud‑prevention headers.** Use Node modules to gather client IP, device info, user agent and screen resolution; populate `Gov‑Client-*` and `Gov‑Vendor-*` headers based on HMRC’s guidance and remove the static placeholder values.  This is critical for HMRC approval.
3. **Harden OAuth and secrets management.** Enforce state and nonce in OAuth redirection, validate tokens, rotate secrets via AWS Secrets Manager and environment variables, and add CSRF protection on the form posts.
4. **Add rate‑limiting and security headers.** Use API Gateway or Lambda middleware to throttle requests, send HSTS/CSP/X‑Frame headers and implement basic Web Application Firewall rules to block abuse.
5. **Enhance logging and monitoring.** Use structured JSON logs, include correlation IDs, and configure CloudWatch dashboards.  Add CloudTrail and X‑Ray tracing when running in AWS.
6. **Refresh documentation.** Update the README and user guide to match current variables and flows; include clear instructions for running locally and using ngrok; and document how to configure HMRC sandbox and production credentials.

**Phase2 – Complete MTD VAT functionality**

1. **Implement VAT obligations, returns, liabilities, payments and penalties handlers.** Follow the backlog plan to create `getVatObligations.js`, `getVatReturn.js`, `getVatLiability.js`, `getVatPayment.js` and `getVatPenalties.js` endpoints, each validating VRN, period dates and optional `Gov-Test-Scenario`; call the corresponding HMRC endpoints.  Build page templates (e.g., `vatObligations.html`, `vatLiabilities.html`) similar to `submit-vat` with forms, result tables and developer test scenario dropdowns.
2. **Integrate these activities into the product catalogue and route guards.** Update `product-catalogue.toml` to enable these activities for appropriate bundles, and modify the entitlements guard to check access for all new routes.
3. **Generate API clients and validators from HMRC’s OpenAPI specs.** This will improve type safety and reduce manual error handling as recommended in the backlog.
4. **Extend test coverage.** Create Vitest/Playwright suites for obligations, view return and liability flows; test both sandbox and live endpoints; include concurrency tests with ETags to ensure idempotent requests.

**Phase3 – Robust entitlements and persistence**

1. **Persist entitlements and receipts.** Replace the in‑memory entitlements service with DynamoDB tables keyed on bundle and user ID with TTL, ensuring durable storage across deployments.  Store receipts in S3 with encryption and metadata; implement listing and pagination with proper access control.
2. **Implement admin APIs for bundle management.** Allow administrators to grant or revoke bundles, adjust subscription tiers and set expiry via a simple UI or CLI, respecting the qualifiers defined in the catalogue.
3. **Expand CATALOG‑driven UI.** Remove conditional flags and always drive the menu and features off the product catalogue; ensure the UI automatically reflects newly enabled activities.

**Phase4 – Production hardening and compliance**

1. **Audit against HMRC fraud prevention spec.** Validate that all required headers (user identifiers, device details, vendor info) are present and accurate for every API call; incorporate digital link evidence to show that VAT figures were pulled from records and not manually entered, per MTD rules.
2. **Address SOC2/GDPR requirements.** Review data flows for personal data, add privacy policy, implement cookie consent, and ensure receipts and personal information are encrypted at rest and purged after retention period.
3. **Threat modelling and penetration testing.** Run a formal security assessment (OWASP ASVS) and fix identified issues such as injection, broken access controls, cross‑site scripting and misconfiguration.
4. **Implement CI/CD hardening.** Add static code analysis (e.g., SonarQube), run dependency vulnerability scans, sign artefacts, and lock down AWS IAM roles to least privilege.

**Phase5 – HMRC approval and real customer use**

1. **Register as a Software Vendor with HMRC.** Obtain production MTD credentials, complete the self‑certification forms and share the application for review.  Provide evidence of fraud‑prevention compliance and test logs.
2. **Beta testing with early users.** Run a controlled pilot with friendly businesses using the live environment; gather feedback on usability and accuracy; verify that submitted VAT returns appear correctly in HMRC’s portal.
3. **Launch free version.** Once HMRC approval is granted, release the system under a free tier defined in the product catalogue (guest/basic bundle) with clear terms of service.  Continue to refine the product based on user feedback and HMRC guidance updates.

This phased plan addresses the current quality and completeness issues, implements the remaining API operations and security hardening, and lays out the concrete steps required to reach HMRC approval and readiness for real customers.
