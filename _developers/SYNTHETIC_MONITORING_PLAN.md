# Synthetic Monitoring Implementation Plan

**Issue**: #445 - Synthetic tests hooked into Alarms are not yet present
**Priority**: Important for HMRC approval
**Author**: Claude
**Date**: January 2026

---

## Overview

This document describes the implementation plan for CloudWatch Synthetics canaries with integrated alarms and SNS notifications. The goal is to provide proactive monitoring that detects issues before users report them.

---

## Architecture

```
                                    +-----------------+
                                    |  SNS Topic      |
                                    |  (Alerts)       |
                                    +--------+--------+
                                             |
                    +------------------------+------------------------+
                    |                        |                        |
           +--------v--------+      +--------v--------+      +--------v--------+
           | CloudWatch      |      | CloudWatch      |      | CloudWatch      |
           | Alarm: Health   |      | Alarm: OAuth    |      | Alarm: API      |
           +--------+--------+      +--------+--------+      +--------+--------+
                    |                        |                        |
           +--------v--------+      +--------v--------+      +--------v--------+
           | Canary:         |      | Canary:         |      | Canary:         |
           | Health Check    |      | OAuth Flow      |      | API Endpoints   |
           +-----------------+      +-----------------+      +-----------------+
                    |                        |                        |
                    +------------------------+------------------------+
                                             |
                                    +--------v--------+
                                    | Application     |
                                    | (submit.diyacc..)|
                                    +-----------------+
```

---

## Implementation Details

### 1. New Stack: SyntheticMonitoringStack

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/SyntheticMonitoringStack.java`

```java
/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cloudwatch.actions.SnsAction;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.EmailSubscription;
import software.amazon.awscdk.services.synthetics.Canary;
import software.amazon.awscdk.services.synthetics.Code;
import software.amazon.awscdk.services.synthetics.Runtime;
import software.amazon.awscdk.services.synthetics.Schedule;
import software.amazon.awscdk.services.synthetics.Test;
import software.constructs.Construct;

public class SyntheticMonitoringStack extends Stack {

    public Topic alertTopic;
    public Canary healthCheckCanary;
    public Canary apiCanary;
    public Alarm healthCheckAlarm;
    public Alarm apiAlarm;

    @Value.Immutable
    public interface SyntheticMonitoringStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        // Alert configuration
        String alertEmail();

        // Canary configuration
        int canaryIntervalMinutes();

