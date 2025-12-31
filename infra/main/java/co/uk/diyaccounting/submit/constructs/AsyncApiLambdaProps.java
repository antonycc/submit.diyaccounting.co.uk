package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.Duration;

@Value.Immutable
public interface AsyncApiLambdaProps extends AbstractApiLambdaProps {

    String workerFunctionName();

    String workerHandler();

    String workerLambdaArn();

    String workerProvisionedConcurrencyAliasArn();

    String workerQueueName();

    String workerDeadLetterQueueName();

    @Value.Default
    default int workerReservedConcurrency() {
        return 10;
    }

    @Value.Default
    default int workerProvisionedConcurrency() {
        return 0;
    }

    @Value.Default
    default Duration workerLambdaTimeout() {
        return Duration.seconds(10);
    }

    @Value.Default
    default Duration queueVisibilityTimeout() {
        return Duration.seconds(30);
    }

    @Value.Default
    default int workerMaxReceiveCount() {
        return 3; // 2 retries + 1 initial attempt
    }

    static ImmutableAsyncApiLambdaProps.Builder builder() {
        return ImmutableAsyncApiLambdaProps.builder();
    }
}
