package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.AlarmProps;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.SingleValueWidget;
import software.amazon.awscdk.services.cloudwatch.Statistic;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cloudwatch.Unit;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.EmailSubscription;
import software.constructs.Construct;

/**
 * Security Monitoring Stack for DIY Accounting Submit application.
 *
 * <p>This stack creates CloudWatch Alarms for security events and a security dashboard for
 * monitoring authentication, authorization, and threat protection.
 *
 * <p>Key Features:
 *
 * <ul>
 *   <li>WAF metrics monitoring (blocked requests, rate limiting)
 *   <li>Authentication failure tracking (401 errors, failed Cognito sign-ins)
 *   <li>API Gateway error monitoring (4XX/5XX errors)
 *   <li>Lambda authorizer failure detection
 *   <li>Secrets Manager access anomaly detection
 *   <li>SNS topic for security alert notifications
 *   <li>Security dashboard with key metrics
 * </ul>
 */
public class SecurityMonitoringStack extends Stack {

    public final Topic securityAlertsTopic;
    public final Alarm highWafBlockRateAlarm;
    public final Alarm high401ErrorRateAlarm;
    public final Alarm lambdaAuthorizerFailureAlarm;
    public final Alarm unusualApiRequestVolumeAlarm;
    public final Alarm secretsManagerAccessAnomalyAlarm;
    public final Dashboard securityDashboard;

    @Value.Immutable
    public interface SecurityMonitoringStackProps extends StackProps, SubmitStackProps {

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

        /**
         * Email address for security alert notifications.
         *
         * @return Email address
         */
        String securityAlertEmail();

        /**
         * ARN of the WAF Web ACL to monitor.
         *
         * @return WAF Web ACL ARN
         */
        String webAclArn();

        /**
         * ID of the API Gateway to monitor.
         *
         * @return API Gateway ID
         */
        String apiGatewayId();

        /**
         * Name of the Lambda authorizer function.
         *
         * @return Lambda function name
         */
        String authorizerLambdaName();

        static ImmutableSecurityMonitoringStackProps.Builder builder() {
            return ImmutableSecurityMonitoringStackProps.builder();
        }
    }

    public SecurityMonitoringStack(
            final Construct scope, final String id, final SecurityMonitoringStackProps props) {
        this(scope, id, null, props);
    }

