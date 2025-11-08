package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cognito.IUserPool;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

public class AccountStack extends Stack {

    public ApiLambdaProps catalogLambdaProps;
    public Function catalogLambda;
    public LogGroup catalogLambdaLogGroup;

    public ApiLambdaProps bundleGetLambdaProps;
    public Function bundleGetLambda;
    public LogGroup bundleGetLambdaLogGroup;

    public ApiLambdaProps bundlePostLambdaProps;
    public Function bundlePostLambda;
    public LogGroup bundlePostLambdaLogGroup;

    public ApiLambdaProps bundleDeleteLambdaProps;
    public Function bundleDeleteLambda;
    public LogGroup bundleDeleteLambdaLogGroup;

    public List<ApiLambdaProps> lambdaFunctionProps;

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
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String baseImageTag();

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

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Catalog Lambda
        var catalogLambdaEnv =
                new PopulatedMap<String, String>().with("DIY_SUBMIT_BASE_URL", props.sharedNames().baseUrl);
        var catalogLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().catalogGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().catalogGetLambdaFunctionName)
                        .handler(props.sharedNames().catalogGetLambdaHandler)
                        .lambdaArn(props.sharedNames().catalogGetLambdaArn)
                        .httpMethod(props.sharedNames().catalogGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().catalogGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().catalogGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().catalogGetLambdaCustomAuthorizer)
                        .environment(catalogLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.catalogLambdaProps = catalogLambdaUrlOrigin.props;
        this.catalogLambda = catalogLambdaUrlOrigin.lambda;
        this.catalogLambdaLogGroup = catalogLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.catalogLambdaProps);
        infof(
                "Created Lambda %s for catalog retrieval with handler %s",
                this.catalogLambda.getNode().getId(), props.sharedNames().catalogGetLambdaHandler);

        // Get Bundles Lambda
        var getBundlesLambdaEnv = new PopulatedMap<String, String>()
                .with("COGNITO_USER_POOL_ID", userPool.getUserPoolId())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName());
        var getBundlesLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().bundleGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().bundleGetLambdaFunctionName)
                        .handler(props.sharedNames().bundleGetLambdaHandler)
                        .lambdaArn(props.sharedNames().bundleGetLambdaArn)
                        .httpMethod(props.sharedNames().bundleGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().bundleGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().bundleGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().bundleGetLambdaCustomAuthorizer)
                        .environment(getBundlesLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.bundleGetLambdaProps = getBundlesLambdaUrlOrigin.props;
        this.bundleGetLambda = getBundlesLambdaUrlOrigin.lambda;
        this.bundleGetLambdaLogGroup = getBundlesLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.bundleGetLambdaProps);
        infof(
                "Created Lambda %s for get bundles with handler %s",
                this.bundleGetLambda.getNode().getId(), props.sharedNames().bundleGetLambdaHandler);

        // Grant the GetBundlesLambda permission to access Cognito User Pool
        var getBundlesLambdaGrantPrincipal = this.bundleGetLambda.getGrantPrincipal();
        userPool.grant(getBundlesLambdaGrantPrincipal, "cognito-idp:AdminGetUser");
        this.bundleGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("cognito-idp:AdminGetUser"))
                .resources(List.of(cognitoUserPoolArn))
                .build());

        infof(
                "Granted Cognito permissions to %s for User Pool %s",
                this.bundleGetLambda.getFunctionName(), userPool.getUserPoolId());

        // Grant the GetBundlesLambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.bundleGetLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.bundleGetLambda.getFunctionName(), bundlesTable.getTableName());

        // Request Bundles Lambda
        var requestBundlesLambdaEnv = new PopulatedMap<String, String>()
                .with("COGNITO_USER_POOL_ID", userPool.getUserPoolId())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("TEST_BUNDLE_EXPIRY_DATE", "2025-12-31")
                .with("TEST_BUNDLE_USER_LIMIT", "10");
        var requestBundlesLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().bundlePostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().bundlePostLambdaFunctionName)
                        .handler(props.sharedNames().bundlePostLambdaHandler)
                        .lambdaArn(props.sharedNames().bundlePostLambdaArn)
                        .httpMethod(props.sharedNames().bundlePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().bundlePostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().bundlePostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().bundlePostLambdaCustomAuthorizer)
                        .environment(requestBundlesLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.bundlePostLambdaProps = requestBundlesLambdaUrlOrigin.props;
        this.bundlePostLambda = requestBundlesLambdaUrlOrigin.lambda;
        this.bundlePostLambdaLogGroup = requestBundlesLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.bundlePostLambdaProps);
        infof(
                "Created Lambda %s for request bundles with handler %s",
                this.bundlePostLambda.getNode().getId(), props.sharedNames().bundlePostLambdaHandler);

        // Grant the RequestBundlesLambda permission to access Cognito User Pool
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "us-east-1";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";
        var cognitoUserPoolArn =
                String.format("arn:aws:cognito-idp:%s:%s:userpool/%s", region, account, userPool.getUserPoolId());
        var requestBundlesLambdaGrantPrincipal = this.bundlePostLambda.getGrantPrincipal();
        userPool.grant(
                requestBundlesLambdaGrantPrincipal,
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminUpdateUserAttributes",
                "cognito-idp:ListUsers");
        this.bundlePostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers"))
                .resources(List.of(cognitoUserPoolArn))
                .build());

        infof(
                "Granted Cognito permissions to %s for User Pool %s",
                this.bundlePostLambda.getFunctionName(), userPool.getUserPoolId());

        // Grant the RequestBundlesLambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadWriteData(this.bundlePostLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.bundlePostLambda.getFunctionName(), bundlesTable.getTableName());

        // Delete Bundles Lambda
        var bundleDeleteLambdaEnv = new PopulatedMap<String, String>()
                .with("COGNITO_USER_POOL_ID", userPool.getUserPoolId())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("TEST_BUNDLE_EXPIRY_DATE", "2025-12-31")
                .with("TEST_BUNDLE_USER_LIMIT", "10");
        var bundleDeleteLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().bundleDeleteLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().bundleDeleteLambdaFunctionName)
                        .handler(props.sharedNames().bundleDeleteLambdaHandler)
                        .lambdaArn(props.sharedNames().bundleDeleteLambdaArn)
                        .httpMethod(props.sharedNames().bundleDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().bundleDeleteLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().bundleDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().bundleDeleteLambdaCustomAuthorizer)
                        .environment(bundleDeleteLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.bundleDeleteLambdaProps = bundleDeleteLambdaUrlOrigin.props;
        this.bundleDeleteLambda = bundleDeleteLambdaUrlOrigin.lambda;
        this.bundleDeleteLambdaLogGroup = bundleDeleteLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.bundleDeleteLambdaProps);

        // Also expose a second route for deleting a bundle by path parameter {id}
        this.lambdaFunctionProps.add(ApiLambdaProps.builder()
                .idPrefix(props.sharedNames().bundleDeleteLambdaFunctionName + "-ByIdRoute")
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                .functionName(props.sharedNames().bundleDeleteLambdaFunctionName)
                .handler(props.sharedNames().bundleDeleteLambdaHandler)
                .lambdaArn(props.sharedNames().bundleDeleteLambdaArn)
                .httpMethod(props.sharedNames().bundleDeleteLambdaHttpMethod)
                .urlPath("/api/v1/bundle/{id}")
                .jwtAuthorizer(props.sharedNames().bundleDeleteLambdaJwtAuthorizer)
                .customAuthorizer(props.sharedNames().bundleDeleteLambdaCustomAuthorizer)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build());
        infof(
                "Created Lambda %s for delete bundles with handler %s",
                this.bundleDeleteLambda.getNode().getId(), props.sharedNames().bundleDeleteLambdaHandler);

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

        // Grant the DeleteBundlesLambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadWriteData(this.bundleDeleteLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.bundleDeleteLambda.getFunctionName(), bundlesTable.getTableName());

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        cfnOutput(this, "CatalogLambdaArn", this.catalogLambda.getFunctionArn());
        cfnOutput(this, "GetBundlesLambdaArn", this.bundleGetLambda.getFunctionArn());
        cfnOutput(this, "RequestBundlesLambdaArn", this.bundlePostLambda.getFunctionArn());
        cfnOutput(this, "BundleDeleteLambdaArn", this.bundleDeleteLambda.getFunctionArn());

        infof(
                "AccountStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
