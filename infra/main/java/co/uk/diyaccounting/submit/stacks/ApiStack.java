package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.aws_apigatewayv2_integrations.HttpLambdaIntegration;
import software.amazon.awscdk.services.apigatewayv2.CfnStage;
import software.amazon.awscdk.services.apigatewayv2.HttpApi;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;
import software.amazon.awscdk.services.apigatewayv2.HttpRoute;
import software.amazon.awscdk.services.apigatewayv2.HttpRouteKey;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.IFunction;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

public class ApiStack extends Stack {

    public final Dashboard operationalDashboard;
    public final HttpApi httpApi;

    @Value.Immutable
    public interface ApiStackProps extends StackProps, SubmitStackProps {

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
        String compressedResourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        // Lambda function references from other stacks
        Map<String, IFunction> lambdaFunctions();

        static ImmutableApiStackProps.Builder builder() {
            return ImmutableApiStackProps.builder();
        }
    }

    @Value.Immutable
    public interface EndpointConfig {
        String path();

        HttpMethod httpMethod();

        String lambdaKey();

        static ImmutableEndpointConfig.Builder builder() {
            return ImmutableEndpointConfig.builder();
        }
    }

    public ApiStack(final Construct scope, final String id, final ApiStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "ApiStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Create HTTP API Gateway v2
        this.httpApi = HttpApi.Builder.create(this, props.resourceNamePrefix() + "-HttpApi")
                .apiName(props.resourceNamePrefix() + "-api")
                .description("API Gateway v2 for " + props.resourceNamePrefix())
                .build();

        // Enable access logging for the default stage to a pre-created CloudWatch Log Group
        ILogGroup apiAccessLogs = LogGroup.fromLogGroupName(
                this, props.resourceNamePrefix() + "-ImportedApiAccessLogs", props.sharedNames().apiAccessLogGroupName);

        // Allow API Gateway service to write logs to this log group for this API's default stage
        apiAccessLogs.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("ApiGatewayAccessLogs")
                .principals(java.util.List.of(new ServicePrincipal("apigateway.amazonaws.com")))
                .actions(java.util.List.of("logs:CreateLogStream", "logs:PutLogEvents"))
                .resources(java.util.List.of(apiAccessLogs.getLogGroupArn()))
                .conditions(java.util.Map.of(
                        "StringEquals", java.util.Map.of("aws:SourceAccount", this.getAccount()),
                        "ArnLike",
                                java.util.Map.of(
                                        "aws:SourceArn",
                                        "arn:aws:apigateway:" + this.getRegion() + "::/apis/" + this.httpApi.getApiId()
                                                + "/stages/$default")))
                .build());

        // Configure default stage access logs and logging level/metrics
        var defaultStage = (CfnStage) this.httpApi.getDefaultStage().getNode().getDefaultChild();
        defaultStage.setAccessLogSettings(CfnStage.AccessLogSettingsProperty.builder()
                .destinationArn(apiAccessLogs.getLogGroupArn())
                .format("{" + "\"requestId\":\"$context.requestId\","
                        + "\"path\":\"$context.path\","
                        + "\"routeKey\":\"$context.routeKey\","
                        + "\"protocol\":\"$context.protocol\","
                        + "\"status\":\"$context.status\","
                        + "\"responseLength\":\"$context.responseLength\","
                        + "\"requestTime\":\"$context.requestTime\","
                        + "\"integrationError\":\"$context.integrationErrorMessage\""
                        + "}")
                .build());
        // Enable AWS X-Ray tracing for the default stage via property override.
        // Some CDK versions don't expose 'tracingEnabled' on CfnStage for HTTP APIs yet.
        // defaultStage.addPropertyOverride("TracingEnabled", true);
        // Note: Execution logs (loggingLevel) and detailed route metrics are not supported for HTTP APIs.
        // Avoid setting defaultRouteSettings to prevent BadRequestException during deployment.

