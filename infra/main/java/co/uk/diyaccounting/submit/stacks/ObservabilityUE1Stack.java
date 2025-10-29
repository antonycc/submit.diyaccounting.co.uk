package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.constructs.Construct;

public class ObservabilityUE1Stack extends Stack {

    public LogGroup selfDestructLogGroup;
    public final LogGroup webDeploymentLogGroup;
    public IBucket distributionLogsBucket;

    @Value.Immutable
    public interface ObservabilityUE1StackProps extends StackProps, SubmitStackProps {

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

        int logGroupRetentionPeriodDays();

        static ImmutableObservabilityUE1StackProps.Builder builder() {
            return ImmutableObservabilityUE1StackProps.builder();
        }
    }

    public ObservabilityUE1Stack(Construct scope, String id, ObservabilityUE1StackProps props) {
        this(scope, id, null, props);
    }

    public ObservabilityUE1Stack(Construct scope, String id, StackProps stackProps, ObservabilityUE1StackProps props) {
        super(scope, id, stackProps);

        // Log group for web deployment operations with 1-day retention
        this.webDeploymentLogGroup = LogGroup.Builder.create(
                        this, props.resourceNamePrefix() + "-WebDeploymentLogGroup")
                .logGroupName(props.sharedNames().webDeploymentLogGroupName)
                .retention(RetentionDays.ONE_DAY)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // TODO: Find alternative to log buckets for CloudFront distribution logs
        this.distributionLogsBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-LogsBucket")
                .bucketName(props.sharedNames().distributionAccessLogBucketName)
                .objectOwnership(ObjectOwnership.OBJECT_WRITER)
                .versioned(false)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(List.of(LifecycleRule.builder()
                        .id(props.resourceNamePrefix() + "-LogsLifecycleRule")
                        .enabled(true)
                        .expiration(Duration.days(props.logGroupRetentionPeriodDays()))
                        .build()))
                .build();

        // Log group for self-destruct operations with 1-week retention
        this.selfDestructLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-SelfDestructLogGroup")
                .logGroupName(props.sharedNames().ue1SelfDestructLogGroupName)
                .retention(RetentionDays.ONE_WEEK) // Longer retention for operations
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        infof(
                "ObservabilityStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs for Observability resources
        cfnOutput(this, "WebDeploymentLogGroupArn", this.webDeploymentLogGroup.getLogGroupArn());
        cfnOutput(this, "SelfDestructLogGroupArn", this.selfDestructLogGroup.getLogGroupArn());
    }
}
