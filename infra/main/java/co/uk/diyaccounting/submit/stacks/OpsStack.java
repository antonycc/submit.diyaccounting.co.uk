/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.AlarmStatusWidget;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.IWidget;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TextWidget;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cloudwatch.actions.SnsAction;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.IFunction;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.EmailSubscription;
import software.amazon.awscdk.services.synthetics.ArtifactsBucketLocation;
import software.amazon.awscdk.services.synthetics.Canary;
import software.amazon.awscdk.services.synthetics.Code;
import software.amazon.awscdk.services.synthetics.CustomTestOptions;
import software.amazon.awscdk.services.synthetics.Runtime;
import software.amazon.awscdk.services.synthetics.Schedule;
import software.amazon.awscdk.services.synthetics.Test;
import software.constructs.Construct;

public class OpsStack extends Stack {

    public final Dashboard operationalDashboard;
    public final Topic alertTopic;
    public final Alarm githubSyntheticAlarm;
    public Canary healthCanary;
    public Canary apiCanary;
    public Alarm healthCheckAlarm;
    public Alarm apiCheckAlarm;

    @Value.Immutable
    public interface OpsStackProps extends StackProps, SubmitStackProps {

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

        List<String> lambdaFunctionArns();

        // Alert configuration
        @Value.Default
        default String alertEmail() {
            return "";
        }

        // Canary configuration
        @Value.Default
        default int canaryIntervalMinutes() {
            return 5;
        }

        // Base URL for canaries (e.g., https://submit.diyaccounting.co.uk)
        @Value.Default
        default String baseUrl() {
            return "";
        }

        // Apex domain for GitHub synthetic metrics namespace (e.g., submit.diyaccounting.co.uk)
        @Value.Default
        default String apexDomain() {
            return "";
        }

        static ImmutableOpsStackProps.Builder builder() {
            return ImmutableOpsStackProps.builder();
        }
    }

