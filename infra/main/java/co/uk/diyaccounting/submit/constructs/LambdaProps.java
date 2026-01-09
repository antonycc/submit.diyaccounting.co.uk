/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;

@Value.Immutable
public interface LambdaProps extends AbstractLambdaProps {

    static ImmutableLambdaProps.Builder builder() {
        return ImmutableLambdaProps.builder();
    }
}
