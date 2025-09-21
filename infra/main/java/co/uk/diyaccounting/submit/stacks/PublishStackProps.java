package co.uk.diyaccounting.submit.stacks;

import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.s3.Bucket;

@Value.Immutable
public interface PublishStackProps extends StackProps {
    String envName();
    String deploymentName();
    String domainName();
    String baseUrl();
    String resourceNamePrefix();
    String distributionArn();
    Bucket webBucket();
    String commitHash();
    String docRootPath();

    // StackProps interface methods
    @Override
    Environment getEnv();
    
    @Override
    @Value.Default
    default Boolean getCrossRegionReferences() {
        return null;
    }

    static ImmutablePublishStackProps.Builder builder() {
        return ImmutablePublishStackProps.builder();
    }
}