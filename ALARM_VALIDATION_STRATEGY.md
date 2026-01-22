# Alarm Validation Strategy

> **Status:** Planning
> **Author:** Claude Code
> **Created:** 2025-01-22
> **Original Request:** Consider a test strategy for all alarms configured in this repository (CDK in ./infra). Run in CI doing chaos monkey stuff, mutation testing, threshold lowering, or AWS API manipulation. Check alarm state before/after. Focus on: code quality gate testing, secret detection, service downtime detection, throttling (WAF), and data breach detection. Run in CI (destructive) and non-destructively in prod for manual drills.

---

## Executive Summary

This document outlines a test strategy for validating the ~20 CloudWatch alarms, 6 EventBridge security rules, and synthetic canaries configured in the `./infra` CDK stacks. The strategy uses a combination of:

1. **Chaos injection** - Deliberately break things to trigger alarms
2. **Threshold manipulation** - Temporarily lower thresholds for easy triggering
3. **AWS API manipulation** - Force alarm states via `SetAlarmState`
4. **Traffic injection** - Send specific patterns to trigger WAF/security rules

Two execution modes:
- **CI Mode** (destructive): Full chaos testing in `ci` environment
- **Drill Mode** (non-destructive): AWS API state changes only in `prod`

---

## Current Alarm Inventory

### Lambda Alarms (per function × 4 alarms each)
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{fn}-errors` | ≥1 error/5min | Mutation testing, chaos injection |
| `{fn}-throttles` | ≥1 throttle/5min | Reserved concurrency + load |
| `{fn}-high-duration-p95` | ≥80% timeout | Slow code injection |
| `{fn}-log-errors` | ≥1 ERROR pattern/5min | Log injection |

### API Gateway Alarms
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{prefix}-api-5xx` | ≥1 5xx/5min | Lambda mutation, chaos |

### WAF Alarms (Edge Stack, us-east-1)
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{prefix}-waf-rate-limit` | ≥50 blocks/5min | High-frequency requests |
| `{prefix}-waf-attack-signatures` | ≥5 blocks/5min | SQLi/XSS payloads |
| `{prefix}-waf-known-bad-inputs` | ≥5 blocks/5min | Malformed inputs |

### Synthetic Canary Alarms
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{prefix}-health-failed` | <90% success/5min | Break web endpoint |
| `{prefix}-api-failed` | <90% success/5min | Break API endpoint |
| `{prefix}-github-synthetic-failed` | ≥1 (2hr window, missing=breaching) | Skip synthetic workflow |

### RUM Alarms
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{prefix}-rum-lcp-p75` | >4s LCP | Slow asset injection |
| `{prefix}-rum-js-errors` | ≥5 errors/5min | JS error injection |

### Async/SQS Alarms
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{queue}-not-empty` (DLQ) | >1 message | Fail queue processor |

