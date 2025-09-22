package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.awssdk.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;

import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginProps;
import java.util.HashMap;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class AuthStack extends Stack {

    public Function authUrlMockLambda;
    public LogGroup authUrlMockLambdaLogGroup;
    public Function authUrlCognitoLambda;
    public LogGroup authUrlCognitoLambdaLogGroup;
    public Function exchangeCognitoTokenLambda;
    public LogGroup exchangeCognitoTokenLambdaLogGroup;

    @Value.Immutable
    public interface AuthStackProps extends StackProps {
        String envName();

        String subDomainName();

        String resourceNamePrefix();

        String compressedResourceNamePrefix();

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

        // Values are provided via SubmitApplication after context/env resolution

        // Build naming using same patterns as WebStack
        // String dashedDomainName = buildNonProdDomainName(props.env(), props.subDomainName(), props.hostedZoneName());

        boolean cloudTrailEnabled = Boolean.parseBoolean(props.cloudTrailEnabled());
        boolean xRayEnabled = Boolean.parseBoolean(props.xRayEnabled());

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(props.lambdaUrlAuthType())
                ? FunctionUrlAuthType.AWS_IAM
                : FunctionUrlAuthType.NONE;

        // var lambdaUrlToOriginsBehaviourMappings = new HashMap<String, String>();

        // authUrl - mock
        var authUrlMockLambdaEnv = new HashMap<String, String>();
        // if (StringUtils.isNotBlank(props.homeUrl)) {
        authUrlMockLambdaEnv.put("DIY_SUBMIT_HOME_URL", props.homeUrl());
        // }
        var authUrlMockLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("AuthUrlMock")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .imageFilename("authUrlMock.Dockerfile")
                        .functionName(buildFunctionName(props.compressedResourceNamePrefix(), "authUrl.httpGetMock"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + "authUrl.httpGetMock")
                        .environment(authUrlMockLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlMockLambda = authUrlMockLambdaUrlOrigin.lambda;
        // this.authUrlMockLambdaUrl = authUrlMockLambdaUrlOrigin.functionUrl;
        this.authUrlMockLambdaLogGroup = authUrlMockLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for mock auth URL with handler %s",
                this.authUrlMockLambda.getNode().getId(), props.lambdaEntry() + "authUrl.httpGetMock");
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/mock/auth-url" + "*", authUrlMockLambdaUrlOrigin.lambda.getFunctionArn());

        // authUrl - Google or Antonycc via Cognito
        var authUrlCognitoLambdaEnv = new HashMap<String, String>();
        // if (StringUtils.isNotBlank(props.homeUrl)) {
        authUrlCognitoLambdaEnv.put("DIY_SUBMIT_HOME_URL", props.homeUrl());
        // }
        // if (StringUtils.isNotBlank(props.cognitoClientId)) {
        authUrlCognitoLambdaEnv.put("DIY_SUBMIT_COGNITO_CLIENT_ID", props.cognitoClientId());
        // }
        // if (StringUtils.isNotBlank(props.cognitoBaseUri)) {
        authUrlCognitoLambdaEnv.put("DIY_SUBMIT_COGNITO_BASE_URI", props.cognitoBaseUri());
        // }
        var authUrlCognitoLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("AuthUrlCognito")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .imageFilename("authUrlCognito.Dockerfile")
                        .functionName(buildFunctionName(props.compressedResourceNamePrefix(), "authUrl.httpGetCognito"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + "authUrl.httpGetCognito")
                        .environment(authUrlCognitoLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlCognitoLambda = authUrlCognitoLambdaUrlOrigin.lambda;
        // this.authUrlCognitoLambdaUrl = authUrlCognitoLambdaUrlOrigin.functionUrl;
        this.authUrlCognitoLambdaLogGroup = authUrlCognitoLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for Cognito auth URL with handler %s",
                this.authUrlCognitoLambda.getNode().getId(), props.lambdaEntry() + "authUrl.httpGetCognito");
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/cognito/auth-url" + "*", authUrlCognitoLambdaUrlOrigin.lambda.getFunctionArn());

        // exchangeToken - Google or Antonycc via Cognito
        var exchangeCognitoTokenLambdaEnv = new HashMap<String, String>();
        // if (StringUtils.isNotBlank(props.homeUrl)) {
        exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_HOME_URL", props.homeUrl());
        // }
        // if (StringUtils.isNotBlank(props.cognitoBaseUri)) {
        exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_COGNITO_BASE_URI", props.cognitoBaseUri());
        // }
        // if (StringUtils.isNotBlank(props.cognitoClientId)) {
        exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_COGNITO_CLIENT_ID", props.cognitoClientId());
        // }
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
                        .imageFilename("exchangeCognitoToken.Dockerfile")
                        .functionName(buildFunctionName(
                                props.compressedResourceNamePrefix(), "exchangeToken.httpPostCognito"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "exchangeToken.httpPostCognito")
                        .environment(exchangeCognitoTokenLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.exchangeCognitoTokenLambda = exchangeCognitoTokenLambdaUrlOrigin.lambda;
        // this.exchangeCognitoTokenLambdaUrl = exchangeCognitoTokenLambdaUrlOrigin.functionUrl;
        this.exchangeCognitoTokenLambdaLogGroup = exchangeCognitoTokenLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for Cognito exchange token with handler %s",
                this.exchangeCognitoTokenLambda.getNode().getId(),
                props.lambdaEntry() + "exchangeToken.httpPostCognito");
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/cognito/exchange-token" + "*", exchangeCognitoTokenLambdaUrlOrigin.lambda.getFunctionArn());

        // if (this.authUrlMockLambda != null) {
        //    CfnOutput.Builder.create(this, "AuthUrlMockLambdaArn")
        //        .value(this.authUrlMockLambda.getFunctionArn())
        //        .build();
        // CfnOutput.Builder.create(this, "AuthUrlMockLambdaUrl")
        //    .value(this.authUrlMockLambdaUrl.getUrl())
        //    .build();
        // }

        // this.additionalOriginsBehaviourMappings = lambdaUrlToOriginsBehaviourMappings;

        cfnOutput(this, "AuthUrlMockLambdaArn", this.authUrlMockLambda.getFunctionArn());
        cfnOutput(this, "AuthUrlCognitoLambdaArn", this.authUrlCognitoLambda.getFunctionArn());
        cfnOutput(this, "ExchangeCognitoTokenLambdaArn", this.exchangeCognitoTokenLambda.getFunctionArn());

        infof("AuthStack %s created successfully for %s", this.getNode().getId(), props.compressedResourceNamePrefix());
    }
}
