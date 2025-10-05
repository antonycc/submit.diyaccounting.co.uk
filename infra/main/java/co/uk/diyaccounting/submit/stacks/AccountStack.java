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
import software.amazon.awscdk.services.cognito.IUserPool;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.logs.LogGroup;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;

public class AccountStack extends Stack {

    // CDK resources here
    public Function catalogLambda;
    public LogGroup catalogLambdaLogGroup;
    public Function requestBundlesLambda;
    public LogGroup requestBundlesLambdaLogGroup;
    public Function myBundlesLambda;
    public LogGroup myBundlesLambdaLogGroup;

    @Value.Immutable
    public interface AccountStackProps extends StackProps, SubmitStackProps {

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

        String lambdaUrlAuthType();

        String lambdaEntry();

        String cognitoUserPoolArn();

        static ImmutableAccountStackProps.Builder builder() {
            return ImmutableAccountStackProps.builder();
        }
    }

    public AccountStack(Construct scope, String id, AccountStackProps props) {
        this(scope, id, null, props);
    }

    public AccountStack(Construct scope, String id, StackProps stackProps, AccountStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing Cognito UserPool
        IUserPool userPool = UserPool.fromUserPoolArn(
            this, "ImportedUserPool-%s".formatted(props.deploymentName()),
            props.cognitoUserPoolArn());

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(props.lambdaUrlAuthType())
                ? FunctionUrlAuthType.AWS_IAM
                : FunctionUrlAuthType.NONE;

        // Catalog Lambda
        //var catalogLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_BASE_URL", props.baseUrl()));
        var catalogLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.baseUrl()
                );
        var catalogLambdaUrlOriginFunctionHandler = "catalogGet.handle";
        var catalogLambdaUrlOriginFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), catalogLambdaUrlOriginFunctionHandler);
        var catalogLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(catalogLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(catalogLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + catalogLambdaUrlOriginFunctionHandler)
                        .environment(catalogLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.catalogLambda = catalogLambdaUrlOrigin.lambda;
        this.catalogLambdaLogGroup = catalogLambdaUrlOrigin.logGroup;
        infof("Created Lambda %s for catalog retrieval with handler %s",
                this.catalogLambda.getNode().getId(), props.lambdaEntry() + catalogLambdaUrlOriginFunctionHandler);

        // Request Bundles Lambda
        var requestBundlesLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_USER_POOL_ID", userPool.getUserPoolId())
                .with("TEST_BUNDLE_EXPIRY_DATE", "2025-12-31")
                .with("TEST_BUNDLE_USER_LIMIT", "10");
        var requestBundlesLambdaUrlOriginFunctionHandler = "bundle.httpPost";
        var requestBundlesLambdaUrlOriginFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), requestBundlesLambdaUrlOriginFunctionHandler);
        var requestBundlesLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(requestBundlesLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(requestBundlesLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + requestBundlesLambdaUrlOriginFunctionHandler)
                        .environment(requestBundlesLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.requestBundlesLambda = requestBundlesLambdaUrlOrigin.lambda;
        this.requestBundlesLambdaLogGroup = requestBundlesLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for request bundles with handler %s",
                this.requestBundlesLambda.getNode().getId(), props.lambdaEntry() + requestBundlesLambdaUrlOriginFunctionHandler);

        // Grant the RequestBundlesLambda permission to access Cognito User Pool
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "us-east-1";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";
        var cognitoUserPoolArn = String.format(
                "arn:aws:cognito-idp:%s:%s:userpool/%s",
            region, account, userPool.getUserPoolId());
        var requestBundlesLambdaGrantPrincipal = this.requestBundlesLambda.getGrantPrincipal();
        userPool.grant(
            requestBundlesLambdaGrantPrincipal,
            "cognito-idp:AdminGetUser",
            "cognito-idp:AdminUpdateUserAttributes",
            "cognito-idp:ListUsers");
        this.requestBundlesLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers"))
                .resources(List.of(cognitoUserPoolArn))
                .build());

        infof(
                "Granted Cognito permissions to %s for User Pool %s",
                this.requestBundlesLambda.getFunctionName(), userPool.getUserPoolId());

        // My Bundles Lambda
        var myBundlesLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.baseUrl());
        var myBundlesLambdaUrlOriginFunctionHandler = "myBundles.httpGet";
        var myBundlesLambdaUrlOriginFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), myBundlesLambdaUrlOriginFunctionHandler);
        var myBundlesLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(myBundlesLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(myBundlesLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + myBundlesLambdaUrlOriginFunctionHandler)
                        .environment(myBundlesLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.myBundlesLambda = myBundlesLambdaUrlOrigin.lambda;
        this.myBundlesLambdaLogGroup = myBundlesLambdaUrlOrigin.logGroup;
        var myBundlesLambdaGrantPrincipal = this.myBundlesLambda.getGrantPrincipal();
        userPool.grant(
            myBundlesLambdaGrantPrincipal,
            "cognito-idp:AdminGetUser",
            "cognito-idp:AdminUpdateUserAttributes",
            "cognito-idp:ListUsers");
        infof(
                "Created Lambda %s for my bundles retrieval with handler %s",
                this.myBundlesLambda.getNode().getId(), props.lambdaEntry() + myBundlesLambdaUrlOriginFunctionHandler);

        var catalogUrl = this.catalogLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var requestBundlesUrl = this.requestBundlesLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var myBundlesUrl = this.myBundlesLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());

        cfnOutput(this, "CatalogLambdaArn", this.catalogLambda.getFunctionArn());
        cfnOutput(this, "RequestBundlesLambdaArn", this.requestBundlesLambda.getFunctionArn());
        cfnOutput(this, "MyBundlesLambdaArn", this.myBundlesLambda.getFunctionArn());

        // Output Function URLs for EdgeStack to use as HTTP origins
        cfnOutput(this, "CatalogLambdaUrl", catalogUrl.getUrl());
        cfnOutput(this, "RequestBundlesLambdaUrl", requestBundlesUrl.getUrl());
        cfnOutput(this, "MyBundlesLambdaUrl", myBundlesUrl.getUrl());

        infof("AccountStack %s created successfully for %s", this.getNode().getId(), props.dashedDomainName());
    }
}
