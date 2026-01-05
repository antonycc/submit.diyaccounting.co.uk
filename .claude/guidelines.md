# Claude Agent Guidelines - DIY Accounting Submit

**Last Updated:** 2026-01-05

## About This File

This file contains guidelines for **Claude Agent** (the AI assistant you're using now). The repository also has guidelines for other AI coding assistants:
- `.junie/guidelines.md` - Guidelines for Junie (custom agent, emphasis on testing & iteration)
- `.github/copilot-instructions.md` - Guidelines for GitHub Copilot (emphasis on code review & analysis)

Each assistant has complementary strengths - Claude Agent is optimized for autonomous task execution and comprehensive implementation.

## Primary References

**IMPORTANT**: Orient yourself with this repository using `REPOSITORY_DOCUMENTATION.md` at the repository root. This comprehensive document contains:
- Complete architecture overview (AWS serverless stack)
- All npm scripts with detailed descriptions
- Maven/CDK build process and stack organization
- Environment configuration
- Testing strategy
- Deployment workflows
- Directory structure and file purposes

Reference `REPOSITORY_DOCUMENTATION.md` first to understand context before making changes.

## Core Principles

### 1. Iterative Testing and Validation

**Test Execution**: Run the following test commands in sequence to verify code works:
```bash
npm test
./mvnw clean verify
npm run test:submitVatBehaviour-proxy
```

**Capturing Test Output**: When you need to analyze test output, capture to files:
```bash
npm test > target/test.txt 2>&1
./mvnw clean verify > target/mvnw.txt 2>&1
npm run test:submitVatBehaviour-proxy > target/behaviour.txt 2>&1
```

**Analyzing Failures**: Query for failures and errors:
```bash
grep -i -n -A 20 -E 'fail|error' target/test.txt
grep -i -n -A 20 -E 'fail|error' target/mvnw.txt
grep -i -n -A 20 -E 'fail|error' target/behaviour.txt
```

**Note**: Behaviour tests generate extensive output. Always pipe to a file rather than viewing directly.

### 2. Code Tracing Before Testing

Before running tests, trace code execution paths yourself:
- Follow the test execution path
- Trace the same path when code is deployed to AWS
- Detect and resolve bugs through tracing before running tests
- This prevents wasted test runs and catches issues earlier

### 3. Code Quality Standards

**Formatting and Style**:
- Avoid unnecessary formatting changes when editing code
- Do not reformat lines of code you are not changing
- Do not re-order imports (considered unnecessary formatting)
- Only run `npm run linting-fix && npm run formatting-fix` when specifically asked to fix formatting/linting errors

**Bug Fixes**:
- Do not add "fallback" paths that allow silent failures
- Fix the root cause, not symptoms

**Refactoring**:
- When refactoring, change names everywhere consistently
- Do not create "compatibility" adaptors
- Prefer comprehensive changes over gradual compatibility layers

## Testing Strategy

This repository uses a **four-tier testing pyramid**:

### 1. Unit Tests (Vitest)
- **Location**: `app/unit-tests/`, `web/unit-tests/`
- **Run**: `npm run test:unit` (~4 seconds)
- **Focus**: Business logic, helpers, utilities
- **Fast, isolated tests of individual functions/modules**

### 2. System Tests (Vitest + Docker)
- **Location**: `app/system-tests/`
- **Run**: `npm run test:system` (~6 seconds)
- **Focus**: Service integration, Docker containers (DynamoDB, OAuth2)
- **Integration tests with real dependencies**

### 3. Browser Tests (Playwright)
- **Location**: `web/browser-tests/`
- **Run**: `npm run test:browser` (~30+ seconds)
- **Focus**: Frontend widgets, navigation, client-side logic
- **UI component tests in real browser**

### 4. Behaviour Tests (Playwright)
- **Location**: `behaviour-tests/`
- **Run**: `npm run test:submitVatBehaviour-proxy` (with variants: `-proxy`, `-ci`, `-prod`)
- **Focus**: Complete flows (auth, VAT submission, bundles, receipts)
- **End-to-end user journey tests**

**Default**: `npm test` runs unit + system tests (~4 seconds, 108 tests)

## Environment Configuration

The repository supports **four environments** via `.env` files:

| Environment | File | Purpose |
|------------|------|---------|
| **test** | `.env.test` | Unit/system tests with mocked services |
| **proxy** | `.env.proxy` | Local development with ngrok, mock OAuth2, local DynamoDB |
| **ci** | `.env.ci` | Continuous integration with real AWS resources |
| **prod** | `.env.prod` | Production deployment |

**Key environment variables** to be aware of:
- `ENVIRONMENT_NAME`: `test`, `ci`, or `prod`
- `DEPLOYMENT_NAME`: Unique deployment identifier
- `DIY_SUBMIT_BASE_URL`: Application base URL
- `HMRC_BASE_URI`: HMRC API endpoint (test or prod)
- `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`: AWS Cognito configuration
- `*_DYNAMODB_TABLE_NAME`: DynamoDB table names
- `*_CLIENT_SECRET_ARN`: AWS Secrets Manager ARNs (never plain secrets in env files)

## Code Patterns and Conventions

### Lambda Function Pattern

```javascript
// Standard Lambda function structure
export const ingestHandler = async (event, context) => {
  try {
    // 1. Extract parameters from event (query, path, headers, body)
    // 2. Validate input
    // 3. Perform business logic
    // 4. Call AWS services (DynamoDB, Secrets Manager, etc.)
    // 5. Return successful response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (error) {
    // 6. Log error and return appropriate status code
    logger.error({ error, event }, 'Lambda execution failed');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

### Naming Conventions

- **Lambda function files**: `{feature}{Method}.js` (e.g., `hmrcVatReturnPost.js`)
- **CDK stacks**: `{Purpose}Stack` (e.g., `AuthStack`, `HmrcStack`)
- **DynamoDB tables**: `{env}-submit-{purpose}` (e.g., `ci-submit-bundles`)
- **Environment variables**: `{SERVICE}_{RESOURCE}_ARN` format
- **npm scripts**: Use `:` separator for variants (e.g., `test:unit`, `test:submitVatBehaviour-proxy`)

### Error Handling

- Lambda functions should catch errors and return appropriate HTTP status codes
- Use structured logging with Pino logger
- Include correlation IDs for request tracing

## Security Requirements

**Critical security checks**:

1. **Secrets Management**
   - ❌ Never commit secrets to code or environment files
   - ✅ Use AWS Secrets Manager ARNs in `.env.ci` and `.env.prod`
   - ✅ Export secrets in shell for local development
   - Check: Search for patterns like `client_secret`, `password`, API keys

2. **IAM Permissions**
   - Check Lambda execution roles for least privilege
   - Verify CDK-created roles follow principle of minimal access
   - Look for overly broad wildcards in IAM policies (`Resource: "*"`)

3. **Input Validation**
   - Validate and sanitize user input in Lambda functions
   - Check for SQL injection risks
   - Verify OAuth state parameter validation

4. **Authentication & Authorization**
   - Ensure protected routes use custom authorizer
   - Check JWT validation logic in `app/functions/auth/customAuthorizer.js`
   - Verify bundle entitlement checks before feature access

## AWS CDK Architecture

Infrastructure is divided into **two CDK applications**:

### 1. Environment Stacks (`cdk-environment/`)
Long-lived, shared resources:
- ObservabilityStack (CloudWatch RUM, logs, alarms)
- DataStack (DynamoDB tables)
- ApexStack (Route53 DNS)
- IdentityStack (Cognito user pool)
- **Deployed by**: `deploy-environment.yml` workflow

### 2. Application Stacks (`cdk-application/`)
Per-deployment resources:
- DevStack (S3, CloudFront, ECR)
- AuthStack, HmrcStack, AccountStack (Lambda functions)
- ApiStack (HTTP API Gateway)
- EdgeStack (CloudFront distribution)
- PublishStack (static file deployment)
- OpsStack (monitoring dashboard)
- SelfDestructStack (auto-cleanup for non-prod)
- **Deployed by**: `deploy.yml` workflow

**Entry points**:
- `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java`
- `infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java`

## Code Quality Tools

### JavaScript/TypeScript (ES Modules)
- **Linter**: ESLint with flat config (`eslint.config.js`)
- **Formatter**: Prettier (`.prettierrc`)
- **Check**: `npm run linting`, `npm run formatting`
- **Fix**: `npm run linting-fix && npm run formatting-fix` (only when specifically asked)

### Java (AWS CDK Infrastructure)
- **Formatter**: Spotless with Palantir Java Format (100-column width)
- **Check**: `./mvnw spotless:check`
- **Fix**: `./mvnw spotless:apply` (runs during Maven `install` phase)

### General Rule
Match existing local style rather than forcing global rules when disruptive. Only change style in code you're actively modifying.

## Key npm Scripts

See `REPOSITORY_DOCUMENTATION.md` Section "Package.json Operations" for complete reference.

**Build & Deploy**:
- `npm run build` - Full Maven build + restore deployment markers
- `npm start` - Start all local services (proxy, auth, data, server)
- `npm run server` - Start Express server on port 3000

**Testing**:
- `npm test` - Default: unit + system tests
- `npm run test:unit` - Unit tests only
- `npm run test:system` - System tests only
- `npm run test:browser` - Playwright browser tests
- `npm run test:submitVatBehaviour-proxy` - End-to-end behaviour tests

**Code Quality**:
- `npm run formatting` - Check JS/Java formatting
- `npm run formatting-fix` - Auto-fix JS/Java formatting
- `npm run linting` - Check ESLint rules
- `npm run linting-fix` - Auto-fix ESLint issues

**Local Development**:
- `npm run proxy` - Start ngrok proxy
- `npm run auth` - Start mock OAuth2 server (Docker)
- `npm run data` - Start local DynamoDB (dynalite)

## Performance and Cost Considerations

### AWS Lambda
- Cold start times (Node.js 22 runtime, Docker images from ECR)
- Memory allocation optimization
- Execution duration (DynamoDB queries, HMRC API calls)

### DynamoDB
- On-demand billing (no provisioned capacity)
- Query efficiency (use partition key + sort key)
- Item size limits (400 KB per item)
- Avoid full table scans

### CloudFront
- Cache policy configuration (static vs. dynamic content)
- Origin request optimization
- CloudWatch RUM costs (events per session)

**Cost red flags**:
- Unbounded loops or recursive calls in Lambda
- Full table scans on DynamoDB
- Excessive CloudWatch log volume
- 100% session sampling in RUM

## Workflow Summary

When working on tasks:

1. **Understand**: Reference `REPOSITORY_DOCUMENTATION.md` for context
2. **Trace**: Follow code execution paths before testing
3. **Implement**: Make targeted changes following established patterns
4. **Test**: Run test suite in sequence (unit → system → behaviour)
5. **Validate**: Ensure tests pass and code quality standards met
6. **Iterate**: Fix issues detected through testing and repeat

## Additional Resources

- **Repository Documentation**: `REPOSITORY_DOCUMENTATION.md` (primary reference)
- **README**: `README.md`
- **Package Scripts**: `package.json`
- **Maven Build**: `pom.xml`
- **ESLint Config**: `eslint.config.js`
- **Vitest Config**: `vitest.config.js`
- **Playwright Config**: `playwright.config.js`
- **GitHub Workflows**: `.github/workflows/`
