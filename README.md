# DIY Accounting Submit

A developer-friendly web app and AWS stack to submit UK VAT returns via HMRC’s Making Tax Digital (MTD) APIs. It runs locally with mock OAuth2 and MinIO, and deploys to AWS with CloudFront + S3 static hosting, Lambda URL backends, and Cognito (Google sign-in). See USERGUIDE.md for the end-user flow.

Table of Contents
- TL;DR
- Quickstart (Local)
- Architecture Overview
- API Reference
- Bundles and product-catalog
- Deployment (AWS CDK Java)
- Observability & Security
- Testing and CI matrix
- Roadmap
- License

TL;DR
- What: Static web app fronted by CloudFront; Lambda functions for auth/token exchange, VAT submission, logging receipts, and bundle entitlement.
- Try it locally: ngrok + mock OAuth2 + MinIO for receipts.
- Deploy: Java CDK synthesizes and deploys CloudFront, S3, Cognito (with Google), Lambda URLs, Route53/ACM, and Secrets Manager.

Quickstart (Local)

Clone and install
```bash

git clone git@github.com:antonycc/submit.diyaccounting.co.uk.git
cd submit.diyaccounting.co.uk
npm install
npm run build
```

Set environment (choose one path)
- HMRC sandbox only (no Cognito/Google):
```env
DIY_SUBMIT_BASE_URL=https://your-ngrok-domain.ngrok-free.app/
HMRC_BASE_URI=https://test-api.service.hmrc.gov.uk
HMRC_CLIENT_ID=your_hmrc_client_id
HMRC_CLIENT_SECRET=your_hmrc_client_secret
```
- Cognito (Google sign-in) fronting Google IdP:
```env
DIY_SUBMIT_BASE_URL=https://submit.example.com/
COGNITO_BASE_URI=https://auth.submit.example.com
COGNITO_CLIENT_ID=your_cognito_userpool_client_id
# Optional fallback for local-only flows without Cognito
DIY_SUBMIT_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```
Note: The previous README mistakenly labeled COGNITO_CLIENT_ID as a Google client ID. Use COGNITO_CLIENT_ID for Cognito; use DIY_SUBMIT_GOOGLE_CLIENT_ID when talking directly to Google (no Cognito).

Run locally (proxy environment)
- Terminal A: start server
```bash

npm run start
```
- Terminal B: expose via ngrok (HTTPS URL seen by the browser)
```bash

npm run proxy
```
- Terminal C: mock OAuth2 (for login flows during development)
```bash

npm run auth
```
- Optional: MinIO (local S3) for receipts
```bash

npm run storage
```


Architecture Overview
High-level
- CloudFront + S3: Static site, OAI-restricted S3 origin.
- Lambda URL backends: authUrl-get (hmrc/mock/cognito), exchange-token (hmrc/google), submit-vat, log-receipt, request-bundle.
- Cognito + Google IdP: Hosted UI domain; User Pool and User Pool Client for Google identity provider.
- Route53 + ACM: DNS and certificates; optional useExisting certificate/hosted zone.
- Secrets Manager: HMRC and Google client secrets, loaded by Lambdas when not provided via env.
- CloudTrail + X-Ray (optional): Audit and tracing.

ASCII diagram
```text
[Browser]
   |  HTTPS (CloudFront)
[CloudFront] -> [S3 static site]
   |            \
   |             -> [Lambda URL: /api/*]
   |                    - authUrl-get (hmrc/mock/cognito)
   |                    - exchange-token (hmrc/google)
   |                    - submit-vat
   |                    - log-receipt
   |                    - request-bundle
   |
[Cognito (Google IdP)]   [Secrets Manager]   [S3 receipts]
```

Key environment variables (selected)
- HMRC: HMRC_CLIENT_ID, HMRC_CLIENT_SECRET, HMRC_BASE_URI, DIY_SUBMIT_BASE_URL
- Cognito/Google: COGNITO_CLIENT_ID, COGNITO_BASE_URI, DIY_SUBMIT_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
- Bundles: TEST_BUNDLE_EXPIRY_DATE, TEST_BUNDLE_USER_LIMIT, TEST_BUNDLE_MOCK, COGNITO_USER_POOL_ID, AWS_REGION
- Local S3: TEST_S3_ENDPOINT, TEST_S3_ACCESS_KEY, TEST_S3_SECRET_KEY, DIY_SUBMIT_RECEIPTS_BUCKET_NAME
See infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java for the full set mapped into the CDK stack.

