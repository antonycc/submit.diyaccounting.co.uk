# DIY Accounting Submit - GitHub Copilot Instructions

**ALWAYS** follow these instructions first and fallback to additional search and context gathering only if the information here is incomplete or found to be in error.

## Working Effectively

### Bootstrap the Repository
```bash
# Install Node.js dependencies (requires Node.js 20+, prefers 22+)
npm install --ignore-engines
# Note: npm install fails due to Playwright browser download issues and Node version mismatch
# Always use --ignore-engines to bypass Node version warnings

# Build Java/CDK components (requires Java 17+)
./mvnw clean package -Dmaven.compiler.source=17 -Dmaven.compiler.target=17
# NEVER CANCEL: Maven build takes 45 seconds. Set timeout to 90+ seconds.
# Note: pom.xml specifies Java 21 but works with Java 17 using compiler overrides
```

### Run Tests
```bash
# Fast unit tests - run these frequently during development
npm run test:unit
# Duration: 4 seconds. NEVER CANCEL: Set timeout to 15+ seconds.

# Integration tests with mocked HTTP services
npm run test:integration  
# Duration: 3 seconds. NEVER CANCEL: Set timeout to 15+ seconds.

# System tests with Docker containers (MinIO S3)
npm run test:system
# Duration: 6 seconds. NEVER CANCEL: Set timeout to 30+ seconds.
# Note: convertVideo test may fail due to ffmpeg dependencies

# All core tests (excludes browser/behavior tests)
npm test
# Duration: 4 seconds (18 test files, 108 tests). NEVER CANCEL: Set timeout to 15+ seconds.
```

### Run the Application Locally
```bash
# Start the Express server
npm run start
# Starts server on http://127.0.0.1:3000
# Uses .env.proxy configuration by default
# ALWAYS verify server starts by checking "Listening at http://127.0.0.1:3000" message
```

### Code Quality
```bash
# Check linting (has many errors in _developers/test-archive/ files)
npm run linting
# Duration: 12 seconds. Set timeout to 30+ seconds.

# Fix auto-fixable linting issues
npm run linting-fix

# Check code formatting
npm run formatting
# Duration: 3 seconds. Set timeout to 15+ seconds.

# Fix formatting issues
npm run formatting-fix

# ALWAYS run before committing:
npm run linting-fix && npm run formatting-fix
```

### Browser/Behavior Tests (Optional - Require Playwright Setup)
```bash
# Install Playwright browsers separately (if needed)
npx playwright install chromium --with-deps
# NOTE: May fail due to network issues with browser downloads

# Browser tests for UI components
npm run test:browser
# NEVER CANCEL: Can take 30+ seconds. Set timeout to 60+ seconds.

# End-to-end behavior tests
npm run test:behaviour
# NEVER CANCEL: Can take 45+ seconds. Set timeout to 120+ seconds.
```

## Architecture Overview

This is a full-stack AWS serverless application:
- **Frontend**: Static HTML/CSS/JS served via CloudFront + S3
- **Backend**: Node.js Express server + AWS Lambda functions
- **Infrastructure**: AWS CDK (Java) for deployment
- **Testing**: Multi-tier testing with Vitest (unit/integration/system) and Playwright (browser/behavior)

## Validation Scenarios

### ALWAYS Test After Making Changes
1. **Core functionality validation**:
   ```bash
   npm run test:unit && npm run test:integration
   ```

2. **Server startup validation**:
   ```bash
   npm run start
   # Verify "Listening at http://127.0.0.1:3000" appears
   # Stop with Ctrl+C
   ```

3. **Code quality validation**:
   ```bash
   npm run linting && npm run formatting
   ```

### Manual Testing Scenarios
After making changes to user-facing features, manually test:

1. **VAT Submission Flow**:
   - Start server: `npm run start`
   - Open: http://127.0.0.1:3000/submitVat.html
   - Fill form with test data (VAT number: 193054661, Period: 24A1, Amount: 1000.00)
   - Verify form validation and submission process

2. **Bundle/Entitlement System**:
   - Open: http://127.0.0.1:3000/bundles.html
   - Test requesting different bundles (Test, Guest, etc.)
   - Verify activities appear in http://127.0.0.1:3000/activities.html

3. **Receipt System**:
   - Open: http://127.0.0.1:3000/receipts.html
   - Verify receipt display and storage functionality

## Common Issues & Workarounds

### Node.js Version Issues
- **Problem**: Package requires Node 22+, system has Node 20
- **Solution**: Always use `npm install --ignore-engines`

### Java Version Issues  
- **Problem**: pom.xml specifies Java 21, system has Java 17
- **Solution**: Use compiler overrides: `-Dmaven.compiler.source=17 -Dmaven.compiler.target=17`

### Playwright Installation Issues
- **Problem**: Playwright browser download fails during npm install or separate installation
- **Solution**: Network/firewall issues may prevent browser downloads. Tests using Playwright may not work in restricted environments. Use unit/integration/system tests instead.

### CDK Synthesis Issues
- **Problem**: `npx cdk synth` fails with missing environment variables
- **Solution**: CDK requires AWS environment variables. For local development, use test commands instead.

### Test Timeouts
- **Problem**: Long-running operations may timeout with default settings
- **Solution**: Always set appropriate timeouts:
  - Unit/Integration tests: 15+ seconds
  - System tests: 30+ seconds  
  - Browser tests: 60+ seconds
  - Behavior tests: 120+ seconds
  - Maven builds: 90+ seconds

## Key Project Files

### Configuration
- `package.json` - Node.js dependencies and scripts
- `pom.xml` - Java/CDK build configuration
- `vitest.config.js` - Test configuration
- `playwright.config.js` - Browser test configuration
- `eslint.config.js` - Linting rules

### Source Code
- `app/` - Backend Express server and Lambda functions
- `web/public/` - Frontend static files
- `infra/` - AWS CDK infrastructure code (Java)
- `behaviour-tests/` - End-to-end Playwright tests

### Environment Files
- `.env.test` - Test environment configuration
- `.env.proxy` - Local development configuration
- `.env.ci` - CI environment configuration

## Deployment Notes

- AWS CDK deployment requires Java 17+, Docker, and AWS CLI
- GitHub Actions workflows handle CI/CD with multi-stage testing
- Local development uses mock services (OAuth2, S3) for testing

## Critical Timing Expectations

**NEVER CANCEL** any of these operations before the specified timeout:
- `npm install`: 60 seconds (due to Playwright downloads)
- `./mvnw clean package`: 90 seconds 
- `npm test`: 15 seconds
- `npm run test:system`: 30 seconds (includes Docker container startup)
- `npm run test:browser`: 60 seconds (browser automation)
- `npm run test:behaviour`: 120 seconds (full end-to-end flows)

Always build and exercise your changes through the test suites and manual validation scenarios before considering the work complete.