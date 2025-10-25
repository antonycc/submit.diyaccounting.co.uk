package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
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
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.List;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

public class AccountStack extends Stack {

    // CDK resources here
    public Function catalogLambda;
    public LogGroup catalogLambdaLogGroup;
    public Function requestBundlesLambda;
    public LogGroup requestBundlesLambdaLogGroup;
    public Function bundleDeleteLambda;
    public LogGroup bundleDeleteLambdaLogGroup;
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
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String baseImageTag();

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
                this, "ImportedUserPool-%s".formatted(props.deploymentName()), props.cognitoUserPoolArn());

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(props.lambdaUrlAuthType())
                ? FunctionUrlAuthType.AWS_IAM
                : FunctionUrlAuthType.NONE;

        // Catalog Lambda
        // var catalogLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_BASE_URL", props.sharedNames().baseUrl));
        var catalogLambdaEnv =
                new PopulatedMap<String, String>().with("DIY_SUBMIT_BASE_URL", props.sharedNames().baseUrl);
        var catalogLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().catalogLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().catalogLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().catalogLambdaHandler)
                        .environment(catalogLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.catalogLambda = catalogLambdaUrlOrigin.lambda;
        this.catalogLambdaLogGroup = catalogLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for catalog retrieval with handler %s",
                this.catalogLambda.getNode().getId(), props.lambdaEntry() + props.sharedNames().catalogLambdaHandler);

        // Request Bundles Lambda
        var requestBundlesLambdaEnv = new PopulatedMap<String, String>()
                .with("COGNITO_USER_POOL_ID", userPool.getUserPoolId())
                .with("TEST_BUNDLE_EXPIRY_DATE", "2025-12-31")
                .with("TEST_BUNDLE_USER_LIMIT", "10");
        var requestBundlesLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().requestBundlesLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().requestBundlesLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().requestBundlesLambdaHandler)
                        .environment(requestBundlesLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.requestBundlesLambda = requestBundlesLambdaUrlOrigin.lambda;
        this.requestBundlesLambdaLogGroup = requestBundlesLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for request bundles with handler %s",
                this.requestBundlesLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().requestBundlesLambdaHandler);

        // Grant the RequestBundlesLambda permission to access Cognito User Pool
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "us-east-1";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";
        var cognitoUserPoolArn =
                String.format("arn:aws:cognito-idp:%s:%s:userpool/%s", region, account, userPool.getUserPoolId());
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

        // Delete Bundles Lambda
        var bundleDeleteLambdaEnv = new PopulatedMap<String, String>()
            .with("COGNITO_USER_POOL_ID", userPool.getUserPoolId())
            .with("TEST_BUNDLE_EXPIRY_DATE", "2025-12-31")
            .with("TEST_BUNDLE_USER_LIMIT", "10");
        var bundleDeleteLambdaUrlOrigin = new LambdaUrlOrigin(
            this,
            LambdaUrlOriginProps.builder()
                .idPrefix(props.sharedNames().bundleDeleteLambdaFunctionName)
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                .functionName(props.sharedNames().bundleDeleteLambdaFunctionName)
                .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(props.lambdaEntry() + props.sharedNames().bundleDeleteLambdaHandler)
                .environment(bundleDeleteLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build());
        this.bundleDeleteLambda = bundleDeleteLambdaUrlOrigin.lambda;
        this.bundleDeleteLambdaLogGroup = bundleDeleteLambdaUrlOrigin.logGroup;
        infof(
            "Created Lambda %s for delete bundles with handler %s",
            this.bundleDeleteLambda.getNode().getId(),
            props.lambdaEntry() + props.sharedNames().bundleDeleteLambdaHandler);

        // Grant the RequestBundlesLambda permission to access Cognito User Pool
        var bundleDeleteLambdaGrantPrincipal = this.bundleDeleteLambda.getGrantPrincipal();
        userPool.grant(
            bundleDeleteLambdaGrantPrincipal,
            "cognito-idp:AdminGetUser",
            "cognito-idp:AdminUpdateUserAttributes",
            "cognito-idp:ListUsers");
        this.bundleDeleteLambda.addToRolePolicy(PolicyStatement.Builder.create()
            .effect(Effect.ALLOW)
            .actions(List.of(
                "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers"))
            .resources(List.of(cognitoUserPoolArn))
            .build());

        infof(
            "Granted Cognito permissions to %s for User Pool %s",
            this.bundleDeleteLambda.getFunctionName(), userPool.getUserPoolId());

        // My Bundles Lambda
        var myBundlesLambdaEnv =
                new PopulatedMap<String, String>().with("DIY_SUBMIT_BASE_URL", props.sharedNames().baseUrl);
        var myBundlesLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(props.sharedNames().myBundlesLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().myBundlesLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + props.sharedNames().myBundlesLambdaHandler)
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
                this.myBundlesLambda.getNode().getId(),
                props.lambdaEntry() + props.sharedNames().myBundlesLambdaHandler);

        var catalogUrl = this.catalogLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var requestBundlesUrl = this.requestBundlesLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var bundleDeleteUrl = this.bundleDeleteLambda.addFunctionUrl(FunctionUrlOptions.builder()
            .authType(functionUrlAuthType)
            .invokeMode(InvokeMode.BUFFERED)
            .build());
        var myBundlesUrl = this.myBundlesLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        cfnOutput(this, "CatalogLambdaArn", this.catalogLambda.getFunctionArn());
        cfnOutput(this, "RequestBundlesLambdaArn", this.requestBundlesLambda.getFunctionArn());
        cfnOutput(this, "BundleDeleteLambdaArn", this.bundleDeleteLambda.getFunctionArn());
        cfnOutput(this, "MyBundlesLambdaArn", this.myBundlesLambda.getFunctionArn());

        // Output Function URLs for EdgeStack to use as HTTP origins
        cfnOutput(this, "CatalogLambdaUrl", catalogUrl.getUrl());
        cfnOutput(this, "RequestBundlesLambdaUrl", requestBundlesUrl.getUrl());
        cfnOutput(this, "BundleDeleteLambdaUrl", bundleDeleteUrl.getUrl());
        cfnOutput(this, "MyBundlesLambdaUrl", myBundlesUrl.getUrl());

        infof(
                "AccountStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDomainName);
    }
}
