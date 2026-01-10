# Synthetic Monitoring & Operational Dashboard Plan

**Issue**: #445 - Synthetic tests hooked into Alarms are not yet present
**Priority**: Important for HMRC approval
**Author**: Claude
**Date**: January 2026

---

## Overview

Extend the existing OpsStack to provide a comprehensive operational dashboard combining:
1. **Synthetic Canaries** - Automated health checks with alarms
2. **Real User Metrics** - Visitors, page views, errors (from CloudWatch RUM)
3. **Business Metrics** - Sign-ups, form submissions, authentications, bundle changes

The dashboard will clearly separate synthetic test traffic from real human users.

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
           | Alarm:          |      | Alarm:          |      | Alarm:          |
           | Canary Health   |      | API Errors      |      | Auth Failures   |
           +--------+--------+      +--------+--------+      +--------+--------+
                    |                        |                        |
+-------------------+------------------------+------------------------+-------------------+
|                                                                                         |
|                           CloudWatch Dashboard (Extended OpsStack)                      |
|                                                                                         |
|  +----------------------------------+  +----------------------------------+             |
|  | SYNTHETIC HEALTH                 |  | REAL USER TRAFFIC               |             |
|  | - Canary success rate            |  | - RUM page views                |             |
|  | - Canary latency                 |  | - RUM errors                    |             |
|  | - Last run status                |  | - CloudFront requests           |             |
|  +----------------------------------+  +----------------------------------+             |
|                                                                                         |
|  +----------------------------------+  +----------------------------------+             |
|  | BUSINESS METRICS                 |  | INFRASTRUCTURE                  |             |
|  | - Sign-ups (Cognito)             |  | - Lambda invocations            |             |
|  | - VAT submissions (hmrcVatReturn)|  | - Lambda errors                 |             |
|  | - Authentications (HMRC OAuth)   |  | - Lambda duration p95           |             |
|  | - Bundle purchases (bundlePost)  |  | - API Gateway 4xx/5xx           |             |
|  +----------------------------------+  +----------------------------------+             |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

---

## Metrics to Monitor

### 1. Real User Traffic (CloudWatch RUM)

| Metric | Source | Purpose |
|--------|--------|---------|
| Page Views | RUM `PageViewCount` | Track visitor engagement |
| Unique Visitors | RUM `SessionCount` | Daily/weekly active users |
| JS Errors | RUM `JsErrorCount` | Frontend stability |
| HTTP Errors | RUM `HttpErrorCount` | API call failures |
| Performance | RUM `PerformanceNavigationDuration` | Page load times |

### 2. Business Metrics (Lambda Invocations)

| Metric | Lambda Function | Purpose |
|--------|-----------------|---------|
| Sign-ups | `cognitoPostConfirmation` | New user registrations |
| VAT Submissions | `hmrcVatReturnPost` | Successful form submissions |
| HMRC Authentications | `hmrcTokenPost` | OAuth token exchanges |
| Bundle Purchases | `bundlePost` | Bundle activations/changes |
| View VAT Return | `hmrcVatReturnGet` | Read operations |
| View Obligations | `hmrcVatObligationGet` | Obligations lookups |

### 3. Synthetic Health (CloudWatch Synthetics + GitHub Actions)

#### CloudWatch Synthetics Canaries (AWS-hosted)

| Canary | Checks | Frequency |
|--------|--------|-----------|
| Health Check | Main page, privacy, terms load | 5 min |
| API Check | OpenAPI docs, API auth enforcement | 5 min |

#### GitHub Actions Synthetic Tests (synthetic-test.yml)

The `synthetic-test.yml` workflow runs Playwright behaviour tests and publishes metrics to CloudWatch.

| Metric | Namespace | Dimensions | Schedule |
|--------|-----------|------------|----------|
| `behaviour-test` | `{apex-domain}` | `deployment-name`, `test` | Every 57 min |

**Metric values**:
- `0` = Test passed (success)
- Non-zero = Test failed

**Alarm**: Alert if no successful test (value=0) in any 2-hour period.

```java
// GitHub Actions Synthetic Test Alarm
Alarm.Builder.create(this, "GithubSyntheticAlarm")
    .alarmName(props.resourceNamePrefix() + "-github-synthetic-failed")
    .alarmDescription("GitHub Actions synthetic test has not succeeded in 2 hours")
    .metric(Metric.Builder.create()
        .namespace(props.sharedNames().envBaseUrl.replace("https://", ""))
        .metricName("behaviour-test")
        .dimensionsMap(Map.of(
            "deployment-name", props.deploymentName(),
            "test", "submitVatBehaviour"))
        .statistic("Minimum")  // Look for any success (0)
        .period(Duration.hours(2))
        .build())
    .threshold(1)  // Alert if minimum is >= 1 (no successes)
    .evaluationPeriods(1)
    .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
    .treatMissingData(TreatMissingData.BREACHING)  // Missing data = no tests ran
    .build();
```

