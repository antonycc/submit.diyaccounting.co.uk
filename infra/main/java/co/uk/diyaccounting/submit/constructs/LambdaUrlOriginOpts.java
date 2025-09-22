package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;

@Value.Immutable
public interface LambdaUrlOriginOpts {
    String env();
    
    @Value.Default
    default String imageDirectory() {
        return ".";
    }
    
    @Value.Default
    default FunctionUrlAuthType functionUrlAuthType() {
        return FunctionUrlAuthType.NONE;
    }
    
    @Value.Default
    default boolean cloudTrailEnabled() {
        return false;
    }
    
    @Value.Default
    default boolean xRayEnabled() {
        return false;
    }
    
    @Value.Default
    default boolean verboseLogging() {
        return false;
    }
    
    String baseImageTag();

    static ImmutableLambdaUrlOriginOpts.Builder builder() {
        return ImmutableLambdaUrlOriginOpts.builder();
    }
}