        static ImmutableSyntheticMonitoringStackProps.Builder builder() {
            return ImmutableSyntheticMonitoringStackProps.builder();
        }
    }

    public SyntheticMonitoringStack(Construct scope, String id, SyntheticMonitoringStackProps props) {
        this(scope, id, null, props);
    }

    public SyntheticMonitoringStack(Construct scope, String id, StackProps stackProps, SyntheticMonitoringStackProps props) {
        super(scope, id, stackProps);

        String baseUrl = props.sharedNames().envBaseUrl;
        String canaryNamePrefix = sanitizeCanaryName(props.resourceNamePrefix());

        // ============================================================================
        // SNS Topic for Alerts
        // ============================================================================
        this.alertTopic = Topic.Builder.create(this, props.resourceNamePrefix() + "-AlertTopic")
                .topicName(props.resourceNamePrefix() + "-synthetic-alerts")
                .displayName("DIY Accounting Submit - Synthetic Monitoring Alerts")
                .build();

        // Add email subscription if configured
        if (props.alertEmail() != null && !props.alertEmail().isBlank()) {
            this.alertTopic.addSubscription(new EmailSubscription(props.alertEmail()));
            infof("Added email subscription for alerts: %s", props.alertEmail());
        }

        // ============================================================================
        // S3 Bucket for Canary Artifacts
        // ============================================================================
        Bucket canaryArtifactsBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-CanaryArtifacts")
                .bucketName(props.resourceNamePrefix().toLowerCase() + "-canary-artifacts")
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(List.of(LifecycleRule.builder()
                        .expiration(Duration.days(30)) // Keep artifacts for 30 days
                        .build()))
                .build();

        // ============================================================================
        // IAM Role for Canaries
        // ============================================================================
        Role canaryRole = Role.Builder.create(this, props.resourceNamePrefix() + "-CanaryRole")
                .roleName(props.resourceNamePrefix() + "-canary-role")
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
                        ManagedPolicy.fromAwsManagedPolicyName("CloudWatchSyntheticsFullAccess")))
                .build();

        canaryArtifactsBucket.grantReadWrite(canaryRole);

        // ============================================================================
        // Canary 1: Health Check
        // ============================================================================
        String healthCheckCanaryName = truncateCanaryName(canaryNamePrefix + "-health");

        this.healthCheckCanary = Canary.Builder.create(this, props.resourceNamePrefix() + "-HealthCanary")
                .canaryName(healthCheckCanaryName)
                .runtime(Runtime.SYNTHETICS_NODEJS_PUPPETEER_7_0)
                .test(Test.custom(Map.of(
                        "handler", "healthCheck.handler",
                        "code", Code.fromInline(generateHealthCheckCanaryCode(baseUrl)))))
                .schedule(Schedule.rate(Duration.minutes(props.canaryIntervalMinutes())))
                .role(canaryRole)
                .artifactsBucketLocation(software.amazon.awscdk.services.synthetics.ArtifactsBucketLocation.builder()
                        .bucket(canaryArtifactsBucket)
                        .prefix("health-check/")
                        .build())
                .startAfterCreation(true)
                .build();

        // Health Check Alarm
        Metric healthCheckSuccessMetric = Metric.Builder.create()
                .namespace("CloudWatchSynthetics")
                .metricName("SuccessPercent")
                .dimensionsMap(Map.of("CanaryName", healthCheckCanaryName))
                .statistic("Average")
                .period(Duration.minutes(5))
                .build();

        this.healthCheckAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-HealthAlarm")
                .alarmName(props.resourceNamePrefix() + "-health-check-failed")
                .alarmDescription("Health check canary is failing - application may be down")
                .metric(healthCheckSuccessMetric)
                .threshold(90) // Alert if success rate drops below 90%
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        this.healthCheckAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        this.healthCheckAlarm.addOkAction(new SnsAction(this.alertTopic));

        // ============================================================================
        // Canary 2: API Endpoints Check
        // ============================================================================
        String apiCanaryName = truncateCanaryName(canaryNamePrefix + "-api");

        this.apiCanary = Canary.Builder.create(this, props.resourceNamePrefix() + "-ApiCanary")
                .canaryName(apiCanaryName)
                .runtime(Runtime.SYNTHETICS_NODEJS_PUPPETEER_7_0)
                .test(Test.custom(Map.of(
                        "handler", "apiCheck.handler",
                        "code", Code.fromInline(generateApiCheckCanaryCode(baseUrl)))))
                .schedule(Schedule.rate(Duration.minutes(props.canaryIntervalMinutes())))
                .role(canaryRole)
                .artifactsBucketLocation(software.amazon.awscdk.services.synthetics.ArtifactsBucketLocation.builder()
                        .bucket(canaryArtifactsBucket)
                        .prefix("api-check/")
                        .build())
                .startAfterCreation(true)
                .build();

        // API Canary Alarm
        Metric apiSuccessMetric = Metric.Builder.create()
                .namespace("CloudWatchSynthetics")
                .metricName("SuccessPercent")
                .dimensionsMap(Map.of("CanaryName", apiCanaryName))
                .statistic("Average")
                .period(Duration.minutes(5))
                .build();

        this.apiAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-ApiAlarm")
                .alarmName(props.resourceNamePrefix() + "-api-check-failed")
                .alarmDescription("API check canary is failing - API endpoints may be unavailable")
                .metric(apiSuccessMetric)
                .threshold(90)
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        this.apiAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        this.apiAlarm.addOkAction(new SnsAction(this.alertTopic));

        // ============================================================================
        // Outputs
        // ============================================================================
        cfnOutput(this, "AlertTopicArn", this.alertTopic.getTopicArn());
        cfnOutput(this, "HealthCheckCanaryName", this.healthCheckCanary.getCanaryName());
        cfnOutput(this, "ApiCanaryName", this.apiCanary.getCanaryName());
        cfnOutput(this, "HealthCheckAlarmArn", this.healthCheckAlarm.getAlarmArn());
        cfnOutput(this, "ApiAlarmArn", this.apiAlarm.getAlarmArn());
        cfnOutput(this, "CanaryArtifactsBucket", canaryArtifactsBucket.getBucketName());

        infof(
                "SyntheticMonitoringStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }

    /**
     * Sanitize the canary name to meet CloudWatch Synthetics requirements.
     * Canary names must be lowercase, alphanumeric, with hyphens only.
     */
    private String sanitizeCanaryName(String name) {
        return name.toLowerCase().replaceAll("[^a-z0-9-]", "-").replaceAll("-+", "-");
    }

    /**
     * Truncate canary name to maximum 21 characters (CloudWatch Synthetics limit).
     */
    private String truncateCanaryName(String name) {
        if (name.length() <= 21) {
            return name;
        }
        return name.substring(0, 21);
    }

    /**
     * Generate the health check canary code.
     * This canary verifies the application is responding and serving content.
     */
    private String generateHealthCheckCanaryCode(String baseUrl) {
        return """
            const { URL } = require('url');
            const synthetics = require('Synthetics');
            const log = require('SyntheticsLogger');

            const healthCheck = async function () {
                const baseUrl = '%s';

                // Step 1: Check main page loads
                log.info('Step 1: Checking main page...');
                let page = await synthetics.getPage();
                const response = await page.goto(baseUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });

                if (response.status() !== 200) {
                    throw new Error(`Main page returned status ${response.status()}`);
                }
                log.info('Main page loaded successfully');

                // Step 2: Check privacy page (static content)
                log.info('Step 2: Checking privacy page...');
                const privacyResponse = await page.goto(baseUrl + '/privacy.html', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });

                if (privacyResponse.status() !== 200) {
                    throw new Error(`Privacy page returned status ${privacyResponse.status()}`);
                }
                log.info('Privacy page loaded successfully');

                // Step 3: Check terms page (static content)
                log.info('Step 3: Checking terms page...');
                const termsResponse = await page.goto(baseUrl + '/terms.html', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });

                if (termsResponse.status() !== 200) {
                    throw new Error(`Terms page returned status ${termsResponse.status()}`);
                }
                log.info('Terms page loaded successfully');

                log.info('Health check completed successfully');
            };

            exports.handler = async () => {
                return await healthCheck();
            };
            """.formatted(baseUrl);
    }

    /**
     * Generate the API check canary code.
     * This canary verifies API endpoints are responding correctly.
     */
    private String generateApiCheckCanaryCode(String baseUrl) {
        return """
            const https = require('https');
            const http = require('http');
            const { URL } = require('url');
            const synthetics = require('Synthetics');
            const log = require('SyntheticsLogger');

            const makeRequest = (urlString) => {
                return new Promise((resolve, reject) => {
                    const url = new URL(urlString);
                    const client = url.protocol === 'https:' ? https : http;

                    const req = client.get(urlString, { timeout: 10000 }, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => resolve({ status: res.statusCode, data }));
                    });

                    req.on('error', reject);
                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error('Request timeout'));
                    });
                });
            };

            const apiCheck = async function () {
                const baseUrl = '%s';

                // Step 1: Check OpenAPI documentation is accessible
                log.info('Step 1: Checking OpenAPI docs endpoint...');
                try {
                    const docsResponse = await makeRequest(baseUrl + '/docs/openapi.json');
                    if (docsResponse.status !== 200) {
                        throw new Error(`OpenAPI docs returned status ${docsResponse.status}`);
                    }
                    // Verify it's valid JSON
                    JSON.parse(docsResponse.data);
                    log.info('OpenAPI docs accessible and valid');
                } catch (error) {
                    log.error('OpenAPI docs check failed: ' + error.message);
                    throw error;
                }

                // Step 2: Check API returns 401 for unauthenticated request (proves API is up)
                log.info('Step 2: Checking API auth enforcement...');
                try {
                    const apiResponse = await makeRequest(baseUrl + '/api/v1/bundles');
                    // We expect 401 Unauthorized for unauthenticated requests
                    if (apiResponse.status !== 401) {
                        log.warn(`API bundles endpoint returned unexpected status ${apiResponse.status}`);
                        // 403 is also acceptable (means API is responding)
                        if (apiResponse.status !== 403) {
                            throw new Error(`API returned unexpected status ${apiResponse.status}`);
                        }
                    }
                    log.info('API is responding correctly (returned expected auth error)');
                } catch (error) {
                    if (error.message.includes('unexpected status')) {
                        throw error;
                    }
                    log.error('API check failed: ' + error.message);
                    throw error;
                }

                log.info('API check completed successfully');
            };

            exports.handler = async () => {
                return await apiCheck();
            };
            """.formatted(baseUrl);
    }
}
```

---

### 2. Integration into SubmitApplication.java

Add the new stack to the application bootstrap:

```java
// In SubmitApplication.java, after other stacks:

