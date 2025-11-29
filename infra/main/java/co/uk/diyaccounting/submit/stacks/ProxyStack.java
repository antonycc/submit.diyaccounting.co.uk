package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
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

    public final ITable proxyConfigTable;
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

        static ImmutableProxyStackProps.Builder builder() {
            return ImmutableProxyStackProps.builder();
        }
    }

    public ProxyStack(Construct scope, String id, ProxyStackProps props) {
        this(scope, id, null, props);
    }

    public ProxyStack(Construct scope, String id, StackProps stackProps, ProxyStackProps props) {
        super(scope, id, stackProps);

        // Apply auto-delete aspect for log retention
        Aspects.of(this)
                .add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_MONTHS));

        // Create DynamoDB table for proxy configuration
        this.proxyConfigTable = Table.Builder.create(this, props.resourceNamePrefix() + "-ProxyConfigTable")
                .tableName(props.sharedNames().proxyConfigTableName)
                .partitionKey(Attribute.builder()
                        .name("proxyHost")
                        .type(AttributeType.STRING)
                        .build())
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        infof(
                "Created proxy config DynamoDB table with name %s and id %s",
                this.proxyConfigTable.getTableName(),
                this.proxyConfigTable.getNode().getId());

        // Create Lambda function for outbound proxy
        this.proxyFunction = Function.Builder.create(this, props.resourceNamePrefix() + "-OutboundProxyFunction")
                .functionName(props.sharedNames().outboundProxyFunctionName)
                .runtime(Runtime.NODEJS_22_X)
                .handler("outboundProxyHandler.handler")
                .code(Code.fromAsset("app/functions/proxy"))
                .timeout(Duration.seconds(30))
                .memorySize(512)
                .environment(Map.of("CONFIG_TABLE_NAME", this.proxyConfigTable.getTableName()))
                .build();

        // Grant read access to DynamoDB table
        this.proxyConfigTable.grantReadData(this.proxyFunction);

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
