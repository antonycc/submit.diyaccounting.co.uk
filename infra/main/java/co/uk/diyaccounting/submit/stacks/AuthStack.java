package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
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
import software.amazon.awscdk.services.logs.RetentionDays;
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
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String baseImageTag();

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
        var authUrlMockLambdaEnv =
                new PopulatedMap<String, String>().with("DIY_SUBMIT_BASE_URL", props.sharedNames().baseUrl);
        var authUrlMockLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().authUrlMockLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().authUrlMockLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + props.sharedNames().authUrlMockLambdaHandler)
                        .environment(authUrlMockLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlMockLambda = authUrlMockLambdaUrlOrigin.lambda;
        this.authUrlMockLambdaLogGroup = authUrlMockLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for mock auth URL with handler %s",
                this.authUrlMockLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().authUrlMockLambdaHandler);

        // authUrl - Google or Antonycc via Cognito
        var authUrlCognitoLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().baseUrl)
                .with("COGNITO_CLIENT_ID", props.cognitoClientId())
                .with("COGNITO_BASE_URI", props.cognitoBaseUri());

        var authUrlCognitoLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().authUrlCognitoLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().authUrlCognitoLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + props.sharedNames().authUrlCognitoLambdaHandler)
                        .environment(authUrlCognitoLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlCognitoLambda = authUrlCognitoLambdaUrlOrigin.lambda;
        this.authUrlCognitoLambdaLogGroup = authUrlCognitoLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for Cognito auth URL with handler %s",
                this.authUrlCognitoLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().authUrlCognitoLambdaHandler);

        // exchangeToken - Google or Antonycc via Cognito
        var exchangeCognitoTokenLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().baseUrl)
                .with("COGNITO_BASE_URI", props.cognitoBaseUri())
                .with("COGNITO_CLIENT_ID", props.cognitoClientId());
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeCognitoTokenLambdaEnv.with(
                    "TEST_ACCESS_TOKEN", props.optionalTestAccessToken().get());
        }
        var exchangeCognitoTokenLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().exchangeCognitoTokenLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().exchangeCognitoTokenLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().exchangeCognitoTokenLambdaHandler)
                        .environment(exchangeCognitoTokenLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.exchangeCognitoTokenLambda = exchangeCognitoTokenLambdaUrlOrigin.lambda;
        this.exchangeCognitoTokenLambdaLogGroup = exchangeCognitoTokenLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for Cognito exchange token with handler %s",
                this.exchangeCognitoTokenLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().exchangeCognitoTokenLambdaHandler);

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

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

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
