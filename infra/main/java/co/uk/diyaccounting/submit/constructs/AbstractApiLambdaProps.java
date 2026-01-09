/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public interface AbstractApiLambdaProps extends AbstractLambdaProps {

    HttpMethod httpMethod();

    String urlPath();

    boolean jwtAuthorizer();

    boolean customAuthorizer();
}
