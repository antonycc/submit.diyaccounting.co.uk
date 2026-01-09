/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import org.immutables.value.Value;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

@Value.Immutable
public interface LambdaNameProps {

    HttpMethod apiHttpMethod();

    String handlerPath();

    String apiUrlPath();

    boolean apiJwtAuthorizer();

    boolean apiCustomAuthorizer();

    String resourceNamePrefix();

    String lambdaArnPrefix();

    String ingestHandlerName();

    String workerHandlerName();

    String provisionedConcurrencyAliasName();

    @Value.Default
    default String handlerPrefix() {
        return "app/functions";
    }

    @Value.Default
    default String defaultAliasName() {
        return "hot";
    }

    @Value.Default
    default String workerPostfix() {
        return "worker";
    }

    @Value.Default
    default String queuePostfix() {
        return "queue";
    }

    @Value.Default
    default String deadLetterQueuePostfix() {
        return "dlq";
    }

    static ImmutableLambdaNameProps.Builder builder() {
        return ImmutableLambdaNameProps.builder();
    }
}
