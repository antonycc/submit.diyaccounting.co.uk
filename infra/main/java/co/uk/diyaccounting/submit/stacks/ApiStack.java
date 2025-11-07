package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.aws_apigatewayv2_authorizers.HttpJwtAuthorizer;
import software.amazon.awscdk.aws_apigatewayv2_authorizers.HttpLambdaAuthorizer;
import software.amazon.awscdk.aws_apigatewayv2_authorizers.HttpLambdaResponseType;
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
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
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
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        List<ApiLambdaProps> lambdaFunctions();

        static ImmutableApiStackProps.Builder builder() {
            return ImmutableApiStackProps.builder();
        }

        String userPoolId();

        String userPoolClientId();

        String customAuthorizerLambdaArn();
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

    public static class LambdaIntegrations {
        public final List<Metric> lambdaInvocations = new java.util.ArrayList<>();
        public final List<Metric> lambdaErrors = new java.util.ArrayList<>();
        public final List<Metric> lambdaDurationsP95 = new java.util.ArrayList<>();
        public final List<Metric> lambdaThrottles = new java.util.ArrayList<>();
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
        // The resource policy for API Gateway to write to this log group is managed centrally
        // in the ObservabilityStack to avoid hitting the 10 resource policy limit per account
        ILogGroup apiAccessLogs = LogGroup.fromLogGroupName(
                this, props.resourceNamePrefix() + "-ImportedApiAccessLogs", props.sharedNames().apiAccessLogGroupName);

        // Configure default stage access logs and logging level/metrics
        assert this.httpApi.getDefaultStage() != null;
        var defaultStage = (CfnStage) this.httpApi.getDefaultStage().getNode().getDefaultChild();
        assert defaultStage != null;
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

        // Create integrations using Lambda function references
        var lambdaIntegrations = new LambdaIntegrations();

        // Create authorizers to selectively apply to routes
        String issuer = "https://cognito-idp.%s.amazonaws.com/%s".formatted(getRegion(), props.userPoolId());
        HttpJwtAuthorizer jwtAuthorizer = HttpJwtAuthorizer.Builder.create(
                        props.resourceNamePrefix() + "-CognitoAuthorizer", issuer)
                .jwtAudience(List.of(props.userPoolClientId()))
                .build();

        // Create custom Lambda authorizer for X-Authorization header
        IFunction customAuthorizerLambda = Function.fromFunctionAttributes(
                this,
                props.resourceNamePrefix() + "-CustomAuthorizerLambda",
                FunctionAttributes.builder()
                        .functionArn(props.customAuthorizerLambdaArn())
                        .sameEnvironment(true)
                        .build());

        HttpLambdaAuthorizer customAuthorizer = HttpLambdaAuthorizer.Builder.create(
                        props.resourceNamePrefix() + "-CustomAuthorizer", customAuthorizerLambda)
                .responseTypes(List.of(HttpLambdaResponseType.IAM))
                .identitySource(List.of("$request.header.X-Authorization"))
                .resultsCacheTtl(Duration.minutes(5))
                .build();

        java.util.Set<String> createdRouteKeys = new java.util.HashSet<>();
        java.util.Map<String, String> firstCreatorByRoute = new java.util.HashMap<>();
        for (int i = 0; i < props.lambdaFunctions().size(); i++) {
            ApiLambdaProps apiLambdaProps = props.lambdaFunctions().get(i);
            String routeKeyStr = apiLambdaProps.httpMethod().toString() + " " + apiLambdaProps.urlPath();
            if (createdRouteKeys.contains(routeKeyStr)) {
                String firstCreator = firstCreatorByRoute.getOrDefault(routeKeyStr, "<unknown>");
                infof(
                        "Skipping duplicate route %s (attempted by %s, first created by %s)",
                        routeKeyStr, apiLambdaProps.functionName(), firstCreator);
                continue;
            }
            createdRouteKeys.add(routeKeyStr);
            firstCreatorByRoute.put(routeKeyStr, apiLambdaProps.functionName());
            createRouteForLambda(apiLambdaProps, jwtAuthorizer, customAuthorizer, lambdaIntegrations);
        }

        // Synthesis-time diagnostics: list all created routes
        if (!createdRouteKeys.isEmpty()) {
            var sorted = new java.util.ArrayList<>(createdRouteKeys);
            java.util.Collections.sort(sorted);
            infof("Total unique API routes synthesized: %d", sorted.size());
            for (String rk : sorted) {
                String creator = firstCreatorByRoute.getOrDefault(rk, "<unknown>");
                infof(" - %s (by %s)", rk, creator);
            }
        } else {
            infof("No API routes synthesized");
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
        if (!lambdaIntegrations.lambdaInvocations.isEmpty()) {
            rows.add(List.of(
                    GraphWidget.Builder.create()
                            .title("Lambda Invocations by Function")
                            .left(lambdaIntegrations.lambdaInvocations)
                            .width(12)
                            .height(6)
                            .build(),
                    GraphWidget.Builder.create()
                            .title("Lambda Errors by Function")
                            .left(lambdaIntegrations.lambdaErrors)
                            .width(12)
                            .height(6)
                            .build()));
            rows.add(List.of(
                    GraphWidget.Builder.create()
                            .title("Lambda p95 Duration by Function")
                            .left(lambdaIntegrations.lambdaDurationsP95)
                            .width(12)
                            .height(6)
                            .build(),
                    GraphWidget.Builder.create()
                            .title("Lambda Throttles by Function")
                            .left(lambdaIntegrations.lambdaThrottles)
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

    private void createRouteForLambda(
            ApiLambdaProps apiLambdaProps,
            HttpJwtAuthorizer jwtAuthorizer,
            HttpLambdaAuthorizer customAuthorizer,
            LambdaIntegrations lambdaIntegrations) {

        // Build stable, unique construct IDs per route using method+path signature
        String keySuffix = (apiLambdaProps.httpMethod().toString() + "-" + apiLambdaProps.urlPath())
                .replaceAll("[^A-Za-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");

        String importedFnId = apiLambdaProps.functionName() + "-imported-" + keySuffix;
        String integrationId = apiLambdaProps.functionName() + "-Integration-" + keySuffix;
        String routeId = apiLambdaProps.functionName() + "-Route-" + keySuffix;

        IFunction fn = Function.fromFunctionAttributes(
                this,
                importedFnId,
                FunctionAttributes.builder()
                        .functionArn(apiLambdaProps.lambdaArn())
                        .sameEnvironment(true)
                        .build());

        // Create HTTP Lambda integration
        HttpLambdaIntegration integration =
                HttpLambdaIntegration.Builder.create(integrationId, fn).build();

        // Create HTTP route with appropriate authorizer
        var routeKey = HttpRouteKey.with(apiLambdaProps.urlPath(), apiLambdaProps.httpMethod());
        if (apiLambdaProps.customAuthorizer()) {
            HttpRoute.Builder.create(this, routeId)
                    .httpApi(this.httpApi)
                    .routeKey(routeKey)
                    .integration(integration)
                    .authorizer(customAuthorizer)
                    .build();
        } else if (apiLambdaProps.jwtAuthorizer()) {
            HttpRoute.Builder.create(this, routeId)
                    .httpApi(this.httpApi)
                    .routeKey(routeKey)
                    .integration(integration)
                    .authorizer(jwtAuthorizer)
                    .build();
        } else {
            HttpRoute.Builder.create(this, routeId)
                    .httpApi(this.httpApi)
                    .routeKey(routeKey)
                    .integration(integration)
                    .build();
        }

        infof(
                "Created route %s %s for function %s",
                apiLambdaProps.httpMethod().toString(), apiLambdaProps.urlPath(), fn.getFunctionName());

        // Collect metrics for monitoring
        lambdaIntegrations.lambdaInvocations.add(fn.metricInvocations());
        lambdaIntegrations.lambdaErrors.add(fn.metricErrors());
        lambdaIntegrations.lambdaDurationsP95.add(fn.metricDuration()
                .with(MetricOptions.builder().statistic("p95").build()));
        lambdaIntegrations.lambdaThrottles.add(fn.metricThrottles());

        // Per-function error alarm (>=1 error in 5 minutes)
        Alarm.Builder.create(this, apiLambdaProps.functionName() + "-LambdaErrors-" + keySuffix)
                .alarmName(apiLambdaProps.functionName() + "-lambda-errors-" + keySuffix)
                .metric(fn.metricErrors())
                .threshold(1.0)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription(
                        "Lambda errors >= 1 for " + apiLambdaProps.urlPath() + " " + apiLambdaProps.httpMethod())
                .build();
    }
}
