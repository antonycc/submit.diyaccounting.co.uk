package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.Duration;

@Value.Immutable
public interface AsyncApiLambdaProps extends AbstractApiLambdaProps {

    String workerHandler();

    @Value.Default
    default int workerReservedConcurrency() {
        return 10;
    }

    @Value.Default
    default int workerProvisionedConcurrencyZero() {
        return 0;
    }

    @Value.Default
    default int workerProvisionedConcurrencyReady() {
        return 0;
    }

    @Value.Default
    default int workerProvisionedConcurrencyHot() {
        return 0;
    }

    @Value.Default
    default Duration workerTimeout() {
        return Duration.seconds(10);
    }

    @Value.Default
    default Duration visibilityTimeout() {
        return Duration.seconds(30);
    }

    @Value.Default
    default int maxReceiveCount() {
        return 3; // 2 retries + 1 initial attempt
    }

    static ImmutableAsyncApiLambdaProps.Builder builder() {
        return ImmutableAsyncApiLambdaProps.builder();
    }
}
