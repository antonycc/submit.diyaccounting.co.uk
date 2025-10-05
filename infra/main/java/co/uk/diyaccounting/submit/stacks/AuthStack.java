package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.Optional;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;

public class AuthStack extends Stack {

    public Function authUrlMockLambda;
    public LogGroup authUrlMockLambdaLogGroup;
    public Function authUrlCognitoLambda;
    public LogGroup authUrlCognitoLambdaLogGroup;
    public Function exchangeCognitoTokenLambda;
    public LogGroup exchangeCognitoTokenLambdaLogGroup;

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
        String compressedResourceNamePrefix();

        @Override
        String dashedDomainName();

        @Override
        String domainName();

        @Override
        String baseUrl();

        @Override
        String cloudTrailEnabled();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        String lambdaEntry();

        String lambdaUrlAuthType();

        String cognitoClientId();

        String cognitoBaseUri();

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

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(props.lambdaUrlAuthType())
                ? FunctionUrlAuthType.AWS_IAM
                : FunctionUrlAuthType.NONE;

        // authUrl - mock
        var authUrlMockLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.baseUrl());
        var authUrlMockLambdaUrlOriginFunctionHandler = "authUrl.httpGetMock";
        var authUrlMockLambdaFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), authUrlMockLambdaUrlOriginFunctionHandler);
        var authUrlMockLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(authUrlMockLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(authUrlMockLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + authUrlMockLambdaUrlOriginFunctionHandler)
                        .environment(authUrlMockLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlMockLambda = authUrlMockLambdaUrlOrigin.lambda;
        this.authUrlMockLambdaLogGroup = authUrlMockLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for mock auth URL with handler %s",
                this.authUrlMockLambda.getNode().getId(), props.lambdaEntry() + authUrlMockLambdaUrlOriginFunctionHandler);

        // authUrl - Google or Antonycc via Cognito
        var authUrlCognitoLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.baseUrl())
                .with("COGNITO_CLIENT_ID", props.cognitoClientId())
                .with("COGNITO_BASE_URI", props.cognitoBaseUri());
        var authUrlCognitoLambdaUrlOriginFunctionHandler = "authUrl.httpGetCognito";
        var authUrlCognitoLambdaFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), authUrlCognitoLambdaUrlOriginFunctionHandler);
        var authUrlCognitoLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(authUrlCognitoLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(authUrlCognitoLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + authUrlCognitoLambdaUrlOriginFunctionHandler)
                        .environment(authUrlCognitoLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlCognitoLambda = authUrlCognitoLambdaUrlOrigin.lambda;
        this.authUrlCognitoLambdaLogGroup = authUrlCognitoLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for Cognito auth URL with handler %s",
                this.authUrlCognitoLambda.getNode().getId(), props.lambdaEntry() + authUrlCognitoLambdaUrlOriginFunctionHandler);

        // exchangeToken - Google or Antonycc via Cognito
        var exchangeCognitoTokenLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.baseUrl())
                .with("COGNITO_BASE_URI", props.cognitoBaseUri())
                .with("COGNITO_CLIENT_ID", props.cognitoClientId());
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeCognitoTokenLambdaEnv.with(
                    "TEST_ACCESS_TOKEN",
                    props.optionalTestAccessToken().get());
        }
        var exchangeCognitoTokenLambdaUrlOriginFunctionHandler = "exchangeToken.httpPostCognito";
        var exchangeCognitoTokenLambdaUrlOriginFunctionName =
                buildFunctionName(props.compressedResourceNamePrefix(), exchangeCognitoTokenLambdaUrlOriginFunctionHandler);
        var exchangeCognitoTokenLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(exchangeCognitoTokenLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(exchangeCognitoTokenLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + exchangeCognitoTokenLambdaUrlOriginFunctionHandler)
                        .environment(exchangeCognitoTokenLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.exchangeCognitoTokenLambda = exchangeCognitoTokenLambdaUrlOrigin.lambda;
        this.exchangeCognitoTokenLambdaLogGroup = exchangeCognitoTokenLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for Cognito exchange token with handler %s",
                this.exchangeCognitoTokenLambda.getNode().getId(),
                props.lambdaEntry() + exchangeCognitoTokenLambdaUrlOriginFunctionHandler);

        // Create Function URLs for cross-region access
        var authUrlMockUrl = this.authUrlMockLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var authUrlCognitoUrl = this.authUrlCognitoLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var exchangeCognitoTokenUrl = this.exchangeCognitoTokenLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());

        cfnOutput(this, "AuthUrlMockLambdaArn", this.authUrlMockLambda.getFunctionArn());
        cfnOutput(this, "AuthUrlCognitoLambdaArn", this.authUrlCognitoLambda.getFunctionArn());
        cfnOutput(this, "ExchangeCognitoTokenLambdaArn", this.exchangeCognitoTokenLambda.getFunctionArn());

        // Output Function URLs for EdgeStack to use as HTTP origins
        cfnOutput(this, "AuthUrlMockLambdaUrl", authUrlMockUrl.getUrl());
        cfnOutput(this, "AuthUrlCognitoLambdaUrl", authUrlCognitoUrl.getUrl());
        cfnOutput(this, "ExchangeCognitoTokenLambdaUrl", exchangeCognitoTokenUrl.getUrl());

        infof("AuthStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