    public OpsStack(final Construct scope, final String id, final OpsStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "OpsStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // ============================================================================
        // SNS Topic for Alerts
        // ============================================================================
        this.alertTopic = Topic.Builder.create(this, props.resourceNamePrefix() + "-AlertTopic")
                .topicName(props.resourceNamePrefix() + "-ops-alerts")
                .displayName("DIY Accounting Submit - Operational Alerts")
                .build();

        if (props.alertEmail() != null && !props.alertEmail().isBlank()) {
            this.alertTopic.addSubscription(new EmailSubscription(props.alertEmail()));
            infof("Added email subscription for alerts: %s", props.alertEmail());
        }

        // ============================================================================
        // Import Lambda functions and collect metrics
        // ============================================================================
        List<Metric> lambdaInvocations = new ArrayList<>();
        List<Metric> lambdaErrors = new ArrayList<>();
        List<Metric> lambdaDurationsP95 = new ArrayList<>();
        List<Metric> lambdaThrottles = new ArrayList<>();
        List<String> lambdaFunctionNames = new ArrayList<>();

        if (props.lambdaFunctionArns() != null) {
            for (int i = 0; i < props.lambdaFunctionArns().size(); i++) {
                String arn = props.lambdaFunctionArns().get(i);
                IFunction fn = Function.fromFunctionAttributes(
                        this,
                        props.resourceNamePrefix() + "-Fn-" + i,
                        FunctionAttributes.builder()
                                .functionArn(arn)
                                .sameEnvironment(true)
                                .build());
                lambdaInvocations.add(fn.metricInvocations());
                lambdaErrors.add(fn.metricErrors());
                lambdaDurationsP95.add(
                        fn.metricDuration().with(MetricOptions.builder().statistic("p95").build()));
                lambdaThrottles.add(fn.metricThrottles());
                // Extract function name from ARN for filtering
                String functionName = arn.substring(arn.lastIndexOf(":") + 1);
                lambdaFunctionNames.add(functionName);
            }
        }

        // ============================================================================
        // Synthetic Canaries (if baseUrl provided)
        // ============================================================================
        if (props.baseUrl() != null && !props.baseUrl().isBlank()) {
            createSyntheticCanaries(props);
        }

        // ============================================================================
        // GitHub Actions Synthetic Test Alarm
        // ============================================================================
        String apexDomain =
                props.apexDomain() != null && !props.apexDomain().isBlank() ? props.apexDomain() : "submit.diyaccounting.co.uk";

        this.githubSyntheticAlarm = Alarm.Builder.create(this, "GithubSyntheticAlarm")
                .alarmName(props.resourceNamePrefix() + "-github-synthetic-failed")
                .alarmDescription("GitHub Actions synthetic test has not succeeded in 2 hours")
                .metric(Metric.Builder.create()
                        .namespace(apexDomain)
                        .metricName("behaviour-test")
                        .dimensionsMap(
                                Map.of("deployment-name", props.deploymentName(), "test", "submitVatBehaviour"))
                        .statistic("Minimum")
                        .period(Duration.hours(2))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        this.githubSyntheticAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        this.githubSyntheticAlarm.addOkAction(new SnsAction(this.alertTopic));

        // ============================================================================
        // Build Comprehensive Dashboard
        // ============================================================================
        List<List<IWidget>> rows = new ArrayList<>();

        // Row 1: Synthetic Health (AWS Canaries + GitHub Actions)
        List<IWidget> row1 = new ArrayList<>();

        // AWS Canary Health widget (if canaries exist)
        if (this.healthCanary != null && this.apiCanary != null) {
            String healthCanaryName = this.healthCanary.getCanaryName();
            String apiCanaryName = this.apiCanary.getCanaryName();
            row1.add(GraphWidget.Builder.create()
                    .title("AWS Canary Health")
                    .left(List.of(
                            Metric.Builder.create()
                                    .namespace("CloudWatchSynthetics")
                                    .metricName("SuccessPercent")
                                    .dimensionsMap(Map.of("CanaryName", healthCanaryName))
                                    .statistic("Average")
                                    .period(Duration.minutes(5))
                                    .label("Health Check")
                                    .build(),
                            Metric.Builder.create()
                                    .namespace("CloudWatchSynthetics")
                                    .metricName("SuccessPercent")
                                    .dimensionsMap(Map.of("CanaryName", apiCanaryName))
                                    .statistic("Average")
                                    .period(Duration.minutes(5))
                                    .label("API Check")
                                    .build()))
                    .width(8)
                    .height(6)
                    .build());
        } else {
            row1.add(TextWidget.Builder.create()
                    .markdown("### AWS Canaries\n\nNot configured (set baseUrl)")
                    .width(8)
                    .height(6)
                    .build());
        }

        // GitHub Synthetic Tests widget
        row1.add(GraphWidget.Builder.create()
                .title("GitHub Synthetic Tests")
                .left(List.of(Metric.Builder.create()
                        .namespace(apexDomain)
                        .metricName("behaviour-test")
                        .dimensionsMap(
                                Map.of("deployment-name", props.deploymentName(), "test", "submitVatBehaviour"))
                        .statistic("Minimum")
                        .period(Duration.hours(1))
                        .label("submitVatBehaviour (0=pass)")
                        .build()))
                .width(8)
                .height(6)
                .build());

        // Real User Traffic placeholder (RUM metrics would go here)
        row1.add(TextWidget.Builder.create()
                .markdown("### Real User Traffic\n\n*RUM metrics to be added*\n\n- Page Views\n- Sessions\n- JS Errors")
                .width(8)
                .height(6)
                .build());

        rows.add(row1);

        // Row 2: Business Metrics - find specific Lambda functions
        Metric vatSubmissionMetric = findLambdaMetricByName(props, lambdaFunctionNames, "hmrcVatReturnPost");
        Metric signUpMetric = findLambdaMetricByName(props, lambdaFunctionNames, "cognitoPostConfirmation");
        Metric authMetric = findLambdaMetricByName(props, lambdaFunctionNames, "hmrcTokenPost");
        Metric bundleMetric = findLambdaMetricByName(props, lambdaFunctionNames, "bundlePost");

        List<Metric> businessMetrics1 = new ArrayList<>();
        if (vatSubmissionMetric != null) businessMetrics1.add(vatSubmissionMetric);
        if (signUpMetric != null) businessMetrics1.add(signUpMetric);

        List<Metric> businessMetrics2 = new ArrayList<>();
        if (authMetric != null) businessMetrics2.add(authMetric);
        if (bundleMetric != null) businessMetrics2.add(bundleMetric);

        if (!businessMetrics1.isEmpty() || !businessMetrics2.isEmpty()) {
            rows.add(List.of(
                    GraphWidget.Builder.create()
                            .title("VAT Submissions & Sign-ups")
                            .left(businessMetrics1.isEmpty() ? List.of(createPlaceholderMetric()) : businessMetrics1)
                            .width(12)
                            .height(6)
                            .build(),
                    GraphWidget.Builder.create()
                            .title("HMRC Authentications & Bundle Changes")
                            .left(businessMetrics2.isEmpty() ? List.of(createPlaceholderMetric()) : businessMetrics2)
                            .width(12)
                            .height(6)
                            .build()));
        }

        // Row 3: Lambda Invocations & Errors (existing)
        if (!lambdaInvocations.isEmpty()) {
            rows.add(List.of(
                    GraphWidget.Builder.create()
                            .title("Lambda Invocations by Function")
                            .left(lambdaInvocations)
                            .width(12)
                            .height(6)
                            .build(),
                    GraphWidget.Builder.create()
                            .title("Lambda Errors by Function")
                            .left(lambdaErrors)
                            .width(12)
                            .height(6)
                            .build()));

            // Row 4: Lambda Performance (existing)
            rows.add(List.of(
                    GraphWidget.Builder.create()
                            .title("Lambda p95 Duration by Function")
                            .left(lambdaDurationsP95)
                            .width(12)
                            .height(6)
                            .build(),
                    GraphWidget.Builder.create()
                            .title("Lambda Throttles by Function")
                            .left(lambdaThrottles)
                            .width(12)
                            .height(6)
                            .build()));
        }

        // Row 5: Alarms Status
        List<Alarm> alarms = new ArrayList<>();
        alarms.add(this.githubSyntheticAlarm);
        if (this.healthCheckAlarm != null) alarms.add(this.healthCheckAlarm);
        if (this.apiCheckAlarm != null) alarms.add(this.apiCheckAlarm);

        rows.add(List.of(AlarmStatusWidget.Builder.create()
                .title("Alarm Status")
                .alarms(alarms)
                .width(24)
                .height(4)
                .build()));

        this.operationalDashboard = Dashboard.Builder.create(this, props.resourceNamePrefix() + "-Dashboard")
                .dashboardName(props.resourceNamePrefix() + "-operations")
                .widgets(rows)
                .build();

        // ============================================================================
        // Outputs
        // ============================================================================
        cfnOutput(
                this,
                "OperationalDashboard",
                "https://" + this.getRegion() + ".console.aws.amazon.com/cloudwatch/home?region=" + this.getRegion()
                        + "#dashboards:name=" + this.operationalDashboard.getDashboardName());
        cfnOutput(this, "AlertTopicArn", this.alertTopic.getTopicArn());
        cfnOutput(this, "GithubSyntheticAlarmArn", this.githubSyntheticAlarm.getAlarmArn());

        if (this.healthCanary != null) {
            cfnOutput(this, "HealthCanaryName", this.healthCanary.getCanaryName());
        }
        if (this.apiCanary != null) {
            cfnOutput(this, "ApiCanaryName", this.apiCanary.getCanaryName());
        }

        infof("OpsStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }

    private void createSyntheticCanaries(OpsStackProps props) {
        // Use deployment name for unique canary names (max 21 chars for canary names)
        // Format: {env}-{suffix} e.g., "ci-monitorin-hlth" or "prod-hlth"
        String deploymentPrefix = sanitizeCanaryName(props.deploymentName());

        // S3 bucket for canary artifacts
        Bucket canaryBucket = Bucket.Builder.create(this, "CanaryArtifacts")
                .bucketName(props.resourceNamePrefix().toLowerCase() + "-canary-artifacts")
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(
                        List.of(LifecycleRule.builder().expiration(Duration.days(14)).build()))
                .build();

        // IAM role for canaries
        Role canaryRole = Role.Builder.create(this, "CanaryRole")
                .roleName(props.resourceNamePrefix() + "-canary-role")
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
                        ManagedPolicy.fromAwsManagedPolicyName("CloudWatchSyntheticsFullAccess")))
                .build();
        canaryBucket.grantReadWrite(canaryRole);

        // Health Check Canary - use short suffix to maximize prefix uniqueness
        String healthCanaryName = truncateCanaryName(deploymentPrefix + "-hlth");
        this.healthCanary = Canary.Builder.create(this, "HealthCanary")
                .canaryName(healthCanaryName)
                .runtime(Runtime.SYNTHETICS_NODEJS_PUPPETEER_7_0)
                .test(Test.custom(CustomTestOptions.builder()
                        .handler("index.handler")
                        .code(Code.fromInline(generateHealthCheckCode(props.baseUrl())))
                        .build()))
                .schedule(Schedule.rate(Duration.minutes(props.canaryIntervalMinutes())))
                .role(canaryRole)
                .artifactsBucketLocation(ArtifactsBucketLocation.builder()
                        .bucket(canaryBucket)
                        .prefix("health/")
                        .build())
                .startAfterCreation(true)
                .build();

        // Health Check Alarm
        this.healthCheckAlarm = Alarm.Builder.create(this, "HealthAlarm")
                .alarmName(props.resourceNamePrefix() + "-health-failed")
                .alarmDescription("Health check canary is failing - application may be down")
                .metric(Metric.Builder.create()
                        .namespace("CloudWatchSynthetics")
                        .metricName("SuccessPercent")
                        .dimensionsMap(Map.of("CanaryName", healthCanaryName))
                        .statistic("Average")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(90)
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        this.healthCheckAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        this.healthCheckAlarm.addOkAction(new SnsAction(this.alertTopic));

        // API Check Canary - use short suffix to maximize prefix uniqueness
        String apiCanaryName = truncateCanaryName(deploymentPrefix + "-api");
        this.apiCanary = Canary.Builder.create(this, "ApiCanary")
                .canaryName(apiCanaryName)
                .runtime(Runtime.SYNTHETICS_NODEJS_PUPPETEER_7_0)
                .test(Test.custom(CustomTestOptions.builder()
                        .handler("index.handler")
                        .code(Code.fromInline(generateApiCheckCode(props.baseUrl())))
                        .build()))
                .schedule(Schedule.rate(Duration.minutes(props.canaryIntervalMinutes())))
                .role(canaryRole)
                .artifactsBucketLocation(ArtifactsBucketLocation.builder()
                        .bucket(canaryBucket)
                        .prefix("api/")
                        .build())
                .startAfterCreation(true)
                .build();

        // API Check Alarm
        this.apiCheckAlarm = Alarm.Builder.create(this, "ApiAlarm")
                .alarmName(props.resourceNamePrefix() + "-api-failed")
                .alarmDescription("API check canary is failing - API endpoints may be unavailable")
                .metric(Metric.Builder.create()
                        .namespace("CloudWatchSynthetics")
                        .metricName("SuccessPercent")
                        .dimensionsMap(Map.of("CanaryName", apiCanaryName))
                        .statistic("Average")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(90)
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        this.apiCheckAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        this.apiCheckAlarm.addOkAction(new SnsAction(this.alertTopic));

        cfnOutput(this, "CanaryArtifactsBucket", canaryBucket.getBucketName());
        infof("Created synthetic canaries: %s, %s", healthCanaryName, apiCanaryName);
    }

    private Metric findLambdaMetricByName(OpsStackProps props, List<String> functionNames, String partialName) {
        for (String name : functionNames) {
            if (name.contains(partialName)) {
                return Metric.Builder.create()
                        .namespace("AWS/Lambda")
                        .metricName("Invocations")
                        .dimensionsMap(Map.of("FunctionName", name))
                        .statistic("Sum")
                        .period(Duration.hours(1))
                        .label(partialName)
                        .build();
            }
        }
        return null;
    }

    private Metric createPlaceholderMetric() {
        return Metric.Builder.create()
                .namespace("AWS/Lambda")
                .metricName("Invocations")
                .statistic("Sum")
                .period(Duration.hours(1))
                .label("No data")
                .build();
    }

    private String sanitizeCanaryName(String name) {
        return name.toLowerCase().replaceAll("[^a-z0-9-]", "-").replaceAll("-+", "-");
    }

    private String truncateCanaryName(String name) {
        if (name.length() <= 21) {
            return name;
        }
        return name.substring(0, 21);
    }

    private String generateHealthCheckCode(String baseUrl) {
        return """
            const synthetics = require('Synthetics');
            const log = require('SyntheticsLogger');

            const healthCheck = async function () {
                const baseUrl = '%s';

                // Step 1: Check main page loads
                log.info('Step 1: Checking main page...');
                let page = await synthetics.getPage();
                await page.setUserAgent('DIYAccounting-Synthetic-Monitor/1.0');
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
                const privacyResponse = await page.goto(baseUrl + 'privacy.html', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });

                if (privacyResponse.status() !== 200) {
                    throw new Error(`Privacy page returned status ${privacyResponse.status()}`);
                }
                log.info('Privacy page loaded successfully');

                log.info('Health check completed successfully');
            };

            exports.handler = async () => {
                return await healthCheck();
            };
            """
                .formatted(baseUrl);
    }

    private String generateApiCheckCode(String baseUrl) {
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

                    const req = client.get(urlString, {
                        timeout: 10000,
                        headers: { 'User-Agent': 'DIYAccounting-Synthetic-Monitor/1.0' }
                    }, (res) => {
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
                    const docsResponse = await makeRequest(baseUrl + 'docs/openapi.json');
                    if (docsResponse.status !== 200) {
                        throw new Error(`OpenAPI docs returned status ${docsResponse.status}`);
                    }
                    JSON.parse(docsResponse.data);
                    log.info('OpenAPI docs accessible and valid');
                } catch (error) {
                    log.error('OpenAPI docs check failed: ' + error.message);
                    throw error;
                }

                // Step 2: Check API returns 401 for unauthenticated request (proves API is up)
                log.info('Step 2: Checking API auth enforcement...');
                try {
                    const apiResponse = await makeRequest(baseUrl + 'api/v1/bundles');
                    if (apiResponse.status !== 401 && apiResponse.status !== 403) {
                        throw new Error(`API returned unexpected status ${apiResponse.status}`);
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
            """
                .formatted(baseUrl);
    }
}
