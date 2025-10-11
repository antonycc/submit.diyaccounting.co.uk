package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildTrailName;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.utils.RetentionDaysConverter;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
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
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.constructs.Construct;

public class ObservabilityStack extends Stack {

    public Bucket trailBucket;
    public Trail trail;
    public LogGroup cloudTrailLogGroup;
    public LogGroup selfDestructLogGroup;

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

        String trailName = buildTrailName(props.resourceNamePrefix());
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

        // Log group for self-destruct operations with 1-week retention
        this.selfDestructLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-SelfDestructLogGroup")
                .logGroupName(props.sharedNames().selfDestructLogGroupName)
                .retention(RetentionDays.ONE_WEEK) // Longer retention for operations
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        infof(
                "ObservabilityStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDomainName);

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs for Observability resources
        cfnOutput(this, "SelfDestructLogGroupArn", this.selfDestructLogGroup.getLogGroupArn());
    }
}
