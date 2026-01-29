/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlCorsOptions;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.HttpMethod;
import software.amazon.awscdk.services.lambda.LayerVersion;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

/**
 * SimulatorStack - Deploys the public simulator as a Lambda with Function URL.
 *
 * <p>The simulator is a read-only demo of DIY Accounting Submit that:
 * - Has no access to production secrets or data
 * - Uses in-memory state only (resets on cold start)
 * - Is clearly labeled as demo mode
 * - Can be embedded via iframe on the main site
 *
 * <p>Uses AWS Lambda Web Adapter to run the Express.js simulator-server.js
 */
public class SimulatorStack extends Stack {

    public final Function simulatorFunction;
    public final FunctionUrl functionUrl;

    @Value.Immutable
    public interface SimulatorStackProps extends StackProps, SubmitStackProps {

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

        /** Path to the bundled simulator code */
        String simulatorCodePath();

        /** Base URL for the simulator (for self-reference in submit.env) */
        String simulatorBaseUrl();

        static ImmutableSimulatorStackProps.Builder builder() {
            return ImmutableSimulatorStackProps.builder();
        }
    }

    public SimulatorStack(final Construct scope, final String id, final SimulatorStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "SimulatorStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Simulator-specific tags
        Tags.of(this).add("BillingPurpose", "public-demo");
        Tags.of(this).add("ResourceType", "serverless-demo");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "false"); // No logging for simulator

        // Log group for simulator (minimal retention)
        LogGroup logGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-SimulatorLogGroup")
                .logGroupName("/aws/lambda/" + props.resourceNamePrefix() + "-simulator")
                .retention(RetentionDays.ONE_DAY) // Minimal retention - simulator has no important logs
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // Lambda Web Adapter layer ARN for eu-west-2
        // See: https://github.com/awslabs/aws-lambda-web-adapter
        String lambdaAdapterLayerArn = "arn:aws:lambda:eu-west-2:753240598075:layer:LambdaAdapterLayerX86:22";

        // Create the simulator Lambda function
        this.simulatorFunction = Function.Builder.create(this, props.resourceNamePrefix() + "-SimulatorFunction")
                .functionName(props.resourceNamePrefix() + "-simulator")
                .description("Public simulator for DIY Accounting Submit - demo mode only")
                .runtime(Runtime.NODEJS_20_X)
                .architecture(Architecture.X86_64)
                .handler("run.sh") // Lambda Web Adapter entrypoint
                .code(Code.fromAsset(props.simulatorCodePath()))
                .memorySize(512)
                .timeout(Duration.seconds(30))
                .environment(Map.of(
                        "AWS_LWA_INVOKE_MODE", "response_stream",
                        "AWS_LWA_PORT", "8080",
                        "PORT", "8080",
                        "NODE_ENV", "production",
                        "DIY_SUBMIT_BASE_URL", props.simulatorBaseUrl(),
                        "SIMULATOR_MODE", "true"))
                .layers(List.of(LayerVersion.fromLayerVersionArn(
                        this, props.resourceNamePrefix() + "-LambdaAdapter", lambdaAdapterLayerArn)))
                .logGroup(logGroup)
                .build();

        // Create Function URL with public access (no auth required for simulator)
        this.functionUrl = this.simulatorFunction.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(FunctionUrlAuthType.NONE) // Public access
                .cors(FunctionUrlCorsOptions.builder()
                        .allowedOrigins(List.of(
                                "https://submit.diyaccounting.co.uk",
                                "https://ci.submit.diyaccounting.co.uk",
                                "http://localhost:3000"))
                        .allowedMethods(List.of(HttpMethod.GET, HttpMethod.POST))
                        .allowedHeaders(List.of("Content-Type", "Authorization"))
                        .build())
                .build());

        // Outputs
        cfnOutput(this, "SimulatorFunctionArn", this.simulatorFunction.getFunctionArn());
        cfnOutput(this, "SimulatorFunctionUrl", this.functionUrl.getUrl());

        infof(
                "SimulatorStack %s created successfully with Function URL: %s",
                this.getNode().getId(), this.functionUrl.getUrl());
    }
}
