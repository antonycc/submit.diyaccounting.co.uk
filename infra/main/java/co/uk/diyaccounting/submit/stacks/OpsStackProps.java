package co.uk.diyaccounting.submit.stacks;

import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

@Value.Immutable
public interface OpsStackProps extends StackProps {
    String envName();
    String deploymentName();
    String domainName();
    String resourceNamePrefix();
    String compressedResourceNamePrefix();
    String distributionId();
    String originBucketArn();
    String receiptsBucketArn(); // optional, may be null
    List<String> lambdaFunctionArns();

    // StackProps interface methods
    @Override
    Environment getEnv();
    
    @Override
    @Value.Default
    default Boolean getCrossRegionReferences() {
        return null;
    }

    static ImmutableOpsStackProps.Builder builder() {
        return ImmutableOpsStackProps.builder();
    }
}