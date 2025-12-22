package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambda;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import org.immutables.value.Value;
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
import software.amazon.awscdk.services.logs.ILogGroup;
import software.constructs.Construct;

public class AccountStack extends Stack {

    public ApiLambdaProps catalogLambdaProps;
    public Function catalogLambda;
    public ILogGroup catalogLambdaLogGroup;

    public ApiLambdaProps bundleGetLambdaProps;
    public Function bundleGetLambda;
    public ILogGroup bundleGetLambdaLogGroup;

    public ApiLambdaProps bundlePostLambdaProps;
    public Function bundlePostLambda;
    public ILogGroup bundlePostLambdaLogGroup;

    public ApiLambdaProps bundleDeleteLambdaProps;
    public Function bundleDeleteLambda;
    public ILogGroup bundleDeleteLambdaLogGroup;

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
        // TODO: Remove this and the the BUNDLE_DYNAMODB_TABLE_NAME from customAuthorizerLambdaEnv once otherwise stable
        IUserPool userPool = UserPool.fromUserPoolArn(
                this, "ImportedUserPool-%s".formatted(props.deploymentName()), props.cognitoUserPoolArn());

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lookup existing DynamoDB Async Requests Table
        ITable asyncRequestsTable = Table.fromTableName(
                this,
                "ImportedAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().asyncRequestsTableName);

        // Lookup existing DynamoDB Bundle POST Async Requests Table
        ITable bundlePostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedBundlePostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlePostAsyncRequestsTableName);

