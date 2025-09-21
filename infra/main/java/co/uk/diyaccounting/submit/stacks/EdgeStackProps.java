package co.uk.diyaccounting.submit.stacks;

import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

@Value.Immutable
public interface EdgeStackProps extends StackProps {
    String envName();
    String deploymentName();
    String hostedZoneName();
    String hostedZoneId();
    String domainName();
    String baseUrl();
    String resourceNamePrefix();
    String compressedResourceNamePrefix();
    String certificateArn();
    String logsBucketArn();
    String webBucketArn();
    Map<String, String> additionalOriginsBehaviourMappings();

    // StackProps interface methods
    @Override
    Environment getEnv();
    
    @Override
    @Value.Default
    default Boolean getCrossRegionReferences() {
        return null;
    }

    static ImmutableEdgeStackProps.Builder builder() {
        return ImmutableEdgeStackProps.builder();
    }
}