### 4. Infrastructure Metrics

| Metric | Source | Purpose |
|--------|--------|---------|
| CloudFront Requests | CloudFront | Total traffic volume |
| CloudFront Error Rate | CloudFront `4xxErrorRate`, `5xxErrorRate` | CDN health |
| API Gateway Latency | API Gateway | Backend performance |
| Lambda Throttles | Lambda | Capacity issues |

---

## Implementation: Extend OpsStack

### 1. Updated OpsStackProps

Add new properties to support extended monitoring:

```java
@Value.Immutable
public interface OpsStackProps extends StackProps, SubmitStackProps {
    // ... existing props ...

    List<String> lambdaFunctionArns();

    // New: Alert configuration
    @Value.Default
    default String alertEmail() { return ""; }

    // New: Canary configuration
    @Value.Default
    default int canaryIntervalMinutes() { return 5; }

    // New: RUM App Monitor ID (from ObservabilityStack)
    @Value.Default
    default String rumAppMonitorId() { return ""; }

    // New: CloudFront Distribution ID (from EdgeStack)
    @Value.Default
    default String cloudFrontDistributionId() { return ""; }

    // New: Base URL for canaries
    String baseUrl();
}
```

### 2. Extended OpsStack Constructor

```java
public OpsStack(final Construct scope, final String id, final OpsStackProps props) {
    super(scope, id, props);

    // ... existing tags and Lambda metric collection ...

    // ============================================================================
    // SNS Topic for Alerts
    // ============================================================================
    this.alertTopic = Topic.Builder.create(this, props.resourceNamePrefix() + "-AlertTopic")
            .topicName(props.resourceNamePrefix() + "-ops-alerts")
            .displayName("DIY Accounting Submit - Operational Alerts")
            .build();

    if (props.alertEmail() != null && !props.alertEmail().isBlank()) {
        this.alertTopic.addSubscription(new EmailSubscription(props.alertEmail()));
    }

    // ============================================================================
    // Synthetic Canaries (if baseUrl provided)
    // ============================================================================
    if (props.baseUrl() != null && !props.baseUrl().isBlank()) {
        createSyntheticCanaries(props);
    }

    // ============================================================================
    // Build Comprehensive Dashboard
    // ============================================================================
    buildDashboard(props, lambdaMetrics);
}
```

### 3. Dashboard Layout

