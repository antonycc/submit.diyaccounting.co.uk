package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.aws_apigatewayv2_integrations.HttpLambdaIntegration;
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
import software.amazon.awscdk.services.lambda.IFunction;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

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

        // Map each Lambda key to its endpoint configuration
        configs.add(EndpointConfig.builder()
                .path("/cognito/authUrl")
                .httpMethod(HttpMethod.GET)
                .lambdaKey("authUrlCognito")
                .build());

        configs.add(EndpointConfig.builder()
                .path("/cognito/token")
                .httpMethod(HttpMethod.POST)
                .lambdaKey("exchangeCognitoToken")
                .build());

        configs.add(EndpointConfig.builder()
                .path("/hmrc/authUrl")
                .httpMethod(HttpMethod.GET)
                .lambdaKey("authUrlHmrc")
                .build());

        configs.add(EndpointConfig.builder()
                .path("/hmrc/token")
                .httpMethod(HttpMethod.POST)
                .lambdaKey("exchangeHmrcToken")
                .build());

        configs.add(EndpointConfig.builder()
                .path("/hmrc/vat/return")
                .httpMethod(HttpMethod.POST)
                .lambdaKey("submitVat")
                .build());

        configs.add(EndpointConfig.builder()
                .path("/hmrc/receipt")
                .httpMethod(HttpMethod.POST)
                .lambdaKey("logReceipt")
                .build());

        configs.add(EndpointConfig.builder()
                .path("/hmrc/receipt")
                .httpMethod(HttpMethod.GET)
                .lambdaKey("myReceipts")
                .build());

        // TODO: YOU ARE HERE switching to REST
        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().catalogLambdaUrlPath)
                .httpMethod(props.sharedNames().catalogLambdaHttpMethod)
                .lambdaKey(props.sharedNames().catalogLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path(props.sharedNames().catalogLambdaUrlPath)
                .httpMethod(props.sharedNames().catalogLambdaHttpMethod)
                .lambdaKey(props.sharedNames().catalogLambdaFunctionName)
                .build());

        configs.add(EndpointConfig.builder()
                .path("/bundle")
                .httpMethod(HttpMethod.POST)
                .lambdaKey("requestBundles")
                .build());

        configs.add(EndpointConfig.builder()
                .path("/bundle")
                .httpMethod(HttpMethod.DELETE)
                .lambdaKey("bundleDelete")
                .build());

        configs.add(EndpointConfig.builder()
                .path("/bundle")
                .httpMethod(HttpMethod.GET)
                .lambdaKey("myBundles")
                .build());

        return configs;
    }
}