### Security EventBridge Rules → SNS
| Rule | Trigger | Testable Via |
|------|---------|--------------|
| GuardDuty findings | Any finding | Simulated finding |
| Security Hub findings | Any imported finding | CIS check failure |
| IAM policy changes | Create/Attach/Put policy | Test policy creation |
| Security group changes | Authorize/Revoke ingress/egress | Test SG modification |
| Access key creation | CreateAccessKey | Test key creation |
| Root account activity | Root API calls | Not testable (don't use root) |

---

## Level 1: Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Workflow                         │
│  ┌──────────────────────┐  ┌──────────────────────┐               │
│  │   CI Mode (ci env)   │  │ Drill Mode (prod)    │               │
│  │   - Full chaos       │  │ - SetAlarmState only │               │
│  │   - Mutation deploy  │  │ - Non-destructive    │               │
│  │   - Traffic injection│  │ - Manual trigger     │               │
│  └──────────────────────┘  └──────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
           ┌─────────────────┐           ┌─────────────────┐
           │ Pre-test Phase  │           │ Chaos/Drill     │
           │ - Record states │           │ - Execute tests │
           │ - Validate SNS  │           │ - Wait periods  │
           └─────────────────┘           └─────────────────┘
                     │                             │
                     └──────────────┬──────────────┘
                                    ▼
                          ┌─────────────────┐
                          │ Post-test Phase │
                          │ - Verify alarms │
                          │ - Check SNS     │
                          │ - Generate report│
                          │ - Restore state │
                          └─────────────────┘
```

---

## Level 2: Test Categories & Jobs

### Job 1: `code-quality-gate-testing`
**Focus:** Lambda error detection, log-based error detection

| Test | Method | Expected Result |
|------|--------|-----------------|
| Lambda throws exception | Deploy mutant with `throw new Error()` | `{fn}-errors` → ALARM |
| Lambda logs ERROR | Deploy mutant with `console.error('ERROR')` | `{fn}-log-errors` → ALARM |
| Lambda timeout | Deploy mutant with `await sleep(30000)` | `{fn}-high-duration-p95` → ALARM |
| API 5xx response | Break API Lambda | `{prefix}-api-5xx` → ALARM |

**CI Implementation:**
```yaml
steps:
  - name: Deploy mutant Lambda
    run: |
      # Inject error into Lambda code
      sed -i 's/return response/throw new Error("CHAOS_TEST")/g' app/functions/example.js
      npm run deploy:ci
  - name: Invoke Lambda
    run: aws lambda invoke --function-name $FN_NAME /dev/null
  - name: Wait for alarm
    run: sleep 300  # Wait for 5-min evaluation period
  - name: Verify alarm state
    run: |
      STATE=$(aws cloudwatch describe-alarms --alarm-names "${FN_NAME}-errors" \
        --query 'MetricAlarms[0].StateValue' --output text)
      [ "$STATE" = "ALARM" ] || exit 1
```

### Job 2: `secret-detection`
**Focus:** Security event detection, data exfiltration patterns

| Test | Method | Expected Result |
|------|--------|-----------------|
| IAM policy creation | `aws iam create-policy` (test policy) | EventBridge → SNS |
| Access key creation | `aws iam create-access-key` (test user) | EventBridge → SNS |
| Security group modification | `aws ec2 authorize-security-group-ingress` | EventBridge → SNS |

**CI Implementation:**
```yaml
steps:
  - name: Create test IAM policy
    run: |
      aws iam create-policy \
        --policy-name "alarm-test-policy-$(date +%s)" \
        --policy-document '{"Version":"2012-10-17","Statement":[]}' \
        --tags Key=Purpose,Value=AlarmTest
  - name: Wait for EventBridge propagation
    run: sleep 60
  - name: Verify SNS notification received
    run: |
      # Check CloudWatch Logs for SNS delivery to security topic
      aws logs filter-log-events \
        --log-group-name "sns/$REGION/$ACCOUNT/security-findings" \
        --filter-pattern "alarm-test-policy"
  - name: Cleanup
    run: aws iam delete-policy --policy-arn $POLICY_ARN
```

### Job 3: `service-downtime-detection`
**Focus:** Synthetic canaries, health check alarms

| Test | Method | Expected Result |
|------|--------|-----------------|
| Health endpoint down | Return 500 from health Lambda | `{prefix}-health-failed` → ALARM |
| API endpoint down | Return 500 from API Lambda | `{prefix}-api-failed` → ALARM |
| GitHub synthetic gap | Skip synthetic-test workflow | `{prefix}-github-synthetic-failed` → ALARM |

**CI Implementation:**
```yaml
steps:
  - name: Deploy broken health endpoint
    run: |
      # Inject 500 response
      sed -i 's/statusCode: 200/statusCode: 500/g' app/functions/health.js
      npm run deploy:ci
  - name: Wait for canary failure (2 evaluation periods)
    run: sleep 600
  - name: Verify alarm state
    run: |
      STATE=$(aws cloudwatch describe-alarms --alarm-names "${PREFIX}-health-failed" \
        --query 'MetricAlarms[0].StateValue' --output text)
      [ "$STATE" = "ALARM" ] || exit 1
```

### Job 4: `throttling-waf`
**Focus:** WAF rate limiting, attack pattern detection

| Test | Method | Expected Result |
|------|--------|-----------------|
| Rate limit | 2500 requests in <5min from single IP | `{prefix}-waf-rate-limit` → ALARM |
| SQLi detection | Requests with `' OR 1=1 --` | `{prefix}-waf-attack-signatures` → ALARM |
| XSS detection | Requests with `<script>alert(1)</script>` | `{prefix}-waf-attack-signatures` → ALARM |
| Bad inputs | Requests with known malicious payloads | `{prefix}-waf-known-bad-inputs` → ALARM |

**CI Implementation:**
```yaml
steps:
  - name: Generate attack traffic
    run: |
      # SQLi payloads (will be blocked by WAF)
      for i in $(seq 1 10); do
        curl -s "${BASE_URL}/api/test?id=' OR 1=1 --" || true
        curl -s "${BASE_URL}/api/test" -d "name=<script>alert(1)</script>" || true
      done
  - name: Wait for metric aggregation
    run: sleep 300
  - name: Verify WAF alarm (us-east-1)
    run: |
      STATE=$(aws cloudwatch describe-alarms --region us-east-1 \
        --alarm-names "${PREFIX}-waf-attack-signatures" \
        --query 'MetricAlarms[0].StateValue' --output text)
      [ "$STATE" = "ALARM" ] || exit 1
```

### Job 5: `data-breach-detection`
**Focus:** GuardDuty, Security Hub, anomaly detection

| Test | Method | Expected Result |
|------|--------|-----------------|
| GuardDuty finding | Use GuardDuty sample findings API | EventBridge → SNS |
| Security Hub finding | Import sample finding | EventBridge → SNS |
| Unusual API pattern | Make atypical API calls | GuardDuty detection |

**CI Implementation:**
```yaml
steps:
  - name: Generate GuardDuty sample findings
    run: |
      DETECTOR_ID=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)
      aws guardduty create-sample-findings --detector-id $DETECTOR_ID \
        --finding-types "UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B"
  - name: Wait for finding propagation
    run: sleep 120
  - name: Verify SNS notification
    run: |
      # Check that security findings topic received the event
      # This requires SNS subscription confirmation and log checking
```

---

## Level 3: Implementation Details

### 3.1 Workflow File Structure

```yaml
# .github/workflows/alarm-validation.yml
name: alarm-validation
run-name: "Alarm Validation [${{ inputs.mode }}] - ${{ github.ref_name }}"

on:
  workflow_dispatch:
    inputs:
      mode:
        description: 'Test mode'
        required: true
        type: choice
        options:
          - 'ci'      # Full chaos testing
          - 'drill'   # Non-destructive prod drill
      categories:
        description: 'Test categories (comma-separated)'
        required: false
        type: string
        default: 'all'
        # Options: code-quality,secret-detection,downtime,throttling,data-breach
  schedule:
    - cron: '0 3 * * 0'  # Weekly Sunday 3am UTC (CI mode)

permissions:
  id-token: write
  contents: read

env:
  # ... standard AWS config ...

jobs:
  setup:
    runs-on: ubuntu-24.04
    outputs:
      alarm-states-before: ${{ steps.record.outputs.states }}
      deployment-name: ${{ steps.names.outputs.deployment-name }}
    steps:
      - name: Record alarm states before test
        id: record
        run: |
          aws cloudwatch describe-alarms \
            --alarm-name-prefix "${PREFIX}" \
            --query 'MetricAlarms[*].{Name:AlarmName,State:StateValue}' \
            > /tmp/alarm-states-before.json
          echo "states=$(cat /tmp/alarm-states-before.json | jq -c)" >> $GITHUB_OUTPUT

  code-quality-gate:
    needs: [setup]
    if: contains(inputs.categories, 'code-quality') || inputs.categories == 'all'
    # ... test implementation ...

  secret-detection:
    needs: [setup]
    if: contains(inputs.categories, 'secret-detection') || inputs.categories == 'all'
    # ... test implementation ...

  downtime-detection:
    needs: [setup]
    if: contains(inputs.categories, 'downtime') || inputs.categories == 'all'
    # ... test implementation ...

  throttling-waf:
    needs: [setup]
    if: contains(inputs.categories, 'throttling') || inputs.categories == 'all'
    # ... test implementation ...

  data-breach-detection:
    needs: [setup]
    if: contains(inputs.categories, 'data-breach') || inputs.categories == 'all'
    # ... test implementation ...

  verify-and-restore:
    needs: [code-quality-gate, secret-detection, downtime-detection, throttling-waf, data-breach-detection]
    if: always()
    steps:
      - name: Compare alarm states
        run: |
          # Verify expected alarms triggered
          # Generate report
      - name: Restore alarm states (drill mode only)
        if: inputs.mode == 'drill'
        run: |
          # Use SetAlarmState to restore OK state
```

### 3.2 Drill Mode (Non-Destructive)

For production drills, we only use AWS API state manipulation:

```bash
# Force alarm to ALARM state
aws cloudwatch set-alarm-state \
  --alarm-name "${PREFIX}-api-5xx" \
  --state-value ALARM \
  --state-reason "Drill test - validating SNS notification pipeline"

# Wait and verify SNS delivery
sleep 60

# Check that SNS topic received notification
# (Requires SNS subscription to a verifiable endpoint)

# Restore to OK
aws cloudwatch set-alarm-state \
  --alarm-name "${PREFIX}-api-5xx" \
  --state-value OK \
  --state-reason "Drill test complete"
```

### 3.3 Mutation Testing Framework

Create a lightweight mutation framework:

```javascript
// scripts/alarm-validation/mutators.js
const mutations = {
  'throw-error': {
    pattern: /return\s+\{[\s\S]*statusCode:\s*200/,
    replacement: 'throw new Error("ALARM_VALIDATION_CHAOS"); return { statusCode: 200',
  },
  'slow-response': {
    pattern: /exports\.handler\s*=\s*async/,
    replacement: 'exports.handler = async (event) => { await new Promise(r => setTimeout(r, 25000)); return (async',
  },
  'log-error': {
    pattern: /console\.log/,
    replacement: 'console.error("ERROR ALARM_VALIDATION_TEST"); console.log',
  },
  'return-500': {
    pattern: /statusCode:\s*200/,
    replacement: 'statusCode: 500',
  },
};
```

### 3.4 Test Verification Script

```javascript
// scripts/alarm-validation/verify-alarms.js
const { CloudWatchClient, DescribeAlarmsCommand } = require('@aws-sdk/client-cloudwatch');

async function verifyAlarmTransitions(expectedTransitions) {
  const client = new CloudWatchClient({});
  const results = [];

  for (const { alarmName, expectedState } of expectedTransitions) {
    const response = await client.send(new DescribeAlarmsCommand({
      AlarmNames: [alarmName],
    }));

    const actualState = response.MetricAlarms[0]?.StateValue;
    const passed = actualState === expectedState;

    results.push({
      alarmName,
      expectedState,
      actualState,
      passed,
    });
  }

  return results;
}
```

---

## Level 4: Detailed Test Specifications

### 4.1 Code Quality Gate Tests

#### Test CQ-1: Lambda Error Detection
```yaml
name: Lambda Error Detection
id: CQ-1
category: code-quality-gate
alarm: "{functionName}-errors"
preconditions:
  - Alarm in OK state
  - Lambda deployed and invokable
mutation:
  file: "app/functions/{targetFunction}.js"
  type: "throw-error"
  marker: "ALARM_VALIDATION_CQ1"
execution:
  - Deploy mutated Lambda
  - Invoke Lambda 3 times (to ensure metrics)
  - Wait 6 minutes (> 5min evaluation period)
verification:
  - Alarm state = ALARM
  - Alarm reason contains metric breach
  - (Optional) SNS notification received
cleanup:
  - Redeploy original Lambda code
  - Wait for alarm to return to OK
```

#### Test CQ-2: Log-Based Error Detection
```yaml
name: Log-Based Error Detection
id: CQ-2
category: code-quality-gate
alarm: "{functionName}-log-errors"
preconditions:
  - Alarm in OK state
mutation:
  file: "app/functions/{targetFunction}.js"
  type: "log-error"
execution:
  - Deploy mutated Lambda
  - Invoke Lambda 3 times
  - Wait 6 minutes
verification:
  - Alarm state = ALARM
  - CloudWatch Logs Insights shows ERROR pattern
cleanup:
  - Redeploy original Lambda code
```

#### Test CQ-3: Lambda Duration (Approaching Timeout)
```yaml
name: Lambda Duration Alarm
id: CQ-3
category: code-quality-gate
alarm: "{functionName}-high-duration-p95"
mutation:
  file: "app/functions/{targetFunction}.js"
  type: "slow-response"
  # Inject 25s delay (Lambda timeout typically 30s, alarm at 80% = 24s)
execution:
  - Deploy mutated Lambda
  - Invoke Lambda 5 times (for p95 significance)
  - Wait 6 minutes
verification:
  - Alarm state = ALARM
```

### 4.2 Secret Detection Tests

#### Test SD-1: IAM Policy Change Detection
```yaml
name: IAM Policy Change Detection
id: SD-1
category: secret-detection
rule: "{prefix}-iam-policy-changes"
topic: "{prefix}-security-findings"
execution:
  - Create IAM policy with test name
    aws iam create-policy --policy-name "alarm-test-$(date +%s)" \
      --policy-document '{"Version":"2012-10-17","Statement":[]}'
  - Wait 2 minutes (EventBridge propagation)
verification:
  - EventBridge rule triggered (CloudWatch Events metrics)
  - SNS topic received message
  - (If email subscription) Alert email received
cleanup:
  - Delete test IAM policy
```

#### Test SD-2: Access Key Creation Detection
```yaml
name: Access Key Creation Detection
id: SD-2
category: secret-detection
rule: "{prefix}-access-key-creation"
execution:
  - Create test IAM user (if not exists)
  - Create access key for test user
  - Wait 2 minutes
verification:
  - EventBridge rule triggered
  - SNS notification sent
cleanup:
  - Delete access key
  - Delete test user
```

### 4.3 Service Downtime Tests

#### Test DT-1: Health Canary Failure
```yaml
name: Health Canary Failure Detection
id: DT-1
category: downtime
alarm: "{prefix}-health-failed"
canary: "{prefix}-health-check"
mutation:
  # Break the health endpoint
  file: "app/functions/health.js"  # or relevant endpoint
  type: "return-500"
execution:
  - Deploy broken health endpoint
  - Wait 12 minutes (2 × 5min evaluation periods + buffer)
verification:
  - Alarm state = ALARM
  - Canary SuccessPercent < 90%
  - SNS notification to alertTopic
cleanup:
  - Redeploy working health endpoint
  - Wait for alarm to return to OK
```

### 4.4 WAF Throttling Tests

#### Test TH-1: Rate Limit Trigger
```yaml
name: WAF Rate Limit Detection
id: TH-1
category: throttling
alarm: "{prefix}-waf-rate-limit"
region: us-east-1  # WAF alarms are in CloudFront region
preconditions:
  - WAF rate limit: 2000 requests/5min/IP
  - Alarm threshold: 50 blocks/5min
execution:
  - Send 2500 requests from single IP in 4 minutes
    for i in {1..2500}; do curl -s "$BASE_URL" &; done; wait
  - Wait 6 minutes
verification:
  - Alarm state = ALARM
  - WAF BlockedRequests metric > 50
```

#### Test TH-2: SQL Injection Detection
```yaml
name: WAF SQLi Detection
id: TH-2
category: throttling
alarm: "{prefix}-waf-attack-signatures"
execution:
  - Send 10 requests with SQLi payloads
    payloads:
      - "' OR '1'='1"
      - "'; DROP TABLE users; --"
      - "1' AND '1'='1"
  - Wait 6 minutes
verification:
  - Alarm state = ALARM
  - WAF BlockedRequests for CommonRuleSet >= 5
```

### 4.5 Data Breach Detection Tests

#### Test DB-1: GuardDuty Finding Detection
```yaml
name: GuardDuty Finding Detection
id: DB-1
category: data-breach
rule: "{prefix}-guardduty-findings"
execution:
  - Get GuardDuty detector ID
  - Create sample findings
    aws guardduty create-sample-findings \
      --detector-id $DETECTOR_ID \
      --finding-types "UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B"
  - Wait 3 minutes
verification:
  - EventBridge rule triggered
  - SNS notification to securityFindingsTopic
cleanup:
  - Archive sample findings
```

---

## Level 5: Operational Procedures

### 5.1 Running CI Mode

```bash
# Trigger via GitHub CLI
gh workflow run alarm-validation.yml \
  -f mode=ci \
  -f categories=all \
  --ref main

# Monitor
gh run watch
```

### 5.2 Running Production Drill

```bash
# Manual trigger - drill mode only
gh workflow run alarm-validation.yml \
  -f mode=drill \
  -f categories=downtime,throttling \
  --ref main

# This will:
# 1. Record current alarm states
# 2. Use SetAlarmState to force ALARM state
# 3. Verify SNS notifications are delivered
# 4. Restore alarm states to original
# 5. Generate drill report
```

### 5.3 Interpreting Results

The workflow generates a JSON report:

```json
{
  "runId": "12345",
  "mode": "ci",
  "timestamp": "2025-01-22T10:00:00Z",
  "results": {
    "code-quality-gate": {
      "CQ-1": { "passed": true, "alarmTriggered": true, "snsDelivered": true },
      "CQ-2": { "passed": true, "alarmTriggered": true, "snsDelivered": true },
      "CQ-3": { "passed": false, "alarmTriggered": false, "reason": "Duration not high enough" }
    },
    "throttling": {
      "TH-1": { "passed": true, "alarmTriggered": true, "blockedRequests": 487 },
      "TH-2": { "passed": true, "alarmTriggered": true, "blockedRequests": 10 }
    }
  },
  "summary": {
    "total": 12,
    "passed": 11,
    "failed": 1,
    "skipped": 0
  }
}
```

### 5.4 Known Limitations

1. **GuardDuty sample findings** - Limited to AWS-provided sample types
2. **Root account activity** - Cannot test without using root (don't do this)
3. **RUM alarms** - Require browser-side injection, harder to automate
4. **Cross-region alarms** - WAF alarms in us-east-1 require separate handling
5. **Evaluation periods** - Tests require waiting for CloudWatch evaluation windows

---

## Appendix A: Alarm Inventory (from CDK exploration)

| Stack | Alarm Name Pattern | Threshold | SNS Topic |
|-------|-------------------|-----------|-----------|
| Lambda.java | `{fn}-errors` | ≥1/5min | None (silent) |
| Lambda.java | `{fn}-throttles` | ≥1/5min | None (silent) |
| Lambda.java | `{fn}-high-duration-p95` | ≥80% timeout | None (silent) |
| Lambda.java | `{fn}-log-errors` | ≥1/5min | None (silent) |
| ApiStack.java | `{prefix}-api-5xx` | ≥1/5min | None (silent) |
| OpsStack.java | `{prefix}-health-failed` | <90%/5min (2 periods) | alertTopic |
| OpsStack.java | `{prefix}-api-failed` | <90%/5min (2 periods) | alertTopic |
| OpsStack.java | `{prefix}-github-synthetic-failed` | ≥1 (2hr, missing=breaching) | alertTopic |
| ObservabilityStack.java | `{prefix}-rum-lcp-p75` | >4000ms | None (silent) |
| ObservabilityStack.java | `{prefix}-rum-js-errors` | ≥5/5min | None (silent) |
| EdgeStack.java | `{prefix}-waf-rate-limit` | ≥50/5min | None (us-east-1) |
| EdgeStack.java | `{prefix}-waf-attack-signatures` | ≥5/5min | None (us-east-1) |
| EdgeStack.java | `{prefix}-waf-known-bad-inputs` | ≥5/5min | None (us-east-1) |
| AsyncApiLambda.java | `{queue}-not-empty` | >1 message | None (silent) |

## Appendix B: EventBridge Security Rules

| Rule | Event Source | Event Pattern | SNS Topic |
|------|-------------|---------------|-----------|
| `{prefix}-guardduty-findings` | aws.guardduty | GuardDuty Finding | securityFindingsTopic |
| `{prefix}-securityhub-findings` | aws.securityhub | Findings - Imported | securityFindingsTopic |
| `{prefix}-iam-policy-changes` | aws.iam | Create/Attach/Put policy | securityFindingsTopic |
| `{prefix}-security-group-changes` | aws.ec2 | Authorize/Revoke SG | securityFindingsTopic |
| `{prefix}-access-key-creation` | aws.iam | Create/Update AccessKey | securityFindingsTopic |
| `{prefix}-root-account-activity` | CloudTrail | userIdentity.type=Root | securityFindingsTopic |

---

## Next Steps

1. [ ] Create `.github/workflows/alarm-validation.yml` workflow
2. [ ] Create `scripts/alarm-validation/` directory with helper scripts
3. [ ] Add IAM permissions for alarm state manipulation
4. [ ] Create SNS subscription for verification (e.g., SQS queue for checking)
5. [ ] Implement mutation testing framework
6. [ ] Add to CI pipeline (weekly schedule)
7. [ ] Document drill procedures in runbook