API Reference
Auth URL endpoints
- GET /api/hmrc/authUrl-get?state=...
- GET /api/mock/authUrl-get?state=...
- GET /api/cognito/authUrl-get?state=...
Response
```json
{
  "authUrl": "https://..."
}
```

Token exchange endpoints
- POST /api/hmrc/token-post
- POST /api/google/exchange-token
Request
```json
{
  "code": "AUTHORIZATION_CODE"
}
```
Success response
```json
{
  "accessToken": "...",
  "hmrcAccessToken": "..."
}
```
Error response (example)
```json
{
  "message": "Token exchange failed",
  "error": { "responseCode": 400, "responseBody": { "providerError": "..." } }
}
```

VAT submission
- POST /api/submit-vat
Headers: Authorization: Bearer <accessToken>
Request (example)
```json
{
  "vatNumber": "176540158",
  "periodKey": "24A1",
  "vatDue": "2400.00"
}
```
Response (example)
```json
{
  "processingDate": "2025-07-14T20:20:20Z",
  "formBundleNumber": "123456789012",
  "chargeRefNumber": "XZ1234567890"
}
```

Receipts and bundles
- POST /api/log-receipt
- POST /api/request-bundle
  - Headers: Authorization: Bearer <idToken>
  - Body: { "bundleId": "test", "qualifiers": { /* optional */ } }
  - Response: { "granted": true, "expiry": "2025-09-01T00:00:00Z" }

Bundles and product-catalog
Catalog: product-catalogue.toml
- Bundles (default, test, guest, basic, legacy, advanced) govern access.
- Activities map to bundles. For example:
  - test -> submit-vat-sandbox, vat-obligations-sandbox
  - guest/basic/legacy -> production submit-vat and others
How to try locally
- Go to bundles.html and request the “Test” bundle.
- Visit index.html to see sections update based on granted bundles.

Deployment (AWS CDK Java)
Prereqs
- Node 22+, Java 17+, Docker, AWS CLI, CDK v2, Maven wrapper (./mvnw)

Environment (example)
```bash

export ENVIRONMENT_NAME=dev
export HOSTED_ZONE_NAME=example.com
export HOSTED_ZONE_ID=Z123ABC...
export SUB_DOMAIN_NAME=submit
export USE_EXISTING_HOSTED_ZONE=true
export USE_EXISTING_CERTIFICATE=true
export DIY_SUBMIT_BASE_URL=https://submit.example.com/
export HMRC_BASE_URI=https://test-api.service.hmrc.gov.uk
export HMRC_CLIENT_ID=...
export HMRC_CLIENT_SECRET=...
export DIY_SUBMIT_GOOGLE_CLIENT_ID=...
export GOOGLE_CLIENT_SECRET=...
export DIY_SUBMIT_COGNITO_DOMAIN_PREFIX=submit-dev-1234
```

Build, synth, deploy
```bash

./mvnw clean package
npx cdk bootstrap aws://YOUR_ACCOUNT/YOUR_REGION
npx cdk synth WebStack-dev
npx cdk deploy WebStack-dev
```
Useful outputs (CfnOutput)
- DistributionId, ARecord, UserPoolId, UserPoolClientId, UserPoolDomainName
- Lambda URLs: AuthUrlHmrc, ExchangeHmrcToken, ExchangeGoogleToken, SubmitVat, LogReceipt, Bundle
- Secrets ARNs: HmrcClientSecretsManagerSecretArn, GoogleClientSecretsManagerSecretArn

Observability & Security
- Logging: S3 access logs, CloudFront logs, Lambda logs; optional verbose.
- Audit: CloudTrail optional, with object-level S3 event selectors.
- Tracing: X-Ray optional.
- Secrets: AWS Secrets Manager used by exchangeToken when env vars are not present.
- Compliance: HMRC MTD sandbox vs production keys; data retention policies for receipts; consider GDPR for Cognito profile data.

Testing and CI matrix
Test types (scripts in package.json)
- Unit tests (Vitest): app/unit-tests, web/unit-tests
  - npm run test:unit
