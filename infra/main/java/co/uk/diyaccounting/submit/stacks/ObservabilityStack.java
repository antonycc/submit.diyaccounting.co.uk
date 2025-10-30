package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.utils.RetentionDaysConverter;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cognito.CfnIdentityPool;
import software.amazon.awscdk.services.cognito.CfnIdentityPoolRoleAttachment;
import software.amazon.awscdk.services.iam.FederatedPrincipal;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.rum.CfnAppMonitor;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.constructs.Construct;

public class ObservabilityStack extends Stack {

    public Bucket trailBucket;
    public Trail trail;
    public LogGroup cloudTrailLogGroup;
    public LogGroup selfDestructLogGroup;
    public LogGroup apiAccessLogGroup;

    @Value.Immutable
    public interface ObservabilityStackProps extends StackProps, SubmitStackProps {

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

        //@Override
        //String compressedResourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String cloudTrailLogGroupPrefix();

        String cloudTrailLogGroupRetentionPeriodDays();

        int accessLogGroupRetentionPeriodDays();

        static ImmutableObservabilityStackProps.Builder builder() {
            return ImmutableObservabilityStackProps.builder();
        }
    }

    public ObservabilityStack(Construct scope, String id, ObservabilityStackProps props) {
        this(scope, id, null, props);
    }

