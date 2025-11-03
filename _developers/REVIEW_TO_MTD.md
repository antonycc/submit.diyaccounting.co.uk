# Review of `submit.diyaccounting.co.uk` repository (branch `copilot/reduce-code-verbosity-responses`)

## 1 Overview and repository goals

* **Purpose** – The repository aims to provide an open-source, developer-friendly system for UK businesses to submit VAT returns via HMRC’s *Making Tax Digital* (MTD) APIs.  It includes a static front-end (HTML/JS/ESM) and a serverless back-end (Node-based Lambdas) that can run locally with mock OAuth2 and MinIO or deploy to AWS (S3 + CloudFront + Lambda + Cognito).
* **Core capability** – VAT return submission via the `/organisations/vat/{vrn}/returns` endpoint.  The OAuth flow uses HMRC’s sandbox for token acquisition and submission.
* **Secondary features (in progress)** – viewing VAT obligations, liabilities, payments and penalties; entitlements management (bundle model) and front-end activity routing; dynamic fraud-prevention headers; observability and CI/CD integration.
* **Branch focus** – `copilot/reduce-code-verbosity-responses` streamlines code responses and logging, simplifies handler verbosity, and improves consistency in API results while preserving traceability for HMRC logs.

---

## 2 HMRC MTD test and production requirements

HMRC specifies minimum functionality for MTD VAT software before production credentials can be issued:contentReference[oaicite:0]{index=0}:

1. **Fraud prevention headers (FPH)** – every request to HMRC APIs must include the full set of `Gov-Client-*` and `Gov-Vendor-*` headers, generated dynamically from browser and network data:contentReference[oaicite:1]{index=1}.
2. **Retrieve VAT obligations** – `GET /organisations/vat/{vrn}/obligations` for the current open period.
3. **Submit VAT return** – `POST /organisations/vat/{vrn}/returns` using valid period keys.
4. **Testing sequence** – create an *organisation* test user, fetch obligations, submit a return, verify error handling and rate-limit compliance.
5. **Approval path** – email `SDSTeam@hmrc.gov.uk` with logs, complete fraud-prevention questionnaires, sign the HMRC Terms of Use, then perform a live submission before being listed as approved software.

---

## 3 Current state and issues

| Area | Current state | Gap / risk |
|------|---------------|------------|
| VAT submission | Working in sandbox; logs all requests and responses | Needs validation of numeric formats and period-key logic |
| Fraud prevention headers | Partially implemented (`eventToGovClientHeaders.js`, `submit.js`) | Uses static IPs and placeholder licence IDs; missing cross-validation |
| Obligations, liabilities, payments, penalties | Stubs exist but not exposed | Required for HMRC approval |
| OAuth / security | Basic PKCE flow, static secrets | Must enforce nonce/state, rotate secrets, and add CSRF protection |
| Entitlements / bundles | In-memory, catalogue not persisted | Requires DynamoDB or similar persistence for user entitlements |
| Logging and monitoring | Console and simple JSON logs | Needs CloudWatch structure, X-Ray, correlation IDs |
| Compliance | Minimal privacy and consent banner | Requires GDPR documentation and retention policy |
| Testing | Playwright UI tests for submit only | Needs sandbox tests for obligations, liabilities, payments |

---

## 4 Phased plan to reach HMRC production readiness

### Phase 1 – Stabilise and harden existing VAT submission
1. Strengthen input validation for VRN, period key and VAT figures.
2. Implement fully dynamic fraud-prevention headers (collect device, IP, browser, screen and timezone data).
3. Harden OAuth (state/nonce enforcement, PKCE verification, secrets rotation).
4. Add rate-limiting, CSP/HSTS headers, and AWS WAF baseline rules.
5. Standardise structured logging (JSON) with correlation IDs and CloudWatch dashboards.
6. Refresh documentation for local and AWS deployment and sandbox testing.

### Phase 2 – Complete MTD VAT functionality
1. Implement and test:
    * `GET /obligations`
    * `GET /returns`
    * `GET /liabilities`
    * `GET /payments`
    * `GET /penalties`
2. Add front-end pages (`vatObligations.html`, `viewVatReturn.html`) and link them to the product catalogue.
3. Integrate catalogue bundles and entitlement guards for all new routes.
4. Auto-generate API clients from HMRC OpenAPI specs to improve type-safety.
5. Extend Playwright/Vitest coverage for all flows.

### Phase 3 – Persistent entitlements and receipt storage
1. Replace in-memory entitlements with DynamoDB keyed on `userId + bundle`.
2. Store VAT receipts in S3 (encrypted, versioned) with signed-URL retrieval.
3. Add admin API to grant/revoke bundles (`guest`, `test`, `prod`).
4. Drive UI menus purely from `product-catalogue.toml`.

### Phase 4 – Compliance, monitoring and security maturity
1. Audit against full FPH specification and HMRC self-certification forms.
2. Implement privacy policy, consent tracking and data retention.
3. Enable CloudTrail, GuardDuty, Security Hub, and X-Ray tracing.
4. Conduct OWASP ASVS / penetration test before submission for approval.

### Phase 5 – HMRC approval and public release
1. Perform official sandbox test (obligations + return).
2. Send logs and fraud-prevention questionnaire to HMRC SDS team.
3. Obtain production credentials, make one live return for verification.
4. Release **free “guest” bundle** alongside existing “test” bundle in catalogue:
    * Guest = read-only (fetch obligations/returns)
    * Test = sandbox submissions
    * Prod = real submissions after approval
5. Publish privacy terms and onboard early users.

---

## 5 Immediate priorities

* Complete and verify `Gov-Client-*` header accuracy.
* Implement `/obligations` endpoint with validation.
* Replace static vendor info with build-time metadata (`package.json` version, licence ID hash).
* Finalise end-to-end sandbox workflow logs for HMRC review.

---

## 6 Outcome

Following this plan will:

* Satisfy HMRC’s minimum production criteria (fraud-prevention headers + obligations + return).
* Deliver a transparent, auditable open-source VAT submission system ready for HMRC listing.
* Enable real-world users to use the free **guest bundle** for exploration while maintaining compliance and security for production users.

---