        // Lookup existing DynamoDB Bundle DELETE Async Requests Table
        ITable bundleDeleteAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedBundleDeleteAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundleDeleteAsyncRequestsTableName);

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
                        .timeout(Duration.millis(Long.parseLong("29000"))) // 1s below API Gateway
                        .build());
        this.catalogLambdaProps = catalogLambdaUrlOrigin.apiProps;
        this.catalogLambda = catalogLambdaUrlOrigin.lambda;
        this.catalogLambdaLogGroup = catalogLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.catalogLambdaProps);
        infof(
                "Created Lambda %s for catalog retrieval with handler %s",
                this.catalogLambda.getNode().getId(), props.sharedNames().catalogGetLambdaHandler);

        // Construct Cognito User Pool ARN for IAM policies
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "us-east-1";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";
        var cognitoUserPoolArn =
                String.format("arn:aws:cognito-idp:%s:%s:userpool/%s", region, account, userPool.getUserPoolId());

        // Get Bundles Lambda
        var getBundlesLambdaEnv = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ASYNC_REQUESTS_DYNAMODB_TABLE_NAME", asyncRequestsTable.getTableName());
        var getBundlesAsyncLambda = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().bundleGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().bundleGetLambdaFunctionName)
                        .handler(props.sharedNames().bundleGetLambdaHandler)
                        .consumerHandler(props.sharedNames().bundleGetLambdaConsumerHandler)
                        .lambdaArn(props.sharedNames().bundleGetLambdaArn)
                        .httpMethod(props.sharedNames().bundleGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().bundleGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().bundleGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().bundleGetLambdaCustomAuthorizer)
                        .environment(getBundlesLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("29000"))) // 1s below API Gateway
                        .build());

        // Update API environment with SQS queue URL (for async processing)
        getBundlesLambdaEnv.put("SQS_QUEUE_URL", getBundlesAsyncLambda.queue.getQueueUrl());

        this.bundleGetLambdaProps = getBundlesAsyncLambda.apiProps;
        this.bundleGetLambda = getBundlesAsyncLambda.lambda;
        this.bundleGetLambdaLogGroup = getBundlesAsyncLambda.logGroup;
        this.lambdaFunctionProps.add(this.bundleGetLambdaProps);
        infof(
                "Created Async API Lambda %s for get bundles with handler %s and consumer %s",
                this.bundleGetLambda.getNode().getId(),
                props.sharedNames().bundleGetLambdaHandler,
                props.sharedNames().bundleGetLambdaConsumerHandler);

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

        // Grant DynamoDB permissions to both API and Consumer Lambdas
        bundlesTable.grantReadData(this.bundleGetLambda);
        asyncRequestsTable.grantReadWriteData(this.bundleGetLambda);

        bundlesTable.grantReadData(getBundlesAsyncLambda.consumerLambda);
        asyncRequestsTable.grantReadWriteData(getBundlesAsyncLambda.consumerLambda);

        infof(
                "Granted DynamoDB permissions to %s and its consumer for Bundles and Async Requests Tables",
                this.bundleGetLambda.getFunctionName());

        // Request Bundles Lambda
        var requestBundlesLambdaEnv = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ASYNC_REQUESTS_DYNAMODB_TABLE_NAME", bundlePostAsyncRequestsTable.getTableName())
                .with("TEST_BUNDLE_EXPIRY_DATE", "2025-12-31")
                .with("TEST_BUNDLE_USER_LIMIT", "10");
        var requestBundlesAsyncLambda = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().bundlePostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().bundlePostLambdaFunctionName)
                        .handler(props.sharedNames().bundlePostLambdaHandler)
                        .consumerHandler(props.sharedNames().bundlePostLambdaConsumerHandler)
                        .lambdaArn(props.sharedNames().bundlePostLambdaArn)
                        .httpMethod(props.sharedNames().bundlePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().bundlePostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().bundlePostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().bundlePostLambdaCustomAuthorizer)
                        .environment(requestBundlesLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("29000"))) // 1s below API Gateway
                        .build());

        // Update API environment with SQS queue URL
        requestBundlesLambdaEnv.put("SQS_QUEUE_URL", requestBundlesAsyncLambda.queue.getQueueUrl());

        this.bundlePostLambdaProps = requestBundlesAsyncLambda.apiProps;
        this.bundlePostLambda = requestBundlesAsyncLambda.lambda;
        this.bundlePostLambdaLogGroup = requestBundlesAsyncLambda.logGroup;
        this.lambdaFunctionProps.add(this.bundlePostLambdaProps);
        infof(
                "Created Async API Lambda %s for request bundles with handler %s and consumer %s",
                this.bundlePostLambda.getNode().getId(),
                props.sharedNames().bundlePostLambdaHandler,
                props.sharedNames().bundlePostLambdaConsumerHandler);

        // Grant permissions to both API and Consumer Lambdas
        List.of(this.bundlePostLambda, requestBundlesAsyncLambda.consumerLambda).forEach(fn -> {
            // Grant Cognito permissions
            userPool.grant(fn, "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers");
            fn.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of(
                            "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers"))
                    .resources(List.of(cognitoUserPoolArn))
                    .build());

            // Grant DynamoDB permissions
            bundlesTable.grantReadWriteData(fn);
            bundlePostAsyncRequestsTable.grantReadWriteData(fn);
        });

        infof(
                "Granted Cognito and DynamoDB permissions to %s and its consumer",
                this.bundlePostLambda.getFunctionName());

        // Delete Bundles Lambda
        var bundleDeleteLambdaEnv = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ASYNC_REQUESTS_DYNAMODB_TABLE_NAME", bundleDeleteAsyncRequestsTable.getTableName())
                .with("TEST_BUNDLE_EXPIRY_DATE", "2025-12-31")
                .with("TEST_BUNDLE_USER_LIMIT", "10");
        var bundleDeleteAsyncLambda = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().bundleDeleteLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().bundleDeleteLambdaFunctionName)
                        .handler(props.sharedNames().bundleDeleteLambdaHandler)
                        .consumerHandler(props.sharedNames().bundleDeleteLambdaConsumerHandler)
                        .lambdaArn(props.sharedNames().bundleDeleteLambdaArn)
                        .httpMethod(props.sharedNames().bundleDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().bundleDeleteLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().bundleDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().bundleDeleteLambdaCustomAuthorizer)
                        .environment(bundleDeleteLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("29000"))) // 1s below API Gateway
                        .build());

        // Update API environment with SQS queue URL
        bundleDeleteLambdaEnv.put("SQS_QUEUE_URL", bundleDeleteAsyncLambda.queue.getQueueUrl());

        this.bundleDeleteLambdaProps = bundleDeleteAsyncLambda.apiProps;
        this.bundleDeleteLambda = bundleDeleteAsyncLambda.lambda;
        this.bundleDeleteLambdaLogGroup = bundleDeleteAsyncLambda.logGroup;
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
                .timeout(Duration.millis(Long.parseLong("29000"))) // 1s below API Gateway
                .build());
        infof(
                "Created Async API Lambda %s for delete bundles with handler %s and consumer %s",
                this.bundleDeleteLambda.getNode().getId(),
                props.sharedNames().bundleDeleteLambdaHandler,
                props.sharedNames().bundleDeleteLambdaConsumerHandler);

        // Grant permissions to both API and Consumer Lambdas
        List.of(this.bundleDeleteLambda, bundleDeleteAsyncLambda.consumerLambda).forEach(fn -> {
            // Grant Cognito permissions
            userPool.grant(fn, "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers");
            fn.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of(
                            "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers"))
                    .resources(List.of(cognitoUserPoolArn))
                    .build());

            // Grant DynamoDB permissions
            bundlesTable.grantReadWriteData(fn);
            bundleDeleteAsyncRequestsTable.grantReadWriteData(fn);
        });

        infof(
                "Granted Cognito and DynamoDB permissions to %s and its consumer",
                this.bundleDeleteLambda.getFunctionName());

        cfnOutput(this, "CatalogLambdaArn", this.catalogLambda.getFunctionArn());
        cfnOutput(this, "GetBundlesLambdaArn", this.bundleGetLambda.getFunctionArn());
        cfnOutput(this, "RequestBundlesLambdaArn", this.bundlePostLambda.getFunctionArn());
        cfnOutput(this, "BundleDeleteLambdaArn", this.bundleDeleteLambda.getFunctionArn());

        infof(
                "AccountStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
