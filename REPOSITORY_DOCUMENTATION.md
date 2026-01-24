# DIY Accounting Submit - Repository Documentation

**Generated:** 2026-01-24

This document provides a high-level overview of the `submit.diyaccounting.co.uk` repository. For detailed reference, consult the source files directly.

## Table of Contents

1. [Repository Overview](#repository-overview)
2. [Environment Configuration](#environment-configuration)
3. [Build and Test Commands](#build-and-test-commands)
4. [AWS Deployment Architecture](#aws-deployment-architecture)
5. [Local Development](#local-development)
6. [Directory Structure](#directory-structure)

## Repository Overview

**DIY Accounting Submit** is a full-stack serverless application for submitting UK VAT returns via HMRC's Making Tax Digital (MTD) APIs.

### Technology Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | Static HTML/CSS/JavaScript served via CloudFront + S3 |
| **Backend** | Node.js (Express for local dev, AWS Lambda for production) |
| **Infrastructure** | AWS CDK v2 (Java) |
| **Testing** | Vitest (unit/system), Playwright (browser/behaviour) |
| **Authentication** | AWS Cognito + Google IdP (production), Mock OAuth2 (local) |
| **Storage** | DynamoDB (bundles, receipts, API requests), S3 (receipts backup) |
| **API Integration** | HMRC MTD VAT API (test and production) |
| **Local Dev Proxy** | ngrok (exposes localhost for OAuth callbacks) |

### Key Features

- **VAT Submissions**: Submit VAT returns to HMRC via MTD API
- **VAT Obligations**: Retrieve and display VAT obligations
- **Receipt Storage**: Store and retrieve HMRC submission receipts
- **Bundle/Entitlement System**: User subscription management
- **Multi-Environment**: Supports local proxy, CI, and production deployments
- **OAuth Integration**: Google/Cognito for production, mock OAuth2 for local testing

## Environment Configuration

The repository uses multiple environment files. See the actual files for complete configuration:

| Environment | File | Purpose |
|-------------|------|---------|
| **test** | `.env.test` | Unit/system tests with mocked services |
| **proxy** | `.env.proxy` | Local dev with ngrok, Docker OAuth2, dynalite |
| **proxyRunning** | `.env.proxyRunning` | Connect to already-running local services |
| **simulator** | `.env.simulator` | Local dev with HTTP simulator (lightweight, no Docker) |
| **ci** | `.env.ci` | CI with real AWS (`ci.submit.diyaccounting.co.uk`) |
| **prod** | `.env.prod` | Production (`submit.diyaccounting.co.uk`) |

### Key Environment Variables

Core variables defined in all environment files:

- `ENVIRONMENT_NAME` / `DEPLOYMENT_NAME` - Environment identifiers
- `DIY_SUBMIT_BASE_URL` - Application base URL
- `HMRC_BASE_URI` / `HMRC_SANDBOX_BASE_URI` - HMRC API endpoints
- `HMRC_CLIENT_ID` / `HMRC_SANDBOX_CLIENT_ID` - HMRC OAuth credentials
- `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` - AWS Cognito configuration
- `*_DYNAMODB_TABLE_NAME` - DynamoDB table names

**Read the `.env.*` files directly for complete variable listings.**

### Secrets Management

| Environment | Secret Storage |
|-------------|----------------|
| Local | `.env` files (not committed), shell environment |
| AWS (CI/Prod) | AWS Secrets Manager |

**Critical Secrets** (stored in Secrets Manager):
- `{env}/submit/hmrc/client_secret` - HMRC production OAuth
- `{env}/submit/hmrc/sandbox_client_secret` - HMRC sandbox OAuth
- `{env}/submit/user-sub-hash-salt` - HMAC-SHA256 salt for user ID hashing

See `_developers/SALTED_HASH_IMPLEMENTATION.md` and `_developers/SALT_SECRET_RECOVERY.md` for implementation details.

## Build and Test Commands

### Quick Reference

```bash
# Core test suite (~4s)
npm test

# Java CDK build (~45s)
./mvnw clean verify

# Local E2E tests
npm run test:submitVatBehaviour-proxy
```

**Read `package.json` for complete script listings.**

### Four-Tier Testing Pyramid

| Tier | Location | Command | Focus |
|------|----------|---------|-------|
| Unit | `app/unit-tests/`, `web/unit-tests/` | `npm run test:unit` | Business logic |
| System | `app/system-tests/` | `npm run test:system` | Docker integration |
| Browser | `web/browser-tests/` | `npm run test:browser` | UI components |
| Behaviour | `behaviour-tests/` | `npm run test:submitVatBehaviour-proxy` | E2E journeys |

### Maven Commands

| Command | Purpose |
|---------|---------|
| `./mvnw clean verify` | Full build: compile, test, package CDK JARs |
| `./mvnw clean test` | Run tests only |
| `./mvnw spotless:check` | Verify code formatting |
| `./mvnw spotless:apply` | Auto-format code |

**Output Artifacts**:
- `target/submit-application.jar` - CDK entry point for application stacks
- `target/submit-environment.jar` - CDK entry point for environment stacks
- `web/public/docs/openapi.yaml` - Generated API documentation

**Read `pom.xml` for complete Maven configuration.**

## AWS Deployment Architecture

### High-Level Architecture

```
Internet (Users)
       │
       ▼
   Route 53 (DNS)
       │
       ▼
   CloudFront (CDN) ────────────────┐
       │                            │
   ┌───┴───┐                        │
   │       │                        │
   ▼       ▼                        │
  S3    HTTP API Gateway            │
(Static)    │                       │
            ▼                       ▼
      Lambda Functions ────► HMRC MTD API
            │
    ┌───────┼───────┐
    ▼       ▼       ▼
Cognito  DynamoDB  Secrets Manager
```

### Lambda Execution Models

| Model | Pattern | Use Case |
|-------|---------|----------|
| **Synchronous** (`ApiLambda`) | Request → Lambda → Response | Fast operations (token exchange, bundle get) |
| **Asynchronous** (`AsyncApiLambda`) | Request → 202 → SQS → Worker → Poll | Long-running ops (HMRC VAT submission) |

**Async Flow**: Ingest Lambda → SQS Queue → Worker Lambda → DynamoDB (result) → Client polls

### CDK Stacks

#### Environment Stacks (Long-Lived)

Created once per environment by `deploy-environment.yml`:

| Stack | Resources |
|-------|-----------|
| ObservabilityStack | CloudWatch Log Groups, RUM, Alarms |
| ObservabilityUE1Stack | CloudWatch resources in us-east-1 (for CloudFront) |
| DataStack | DynamoDB tables |
| ApexStack | Route53 apex domain |
| IdentityStack | Cognito user pool |
| BackupStack | Cross-account backup configuration |

#### Application Stacks (Per-Deployment)

Created per deployment by `deploy.yml`:

| Stack | Resources |
|-------|-----------|
| DevStack | S3, CloudFront, ECR |
| SelfDestructStack | Auto-destroy (non-prod) |
| AuthStack | Auth Lambda functions |
| HmrcStack | HMRC API Lambda functions |
| AccountStack | Bundle management Lambdas |
| ApiStack | HTTP API Gateway |
| EdgeStack | Production CloudFront |
| PublishStack | S3 static file deployment |
| OpsStack | CloudWatch dashboard |

**Read the CDK stack files in `infra/main/java/co/uk/diyaccounting/submit/stacks/` for details.**

### GitHub Actions Workflows

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `deploy.yml` | Build, test, deploy application | Push, schedule, manual |
| `deploy-environment.yml` | Deploy shared infrastructure | Push to env files, manual |
| `deploy-cdk-stack.yml` | Deploy individual CDK stack (reusable) | workflow_call |
| `test.yml` | Run all tests (reusable) | Push, schedule, workflow_call |
| `synthetic-test.yml` | Run synthetic monitoring tests | Schedule, manual |
| `destroy.yml` | Tear down deployments | Manual only |
| `publish.yml` | Publish static assets | Manual only |
| `set-origins.yml` | Update DNS/CloudFront | Manual only |
| `manage-secrets.yml` | Backup/restore salt secrets | Manual only |
| `verify-backups.yml` | Verify cross-account backups | Schedule, manual |
| `setup-backup-account.yml` | Configure backup AWS account | Manual only |
| `create-hmrc-test-user.yml` | Create HMRC sandbox test user | Manual only |
| `compliance.yml` | Run compliance checks | Push, manual |
| `security-review.yml` | Security scanning | Push, manual |
| `codeql.yml` | CodeQL security analysis | Push, schedule |
| `copilot-agent.yml` | GitHub Copilot agent workflow | workflow_dispatch |
| `copilot-setup-steps.yml` | Copilot setup (reusable) | workflow_call |

**Read `.github/workflows/*.yml` for complete workflow definitions.**

## Local Development

### Local Development Stack

**Simulator Mode** (lightweight, no Docker):
```
Developer Machine
    │
    ├── Express Server (localhost:3000) ──► Lambda handlers
    │       │
    ├── ngrok (tunnel) ──► Public HTTPS URL for OAuth
    │
    ├── HTTP Simulator (localhost:9000) ──► Mock OAuth2 + HMRC API
    │
    └── Dynalite (dynamic port) ──► Local DynamoDB
```

**Proxy Mode** (full stack with Docker):
```
Developer Machine
    │
    ├── Express Server (localhost:3000) ──► Lambda handlers
    │       │
    ├── ngrok (tunnel) ──► Public HTTPS URL for OAuth
    │
    ├── Mock OAuth2 (Docker, localhost:8080) ──► Simulates Cognito
    │
    └── Dynalite (dynamic port) ──► Local DynamoDB
```

### Starting Local Services

```bash
# Start with HTTP simulator (recommended, lightweight)
npm start                    # or npm run start:simulator

# Start with Docker OAuth2 (full stack)
npm run start:proxy

# Individual services (advanced):
npm run data    # Local DynamoDB
npm run auth    # Mock OAuth2 (Docker)
npm run proxy   # ngrok tunnel
npm run server  # Express server
```

### Local vs AWS Comparison

| Aspect | Local (Express) | AWS (Lambda) |
|--------|----------------|--------------|
| Entry Point | `app/bin/server.js` | Lambda handler exports |
| Static Files | Express static | S3 + CloudFront |
| Authentication | Mock OAuth2 | AWS Cognito |
| Database | Dynalite (in-memory) | DynamoDB |
| Secrets | `.env` file | Secrets Manager |

**Read `app/bin/server.js` and `app/lib/httpServerToLambdaAdaptor.js` for implementation details.**

## Directory Structure

### Top-Level Overview

| Directory | Purpose |
|-----------|---------|
| `.github/` | GitHub Actions workflows and custom actions |
| `app/` | Backend Node.js Lambda functions and libraries |
| `behaviour-tests/` | End-to-end Playwright behaviour tests |
| `cdk-application/` | CDK configuration for application stacks |
| `cdk-environment/` | CDK configuration for environment stacks |
| `infra/` | Java/CDK infrastructure code |
| `scripts/` | Utility scripts for development and deployment |
| `web/` | Frontend HTML/CSS/JavaScript and tests |
| `_developers/` | Developer documentation |

### Backend Structure (`app/`)

| Path | Purpose |
|------|---------|
| `bin/` | Entry point scripts (server.js, ngrok.js, dynamodb.js) |
| `data/` | DynamoDB repository implementations |
| `functions/` | Lambda function handlers (auth/, hmrc/, account/, infra/) |
| `http-simulator/` | Lightweight HTTP simulator for local OAuth2 and HMRC API mocking |
| `lib/` | Shared libraries (logger, JWT, HTTP helpers) |
| `services/` | Business logic (hmrcApi.js, bundleManagement.js, subHasher.js) |
| `unit-tests/` | Vitest unit tests |
| `system-tests/` | Vitest integration tests |

### Frontend Structure (`web/`)

| Path | Purpose |
|------|---------|
| `public/` | Static website files served by S3/CloudFront |
| `public/auth/` | Authentication pages |
| `public/hmrc/` | HMRC-related pages (VAT submission, receipts) |
| `public/widgets/` | Reusable Web Components |
| `public/docs/` | OpenAPI documentation (generated) |
| `unit-tests/` | Vitest frontend unit tests |
| `browser-tests/` | Playwright browser tests |

### Infrastructure Structure (`infra/`)

| Path | Purpose |
|------|---------|
| `main/java/.../stacks/` | CDK stack definitions |
| `main/java/.../constructs/` | Reusable CDK constructs (ApiLambda, AsyncApiLambda) |
| `main/java/.../utils/` | Utility classes |
| `main/java/.../swagger/` | OpenAPI generator |
| `test/` | JUnit tests for CDK code |

**Use your IDE or `ls -la` to explore the full directory structure.**

## DynamoDB Schema

### Core Tables

| Table | Purpose | Key Schema |
|-------|---------|------------|
| Bundles | User entitlements | `hashedSub` (PK), `product` (SK) |
| Receipts | HMRC submission receipts | `hashedSub` (PK), `receiptId` (SK) |
| HMRC API Requests | Audit log | `id` (PK), `timestamp` (SK) |

### Async Request Tables

Each async operation has its own request state table:
- `submit-bundle-post-async-requests`
- `submit-bundle-delete-async-requests`
- `submit-hmrc-vat-return-post-async-requests`
- `submit-hmrc-vat-return-get-async-requests`
- `submit-hmrc-vat-obligation-get-async-requests`

**Schema**: `userId` (PK), `requestId` (SK), `status`, `data`, `ttl`

## Security Architecture

### Authentication Flow

1. User navigates to application
2. Frontend checks for JWT in localStorage
3. If no JWT, redirect to Cognito OAuth
4. User authenticates (Google IdP or username/password)
5. Cognito redirects with auth code
6. Frontend exchanges code for JWT
7. JWT stored in localStorage
8. API requests include JWT in Authorization header
9. Custom authorizer Lambda validates JWT

### Key Security Measures

- All traffic over HTTPS (ACM certificates)
- Secrets in AWS Secrets Manager (never in code)
- User IDs hashed with HMAC-SHA256 before storage
- IAM least-privilege roles
- CORS properly configured
- JWT validation on all protected routes

---

## Additional Documentation

For specific topics, see:

| Document | Location |
|----------|----------|
| Developer setup | `_developers/SETUP.md` |
| MFA implementation | `_developers/MFA_IMPLEMENTATION_SUMMARY.md` |
| Marketing guidance | `_developers/MARKETING_GUIDANCE.md` |
| Salted hash implementation | `_developers/archive/SALTED_HASH_IMPLEMENTATION.md` |
| Salt secret recovery | `_developers/archive/SALT_SECRET_RECOVERY.md` |
| CloudFront fix history | `_developers/archive/CLOUDFRONT_FRAUD_HEADERS_FIX.md` |
| Obligation flexibility | `_developers/archive/OBLIGATION_FLEXIBILITY_FIX.md` |
| Test report generation | `scripts/generate-test-reports.js` |
| API documentation | `web/public/docs/openapi.yaml` |

**For detailed implementation, always refer to the source files directly.**
