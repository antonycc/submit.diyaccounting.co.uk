package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

@Value.Immutable
public interface AsyncApiLambdaProps extends ApiLambdaProps {

    String consumerHandler();

    @Value.Default
    default int maxReceiveCount() {
        return 3; // 2 retries + 1 initial attempt
    }

    @Value.Default
    default int consumerConcurrency() {
        return 1;
    }

    @Value.Default
    default Duration visibilityTimeout() {
        return Duration.seconds(30);
    }

    static ImmutableAsyncApiLambdaProps.Builder builder() {
        return ImmutableAsyncApiLambdaProps.builder();
    }
}
