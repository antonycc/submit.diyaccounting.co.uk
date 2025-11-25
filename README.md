# DIY Accounting Submit

A developer-friendly web app and AWS stack to submit UK VAT returns via HMRC’s Making Tax Digital (MTD) APIs. It runs locally with mock OAuth2 and DynamoDb, and deploys to AWS with CloudFront + S3 static hosting, Lambda URL backends, and Cognito (Google sign-in). See USERGUIDE.md for the end-user flow.

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
- Try it locally: ngrok + mock OAuth2 + DynamoDb for receipts.
- Deploy: Java CDK synthesizes and deploys CloudFront, S3, DynamoDB, Cognito (with Google), Lambda URLs, Route53/ACM, and Secrets Manager.

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

npm run server
```
- Terminal B: expose via ngrok (HTTPS URL seen by the browser)
```bash

npm run proxy
```
- Terminal C: mock OAuth2 (for login flows during development)
```bash

npm run auth
```
- Optional: DynamoDb (local DynamoDb) for receipts
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
- Local DynamoDB: RECEIPTS_DYNAMODB_TABLE_NAME
See infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java for the full set mapped into the CDK stack.

API Reference
Auth URL endpoints
- GET /api/v1/hmrc/authUrl?state=...
- GET /api/v1/mock/authUrl?state=...
- GET /api/v1/cognito/authUrl?state=...
Response
```json
{
  "authUrl": "https://..."
}
```

Token exchange endpoints
- POST /api/v1/hmrc/token
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
- POST /api/v1/hmrc/vat/return
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
- POST /api/v1/hmrc/receipt
- POST /api/v1/bundle
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

Troubleshooting and Error Messages

Common validation errors
- **"Invalid vatNumber format - must be 9 digits"**
  - Cause: VAT number is not exactly 9 digits
  - Fix: Use format 176540158 (no spaces, hyphens, or GB prefix)

- **"Invalid periodKey format"**
  - Cause: Period key doesn't match expected pattern
  - Fix: Use 3-5 character format like "24A1" or "#001"

- **"Missing accessToken parameter from body"**
  - Cause: HMRC access token not provided or expired
  - Fix: Re-authorize with HMRC using /api/v1/hmrc/authUrl

- **"Unauthorized - invalid or expired HMRC access token"**
  - Cause: HMRC token validation failed
  - Fix: Complete HMRC OAuth flow again; check token hasn't expired

- **"Bundle not found in catalog"**
  - Cause: Requested bundle ID doesn't exist in product-catalogue.toml
  - Fix: Verify bundle ID spelling; check catalog for available bundles

- **"Bundle cap reached"**
  - Cause: Maximum users for bundle exceeded
  - Fix: Wait for slots to free up or request a different bundle

Common runtime issues
- **Build failures with mvnw**
  - Ensure Java 17+ is installed: `java -version`
  - Clean build: `./mvnw clean package -U`
  - Check for Maven repository issues; try clearing ~/.m2/repository

- **npm install fails with Playwright**
  - Run with --ignore-engines flag: `npm install --ignore-engines`
  - Separately install browsers: `npx playwright install chromium --with-deps`

- **CDK synth failures**
  - Verify environment variables are set correctly
  - Check cdk.json context values
  - Run `./mvnw clean package` first to compile Java CDK code

- **Lambda function timeout**
  - Check CloudWatch logs: `/aws/lambda/{function-name}`
  - Verify HMRC API is responsive (check status page)
  - Increase Lambda timeout in CDK stack if needed

Debugging tips
- Enable verbose logging: Set LOG_LEVEL=debug in environment
- Check request IDs in error responses to correlate with CloudWatch logs
- Use X-Ray tracing (if enabled) to diagnose API call chains
- Review CloudFront distribution settings for origin configuration issues
- Test with HMRC sandbox before production to isolate API vs app issues

API error responses
All API endpoints return consistent error format:
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

HTTP status codes:
- 200: Success
- 400: Validation error (check message for specific field issues)
- 401: Unauthorized (missing or invalid authentication token)
- 403: Forbidden (insufficient bundle access or permissions)
- 404: Resource not found
- 429: Rate limited (retry with exponential backoff)
- 500: Internal server error (check CloudWatch logs with request ID)

HMRC-specific errors
- Check HMRC API status: https://api.service.hmrc.gov.uk/api-status
- Review HMRC developer forum for known issues
- Verify Gov-Client headers are correctly formatted
- Ensure correct scope (read:vat, write:vat) in authorization
- Test scenario headers (Gov-Test-Scenario) only work in sandbox

Performance optimization
- Lambda cold starts: Consider provisioned concurrency for high-traffic endpoints
- CloudFront caching: Static assets cached; API responses not cached
- Bundle lookups: Cached in Lambda execution context between invocations
- DynamoDB queries: Use sparse indexes for efficient bundle filtering
- S3 receipts: Consider S3 Select for querying large receipt sets

For deployment-specific issues, see [SETUP.md](_developers/SETUP.md).
For end-user troubleshooting, see [USERGUIDE.md](USERGUIDE.md).

Contributing

Code contributions
- Fork the repository and create a feature branch
- Follow code style: ESLint (Flat config) + Prettier for JS, Spotless for Java
- Run tests locally: `npm test` and `./mvnw test`
- Run linting: `npm run linting-fix && npm run formatting-fix`
- Write tests for new functionality
- Update documentation for API or behavior changes
- Submit PR with clear description of changes

Documentation maintenance
Documentation should be updated alongside code changes:
- **README.md**: High-level architecture, setup, troubleshooting
- **USERGUIDE.md**: End-user workflows and features
- **_developers/API.md**: Complete API endpoint documentation
- **_developers/SETUP.md**: Developer environment setup
- **.github/workflows/README.md**: CI/CD workflow documentation
- **OpenAPI specs** (openapi.json/yaml): Keep in sync with actual endpoints
- **JSDoc comments**: Add to all public functions and modules
- **Inline comments**: Explain complex logic or non-obvious behavior

Documentation style guidelines
- Keep prose brief and scannable
- Use code examples liberally
- Include error messages and troubleshooting steps
- Add request/response examples for all APIs
- Reference related documentation sections
- Update version numbers when releasing
- Ensure consistency across all docs

When adding new features
1. Update OpenAPI specification with new endpoints
2. Add comprehensive examples to API.md
3. Update USERGUIDE.md if user-facing
4. Add JSDoc to new functions
5. Update README.md if architecture changes
6. Document new environment variables
7. Add troubleshooting for common issues

Documentation testing checklist
- [ ] All links work (no 404s)
- [ ] Code examples are valid and tested
- [ ] API examples match actual endpoint schemas
- [ ] Error messages match actual application output
- [ ] Screenshots are current (if UI changes)
- [ ] Version numbers are updated
- [ ] Cross-references are accurate

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
