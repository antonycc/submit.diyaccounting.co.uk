package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;

import java.util.Map;
import java.util.Optional;

public abstract interface AbstractLambdaProps {

    String idPrefix();

    String ingestFunctionName();

    String ingestHandler();

    String ingestLambdaArn();

    String ingestDefaultAliasLambdaArn();

    @Value.Default
    default int ingestReservedConcurrency() {
        return 10;
    }

    @Value.Default
    default Duration timeout() {
        return Duration.seconds(10);
    }

    @Value.Default
    default int ingestProvisionedConcurrencyZero() {
        return 0;
    }

    @Value.Default
    default int ingestProvisionedConcurrencyHot() {
        return 0;
    }

    @Value.Default
    default Map<String, String> environment() {
        return Map.of();
    }

    @Value.Default
    default boolean cloudTrailEnabled() {
        return false;
    }

    @Value.Default
    default RetentionDays logGroupRetention() {
        return RetentionDays.THREE_DAYS;
    }

    @Value.Default
    default RemovalPolicy logGroupRemovalPolicy() {
        return RemovalPolicy.DESTROY;
    }

    String baseImageTag();

    String ecrRepositoryArn();

    String ecrRepositoryName();

    @Value.Default
    default Optional<ILogGroup> logGroup() {
        return Optional.empty();
    }

    @Value.Default
    default Optional<Role> role() {
        return Optional.empty();
    }
}
