package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginProps;
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
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String compressedResourceNamePrefix();

        String subDomainName();

        String hostedZoneName();

        String cloudTrailEnabled();

        String xRayEnabled();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        String lambdaEntry();

        String lambdaUrlAuthType();

        String homeUrl();

        String cognitoClientId();

        String cognitoBaseUri();

        // Optional test access token for local/dev testing without real Cognito interaction
        // @Value.Default
        Optional<String> optionalTestAccessToken(); // {
        // return Optional.empty();
        // }

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

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
        var authUrlMockLambdaEnv = new HashMap<String, String>();
        authUrlMockLambdaEnv.put("DIY_SUBMIT_HOME_URL", props.homeUrl());
        var authUrlMockLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("AuthUrlMock")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(buildFunctionName(props.resourceNamePrefix(), "authUrl.httpGetMock"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + "authUrl.httpGetMock")
                        .environment(authUrlMockLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlMockLambda = authUrlMockLambdaUrlOrigin.lambda;
        this.authUrlMockLambdaLogGroup = authUrlMockLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for mock auth URL with handler %s",
                this.authUrlMockLambda.getNode().getId(), props.lambdaEntry() + "authUrl.httpGetMock");

        // authUrl - Google or Antonycc via Cognito
        var authUrlCognitoLambdaEnv = new HashMap<String, String>();
        authUrlCognitoLambdaEnv.put("DIY_SUBMIT_HOME_URL", props.homeUrl());
        authUrlCognitoLambdaEnv.put("DIY_SUBMIT_COGNITO_CLIENT_ID", props.cognitoClientId());
        authUrlCognitoLambdaEnv.put("DIY_SUBMIT_COGNITO_BASE_URI", props.cognitoBaseUri());
        var authUrlCognitoLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("AuthUrlCognito")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(buildFunctionName(props.resourceNamePrefix(), "authUrl.httpGetCognito"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + "authUrl.httpGetCognito")
                        .environment(authUrlCognitoLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlCognitoLambda = authUrlCognitoLambdaUrlOrigin.lambda;
        this.authUrlCognitoLambdaLogGroup = authUrlCognitoLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for Cognito auth URL with handler %s",
                this.authUrlCognitoLambda.getNode().getId(), props.lambdaEntry() + "authUrl.httpGetCognito");

        // exchangeToken - Google or Antonycc via Cognito
        var exchangeCognitoTokenLambdaEnv = new HashMap<String, String>();
        exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_HOME_URL", props.homeUrl());
        exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_COGNITO_BASE_URI", props.cognitoBaseUri());
        exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_COGNITO_CLIENT_ID", props.cognitoClientId());
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeCognitoTokenLambdaEnv.put(
                    "DIY_SUBMIT_TEST_ACCESS_TOKEN",
                    props.optionalTestAccessToken().get());
        }
        var exchangeCognitoTokenLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("ExchangeCognitoToken")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(buildFunctionName(props.resourceNamePrefix(), "exchangeToken.httpPostCognito"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "exchangeToken.httpPostCognito")
                        .environment(exchangeCognitoTokenLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.exchangeCognitoTokenLambda = exchangeCognitoTokenLambdaUrlOrigin.lambda;
        this.exchangeCognitoTokenLambdaLogGroup = exchangeCognitoTokenLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for Cognito exchange token with handler %s",
                this.exchangeCognitoTokenLambda.getNode().getId(),
                props.lambdaEntry() + "exchangeToken.httpPostCognito");

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
