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
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cloudwatch.actions.SnsAction;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
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
import software.amazon.awscdk.services.logs.FilterPattern;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.MetricFilter;
import software.constructs.Construct;

public class OpsStack extends Stack {

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
        // Synthetic Canaries (if baseUrl provided)
        // ============================================================================
        if (props.baseUrl() != null && !props.baseUrl().isBlank()) {
            createSyntheticCanaries(props);
        }

        // ============================================================================
        // GitHub Actions Synthetic Test Alarm
        // ============================================================================
        String apexDomain = props.apexDomain() != null && !props.apexDomain().isBlank()
                ? props.apexDomain()
                : "submit.diyaccounting.co.uk";

        this.githubSyntheticAlarm = Alarm.Builder.create(this, "GithubSyntheticAlarm")
                .alarmName(props.resourceNamePrefix() + "-github-synthetic-failed")
                .alarmDescription("GitHub Actions synthetic test has not succeeded in 2 hours")
                .metric(Metric.Builder.create()
                        .namespace(apexDomain)
                        .metricName("behaviour-test")
                        .dimensionsMap(Map.of("deployment-name", props.deploymentName(), "test", "submitVatBehaviour"))
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
        // Security Detection Alarms - Phase 1.1 Authentication Failure Alerting
        // ============================================================================
        // Create log group reference for the custom authorizer Lambda function
        // The actual log group is created by Lambda; we reference it here for metric filters
        // Log group naming pattern: /aws/lambda/{env}-{hash}-submit-{domain}-app-custom-authorizer
        String authorizerLogGroupName = "/aws/lambda/" + props.envName() + "-" + props.deploymentName()
                + "-submit-" + props.sharedNames().dashedDeploymentDomainName + "-app-custom-authorizer";

        software.amazon.awscdk.services.logs.ILogGroup authorizerLogGroup = LogGroup.fromLogGroupName(
                this, props.resourceNamePrefix() + "-AuthLogGroupRef", authorizerLogGroupName);

        // Metric filter for authentication failures (WARN and ERROR levels in Pino JSON logs)
        // The custom authorizer logs authentication failures as WARN (missing header, invalid format)
        // and ERROR (JWT verification failure, token validation error)
        MetricFilter authFailureFilter = MetricFilter.Builder.create(this, props.resourceNamePrefix() + "-AuthFailure")
                .logGroup(authorizerLogGroup)
                .filterPattern(FilterPattern.any(
                        FilterPattern.stringValue("$.level", "=", "warn"),
                        FilterPattern.stringValue("$.level", "=", "error")))
                .metricNamespace("Submit/Security")
                .metricName("AuthFailures")
                .metricValue("1")
                .defaultValue(0)
                .build();

        // Alarm: 10+ auth failures in 5 minutes indicates possible credential stuffing attack
        Alarm authFailureAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-AuthFailureAlarm")
                .alarmName(props.resourceNamePrefix() + "-auth-failures")
                .alarmDescription(
                        "10+ authentication failures in 5 minutes - possible credential stuffing or brute force attack")
                .metric(Metric.Builder.create()
                        .namespace("Submit/Security")
                        .metricName("AuthFailures")
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(10)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        authFailureAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        authFailureAlarm.addOkAction(new SnsAction(this.alertTopic));
        infof("Created auth failure alarm with SNS notifications");

        // ============================================================================
        // Security Detection Alarms - Phase 2.3 HMRC API Failure Alerting
        // ============================================================================
        // Monitor for 401/403 responses from HMRC API which may indicate:
        // - Token compromise or revocation
        // - Account takeover attempts
        // - Scope/permission issues requiring attention
        String hmrcTokenLogGroupName = "/aws/lambda/" + props.envName() + "-" + props.deploymentName()
                + "-submit-" + props.sharedNames().dashedDeploymentDomainName + "-app-hmrc-token-post-ingest-handler";

        software.amazon.awscdk.services.logs.ILogGroup hmrcTokenLogGroup = LogGroup.fromLogGroupName(
                this, props.resourceNamePrefix() + "-HmrcTokenLogGroupRef", hmrcTokenLogGroupName);

        // Metric filter for HMRC authentication failures (401 Unauthorized responses)
        MetricFilter hmrcAuthFailureFilter =
                MetricFilter.Builder.create(this, props.resourceNamePrefix() + "-HmrcAuthFailure")
                        .logGroup(hmrcTokenLogGroup)
                        .filterPattern(FilterPattern.literal("\"statusCode\":401"))
                        .metricNamespace("Submit/Security")
                        .metricName("HmrcAuthFailures")
                        .metricValue("1")
                        .defaultValue(0)
                        .build();

        // Alarm: 5+ HMRC auth failures in 15 minutes indicates token issues
        Alarm hmrcAuthFailureAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-HmrcAuthFailureAlarm")
                .alarmName(props.resourceNamePrefix() + "-hmrc-auth-failures")
                .alarmDescription(
                        "5+ HMRC API 401 responses in 15 minutes - possible token compromise or revocation")
                .metric(Metric.Builder.create()
                        .namespace("Submit/Security")
                        .metricName("HmrcAuthFailures")
                        .statistic("Sum")
                        .period(Duration.minutes(15))
                        .build())
                .threshold(5)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        hmrcAuthFailureAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        hmrcAuthFailureAlarm.addOkAction(new SnsAction(this.alertTopic));
        infof("Created HMRC auth failure alarm with SNS notifications");

        // ============================================================================
        // Outputs
        // ============================================================================
        cfnOutput(this, "AlertTopicArn", this.alertTopic.getTopicArn());
        cfnOutput(this, "GithubSyntheticAlarmArn", this.githubSyntheticAlarm.getAlarmArn());
        cfnOutput(this, "AuthFailureAlarmArn", authFailureAlarm.getAlarmArn());
        cfnOutput(this, "HmrcAuthFailureAlarmArn", hmrcAuthFailureAlarm.getAlarmArn());

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
                .lifecycleRules(List.of(
                        LifecycleRule.builder().expiration(Duration.days(14)).build()))
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