```java
private void buildDashboard(OpsStackProps props, LambdaMetrics lambdaMetrics) {
    List<List<IWidget>> rows = new ArrayList<>();

    // Row 1: Synthetic Health (AWS Canaries + GitHub Actions)
    rows.add(List.of(
        // AWS Synthetics canary success rates
        GraphWidget.Builder.create()
            .title("AWS Canary Health")
            .left(List.of(
                createCanaryMetric(healthCanaryName, "SuccessPercent"),
                createCanaryMetric(apiCanaryName, "SuccessPercent")))
            .width(8).height(6).build(),

        // GitHub Actions synthetic test results
        GraphWidget.Builder.create()
            .title("GitHub Synthetic Tests")
            .left(List.of(
                Metric.Builder.create()
                    .namespace(apexDomain)
                    .metricName("behaviour-test")
                    .dimensionsMap(Map.of(
                        "deployment-name", props.deploymentName(),
                        "test", "submitVatBehaviour"))
                    .statistic("Minimum")
                    .period(Duration.hours(1))
                    .build()))
            .width(8).height(6).build(),

        // RUM page views (if configured)
        props.rumAppMonitorId().isBlank() ?
            TextWidget.Builder.create()
                .markdown("RUM not configured").width(8).height(6).build() :
            GraphWidget.Builder.create()
                .title("Real User Traffic (RUM)")
                .left(List.of(
                    createRumMetric(props.rumAppMonitorId(), "PageViewCount"),
                    createRumMetric(props.rumAppMonitorId(), "SessionCount")))
                .width(8).height(6).build()
    ));

    // Row 2: Business Metrics - Submissions & Sign-ups
    rows.add(List.of(
        GraphWidget.Builder.create()
            .title("VAT Submissions & Sign-ups")
            .left(List.of(
                filterLambdaMetric(lambdaMetrics, "hmrcVatReturnPost", "Invocations"),
                filterLambdaMetric(lambdaMetrics, "cognitoPostConfirmation", "Invocations")))
            .width(12).height(6).build(),

        GraphWidget.Builder.create()
            .title("HMRC Authentications & Bundle Changes")
            .left(List.of(
                filterLambdaMetric(lambdaMetrics, "hmrcTokenPost", "Invocations"),
                filterLambdaMetric(lambdaMetrics, "bundlePost", "Invocations")))
            .width(12).height(6).build()
    ));

    // Row 3: Lambda Invocations & Errors (existing)
    rows.add(List.of(
        GraphWidget.Builder.create()
            .title("Lambda Invocations by Function")
            .left(lambdaMetrics.invocations)
            .width(12).height(6).build(),
        GraphWidget.Builder.create()
            .title("Lambda Errors by Function")
            .left(lambdaMetrics.errors)
            .width(12).height(6).build()
    ));

    // Row 4: Lambda Performance (existing)
    rows.add(List.of(
        GraphWidget.Builder.create()
            .title("Lambda p95 Duration")
            .left(lambdaMetrics.durationsP95)
            .width(12).height(6).build(),
        GraphWidget.Builder.create()
            .title("Lambda Throttles")
            .left(lambdaMetrics.throttles)
            .width(12).height(6).build()
    ));

    // Row 5: Alarms Status
    rows.add(List.of(
        AlarmStatusWidget.Builder.create()
            .title("Alarm Status")
            .alarms(List.of(healthCheckAlarm, apiAlarm, githubSyntheticAlarm))
            .width(24).height(4).build()
    ));

    this.operationalDashboard = Dashboard.Builder.create(this,
            props.resourceNamePrefix() + "-Dashboard")
        .dashboardName(props.resourceNamePrefix() + "-operations")
        .widgets(rows)
        .build();
}
```

### 4. Canary Creation Helper

```java
private void createSyntheticCanaries(OpsStackProps props) {
    String canaryPrefix = sanitizeCanaryName(props.resourceNamePrefix());

    // S3 bucket for canary artifacts
    Bucket canaryBucket = Bucket.Builder.create(this, "CanaryArtifacts")
        .bucketName(props.resourceNamePrefix().toLowerCase() + "-canary-artifacts")
        .encryption(BucketEncryption.S3_MANAGED)
        .removalPolicy(RemovalPolicy.DESTROY)
        .autoDeleteObjects(true)
        .lifecycleRules(List.of(LifecycleRule.builder()
            .expiration(Duration.days(14)).build()))
        .build();

    // IAM role for canaries
    Role canaryRole = Role.Builder.create(this, "CanaryRole")
        .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
        .managedPolicies(List.of(
            ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ManagedPolicy.fromAwsManagedPolicyName("CloudWatchSyntheticsFullAccess")))
        .build();
    canaryBucket.grantReadWrite(canaryRole);

    // Health Check Canary
    String healthCanaryName = truncateCanaryName(canaryPrefix + "-health");
    this.healthCanary = Canary.Builder.create(this, "HealthCanary")
        .canaryName(healthCanaryName)
        .runtime(Runtime.SYNTHETICS_NODEJS_PUPPETEER_7_0)
        .test(Test.custom(Map.of(
            "handler", "healthCheck.handler",
            "code", Code.fromInline(generateHealthCheckCode(props.baseUrl())))))
        .schedule(Schedule.rate(Duration.minutes(props.canaryIntervalMinutes())))
        .role(canaryRole)
        .artifactsBucketLocation(ArtifactsBucketLocation.builder()
            .bucket(canaryBucket).prefix("health/").build())
        .startAfterCreation(true)
        .build();

    // Health Check Alarm
    this.healthCheckAlarm = Alarm.Builder.create(this, "HealthAlarm")
        .alarmName(props.resourceNamePrefix() + "-health-failed")
        .metric(Metric.Builder.create()
            .namespace("CloudWatchSynthetics")
            .metricName("SuccessPercent")
            .dimensionsMap(Map.of("CanaryName", healthCanaryName))
            .statistic("Average")
            .period(Duration.minutes(5)).build())
        .threshold(90)
        .evaluationPeriods(2)
        .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
        .treatMissingData(TreatMissingData.BREACHING)
        .build();

    this.healthCheckAlarm.addAlarmAction(new SnsAction(this.alertTopic));
    this.healthCheckAlarm.addOkAction(new SnsAction(this.alertTopic));

    // API Check Canary (similar pattern)
    // ...
}
```

