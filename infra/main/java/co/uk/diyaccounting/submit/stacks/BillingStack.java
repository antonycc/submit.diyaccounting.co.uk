/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.constructs.Construct;

public class BillingStack extends Stack {

    public AbstractApiLambdaProps billingCheckoutPostLambdaProps;
    public Function billingCheckoutPostLambda;
    public ILogGroup billingCheckoutPostLambdaLogGroup;

    public AbstractApiLambdaProps billingPortalGetLambdaProps;
    public Function billingPortalGetLambda;
    public ILogGroup billingPortalGetLambdaLogGroup;

    public AbstractApiLambdaProps billingRecoverPostLambdaProps;
    public Function billingRecoverPostLambda;
    public ILogGroup billingRecoverPostLambdaLogGroup;

    public AbstractApiLambdaProps billingWebhookPostLambdaProps;
    public Function billingWebhookPostLambda;
    public ILogGroup billingWebhookPostLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface BillingStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String baseImageTag();

        static ImmutableBillingStackProps.Builder builder() {
            return ImmutableBillingStackProps.builder();
        }
    }

    public BillingStack(Construct scope, String id, BillingStackProps props) {
        this(scope, id, null, props);
    }

    public BillingStack(Construct scope, String id, StackProps stackProps, BillingStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing DynamoDB Subscriptions Table
        ITable subscriptionsTable = Table.fromTableName(
                this,
                "ImportedSubscriptionsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().subscriptionsTableName);

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for IAM policies
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activityBusName);

        // ============================================================================
        // Billing Checkout POST Lambda (JWT auth)
        // ============================================================================
        var billingCheckoutPostLambdaEnv = new PopulatedMap<String, String>()
                .with("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME", subscriptionsTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var billingCheckoutPostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().billingCheckoutPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().billingCheckoutPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().billingCheckoutPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().billingCheckoutPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().billingCheckoutPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().billingCheckoutPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().billingCheckoutPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().billingCheckoutPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().billingCheckoutPostLambdaCustomAuthorizer)
                        .environment(billingCheckoutPostLambdaEnv)
                        .build());
        this.billingCheckoutPostLambdaProps = billingCheckoutPostApiLambda.apiProps;
        this.billingCheckoutPostLambda = billingCheckoutPostApiLambda.ingestLambda;
        this.billingCheckoutPostLambdaLogGroup = billingCheckoutPostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.billingCheckoutPostLambdaProps);
        subscriptionsTable.grantReadWriteData(this.billingCheckoutPostLambda);
        bundlesTable.grantReadData(this.billingCheckoutPostLambda);
        SubHashSaltHelper.grantSaltAccess(this.billingCheckoutPostLambda, region, account, props.envName());
        this.billingCheckoutPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof("Created Billing Checkout POST Lambda %s", this.billingCheckoutPostLambda.getNode().getId());

        // ============================================================================
        // Billing Portal GET Lambda (JWT auth)
        // ============================================================================
        var billingPortalGetLambdaEnv = new PopulatedMap<String, String>()
                .with("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME", subscriptionsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var billingPortalGetApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().billingPortalGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().billingPortalGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().billingPortalGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().billingPortalGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().billingPortalGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().billingPortalGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().billingPortalGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().billingPortalGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().billingPortalGetLambdaCustomAuthorizer)
                        .environment(billingPortalGetLambdaEnv)
                        .build());
        this.billingPortalGetLambdaProps = billingPortalGetApiLambda.apiProps;
        this.billingPortalGetLambda = billingPortalGetApiLambda.ingestLambda;
        this.billingPortalGetLambdaLogGroup = billingPortalGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.billingPortalGetLambdaProps);
        subscriptionsTable.grantReadData(this.billingPortalGetLambda);
        SubHashSaltHelper.grantSaltAccess(this.billingPortalGetLambda, region, account, props.envName());
        this.billingPortalGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof("Created Billing Portal GET Lambda %s", this.billingPortalGetLambda.getNode().getId());

        // ============================================================================
        // Billing Recover POST Lambda (JWT auth)
        // ============================================================================
        var billingRecoverPostLambdaEnv = new PopulatedMap<String, String>()
                .with("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME", subscriptionsTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var billingRecoverPostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().billingRecoverPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().billingRecoverPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().billingRecoverPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().billingRecoverPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().billingRecoverPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().billingRecoverPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().billingRecoverPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().billingRecoverPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().billingRecoverPostLambdaCustomAuthorizer)
                        .environment(billingRecoverPostLambdaEnv)
                        .build());
        this.billingRecoverPostLambdaProps = billingRecoverPostApiLambda.apiProps;
        this.billingRecoverPostLambda = billingRecoverPostApiLambda.ingestLambda;
        this.billingRecoverPostLambdaLogGroup = billingRecoverPostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.billingRecoverPostLambdaProps);
        subscriptionsTable.grantReadWriteData(this.billingRecoverPostLambda);
        bundlesTable.grantReadWriteData(this.billingRecoverPostLambda);
        SubHashSaltHelper.grantSaltAccess(this.billingRecoverPostLambda, region, account, props.envName());
        this.billingRecoverPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof("Created Billing Recover POST Lambda %s", this.billingRecoverPostLambda.getNode().getId());

        // ============================================================================
        // Billing Webhook POST Lambda (NO auth - Stripe signature verification)
        // ============================================================================
        var billingWebhookPostLambdaEnv = new PopulatedMap<String, String>()
                .with("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME", subscriptionsTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var billingWebhookPostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().billingWebhookPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().billingWebhookPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().billingWebhookPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().billingWebhookPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().billingWebhookPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().billingWebhookPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().billingWebhookPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().billingWebhookPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().billingWebhookPostLambdaCustomAuthorizer)
                        .environment(billingWebhookPostLambdaEnv)
                        .build());
        this.billingWebhookPostLambdaProps = billingWebhookPostApiLambda.apiProps;
        this.billingWebhookPostLambda = billingWebhookPostApiLambda.ingestLambda;
        this.billingWebhookPostLambdaLogGroup = billingWebhookPostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.billingWebhookPostLambdaProps);
        subscriptionsTable.grantReadWriteData(this.billingWebhookPostLambda);
        bundlesTable.grantReadWriteData(this.billingWebhookPostLambda);
        SubHashSaltHelper.grantSaltAccess(this.billingWebhookPostLambda, region, account, props.envName());
        this.billingWebhookPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof("Created Billing Webhook POST Lambda %s", this.billingWebhookPostLambda.getNode().getId());

        cfnOutput(this, "BillingCheckoutPostLambdaArn", this.billingCheckoutPostLambda.getFunctionArn());
        cfnOutput(this, "BillingPortalGetLambdaArn", this.billingPortalGetLambda.getFunctionArn());
        cfnOutput(this, "BillingRecoverPostLambdaArn", this.billingRecoverPostLambda.getFunctionArn());
        cfnOutput(this, "BillingWebhookPostLambdaArn", this.billingWebhookPostLambda.getFunctionArn());

        infof(
                "BillingStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
