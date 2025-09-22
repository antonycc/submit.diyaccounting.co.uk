package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.awssdk.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildTrailName;

import co.uk.diyaccounting.submit.awssdk.RetentionDaysConverter;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
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

    @Value.Immutable
    public interface ObservabilityStackProps {
        String env();

        String subDomainName();

        String hostedZoneName();

        String cloudTrailEnabled();

        String cloudTrailLogGroupPrefix();

        String cloudTrailLogGroupRetentionPeriodDays();

        String accessLogGroupRetentionPeriodDays();

        String xRayEnabled();

        static ImmutableObservabilityStackProps.Builder builder() {
            return ImmutableObservabilityStackProps.builder();
        }
    }

    public ObservabilityStack(Construct scope, String id, ObservabilityStackProps props) {
        this(scope, id, null, props);
    }

    public ObservabilityStack(Construct scope, String id, StackProps stackProps, ObservabilityStackProps props) {
        super(scope, id, stackProps);

        // Values are provided via SubmitApplication after context/env resolution

        // Build naming using same patterns as WebStack
        String domainName = buildDomainName(props.env(), props.subDomainName(), props.hostedZoneName());
        String dashedDomainName = buildDashedDomainName(props.env(), props.subDomainName(), props.hostedZoneName());

        String trailName = buildTrailName(dashedDomainName);
        boolean cloudTrailEnabled = Boolean.parseBoolean(props.cloudTrailEnabled());
        int cloudTrailLogGroupRetentionPeriodDays = Integer.parseInt(props.cloudTrailLogGroupRetentionPeriodDays());
        boolean xRayEnabled = Boolean.parseBoolean(props.xRayEnabled());

        // Create a CloudTrail for the stack resources
        RetentionDays cloudTrailLogGroupRetentionPeriod =
                RetentionDaysConverter.daysToRetentionDays(cloudTrailLogGroupRetentionPeriodDays);
        if (cloudTrailEnabled) {
            this.cloudTrailLogGroup = LogGroup.Builder.create(this, "CloudTrailGroup")
                    .logGroupName("%s%s-cloud-trail".formatted(props.cloudTrailLogGroupPrefix(), dashedDomainName))
                    .retention(cloudTrailLogGroupRetentionPeriod)
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .build();
            this.trailBucket = Bucket.Builder.create(this, trailName + "CloudTrailBucket")
                    .encryption(BucketEncryption.S3_MANAGED)
                    .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                    .versioned(false)
                    .autoDeleteObjects(true)
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .lifecycleRules(List.of(LifecycleRule.builder()
                            .expiration(Duration.days(cloudTrailLogGroupRetentionPeriodDays))
                            .build()))
                    .build();
            this.trail = Trail.Builder.create(this, "Trail")
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

        infof(
                "ObservabilityStack %s created successfully for %s",
                this.getNode().getId(), dashedDomainName);
    }
}