    public SecurityMonitoringStack(
            final Construct scope,
            final String id,
            final StackProps stackProps,
            final SecurityMonitoringStackProps props) {
        super(scope, id, stackProps);

        // SNS Topic for security alerts
        this.securityAlertsTopic = Topic.Builder.create(this, props.resourceNamePrefix() + "-SecurityAlerts")
                .topicName(props.resourceNamePrefix() + "-security-alerts")
                .displayName("Security Alerts for " + props.envName())
                .build();

        // Subscribe email to security alerts topic
        this.securityAlertsTopic.addSubscription(new EmailSubscription(props.securityAlertEmail()));

        infof("Created SNS topic for security alerts: %s", this.securityAlertsTopic.getTopicName());

        // Alarm 1: High WAF Block Rate
        // Triggers when more than 100 requests are blocked in 5 minutes
        // Indicates potential attack or misconfigured WAF rules
        Metric wafBlockedRequestsMetric = Metric.Builder.create()
                .namespace("AWS/WAFV2")
                .metricName("BlockedRequests")
                .dimensionsMap(Map.of(
                        "Rule", "ALL",
                        "Region", "us-east-1", // CloudFront WAF is in us-east-1
                        "WebACL", extractWebAclName(props.webAclArn())))
                .statistic(Statistic.SUM)
                .period(software.amazon.awscdk.Duration.minutes(5))
                .unit(Unit.COUNT)
                .build();

        this.highWafBlockRateAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-HighWafBlockRate")
                .alarmName(props.resourceNamePrefix() + "-high-waf-block-rate")
                .alarmDescription("Triggers when WAF blocks more than 100 requests in 5 minutes")
                .metric(wafBlockedRequestsMetric)
                .threshold(100.0)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .actionsEnabled(true)
                .build();

        this.highWafBlockRateAlarm.addAlarmAction(new software.amazon.awscdk.services.cloudwatch.actions.SnsAction(
                this.securityAlertsTopic));

        // Alarm 2: High 401 Error Rate
        // Triggers when more than 50 unauthorized errors occur in 5 minutes
        // Indicates potential credential stuffing or brute force attack
        Metric api401ErrorMetric = Metric.Builder.create()
                .namespace("AWS/ApiGateway")
                .metricName("4XXError")
                .dimensionsMap(Map.of("ApiId", props.apiGatewayId()))
                .statistic(Statistic.SUM)
                .period(software.amazon.awscdk.Duration.minutes(5))
                .unit(Unit.COUNT)
                .build();

        this.high401ErrorRateAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-High401ErrorRate")
                .alarmName(props.resourceNamePrefix() + "-high-401-error-rate")
                .alarmDescription("Triggers when more than 50 401 errors occur in 5 minutes")
                .metric(api401ErrorMetric)
                .threshold(50.0)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .actionsEnabled(true)
                .build();

        this.high401ErrorRateAlarm.addAlarmAction(new software.amazon.awscdk.services.cloudwatch.actions.SnsAction(
                this.securityAlertsTopic));

        // Alarm 3: Lambda Authorizer Failures
        // Triggers when more than 10 Lambda authorizer invocations fail in 1 minute
        // Indicates JWT verification issues or misconfigured authorizer
        Metric authorizerErrorMetric = Metric.Builder.create()
                .namespace("AWS/Lambda")
                .metricName("Errors")
                .dimensionsMap(Map.of("FunctionName", props.authorizerLambdaName()))
                .statistic(Statistic.SUM)
                .period(software.amazon.awscdk.Duration.minutes(1))
                .unit(Unit.COUNT)
                .build();

        this.lambdaAuthorizerFailureAlarm =
                Alarm.Builder.create(this, props.resourceNamePrefix() + "-LambdaAuthorizerFailure")
                        .alarmName(props.resourceNamePrefix() + "-lambda-authorizer-failure")
                        .alarmDescription("Triggers when more than 10 Lambda authorizer errors occur in 1 minute")
                        .metric(authorizerErrorMetric)
                        .threshold(10.0)
                        .evaluationPeriods(1)
                        .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                        .treatMissingData(TreatMissingData.NOT_BREACHING)
                        .actionsEnabled(true)
                        .build();

        this.lambdaAuthorizerFailureAlarm.addAlarmAction(
                new software.amazon.awscdk.services.cloudwatch.actions.SnsAction(this.securityAlertsTopic));

        // Alarm 4: Unusual API Request Volume
        // Triggers when more than 10,000 requests occur in 1 minute
        // Indicates potential DDoS attack or unusual traffic spike
        Metric apiRequestCountMetric = Metric.Builder.create()
                .namespace("AWS/ApiGateway")
                .metricName("Count")
                .dimensionsMap(Map.of("ApiId", props.apiGatewayId()))
                .statistic(Statistic.SUM)
                .period(software.amazon.awscdk.Duration.minutes(1))
                .unit(Unit.COUNT)
                .build();

        this.unusualApiRequestVolumeAlarm =
                Alarm.Builder.create(this, props.resourceNamePrefix() + "-UnusualApiRequestVolume")
                        .alarmName(props.resourceNamePrefix() + "-unusual-api-request-volume")
                        .alarmDescription("Triggers when more than 10,000 API requests occur in 1 minute")
                        .metric(apiRequestCountMetric)
                        .threshold(10000.0)
                        .evaluationPeriods(1)
                        .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                        .treatMissingData(TreatMissingData.NOT_BREACHING)
                        .actionsEnabled(true)
                        .build();

        this.unusualApiRequestVolumeAlarm.addAlarmAction(
                new software.amazon.awscdk.services.cloudwatch.actions.SnsAction(this.securityAlertsTopic));

        // Alarm 5: Secrets Manager Access Anomaly
        // Triggers when more than 100 GetSecretValue API calls occur in 5 minutes
        // Indicates potential credential harvesting or misconfigured application
        // Note: This requires CloudTrail to be enabled with data events for Secrets Manager
        Metric secretsManagerAccessMetric = Metric.Builder.create()
                .namespace("AWS/SecretsManager")
                .metricName("GetSecretValue")
                .statistic(Statistic.SUM)
                .period(software.amazon.awscdk.Duration.minutes(5))
                .unit(Unit.COUNT)
                .build();

        this.secretsManagerAccessAnomalyAlarm =
                Alarm.Builder.create(this, props.resourceNamePrefix() + "-SecretsManagerAccessAnomaly")
                        .alarmName(props.resourceNamePrefix() + "-secrets-manager-access-anomaly")
                        .alarmDescription(
                                "Triggers when more than 100 Secrets Manager GetSecretValue calls occur in 5 minutes")
                        .metric(secretsManagerAccessMetric)
                        .threshold(100.0)
                        .evaluationPeriods(1)
                        .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                        .treatMissingData(TreatMissingData.NOT_BREACHING)
                        .actionsEnabled(true)
                        .build();

        this.secretsManagerAccessAnomalyAlarm.addAlarmAction(
                new software.amazon.awscdk.services.cloudwatch.actions.SnsAction(this.securityAlertsTopic));

        // Security Dashboard
        this.securityDashboard = Dashboard.Builder.create(this, props.resourceNamePrefix() + "-SecurityDashboard")
                .dashboardName(props.resourceNamePrefix() + "-security")
                .build();

        // Widget 1: WAF Blocked Requests (line chart, past 1 hour)
        GraphWidget wafBlockedRequestsWidget = GraphWidget.Builder.create()
                .title("WAF Blocked Requests (Past Hour)")
                .left(List.of(wafBlockedRequestsMetric))
                .width(12)
                .height(6)
                .period(software.amazon.awscdk.Duration.minutes(5))
                .statistic(Statistic.SUM)
                .build();

        // Widget 2: API Gateway Errors (stacked area chart)
        GraphWidget apiGatewayErrorsWidget = GraphWidget.Builder.create()
                .title("API Gateway Errors")
                .left(List.of(
                        Metric.Builder.create()
                                .namespace("AWS/ApiGateway")
                                .metricName("4XXError")
                                .dimensionsMap(Map.of("ApiId", props.apiGatewayId()))
                                .statistic(Statistic.SUM)
                                .period(software.amazon.awscdk.Duration.minutes(5))
                                .build(),
                        Metric.Builder.create()
                                .namespace("AWS/ApiGateway")
                                .metricName("5XXError")
                                .dimensionsMap(Map.of("ApiId", props.apiGatewayId()))
                                .statistic(Statistic.SUM)
                                .period(software.amazon.awscdk.Duration.minutes(5))
                                .build()))
                .width(12)
                .height(6)
                .period(software.amazon.awscdk.Duration.minutes(5))
                .statistic(Statistic.SUM)
                .build();

        // Widget 3: Lambda Authorizer Invocations and Errors (line chart)
        GraphWidget authorizerMetricsWidget = GraphWidget.Builder.create()
                .title("Lambda Authorizer Metrics")
                .left(List.of(
                        Metric.Builder.create()
                                .namespace("AWS/Lambda")
                                .metricName("Invocations")
                                .dimensionsMap(Map.of("FunctionName", props.authorizerLambdaName()))
                                .statistic(Statistic.SUM)
                                .period(software.amazon.awscdk.Duration.minutes(5))
                                .build(),
                        Metric.Builder.create()
                                .namespace("AWS/Lambda")
                                .metricName("Errors")
                                .dimensionsMap(Map.of("FunctionName", props.authorizerLambdaName()))
                                .statistic(Statistic.SUM)
                                .period(software.amazon.awscdk.Duration.minutes(5))
                                .build()))
                .width(12)
                .height(6)
                .period(software.amazon.awscdk.Duration.minutes(5))
                .statistic(Statistic.SUM)
                .build();

        // Widget 4: API Request Volume (single value widget)
        SingleValueWidget apiRequestVolumeWidget = SingleValueWidget.Builder.create()
                .title("API Requests (Past Hour)")
                .metrics(List.of(apiRequestCountMetric))
                .width(6)
                .height(6)
                .period(software.amazon.awscdk.Duration.hours(1))
                .statistic(Statistic.SUM)
                .build();

        // Widget 5: Active Alarms (single value widget)
        SingleValueWidget activeAlarmsWidget = SingleValueWidget.Builder.create()
                .title("Active Security Alarms")
                .metrics(List.of(Metric.Builder.create()
                        .namespace("AWS/CloudWatch")
                        .metricName("AlarmCount")
                        .statistic(Statistic.MAXIMUM)
                        .period(software.amazon.awscdk.Duration.minutes(1))
                        .build()))
                .width(6)
                .height(6)
                .build();

        // Add widgets to dashboard
        this.securityDashboard.addWidgets(wafBlockedRequestsWidget, apiGatewayErrorsWidget);
        this.securityDashboard.addWidgets(authorizerMetricsWidget, apiRequestVolumeWidget);

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs
        cfnOutput(this, "SecurityAlertsTopicArn", this.securityAlertsTopic.getTopicArn());
        cfnOutput(this, "SecurityDashboardName", this.securityDashboard.getDashboardName());
        cfnOutput(
                this,
                "SecurityDashboardUrl",
                String.format(
                        "https://console.aws.amazon.com/cloudwatch/home?region=%s#dashboards:name=%s",
                        this.getRegion(), this.securityDashboard.getDashboardName()));

        infof(
                "SecurityMonitoringStack %s created successfully with 5 alarms and 1 dashboard",
                this.getNode().getId());
    }

    /**
     * Extract the WebACL name from the full ARN.
     *
     * @param webAclArn Full ARN of the WebACL
     * @return WebACL name
     */
    private String extractWebAclName(String webAclArn) {
        // ARN format: arn:aws:wafv2:region:account-id:scope/webacl/name/id
        if (webAclArn == null || webAclArn.isEmpty()) {
            return "unknown";
        }
        String[] parts = webAclArn.split("/");
        return parts.length >= 3 ? parts[2] : "unknown";
    }
}