// Synthetic Monitoring Stack (only for ci and prod environments)
if ("ci".equals(envName) || "prod".equals(envName)) {
    var syntheticMonitoringStack = new SyntheticMonitoringStack(
            app,
            sharedNames.syntheticMonitoringStackName,
            SyntheticMonitoringStackProps.builder()
                    .env(defaultEnv)
                    .envName(envName)
                    .deploymentName(deploymentName)
                    .resourceNamePrefix(sharedNames.resourceNamePrefix)
                    .cloudTrailEnabled(String.valueOf(props.cloudTrailEnabled()))
                    .sharedNames(sharedNames)
                    .alertEmail(envOr("ALERT_EMAIL", ""))
                    .canaryIntervalMinutes(Integer.parseInt(envOr("CANARY_INTERVAL_MINUTES", "5")))
                    .build());
    infof("Created SyntheticMonitoringStack: %s", syntheticMonitoringStack.getStackName());
}
```

---

### 3. Update SubmitSharedNames.java

Add new shared names:

```java
// Add to SubmitSharedNames.java:

public final String syntheticMonitoringStackName;
public final String alertTopicName;
public final String canaryArtifactsBucketName;

// In constructor:
this.syntheticMonitoringStackName = String.format("%s-app-SyntheticMonitoringStack", resourceNamePrefix);
this.alertTopicName = String.format("%s-synthetic-alerts", resourceNamePrefix);
this.canaryArtifactsBucketName = String.format("%s-canary-artifacts", resourceNamePrefix.toLowerCase());
```

---

### 4. GitHub Actions Workflow Updates

Add environment variable for alert email in deploy.yml:

```yaml
env:
  ALERT_EMAIL: ${{ secrets.ALERT_EMAIL }}
  CANARY_INTERVAL_MINUTES: '5'