---

## Distinguishing Synthetic vs Human Traffic

### Option A: User-Agent Filtering (Recommended)

Canaries use a distinctive User-Agent header that can be filtered:

```javascript
// In canary code
const page = await synthetics.getPage();
await page.setUserAgent('DIYAccounting-Synthetic-Monitor/1.0');
```

CloudWatch Logs Insights can then filter:
```sql
fields @timestamp, @message
| filter userAgent NOT LIKE 'DIYAccounting-Synthetic%'
| stats count(*) as realUsers by bin(1h)
```

### Option B: Separate RUM App Monitors

Create two RUM app monitors:
- `prod-submit-rum` - Production traffic (excludes synthetic IPs)
- `prod-submit-rum-synthetic` - Synthetic traffic only

### Option C: Custom Dimensions

Add a `TrafficType` dimension to custom metrics:
- `TrafficType=synthetic` for canary requests
- `TrafficType=human` for real users (default)

---

## Implementation Checklist

- [ ] Update `OpsStackProps` with new properties
- [ ] Add SNS topic and email subscription to OpsStack
- [ ] Create AWS synthetic canaries in OpsStack
- [ ] Create alarm for AWS canary failures
- [ ] Create alarm for GitHub synthetic test failures (no success in 2 hours)
- [ ] Add GitHub synthetic test metric widget to dashboard
- [ ] Add RUM metrics to dashboard (if rumAppMonitorId provided)
- [ ] Add business metrics widgets (VAT submissions, sign-ups, etc.)
- [ ] Add alarm status widget (including github-synthetic alarm)
- [ ] Update `SubmitApplication.java` to pass new props
- [ ] Add `ALERT_EMAIL` secret to GitHub
- [ ] Update `deploy.yml` with new environment variables
- [ ] Test on feature branch
- [ ] Verify dashboard shows all metrics correctly
- [ ] Verify GitHub synthetic alarm triggers when tests fail

---

## Cost Estimate

| Resource | Monthly Cost (estimate) |
|----------|------------------------|
| 2 Canaries @ 5-min interval | ~$2.40 |
| S3 Storage (artifacts) | ~$0.10 |
| SNS Notifications | ~$0.10 |
| CloudWatch Alarms (4) | ~$0.40 |
| Dashboard (1) | Free (first 3) |
| **Total** | **~$3.00/month** |

---

## Dashboard Mockup

```
+============================================================================================+
|                           prod-submit-operations Dashboard                                  |
+============================================================================================+

+---------------------------+  +---------------------------+  +---------------------------+
| AWS CANARY HEALTH         |  | GITHUB SYNTHETIC TESTS    |  | REAL USER TRAFFIC (RUM)   |
|                           |  |                           |  |                           |
|  health-canary: 100%      |  |  submitVatBehaviour       |  |  Page Views: 1,234 /day   |
|  api-canary:    100%      |  |  Last success: 45m ago    |  |  Sessions:     456 /day   |
|  [====] [====]            |  |  [====] Pass rate: 98%    |  |  JS Errors:      2 /day   |
+---------------------------+  +---------------------------+  +---------------------------+

+------------------------------------------+  +------------------------------------------+
| VAT SUBMISSIONS & SIGN-UPS               |  | HMRC AUTH & BUNDLE CHANGES               |
|                                          |  |                                          |
|  [Graph: hmrcVatReturnPost invocations]  |  |  [Graph: hmrcTokenPost invocations]      |
|  [Graph: cognitoPostConfirmation]        |  |  [Graph: bundlePost invocations]         |
|                                          |  |                                          |
+------------------------------------------+  +------------------------------------------+

+------------------------------------------+  +------------------------------------------+
| LAMBDA INVOCATIONS                       |  | LAMBDA ERRORS                            |
|                                          |  |                                          |
|  [Stacked graph by function]             |  |  [Stacked graph by function]             |
|                                          |  |                                          |
+------------------------------------------+  +------------------------------------------+

+------------------------------------------+  +------------------------------------------+
| LAMBDA P95 DURATION                      |  | LAMBDA THROTTLES                         |
|                                          |  |                                          |
|  [Line graph by function]                |  |  [Line graph by function]                |
|                                          |  |                                          |
+------------------------------------------+  +------------------------------------------+

+============================================================================================+
| ALARM STATUS                                                                               |
|  [OK] aws-health    [OK] aws-api    [OK] github-synthetic    [OK] error-rate              |
+============================================================================================+
```
