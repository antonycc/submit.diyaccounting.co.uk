# Test Report Scripts

This directory contains scripts for generating and managing test reports from behaviour tests.

## Overview

The test reporting system has three main components:

1. **Test Execution**: Behaviour tests run and generate artifacts (screenshots, videos, test context)
2. **DynamoDB Export**: HMRC API requests are extracted from DynamoDB tables
3. **Report Generation**: JSON reports are created that combine all test artifacts
4. **Report Publishing**: Reports are uploaded to S3 and served via CloudFront

## Scripts

### generate-test-reports.js

Generates test report JSON files from behaviour test results.

**Usage:**
```bash
node scripts/generate-test-reports.js \
  --testName <name> \
  --envFile <path/to/.env>
```

**Inputs:**
- Test context from `testContext.json` files
- HMRC API requests from `hmrc-api-requests.jsonl` files (if available at time of generation)
- Playwright test reports from `target/test-reports/`
- Screenshots and videos from test artifacts

**Outputs:**
- `target/behaviour-test-results/test-report-<testName>.json`

### inject-dynamodb-into-test-report.js

Injects HMRC API requests from DynamoDB export into an existing test report JSON.

**Purpose:** In CI workflows, DynamoDB export happens after test report generation. This script updates the report JSON with the exported HMRC API requests.

**Usage:**
```bash
node scripts/inject-dynamodb-into-test-report.js \
  --reportFile <path/to/test-report-*.json> \
  --dynamoDbFile <path/to/hmrc-api-requests.jsonl>
```

**Example:**
```bash
node scripts/inject-dynamodb-into-test-report.js \
  --reportFile target/behaviour-test-results/test-report-submitVatBehaviour.json \
  --dynamoDbFile target/behaviour-test-results/hmrc-api-requests.jsonl
```

**Error Handling:**
- Exits with code 1 if report file not found
- Exits with code 0 (gracefully) if DynamoDB file not found
- Replaces existing `hmrcApiRequests` array with new data

### export-test-dynamodb.sh

Exports DynamoDB data for test users after behaviour tests complete.

**Usage:**
```bash
export-test-dynamodb.sh <deployment-name>
```

**Environment Variables:**
- `AWS_REGION` - AWS region (default: eu-west-2)
- `RESULTS_DIR` - Test results directory (default: target/behaviour-test-results)

**Process:**
1. Finds all `userSub.txt` files in test results
2. Calls `export-dynamodb-for-test-users.js` with user subs
3. Exports data to JSONL files:
   - `bundles.jsonl`
   - `receipts.jsonl`
   - `hmrc-api-requests.jsonl`

### publish-web-test-local.sh

Publishes test reports to the local web directory for viewing.

**Usage:**
```bash
./scripts/publish-web-test-local.sh <sourceReport> <targetTest>
```

**Example:**
```bash
./scripts/publish-web-test-local.sh \
  target/behaviour-test-results/test-report-submitVatBehaviour.json \
  web-test-local
```

**Process:**
1. Copies test report JSON to `web/public/tests/`
2. Copies screenshots to `web/public/tests/behaviour-test-results/<targetTest>/`
3. Copies Playwright HTML reports to `web/public/tests/test-reports/<targetTest>/`
4. Normalizes file names (removes timestamps)

## CI Workflow

In `.github/workflows/synthetic-test.yml`, the test reporting process follows this sequence:

1. **Run behaviour test** - Generates test artifacts
2. **Export DynamoDB** - Extracts HMRC API requests to JSONL
3. **Generate test reports** - Creates initial test report JSON
4. **Inject DynamoDB data** - Updates report JSON with HMRC API requests
5. **Upload artifacts** - Uploads results and reports to GitHub Actions
6. **Publish to S3** - In separate job, downloads artifacts and publishes to S3

### Why Injection is Needed

The behaviour test itself exports DynamoDB data inline during execution (for local runs). However, in CI:

- Tests run in containers without AWS credentials
- DynamoDB export happens after test completion using workflow-level AWS credentials
- Test report generation must happen before DynamoDB export completes
- **Solution:** Inject the DynamoDB data into the already-generated report JSON

## Test Report JSON Structure

```json
{
  "testName": "submitVatBehaviour",
  "generatedAt": "2026-01-04T22:00:00.000Z",
  "testContext": {
    "name": "Test name",
    "testData": {
      "observedTraceparent": "00-trace-id-span-id-01"
    }
  },
  "hmrcApiRequests": [
    {
      "id": "hmrcreq-...",
      "traceparent": "00-trace-id-span-id-01",
      "method": "POST",
      "url": "https://test-api.service.hmrc.gov.uk/...",
      "httpRequest": {
        "method": "POST",
        "headers": {},
        "body": "..."
      },
      "httpResponse": {
        "statusCode": 200,
        "headers": {},
        "body": {}
      }
    }
  ],
  "playwrightReport": {
    "status": "passed",
    "failedTests": []
  },
  "artifacts": {
    "screenshots": ["file1.png", "file2.png"],
    "videos": ["video.webm"],
    "figures": [
      {
        "filename": "file1.png",
        "order": 1,
        "caption": "Description",
        "description": "Detailed description"
      }
    ]
  }
}
```

## Viewing Test Reports

Test reports can be viewed at:
```
https://submit.diyaccounting.co.uk/tests/test-report-template.html?test=<testName>
```

For example:
- https://submit.diyaccounting.co.uk/tests/test-report-template.html?test=web-test-local (local development)
- https://submit.diyaccounting.co.uk/tests/test-report-template.html?test=web-test (CI deployment)

The template (`web/public/tests/test-report-template.html`) fetches the corresponding JSON file and renders:
- Test metadata and context
- HMRC API requests (filtered by traceparent)
- Screenshots and videos
- Playwright test results
- Environment configuration

## Troubleshooting

### HMRC API requests not showing in report

**Symptom:** Test report shows "No HMRC API requests found for this test."

**Causes:**
1. DynamoDB export file not found
2. Test report not updated with DynamoDB data
3. Traceparent filtering excluding all requests

**Solutions:**
1. Verify `hmrc-api-requests.jsonl` exists in test results directory
2. Check injection step logs in CI workflow
3. Check `observedTraceparent` in test context matches request traceparents
4. Manually run injection script:
   ```bash
   node scripts/inject-dynamodb-into-test-report.js \
     --reportFile target/behaviour-test-results/test-report-<name>.json \
     --dynamoDbFile target/behaviour-test-results/hmrc-api-requests.jsonl
   ```

### Test report not found

**Symptom:** 404 error when viewing test report URL.

**Solutions:**
1. Check that test report JSON was uploaded to S3
2. Verify CloudFront cache (may need invalidation)
3. Check workflow artifacts for successful upload
4. Manually upload using AWS CLI:
   ```bash
   aws s3 cp test-report-web-test.json s3://bucket/tests/
   ```

## Local Development

For local development, the complete workflow is:

```bash
# 1. Run behaviour tests
npm run test:submitVatBehaviour-proxy

# 2. DynamoDB export happens inline during test
# (No separate step needed)

# 3. Generate test report
node scripts/generate-test-reports.js \
  --testName submitVatBehaviour \
  --envFile .env.proxy

# 4. Publish to local web directory
./scripts/publish-web-test-local.sh \
  target/behaviour-test-results/test-report-submitVatBehaviour.json \
  web-test-local

# 5. Start local server
npm run server

# 6. View report
open http://localhost:3000/tests/test-report-template.html?test=web-test-local
```
