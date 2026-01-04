package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class AuthStack extends Stack {

    //    public AbstractApiLambdaProps cognitoAuthUrlGetLambdaProps;
    //    public Function cognitoAuthUrlGetLambda;
    //    public ILogGroup cognitoAuthUrlGetLambdaLogGroup;
    public AbstractApiLambdaProps cognitoTokenPostLambdaProps;
    public Function cognitoTokenPostLambda;
    public ILogGroup cognitoTokenPostLambdaLogGroup;
    public AbstractApiLambdaProps customAuthorizerLambdaProps;
    public Function customAuthorizerLambda;
    public ILogGroup customAuthorizerLambdaLogGroup;
    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface AuthStackProps extends StackProps, SubmitStackProps {

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

        String cognitoClientId();

        String cognitoUserPoolId();

        String cognitoUserPoolClientId();

        // Optional test access token for local/dev testing without real Cognito interaction
        Optional<String> optionalTestAccessToken(); //

        static ImmutableAuthStackProps.Builder builder() {
            return ImmutableAuthStackProps.builder();
        }
    }

    public AuthStack(Construct scope, String id, AuthStackProps props) {
        this(scope, id, null, props);
    }

    public AuthStack(Construct scope, String id, StackProps stackProps, AuthStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // exchangeToken - Google or Antonycc via Cognito
        var exchangeCognitoTokenLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("COGNITO_BASE_URI", props.sharedNames().cognitoBaseUri)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("COGNITO_CLIENT_ID", props.cognitoClientId());
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeCognitoTokenLambdaEnv.with(
                    "TEST_ACCESS_TOKEN", props.optionalTestAccessToken().get());
        }
        var exchangeCognitoTokenLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().cognitoTokenPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().cognitoTokenPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().cognitoTokenPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().cognitoTokenPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().cognitoTokenPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(1)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().cognitoTokenPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().cognitoTokenPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().cognitoTokenPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().cognitoTokenPostLambdaCustomAuthorizer)
                        .environment(exchangeCognitoTokenLambdaEnv)
                        .build());
        this.cognitoTokenPostLambdaProps = exchangeCognitoTokenLambdaUrlOrigin.apiProps;
        this.cognitoTokenPostLambda = exchangeCognitoTokenLambdaUrlOrigin.ingestLambda;
        this.cognitoTokenPostLambdaLogGroup = exchangeCognitoTokenLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.cognitoTokenPostLambdaProps);
        infof(
                "Created Lambda %s for Cognito exchange token with ingestHandler %s",
                this.cognitoTokenPostLambda.getNode().getId(), props.sharedNames().cognitoTokenPostIngestLambdaHandler);

        // Grant Lambdas access to DynamoDB Bundles Table
        bundlesTable.grantReadWriteData(this.cognitoTokenPostLambda);
        infof(
                "Granted Lambda %s read/write access to DynamoDB Table %s",
                this.cognitoTokenPostLambda.getNode().getId(), props.sharedNames().bundlesTableName);

        // Custom authorizer Lambda for X-Authorization header
        var customAuthorizerLambdaEnv = new PopulatedMap<String, String>()
                .with("COGNITO_USER_POOL_ID", props.cognitoUserPoolId())
                .with("COGNITO_USER_POOL_CLIENT_ID", props.cognitoUserPoolClientId())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName);
        var customAuthorizerLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().customAuthorizerIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().customAuthorizerIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().customAuthorizerIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().customAuthorizerIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().customAuthorizerIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(1)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(HttpMethod.GET) // Not used for authorizers but required by props
                        .urlPath("/") // Not used for authorizers but required by props
                        .jwtAuthorizer(false)
                        .customAuthorizer(false)
                        .environment(customAuthorizerLambdaEnv)
                        .build());
        this.customAuthorizerLambdaProps = customAuthorizerLambda.apiProps;
        this.customAuthorizerLambda = customAuthorizerLambda.ingestLambda;
        this.customAuthorizerLambdaLogGroup = customAuthorizerLambda.logGroup;
        infof(
                "Created Custom Authorizer Lambda %s with ingestHandler %s",
                this.customAuthorizerLambda.getNode().getId(), props.sharedNames().customAuthorizerIngestLambdaHandler);

        // Grant Custom Authorizer Lambda access to DynamoDB Bundles Table
        bundlesTable.grantReadWriteData(this.customAuthorizerLambda);
        infof(
                "Granted Custom Authorizer Lambda %s read/write access to DynamoDB Table %s",
                this.customAuthorizerLambda.getNode().getId(), props.sharedNames().bundlesTableName);

        // cfnOutput(this, "AuthUrlCognitoLambdaArn", this.cognitoAuthUrlGetLambda.getFunctionArn());
        cfnOutput(this, "ExchangeCognitoTokenLambdaArn", this.cognitoTokenPostLambda.getFunctionArn());
        cfnOutput(this, "CustomAuthorizerLambdaArn", this.customAuthorizerLambda.getFunctionArn());

        infof("AuthStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