```

---

## Canary Details

### Health Check Canary

**Purpose**: Verify the web application is accessible and serving content.

**Checks**:
1. Main page loads with HTTP 200
2. Privacy page loads with HTTP 200
3. Terms page loads with HTTP 200

**Frequency**: Every 5 minutes (configurable)

**Alarm Threshold**: Alert if success rate drops below 90% for 2 consecutive periods.

### API Check Canary

**Purpose**: Verify API endpoints are responding correctly.

**Checks**:
1. OpenAPI documentation is accessible and valid JSON
2. API returns expected authentication error (401/403) for unauthenticated requests

**Frequency**: Every 5 minutes (configurable)

**Alarm Threshold**: Alert if success rate drops below 90% for 2 consecutive periods.

---

## Future Enhancements

### OAuth Flow Canary (Phase 2)

A more comprehensive canary that tests the full OAuth flow with HMRC sandbox:

```javascript
// Requires HMRC sandbox credentials stored in Secrets Manager
// Would test:
// 1. Initiate OAuth flow
// 2. Complete authorization (with test user)
// 3. Exchange code for token
// 4. Make authenticated API call
```

This would require:
- Test user credentials in Secrets Manager
- More complex canary code with Puppeteer automation
- Longer timeout and less frequent execution (every 30 minutes)

### VAT Submission Canary (Phase 3)

End-to-end test that submits a VAT return to sandbox and verifies the receipt.

---

## Cost Estimate

| Resource | Monthly Cost (estimate) |
|----------|------------------------|
| 2 Canaries @ 5-min interval | ~$2.40 |
| S3 Storage (artifacts) | ~$0.10 |
| SNS Notifications | ~$0.10 |
| CloudWatch Alarms | ~$0.20 |
| **Total** | **~$2.80/month** |

---

## Testing Plan

1. Deploy to feature branch first
2. Verify canaries execute successfully in CloudWatch console
3. Manually trigger alarm state to test SNS notifications
4. Verify email delivery
5. Monitor for 24 hours before merging to main

---

## Rollback Plan

If issues occur:
1. Delete the SyntheticMonitoringStack via CloudFormation
2. Canaries and alarms will be removed
3. S3 bucket will be emptied and deleted (autoDeleteObjects: true)

---

## Implementation Checklist

- [ ] Create `SyntheticMonitoringStack.java`
- [ ] Update `SubmitSharedNames.java` with new names
- [ ] Update `SubmitApplication.java` to include new stack
- [ ] Add `ALERT_EMAIL` secret to GitHub repository
- [ ] Update `deploy.yml` with new environment variables
- [ ] Test deployment on feature branch
- [ ] Verify canary execution in CloudWatch
- [ ] Test alarm notifications
- [ ] Merge to main
- [ ] Verify prod deployment
