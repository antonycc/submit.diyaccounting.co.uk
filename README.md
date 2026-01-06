# DIY Accounting Submit

Submit UK VAT returns via HMRC’s Making Tax Digital (MTD) APIs. Run locally with ngrok, a mock OAuth2 server, and local DynamoDB; deploy to AWS using Java CDK (CloudFront + S3 static hosting, Lambda URL backends, Cognito optional).

Quickstart — Local (your own ngrok domain + HMRC sandbox)

Prerequisites
- Node.js 22+
- Java 21+ (for CDK build; not required to just run the local server)
- An ngrok account (with Authtoken; a reserved subdomain recommended)
- Playwright browser deps: run npm run playwright:install

1) Clone and install
```bash
git clone git@github.com:antonycc/submit.diyaccounting.co.uk.git
cd submit.diyaccounting.co.uk
npm install
```

2) Configure ngrok
- Get your Authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
- Reserve a subdomain (e.g. my-submit-dev.ngrok-free.app) so URLs are stable
- Export your token so the proxy can authenticate:
```bash
export NGROK_AUTHTOKEN=YOUR_NGROK_AUTHTOKEN
```

3) Configure environment (local proxy)
- Edit .env.proxy and set at least:
  - DIY_SUBMIT_BASE_URL=https://YOUR_RESERVED_SUBDOMAIN.ngrok-free.app/
  - TEST_SERVER_HTTP=run (default)
  - TEST_PROXY=run (default)
  - TEST_MOCK_OAUTH2=run (default)
  - TEST_DYNAMODB=run (default)
- HMRC sandbox (optional, for real OAuth to HMRC):
  - Create an app in the HMRC Developer Hub (Sandbox) and add your redirect URI: https://YOUR_RESERVED_SUBDOMAIN.ngrok-free.app/
  - Set HMRC_SANDBOX_CLIENT_ID in your local environment or .env (not committed)
  - Provide the client secret via either HMRC_SANDBOX_CLIENT_SECRET (local only) or HMRC_SANDBOX_CLIENT_SECRET_ARN (when using AWS Secrets Manager). Keep secrets out of VCS.

4) Run locally
Pick one:
- All-in-one (starts mock OAuth2, ngrok proxy, and the web server):
```bash
npm start
```
- Or run pieces yourself:
```bash
npm run server   # http://127.0.0.1:3000
npm run proxy -- 3000   # exposes your reserved ngrok domain
# Optional: mock OAuth2 server if testing Google/Cognito-like flows locally
npm run auth
```

Open your site at your ngrok URL: https://YOUR_RESERVED_SUBDOMAIN.ngrok-free.app/

Test suites (run progressively)
- One-time browser install: npm run playwright:install
- Unit + system tests (Vitest): npm test
- Browser tests (Playwright): npm run test:browser
- Behaviour tests (Playwright; orchestrates server, ngrok, mock OAuth2, and local DynamoDB using .env.proxy):
  - npm run test:allBehaviour
- Everything above in one go:
  - npm run test:all

Troubleshooting
- If you see flaky behaviour tests after a Docker/build, clear cached outputs: rm -rf target
- Ensure NGROK_AUTHTOKEN is exported and DIY_SUBMIT_BASE_URL matches your reserved subdomain
- If port 3000 is in use, set TEST_SERVER_HTTP_PORT in .env.proxy and pass the same to npm run proxy -- <port>

Architecture (high level)
- CloudFront + S3: static front-end assets
- Lambda URLs: HMRC auth URL, token exchange, VAT submission, logging receipts, bundle entitlement APIs
- Optional Cognito + Google IdP: hosted UI; user identity for gated features
- Route53 + ACM: DNS and CloudFront certificate
- Secrets Manager: HMRC and Google client secrets for non-local environments
- Local dev: ngrok, mock OAuth2, and local DynamoDB (via dynalite)

Environment files
- .env.proxy: local development with proxy + mock OAuth2 + local DynamoDB
- .env.prod: production-like values (no secrets in plaintext). For your own domain, copy this to a new file (e.g. .env.myprod) and override values
- Behaviour tests reference environment via dotenv (see package.json scripts); secrets should come from your shell env or AWS Secrets Manager ARNs

Deployment — AWS (your own domain, prod-based)
Prerequisites
- AWS account, AWS CLI configured
- CDK v2, Java 21+, Docker
- A public domain you control in Route53 (or the ability to delegate to Route53)

Steps
1) DNS and certificate
   - Create (or import) a Route53 hosted zone for your domain (e.g. submit.example.org)
   - Request an ACM certificate in us-east-1 for your apex + wildcard:
     - submit.example.org and *.submit.example.org
2) GitHub Actions OIDC (once per AWS account)
   - Add the token.actions.githubusercontent.com OIDC identity provider in IAM
   - Create two roles: a GitHub Actions role (assumable by your repo) and a deployment role (assumable by the Actions role and trusted admins)
3) Repository configuration
   - Set repository variables/secrets for your account and domain (examples):
     - AWS_ACCOUNT_ID, AWS_REGION
     - AWS_HOSTED_ZONE_ID, AWS_HOSTED_ZONE_NAME (e.g. submit.example.org)
     - AWS_CERTIFICATE_ARN (from us-east-1)
4) Environment file for your domain
   - Copy .env.prod to .env.myprod and set:
     - ENVIRONMENT_NAME=myprod, DEPLOYMENT_NAME=myprod
     - DIY_SUBMIT_BASE_URL=https://submit.example.org/
     - HMRC_BASE_URI / HMRC_SANDBOX_BASE_URI as needed
     - HMRC_CLIENT_SECRET_ARN / HMRC_SANDBOX_CLIENT_SECRET_ARN pointing to Secrets Manager
     - DynamoDB/S3 names if you want to control them; otherwise the CDK will create them
5) Build and synthesise locally (optional pre-check)
```bash
./mvnw clean verify -DskipTests
ENVIRONMENT_NAME=myprod npm run cdk:synth-environment
ENVIRONMENT_NAME=myprod npm run cdk:synth-application
```
6) Deploy via GitHub Actions
   - Push to main for prod-like deployment, or run the deploy workflow manually choosing your environment name

Notes
- Local manual deploys with cdk deploy are possible after assuming your deployment role; the CI workflow is the source of truth for production

House style and tooling
- Formatting checks: npm run formatting (Prettier + Spotless) / npm run formatting-fix
- Linting: npm run linting / npm run linting-fix
- Java formatting is enforced by Spotless (Palantir Java Format, 100 columns)
-  Avoid unnecessary formatting changes when editing code and do not reformat the lines if code that you are not changing.
-  Do not re-order imports (I consider this unnecessary formatting formatting).
-  Only run linting and formatting fix commands `npm run linting-fix && npm run formatting-fix` if specifically asked to fix formatting and linting errors:.

Documentation
- This README: high-level architecture and quickstart
- _developers/SETUP.md: step-by-step developer setup (local, tests, and AWS)
- lambda-concurrency-scaling.md: Lambda provisioned concurrency scaling system
- lambda-concurrency-cost-analysis.md: Detailed cost analysis for Lambda scaling

License
AGPL-3.0. See LICENSE for details.
