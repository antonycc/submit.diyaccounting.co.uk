package co.uk.diyaccounting.submit.constructs;

import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.ICachePolicy;
import software.amazon.awscdk.services.cloudfront.IOriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.IResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.RetentionDays;

/**
 * Props container for LambdaUrlOrigin construct. Mirrors the previous Builder fields
 * so callers can migrate to props-style configuration.
 */
@Value.Immutable
public interface LambdaUrlOriginProps {
    String env();
    String functionName();
    String handler();
    String idPrefix();
    
    @Value.Default
    default Duration timeout() {
        return Duration.seconds(30);
    }
    
    @Value.Default
    default Map<String, String> environment() {
        return Map.of();
    }
    
    @Value.Default
    default AllowedMethods cloudFrontAllowedMethods() {
        return AllowedMethods.ALLOW_GET_HEAD_OPTIONS;
    }
    
    @Value.Default
    default boolean skipBehaviorOptions() {
        return false;
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

    @Value.Default
    default FunctionUrlAuthType functionUrlAuthType() {
        return FunctionUrlAuthType.NONE;
    }
    
    @Value.Default
    default InvokeMode invokeMode() {
        return InvokeMode.BUFFERED;
    }

    @Value.Default
    default RetentionDays logGroupRetention() {
        return RetentionDays.THREE_DAYS;
    }
    
    @Value.Default
    default RemovalPolicy logGroupRemovalPolicy() {
        return RemovalPolicy.DESTROY;
    }

    @Value.Default
    default OriginProtocolPolicy protocolPolicy() {
        return OriginProtocolPolicy.HTTPS_ONLY;
    }

    @Value.Default
    default IResponseHeadersPolicy responseHeadersPolicy() {
        return ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS;
    }

    @Value.Default
    default ICachePolicy cachePolicy() {
        return CachePolicy.CACHING_DISABLED;
    }
    
    @Value.Default
    default ViewerProtocolPolicy viewerProtocolPolicy() {
        return ViewerProtocolPolicy.REDIRECT_TO_HTTPS;
    }
    
    @Value.Default
    default IOriginRequestPolicy originRequestPolicy() {
        return OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;
    }

    @Value.Default
    default String imageDirectory() {
        return ".";
    }
    
    @Value.Default
    default String imageFilename() {
        return "Dockerfile";
    }
    
    @Value.Default
    default Runtime testRuntime() {
        return Runtime.NODEJS_22_X;
    }
    
    String baseImageTag();
    String ecrRepositoryArn();
    String ecrRepositoryName();

    static ImmutableLambdaUrlOriginProps.Builder builder() {
        return ImmutableLambdaUrlOriginProps.builder();
    }
}
