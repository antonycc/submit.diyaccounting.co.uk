package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.util.List;
import java.util.Optional;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

public class AuthStack extends Stack {

    public ApiLambdaProps cognitoAuthUrlGetLambdaProps;
    public Function cognitoAuthUrlGetLambda;
    public LogGroup cognitoAuthUrlGetLambdaLogGroup;
    public ApiLambdaProps cognitoTokenPostLambdaProps;
    public Function cognitoTokenPostLambda;
    public LogGroup cognitoTokenPostLambdaLogGroup;
    public List<ApiLambdaProps> lambdaFunctionProps;

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

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(props.lambdaUrlAuthType())
                ? FunctionUrlAuthType.AWS_IAM
                : FunctionUrlAuthType.NONE;

        // authUrl - Google or Antonycc via Cognito
        var authUrlCognitoLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("COGNITO_CLIENT_ID", props.cognitoClientId())
                .with("COGNITO_BASE_URI", props.sharedNames().cognitoBaseUri);

        var authUrlCognitoLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().cognitoAuthUrlGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().cognitoAuthUrlGetLambdaFunctionName)
                        .lambdaArn(props.sharedNames().cognitoAuthUrlGetLambdaArn)
                        .httpMethod(props.sharedNames().cognitoAuthUrlGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().cognitoAuthUrlGetLambdaUrlPath)
                        .handler(props.sharedNames().cognitoAuthUrlGetLambdaHandler)
                        //.cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .environment(authUrlCognitoLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.cognitoAuthUrlGetLambdaProps = authUrlCognitoLambdaUrlOrigin.props;
        this.cognitoAuthUrlGetLambda = authUrlCognitoLambdaUrlOrigin.lambda;
        this.cognitoAuthUrlGetLambdaLogGroup = authUrlCognitoLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.cognitoAuthUrlGetLambdaProps);
        infof(
                "Created Lambda %s for Cognito auth URL with handler %s",
                this.cognitoAuthUrlGetLambda.getNode().getId(),
                props.sharedNames().cognitoAuthUrlGetLambdaHandler);

        // exchangeToken - Google or Antonycc via Cognito
        var exchangeCognitoTokenLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("COGNITO_BASE_URI", props.sharedNames().cognitoBaseUri)
                .with("COGNITO_CLIENT_ID", props.cognitoClientId());
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeCognitoTokenLambdaEnv.with(
                    "TEST_ACCESS_TOKEN", props.optionalTestAccessToken().get());
        }
        var exchangeCognitoTokenLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().cognitoTokenPostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().cognitoTokenPostLambdaFunctionName)
                        .handler(props.lambdaEntry() + props.sharedNames().cognitoTokenPostLambdaHandler)
                        .lambdaArn(props.sharedNames().cognitoTokenPostLambdaArn)
                        .httpMethod(props.sharedNames().cognitoTokenPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().cognitoTokenPostLambdaUrlPath)
                        //.cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL) // Is this used?
                        .environment(exchangeCognitoTokenLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.cognitoTokenPostLambdaProps = exchangeCognitoTokenLambdaUrlOrigin.props;
        this.cognitoTokenPostLambda = exchangeCognitoTokenLambdaUrlOrigin.lambda;
        this.cognitoTokenPostLambdaLogGroup = exchangeCognitoTokenLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.cognitoTokenPostLambdaProps);
        infof(
                "Created Lambda %s for Cognito exchange token with handler %s",
                this.cognitoTokenPostLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().cognitoTokenPostLambdaHandler);

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        cfnOutput(this, "AuthUrlCognitoLambdaArn", this.cognitoAuthUrlGetLambda.getFunctionArn());
        cfnOutput(this, "ExchangeCognitoTokenLambdaArn", this.cognitoTokenPostLambda.getFunctionArn());

        infof("AuthStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
