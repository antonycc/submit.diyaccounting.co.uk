package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.aws_apigatewayv2_integrations.HttpLambdaIntegration;
import software.amazon.awscdk.services.apigatewayv2.CfnStage;
import software.amazon.awscdk.services.apigatewayv2.HttpApi;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;
import software.amazon.awscdk.services.apigatewayv2.HttpRoute;
import software.amazon.awscdk.services.apigatewayv2.HttpRouteKey;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

public class ProxyStack extends Stack {

    public final ITable proxyStateTable;
    public final Function proxyFunction;
    public final HttpApi proxyApi;
    public final LogGroup accessLogGroup;

    @Value.Immutable
    public interface ProxyStackProps extends StackProps, SubmitStackProps {

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

        String hmrcApiProxyEgressUrl();

        String hmrcSandboxApiProxyEgressUrl();

        String hmrcApiProxyMappedUrl();

        String hmrcSandboxApiProxyMappedUrl();

        String rateLimitPerSecond();

        String breakerErrorThreshold();

        String breakerLatencyMs();

        String breakerCooldownSeconds();

        static ImmutableProxyStackProps.Builder builder() {
            return ImmutableProxyStackProps.builder();
        }
    }

    public ProxyStack(Construct scope, String id, ProxyStackProps props) {
        this(scope, id, null, props);
    }

    public ProxyStack(Construct scope, String id, StackProps stackProps, ProxyStackProps props) {
        super(scope, id, stackProps);

        // Create DynamoDB table for proxy state (rate limiting and circuit breaker)
        this.proxyStateTable = Table.Builder.create(this, props.resourceNamePrefix() + "-ProxyStateTable")
                .tableName(props.sharedNames().proxyStateTableName)
                .partitionKey(Attribute.builder()
                        .name("stateKey")
                        .type(AttributeType.STRING)
                        .build())
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        infof(
                "Created proxy state DynamoDB table with name %s and id %s",
                this.proxyStateTable.getTableName(),
                this.proxyStateTable.getNode().getId());

        // Build environment variables with explicit proxy configuration
        var environmentVars = new java.util.HashMap<String, String>();
        environmentVars.put("STATE_TABLE_NAME", this.proxyStateTable.getTableName());
        environmentVars.put("HMRC_API_PROXY_MAPPED_URL", props.hmrcApiProxyMappedUrl());
        environmentVars.put("HMRC_API_PROXY_EGRESS_URL", props.hmrcApiProxyEgressUrl());
        environmentVars.put("HMRC_SANDBOX_API_PROXY_MAPPED_URL", props.hmrcSandboxApiProxyMappedUrl());
        environmentVars.put("HMRC_SANDBOX_API_PROXY_EGRESS_URL", props.hmrcSandboxApiProxyEgressUrl());
        environmentVars.put("RATE_LIMIT_PER_SECOND", props.rateLimitPerSecond());
        environmentVars.put("BREAKER_ERROR_THRESHOLD", props.breakerErrorThreshold());
        environmentVars.put("BREAKER_LATENCY_MS", props.breakerLatencyMs());
        environmentVars.put("BREAKER_COOLDOWN_SECONDS", props.breakerCooldownSeconds());

        // Determine the path to the proxy function code
        // When running from root (tests), use "app/functions/proxy"
        // When running from cdk-environment (deployment), use "../app/functions/proxy"
        // TODO: Replace all of this with the Api Lambda Construct
        // TODO: Also add an async Lambda wrapper that uses a queue with a worker which stores the result and consumers
        // poll for the result
        // apiEndpoint - http->lambda event, handler - api origin, worker - async processor, poller - result retriever
        // for the poller the inflight request will be identified by a request ID stored in DynamoDB with the result

        var proxyCodePath = java.nio.file.Paths.get("app/functions/infra");
        if (!java.nio.file.Files.exists(proxyCodePath)) {
            proxyCodePath = java.nio.file.Paths.get("../app/functions/infra");
        }

        // Create Lambda function for outbound proxy
        // TODO: Replace with outbound circuit breaker and retry logic in the asyncApiLambdas
        this.proxyFunction = Function.Builder.create(this, props.resourceNamePrefix() + "-OutboundProxyFunction")
                .functionName(props.sharedNames().outboundProxyFunctionName)
                .runtime(Runtime.NODEJS_22_X)
                .handler("hmrcHttpProxy.handler")
                .code(Code.fromAsset(proxyCodePath.toString()))
                .timeout(Duration.seconds(30))
                .memorySize(512)
                .environment(environmentVars)
                .build();

        // Grant read/write access to DynamoDB state table
        this.proxyStateTable.grantReadWriteData(this.proxyFunction);

        infof(
                "Created outbound proxy Lambda function with name %s and ARN %s",
                this.proxyFunction.getFunctionName(), this.proxyFunction.getFunctionArn());

        // Create HTTP API Gateway
        this.proxyApi = HttpApi.Builder.create(this, props.resourceNamePrefix() + "-ProxyApi")
                .apiName(props.sharedNames().proxyApiName)
                .build();

        // Create Lambda integration
        HttpLambdaIntegration proxyIntegration = HttpLambdaIntegration.Builder.create(
                        "ProxyIntegration", this.proxyFunction)
                .build();

        // Add catch-all route
        HttpRoute.Builder.create(this, props.resourceNamePrefix() + "-ProxyRoute")
                .httpApi(this.proxyApi)
                .routeKey(HttpRouteKey.with("/{proxy+}", HttpMethod.ANY))
                .integration(proxyIntegration)
                .build();

        // Grant API Gateway permission to invoke Lambda
        this.proxyFunction.addPermission(
                "AllowApiGatewayInvoke",
                Permission.builder()
                        .principal(new ServicePrincipal("apigateway.amazonaws.com"))
                        .action("lambda:InvokeFunction")
                        .sourceArn(this.proxyApi.arnForExecuteApi())
                        .build());

        infof(
                "Created HTTP API Gateway with endpoint %s",
                this.proxyApi.getApiEndpoint() != null ? this.proxyApi.getApiEndpoint() : "unknown");

        // Create CloudWatch log group for API Gateway access logs
        this.accessLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-ProxyAccessLogs")
                .logGroupName("/aws/apigw/" + props.resourceNamePrefix() + "-proxy/access")
                .retention(RetentionDays.THREE_MONTHS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        infof("Created access log group with name %s", this.accessLogGroup.getLogGroupName());

        // Enable access logging for API Gateway
        CfnStage defaultStage =
                (CfnStage) this.proxyApi.getDefaultStage().getNode().getDefaultChild();
        if (defaultStage != null) {
            defaultStage.setAccessLogSettings(CfnStage.AccessLogSettingsProperty.builder()
                    .destinationArn(this.accessLogGroup.getLogGroupArn())
                    .format("{" + "\"requestId\":\"$context.requestId\","
                            + "\"sourceIp\":\"$context.identity.sourceIp\","
                            + "\"requestTime\":\"$context.requestTime\","
                            + "\"httpMethod\":\"$context.httpMethod\","
                            + "\"routeKey\":\"$context.routeKey\","
                            + "\"status\":\"$context.status\","
                            + "\"protocol\":\"$context.protocol\","
                            + "\"responseLength\":\"$context.responseLength\""
                            + "}")
                    .build());
        }
    }
}
