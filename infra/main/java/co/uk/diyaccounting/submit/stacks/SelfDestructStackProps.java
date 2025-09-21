package co.uk.diyaccounting.submit.stacks;

import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

@Value.Immutable
public interface SelfDestructStackProps extends StackProps {
    String envName();
    String deploymentName();
    String resourceNamePrefix();
    String compressedResourceNamePrefix();
    String observabilityStackName();
    String devStackName();
    String identityStackName();
    String authStackName();
    String applicationStackName();
    String webStackName();
    String edgeStackName();
    String publishStackName();
    String opsStackName();
    String selfDestructDelayHours();
    String selfDestructHandlerSource();

    // StackProps interface methods
    @Override
    Environment getEnv();
    
    @Override
    @Value.Default
    default Boolean getCrossRegionReferences() {
        return null;
    }

    static ImmutableSelfDestructStackProps.Builder builder() {
        return ImmutableSelfDestructStackProps.builder();
    }
}