    public ObservabilityStack(Construct scope, String id, StackProps stackProps, ObservabilityStackProps props) {
        super(scope, id, stackProps);

        boolean cloudTrailEnabled = Boolean.parseBoolean(props.cloudTrailEnabled());
        int cloudTrailLogGroupRetentionPeriodDays = Integer.parseInt(props.cloudTrailLogGroupRetentionPeriodDays());

        // Create a CloudTrail for the stack resources
        RetentionDays cloudTrailLogGroupRetentionPeriod =
                RetentionDaysConverter.daysToRetentionDays(cloudTrailLogGroupRetentionPeriodDays);
        if (cloudTrailEnabled) {
            this.cloudTrailLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-CloudTrailGroup")
                    .logGroupName(
                            "%s%s-cloud-trail".formatted(props.cloudTrailLogGroupPrefix(), props.resourceNamePrefix()))
                    .retention(cloudTrailLogGroupRetentionPeriod)
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .build();
            this.trailBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-CloudTrailBucket")
                    .encryption(BucketEncryption.S3_MANAGED)
                    .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                    .versioned(false)
                    .autoDeleteObjects(true)
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .lifecycleRules(List.of(LifecycleRule.builder()
                            .expiration(Duration.days(cloudTrailLogGroupRetentionPeriodDays))
                            .build()))
                    .build();
            this.trail = Trail.Builder.create(this, props.resourceNamePrefix() + "-Trail")
                    .trailName(props.sharedNames().trailName)
                    .cloudWatchLogGroup(this.cloudTrailLogGroup)
                    .sendToCloudWatchLogs(true)
                    .cloudWatchLogsRetention(cloudTrailLogGroupRetentionPeriod)
                    .includeGlobalServiceEvents(false)
                    .isMultiRegionTrail(false)
                    .build();

            // Outputs for Observability resources
            cfnOutput(this, "TrailBucketArn", this.trailBucket.getBucketArn());
            cfnOutput(this, "TrailArn", this.trail.getTrailArn());
        }

        // Log group for self-destruct operations with 1-week retention
        this.selfDestructLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-SelfDestructLogGroup")
                .logGroupName(props.sharedNames().ew2SelfDestructLogGroupName)
                .retention(RetentionDays.ONE_WEEK) // Longer retention for operations
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // API Gateway access log group with env-stable name and configurable retention
        this.apiAccessLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-ApiAccessLogGroup")
                .logGroupName(props.sharedNames().apiAccessLogGroupName)
                .retention(RetentionDaysConverter.daysToRetentionDays(props.accessLogGroupRetentionPeriodDays()))
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        infof(
                "ObservabilityStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs for Observability resources
        cfnOutput(this, "SelfDestructLogGroupArn", this.selfDestructLogGroup.getLogGroupArn());
        cfnOutput(this, "ApiAccessLogGroupArn", this.apiAccessLogGroup.getLogGroupArn());

        // ------------------ CloudWatch RUM (Real User Monitoring) ------------------
        // Create Cognito Identity Pool for unauthenticated identities used by RUM web client
        CfnIdentityPool rumIdentityPool = CfnIdentityPool.Builder.create(
                        this, props.resourceNamePrefix() + "-RumIdentityPool")
                .allowUnauthenticatedIdentities(true)
                .build();

        // Role for unauthenticated identities allowing PutRumEvents
        Role rumGuestRole = Role.Builder.create(this, props.resourceNamePrefix() + "-RumGuestRole")
                .assumedBy(new FederatedPrincipal(
                        "cognito-identity.amazonaws.com",
                        Map.of(
                                "StringEquals", Map.of("cognito-identity.amazonaws.com:aud", rumIdentityPool.getRef()),
                                "ForAnyValue:StringLike",
                                        Map.of("cognito-identity.amazonaws.com:amr", "unauthenticated")),
                        "sts:AssumeRoleWithWebIdentity"))
                .build();
        rumGuestRole.addToPolicy(PolicyStatement.Builder.create()
                .actions(List.of("rum:PutRumEvents"))
                .resources(List.of("*"))
                .build());

        // Attach role to Identity Pool
        CfnIdentityPoolRoleAttachment.Builder.create(this, props.resourceNamePrefix() + "-RumIdentityPoolRole")
                .identityPoolId(rumIdentityPool.getRef())
                .roles(Map.of("unauthenticated", rumGuestRole.getRoleArn()))
                .build();

        // Create RUM App Monitor
        String rumAppName = props.resourceNamePrefix() + "-rum";
        CfnAppMonitor rumMonitor = CfnAppMonitor.Builder.create(this, props.resourceNamePrefix() + "-RumAppMonitor")
                .name(rumAppName)
                .domainList(List.of(props.sharedNames().deploymentDomainName))
                .appMonitorConfiguration(CfnAppMonitor.AppMonitorConfigurationProperty.builder()
                        .sessionSampleRate(1.0)
                        .allowCookies(true)
                        .enableXRay(true)
                        .guestRoleArn(rumGuestRole.getRoleArn())
                        .identityPoolId(rumIdentityPool.getRef())
                        .telemetries(List.of("performance", "errors", "http"))
                        .build())
                .build();

        // RUM metrics and alarms
        Metric lcpP75 = Metric.Builder.create()
                .namespace("AWS/RUM")
                .metricName("WebVitalsLargestContentfulPaint")
                .dimensionsMap(Map.of("application_name", rumAppName))
                .statistic("p75")
                .period(Duration.minutes(5))
                .build();

        Metric jsErrors = Metric.Builder.create()
                .namespace("AWS/RUM")
                .metricName("JsErrorCount")
                .dimensionsMap(Map.of("application_name", rumAppName))
                .statistic("sum")
                .period(Duration.minutes(5))
                .build();

        Alarm.Builder.create(this, props.resourceNamePrefix() + "-RumLcpP75Alarm")
                .alarmName(props.resourceNamePrefix() + "-rum-lcp-p75")
                .metric(lcpP75)
                .threshold(4000) // 4s
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("RUM p75 LCP > 4s")
                .build();

        Alarm.Builder.create(this, props.resourceNamePrefix() + "-RumJsErrorAlarm")
                .alarmName(props.resourceNamePrefix() + "-rum-js-errors")
                .metric(jsErrors)
                .threshold(5)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("RUM JavaScript errors >= 5 in 5 minutes")
                .build();

        // Frontend Performance Dashboard
        var frontendRows = List.<List<software.amazon.awscdk.services.cloudwatch.IWidget>>of(List.of(
                GraphWidget.Builder.create()
                        .title("RUM p75 LCP (ms)")
                        .left(List.of(lcpP75))
                        .width(8)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("RUM p75 INP (ms)")
                        .left(List.of(Metric.Builder.create()
                                .namespace("AWS/RUM")
                                .metricName("WebVitalsInteractionToNextPaint")
                                .dimensionsMap(Map.of("application_name", rumAppName))
                                .statistic("p75")
                                .period(Duration.minutes(5))
                                .build()))
                        .width(8)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("RUM JS Errors (5m sum)")
                        .left(List.of(jsErrors))
                        .width(8)
                        .height(6)
                        .build()));
        Dashboard frontendDashboard = Dashboard.Builder.create(this, props.resourceNamePrefix() + "-FrontendDashboard")
                .dashboardName(props.resourceNamePrefix() + "-frontend")
                .widgets(frontendRows)
                .build();

        // Outputs for RUM configuration and dashboard
        cfnOutput(this, "RumAppMonitorId", rumMonitor.getAttrId());
        cfnOutput(this, "RumIdentityPoolId", rumIdentityPool.getRef());
        cfnOutput(this, "RumGuestRoleArn", rumGuestRole.getRoleArn());
        cfnOutput(this, "RumRegion", this.getRegion());
        cfnOutput(
                this,
                "FrontendDashboard",
                "https://" + this.getRegion() + ".console.aws.amazon.com/cloudwatch/home?region=" + this.getRegion()
                        + "#dashboards:name=" + frontendDashboard.getDashboardName());
    }
}
