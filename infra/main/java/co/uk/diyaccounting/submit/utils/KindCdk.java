/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.utils;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;

import java.util.List;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsCustomResourcePolicy;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class KindCdk {
    public static CfnOutput cfnOutput(Construct scope, String id, String value) {
        if (StringUtils.isBlank(value)) {
            warnf("CfnOutput value for %s is blank", id);
        }
        return CfnOutput.Builder.create(scope, id).value(value).build();
    }

    public static String getContextValueString(Construct scope, String contextKey, String defaultValue) {
        var contextValue = scope.getNode().tryGetContext(contextKey);
        String defaultedValue;
        String source;
        if (StringUtils.isNotBlank(contextValue.toString())) {
            defaultedValue = contextValue.toString();
            infof("%s=%s (source: CDK context)", contextKey, defaultedValue);
        } else {
            defaultedValue = defaultValue;
            infof("%s=%s (resolved from default)", contextKey, defaultedValue);
        }

        return defaultedValue;
    }

    public static @NotNull Environment buildPrimaryEnvironment() {
        String cdkDefaultAccount = System.getenv("CDK_DEFAULT_ACCOUNT");
        String cdkDefaultRegion = System.getenv("CDK_DEFAULT_REGION");
        Environment primaryEnv = null;
        if (cdkDefaultAccount != null
                && !cdkDefaultAccount.isBlank()
                && cdkDefaultRegion != null
                && !cdkDefaultRegion.isBlank()) {
            primaryEnv = Environment.builder()
                    .account(cdkDefaultAccount)
                    .region(cdkDefaultRegion)
                    .build();
            infof("Using primary environment account %s region %s", cdkDefaultAccount, cdkDefaultRegion);
        } else {
            primaryEnv = Environment.builder().build();
            warnf(
                    "CDK_DEFAULT_ACCOUNT or CDK_DEFAULT_REGION environment variables are not set, using environment agnostic stacks");
        }
        return primaryEnv;
    }

    /**
     * Creates a LogGroup idempotently using AwsCustomResource.
     * Uses createLogGroup API with ignoreErrorCodesMatching("ResourceAlreadyExistsException")
     * so deployments succeed whether the log group exists or not.
     *
     * @param stack The stack to create the log group in
     * @param id The construct ID prefix
     * @param logGroupName The name of the log group
     * @return ILogGroup reference to the log group
     */
    public static ILogGroup ensureLogGroup(Stack stack, String id, String logGroupName) {
        AwsSdkCall createLogGroupCall = AwsSdkCall.builder()
                .service("CloudWatchLogs")
                .action("createLogGroup")
                .parameters(Map.of("logGroupName", logGroupName))
                .physicalResourceId(PhysicalResourceId.of(logGroupName))
                .ignoreErrorCodesMatching("ResourceAlreadyExistsException")
                .build();

        AwsCustomResource.Builder.create(stack, id + "-EnsureLogGroup")
                .onCreate(createLogGroupCall)
                .onUpdate(createLogGroupCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(PolicyStatement.Builder.create()
                        .actions(List.of("logs:CreateLogGroup"))
                        .resources(List.of("arn:aws:logs:" + stack.getRegion() + ":" + stack.getAccount()
                                + ":log-group:" + logGroupName + ":*"))
                        .build())))
                .build();

        return LogGroup.fromLogGroupName(stack, id + "-LogGroup", logGroupName);
    }
}