        // Alarm: API Gateway HTTP 5xx errors >= 1 in a 5-minute period
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-Api5xxAlarm")
                .alarmName(props.resourceNamePrefix() + "-api-5xx")
                .metric(this.httpApi
                        .metricServerError()
                        .with(MetricOptions.builder()
                                .period(Duration.minutes(5))
                                .build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("API Gateway 5xx errors >= 1 for API " + this.httpApi.getApiId())
                .build();

        // Create endpoint configurations
        List<EndpointConfig> endpointConfigurations = createEndpointConfigurations(props);

        // Create integrations using Lambda function references
        List<Metric> lambdaInvocations = new java.util.ArrayList<>();
        List<Metric> lambdaErrors = new java.util.ArrayList<>();
        List<Metric> lambdaDurationsP95 = new java.util.ArrayList<>();
        List<Metric> lambdaThrottles = new java.util.ArrayList<>();

        for (int i = 0; i < endpointConfigurations.size(); i++) {
            EndpointConfig endpointConfig = endpointConfigurations.get(i);
            IFunction fn = props.lambdaFunctions().get(endpointConfig.lambdaKey());

            if (fn == null) {
                infof(
                        "Skipping endpoint %s %s - Lambda function %s not found",
                        endpointConfig.httpMethod(), endpointConfig.path(), endpointConfig.lambdaKey());
                continue;
            }

            // Create HTTP Lambda integration
            HttpLambdaIntegration integration = HttpLambdaIntegration.Builder.create(
                            props.resourceNamePrefix() + "-Integration-" + i, fn)
                    .build();

            // Create HTTP route
            HttpRoute.Builder.create(this, props.resourceNamePrefix() + "-Route-" + i)
                    .httpApi(this.httpApi)
                    .routeKey(HttpRouteKey.with(endpointConfig.path(), endpointConfig.httpMethod()))
                    .integration(integration)
                    .build();

            infof(
                    "Created route %s %s for function %s",
                    endpointConfig.httpMethod().toString(), endpointConfig.path(), fn.getFunctionName());

            // Collect metrics for monitoring
            lambdaInvocations.add(fn.metricInvocations());
            lambdaErrors.add(fn.metricErrors());
            lambdaDurationsP95.add(fn.metricDuration()
                    .with(MetricOptions.builder().statistic("p95").build()));
            lambdaThrottles.add(fn.metricThrottles());

            // Per-function error alarm (>=1 error in 5 minutes)
            Alarm.Builder.create(this, props.resourceNamePrefix() + "-LambdaErrors-" + i)
                    .alarmName(props.resourceNamePrefix() + "-lambda-errors-" + i)
                    .metric(fn.metricErrors())
                    .threshold(1.0)
                    .evaluationPeriods(1)
                    .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                    .treatMissingData(TreatMissingData.NOT_BREACHING)
                    .alarmDescription(
                            "Lambda errors >= 1 for " + endpointConfig.path() + " " + endpointConfig.httpMethod())
                    .build();
        }

        // Dashboard
        List<List<software.amazon.awscdk.services.cloudwatch.IWidget>> rows = new java.util.ArrayList<>();

        // Row 1: API Gateway metrics
        rows.add(List.of(
                GraphWidget.Builder.create()
                        .title("API Gateway Requests")
                        .left(List.of(this.httpApi.metricCount()))
                        .width(12)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("API Gateway Errors")
                        .left(List.of(this.httpApi.metricClientError(), this.httpApi.metricServerError()))
                        .width(12)
                        .height(6)
                        .build()));

        // Row 2: API Gateway latency
        rows.add(List.of(GraphWidget.Builder.create()
                .title("API Gateway p95 Latency")
                .left(List.of(this.httpApi
                        .metricLatency()
                        .with(MetricOptions.builder().statistic("p95").build())))
                .width(24)
                .height(6)
                .build()));

        // Row 3: Lambda invocations and errors (if we have any lambdas)
        if (!lambdaInvocations.isEmpty()) {
            rows.add(List.of(
                    GraphWidget.Builder.create()
                            .title("Lambda Invocations by Function")
                            .left(lambdaInvocations)
                            .width(12)
                            .height(6)
                            .build(),
                    GraphWidget.Builder.create()
                            .title("Lambda Errors by Function")
                            .left(lambdaErrors)
                            .width(12)
                            .height(6)
                            .build()));
            rows.add(List.of(
                    GraphWidget.Builder.create()
                            .title("Lambda p95 Duration by Function")
                            .left(lambdaDurationsP95)
                            .width(12)
                            .height(6)
                            .build(),
                    GraphWidget.Builder.create()
                            .title("Lambda Throttles by Function")
                            .left(lambdaThrottles)
                            .width(12)
                            .height(6)
                            .build()));
        }

        this.operationalDashboard = Dashboard.Builder.create(this, props.resourceNamePrefix() + "-RestApiDashboard")
                .dashboardName(props.resourceNamePrefix() + "-api")
                .widgets(rows)
                .build();

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs
        cfnOutput(this, "HttpApiId", this.httpApi.getHttpApiId());

        // Export the API Gateway URL for cross-stack reference
        CfnOutput.Builder.create(this, "HttpApiUrl")
                .value(this.httpApi.getUrl())
                .exportName(props.resourceNamePrefix() + "-HttpApiUrl")
                .description("API Gateway v2 URL for " + props.resourceNamePrefix())
                .build();
        cfnOutput(
                this,
                "OperationalDashboard",
                "https://" + this.getRegion() + ".console.aws.amazon.com/cloudwatch/home?region=" + this.getRegion()
                        + "#dashboards:name=" + this.operationalDashboard.getDashboardName());

        infof(
                "ApiStack %s created successfully for %s with API Gateway URL: %s",
                this.getNode().getId(), props.resourceNamePrefix(), this.httpApi.getUrl());
    }

    private static List<EndpointConfig> createEndpointConfigurations(final ApiStackProps props) {
        List<EndpointConfig> configs = new java.util.ArrayList<>();

        // TODO: Move these to properties of the LambdaUrlOrigin construct and rename that LambdaApiOrigin and use
        // instead of EndpointConfig

        // Map each Lambda key to its endpoint configuration
        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().cognitoAuthUrlGetLambdaUrlPath)
                .httpMethod(props.sharedNames().cognitoAuthUrlGetLambdaHttpMethod)
                .lambdaKey(props.sharedNames().cognitoAuthUrlGetLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().cognitoTokenPostLambdaUrlPath)
                .httpMethod(props.sharedNames().cognitoTokenPostLambdaHttpMethod)
                .lambdaKey(props.sharedNames().cognitoTokenPostLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().hmrcAuthUrlGetLambdaUrlPath)
                .httpMethod(props.sharedNames().hmrcAuthUrlGetLambdaHttpMethod)
                .lambdaKey(props.sharedNames().hmrcAuthUrlGetLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().hmrcTokenPostLambdaUrlPath)
                .httpMethod(props.sharedNames().hmrcTokenPostLambdaHttpMethod)
                .lambdaKey(props.sharedNames().hmrcTokenPostLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().hmrcVatReturnPostLambdaUrlPath)
                .httpMethod(props.sharedNames().hmrcVatReturnPostLambdaHttpMethod)
                .lambdaKey(props.sharedNames().hmrcVatReturnPostLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().receiptPostLambdaUrlPath)
                .httpMethod(props.sharedNames().receiptPostLambdaHttpMethod)
                .lambdaKey(props.sharedNames().receiptPostLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().receiptGetLambdaUrlPath)
                .httpMethod(props.sharedNames().receiptGetLambdaHttpMethod)
                .lambdaKey(props.sharedNames().receiptGetLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().catalogGetLambdaUrlPath)
                .httpMethod(props.sharedNames().catalogGetLambdaHttpMethod)
                .lambdaKey(props.sharedNames().catalogGetLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().bundleGetLambdaUrlPath)
                .httpMethod(props.sharedNames().bundleGetLambdaHttpMethod)
                .lambdaKey(props.sharedNames().bundleGetLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().bundlePostLambdaUrlPath)
                .httpMethod(props.sharedNames().bundlePostLambdaHttpMethod)
                .lambdaKey(props.sharedNames().bundlePostLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().bundleDeleteLambdaUrlPath)
                .httpMethod(props.sharedNames().bundleDeleteLambdaHttpMethod)
                .lambdaKey(props.sharedNames().bundleDeleteLambdaFunctionName)
                .build());

        return configs;
    }
}