- Integration tests (Vitest): app/integration-tests
  - npm run test:integration
- System tests (Vitest): app/system-tests
  - npm run test:system
- Browser tests (Playwright): web/browser-tests
  - npm run test:browser
- Behaviour tests (Playwright): behaviour-tests
  - npm run test:behaviour
- Infra tests (CDK synth in Docker + mvnw):
  - npm run run test:cdk
- End-to-end with running proxy:
  - npm run test:submitVatBehaviourProxyRunning

What runs between commit and deploy
1) Lint/format (optional gates): eslint, prettier.
2) Unit + Integration + System (Vitest) and Playwright suites.
3) Infra synth validation (Docker + ./mvnw + CDK).
4) If all green, environment-specific cdk deploy step.

Test command excerpts
- npm test
```text
Test Files 18 passed (18)
Tests 119 passed (119)
Duration 2.50s
```
- npm run test:unit
```text
Test Files 13 passed (13)
Tests 101 passed (101)
Duration 1.70s
```
- npm run test:integration
```text
Test Files 5 passed (5)
Tests 18 passed (18)
Duration 1.31s
```
- npm run test:system
```text
Test Files 3 passed (3)
Tests 5 passed (5)
Duration 4.97s
```

Code style, formatting, and IDE setup
- JavaScript/Node
  - Linting: ESLint (Flat config) with eslint-config-google, plus eslint-plugin-prettier to enforce Prettier formatting in lint.
  - Formatting: Prettier v3 with default options. ESM modules throughout.
  - Source of truth: eslint.config.js, package.json scripts.
- Java (CDK/infra)
  - Formatting: Spotless Maven plugin using Palantir Java Format 2.50.0 with 100-column wrap.
  - Also: removeUnusedImports, endWithNewline, and POM sorting for pom.xml.
  - Source of truth: pom.xml (<spotless-maven-plugin> section).
- Shared
  - Editor config: .editorconfig sets LF, final newline, trimming, and Java max_line_length=100.

CLI
- Check: npm run formatting (Prettier check + Spotless check)
- Fix: npm run formatting-fix (Prettier write + Spotless apply)
- Lint: npm run linting / npm run linting-fix

IDE quick setup (respect, enforce, and auto-correct)
- VS Code
  - Install: ESLint (dbaeumer.vscode-eslint), Prettier - Code formatter (esbenp.prettier-vscode).
  - Settings (workspace):
    ```json
    {
      "editor.formatOnSave": true,
      "editor.defaultFormatter": "esbenp.prettier-vscode",
      "eslint.experimental.useFlatConfig": true,
      "editor.codeActionsOnSave": {
        "source.fixAll.eslint": "explicit"
      }
    }
    ```
  - Run fixes: Ctrl/Cmd+S (format on save) or run npm scripts above.
- JetBrains IDEs (WebStorm, IntelliJ IDEA Ultimate/Community)
  - JavaScript: Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint → Automatic.
  - Prettier: Settings → Tools → Actions on Save → Run Prettier; also enable "Run eslint --fix".
  - Java: Install "Palantir Java Format" plugin (or Google Java Format) and enable it; optionally add Save Actions plugin to format + optimize imports on save.
- Eclipse
  - Install Palantir Java Format via update site: https://palantir.github.io/palantir-java-format/eclipse/update/
  - Preferences → Java → Code Style → Formatter → select Palantir. Enable Save Actions to format and organize imports.
- JetBrains Fleet
  - Enable ESLint and Prettier, set Prettier as default formatter; for Java, run ./mvnw spotless:apply or use Google Java Format plugin when available.

Defer to configs
- For any questions about rules, rely on eslint.config.js, pom.xml Spotless config, and Prettier defaults: https://prettier.io/docs/en/options.html

Roadmap
- Production HMRC VAT flow and additional MTD APIs.
- Expand activities across full product catalog; subscription tiers (basic/advanced).
- Audit/export tooling; better UI/UX for activities and receipts.
- CI hardening, additional Playwright journeys, and improved observability defaults.

License
This project is licensed under GPL-3.0. See LICENSE for details.

See also
- USERGUIDE.md (end-user flow)
- _developers/SETUP.md (developer setup details)
