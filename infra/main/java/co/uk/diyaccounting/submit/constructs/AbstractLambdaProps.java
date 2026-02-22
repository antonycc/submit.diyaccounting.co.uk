/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.constructs;

import java.util.Map;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;

public interface AbstractLambdaProps {

    String idPrefix();

    String ingestFunctionName();

    String ingestHandler();

    String ingestLambdaArn();

    String provisionedConcurrencyAliasName();

    String ingestProvisionedConcurrencyAliasArn();

    @Value.Default
    default int ingestProvisionedConcurrency() {
        return 0;
    }

    @Value.Default
    default Duration ingestLambdaTimeout() {
        return Duration.seconds(28);
    }

    @Value.Default
    default int ingestMemorySize() {
        return 1024;
    }

    @Value.Default
    default Architecture ingestArchitecture() {
        return Architecture.ARM_64;
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
