package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.utils.RetentionDaysConverter;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.constructs.Construct;

import java.util.List;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildTrailName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.convertDotSeparatedToDashSeparated;

public class ObservabilityStack extends Stack {

    public Bucket trailBucket;
    public Trail trail;
    public LogGroup cloudTrailLogGroup;
    public LogGroup selfDestructLogGroup;
    public IBucket originAccessLogBucket;
    public IBucket distributionLogsBucket;
    public final LogGroup webDeploymentLogGroup;

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

        @Override
        String compressedResourceNamePrefix();

        @Override
        String dashedDomainName();

        @Override
        String domainName();

        @Override
        String baseUrl();

        @Override
        String cloudTrailEnabled();

        String cloudTrailLogGroupPrefix();

        String cloudTrailLogGroupRetentionPeriodDays();

        int accessLogGroupRetentionPeriodDays();

        String selfDestructLogGroupName();

        static ImmutableObservabilityStackProps.Builder builder() {
            return ImmutableObservabilityStackProps.builder();
        }
    }

    public ObservabilityStack(Construct scope, String id, ObservabilityStackProps props) {
        this(scope, id, null, props);
    }

    public ObservabilityStack(Construct scope, String id, StackProps stackProps, ObservabilityStackProps props) {
        super(scope, id, stackProps);

        String trailName = buildTrailName(props.dashedDomainName());
        boolean cloudTrailEnabled = Boolean.parseBoolean(props.cloudTrailEnabled());
        int cloudTrailLogGroupRetentionPeriodDays = Integer.parseInt(props.cloudTrailLogGroupRetentionPeriodDays());

        // Create a CloudTrail for the stack resources
        RetentionDays cloudTrailLogGroupRetentionPeriod =
                RetentionDaysConverter.daysToRetentionDays(cloudTrailLogGroupRetentionPeriodDays);
        if (cloudTrailEnabled) {
            this.cloudTrailLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-CloudTrailGroup")
                    .logGroupName(
                            "%s%s-cloud-trail".formatted(props.cloudTrailLogGroupPrefix(), props.dashedDomainName()))
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
                    .trailName(trailName)
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

        // Log group for web deployment operations with 1-day retention
        this.webDeploymentLogGroup = LogGroup.Builder.create(
                this, props.resourceNamePrefix() + "-WebDeploymentLogGroup")
            .logGroupName("/deployment/" + props.resourceNamePrefix() + "-web-deployment")
            .retention(RetentionDays.ONE_DAY)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

        // TODO: Re-instate log shipping to CloudWatch Logs for origin access and add xray tracing
        // S3 bucket for origin access logs with specified retention
        String originBucketName = convertDotSeparatedToDashSeparated("origin-" + props.domainName());
        var originAccessLogBucket = originBucketName + "-logs";
        infof(
            "Setting expiration period to %d days for %s",
            props.accessLogGroupRetentionPeriodDays(), props.compressedResourceNamePrefix());
        this.originAccessLogBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-LogBucket")
            .bucketName(originAccessLogBucket)
            .objectOwnership(ObjectOwnership.OBJECT_WRITER)
            .versioned(false)
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .encryption(BucketEncryption.S3_MANAGED)
            .removalPolicy(RemovalPolicy.DESTROY)
            .autoDeleteObjects(true)
            .lifecycleRules(List.of(LifecycleRule.builder()
                .id("%sLogsLifecycleRule".formatted(props.compressedResourceNamePrefix()))
                .enabled(true)
                .expiration(Duration.days(props.accessLogGroupRetentionPeriodDays()))
                .build()))
            .build();
        infof(
            "Created log bucket %s with name",
            this.originAccessLogBucket.getNode().getId(), originAccessLogBucket);

        // TODO: Re-instate log shipping to CloudWatch Logs for distribution access and add xray tracing
        // S3 bucket for CloudFront distribution logs with specified retention
        this.distributionLogsBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-LogsBucket")
            .bucketName(props.resourceNamePrefix() + "-logs-bucket")
            .objectOwnership(ObjectOwnership.OBJECT_WRITER)
            .versioned(false)
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .encryption(BucketEncryption.S3_MANAGED)
            .removalPolicy(RemovalPolicy.DESTROY)
            .autoDeleteObjects(true)
            .lifecycleRules(List.of(LifecycleRule.builder()
                .id(props.resourceNamePrefix() + "-LogsLifecycleRule")
                .enabled(true)
                .expiration(Duration.days(props.accessLogGroupRetentionPeriodDays()))
                .build()))
            .build();

        // Log group for self-destruct operations with 1-week retention
        this.selfDestructLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-SelfDestructLogGroup")
                .logGroupName(props.selfDestructLogGroupName())
                .retention(RetentionDays.ONE_WEEK) // Longer retention for operations
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        infof(
                "ObservabilityStack %s created successfully for %s",
                this.getNode().getId(), props.dashedDomainName());

        // Outputs for Observability resources
        cfnOutput(this, "WebDeploymentLogGroupArn", this.webDeploymentLogGroup.getLogGroupArn());
        cfnOutput(this, "SelfDestructLogGroupArn", this.selfDestructLogGroup.getLogGroupArn());
    }
}
