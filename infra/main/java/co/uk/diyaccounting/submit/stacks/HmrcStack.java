package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambda;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.util.List;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

public class HmrcStack extends Stack {

    public AbstractApiLambdaProps hmrcTokenPostLambdaProps;
    public Function hmrcTokenPostLambda;
    public ILogGroup hmrcTokenPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcVatReturnPostLambdaProps;
    public Function hmrcVatReturnPostLambda;
    public ILogGroup hmrcVatReturnPostLambdaLogGroup;

    // New HMRC VAT GET Lambdas
    public AbstractApiLambdaProps hmrcVatObligationGetLambdaProps;
    public Function hmrcVatObligationGetLambda;
    public ILogGroup hmrcVatObligationGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcVatReturnGetLambdaProps;
    public Function hmrcVatReturnGetLambda;
    public ILogGroup hmrcVatReturnGetLambdaLogGroup;

    public AbstractApiLambdaProps receiptGetLambdaProps;
    public Function receiptGetLambda;
    public ILogGroup receiptGetLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface HmrcStackProps extends StackProps, SubmitStackProps {

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

        String baseImageTag();

        String hmrcBaseUri();

        String hmrcClientId();

        String hmrcClientSecretArn();

        String hmrcSandboxBaseUri();

        String hmrcSandboxClientId();

        String hmrcSandboxClientSecretArn();

        String cognitoUserPoolId();

        @Override
        SubmitSharedNames sharedNames();

        static ImmutableHmrcStackProps.Builder builder() {
            return ImmutableHmrcStackProps.builder();
        }
    }

    public HmrcStack(Construct scope, String id, HmrcStackProps props) {
        this(scope, id, null, props);
    }

    public HmrcStack(Construct scope, String id, StackProps stackProps, HmrcStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lookup existing DynamoDB HMRC API requests Table
        ITable hmrcApiRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcApiRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcApiRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Return POST async request table
        ITable hmrcVatReturnPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatReturnPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcVatReturnPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Return GET async request table
        ITable hmrcVatReturnGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatReturnGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcVatReturnGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Obligation GET async request table
        ITable hmrcVatObligationGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatObligationGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcVatObligationGetAsyncRequestsTableName);

        // Lookup existing DynamoDB Receipts Table
        ITable receiptsTable = Table.fromTableName(
                this,
                "ImportedReceiptsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().receiptsTableName);

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // exchangeToken - HMRC
        var exchangeHmrcTokenLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_CLIENT_ID", props.hmrcClientId())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("HMRC_SANDBOX_CLIENT_ID", props.hmrcSandboxClientId())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName());
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            exchangeHmrcTokenLambdaEnv.with("HMRC_CLIENT_SECRET_ARN", props.hmrcClientSecretArn());
        }
        if (StringUtils.isNotBlank(props.hmrcSandboxClientSecretArn())) {
            exchangeHmrcTokenLambdaEnv.with("HMRC_SANDBOX_CLIENT_SECRET_ARN", props.hmrcSandboxClientSecretArn());
        }

        var exchangeHmrcTokenLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcTokenPostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcTokenPostLambdaFunctionName)
                        .handler(props.sharedNames().hmrcTokenPostLambdaHandler)
                        .ingestDefaultAliasLambdaArn("%s:zero".formatted(props.sharedNames().hmrcTokenPostLambdaArn))
                        .ingestProvisionedConcurrencyHot(1)
                        .lambdaArn(props.sharedNames().hmrcTokenPostLambdaArn)
                        .httpMethod(props.sharedNames().hmrcTokenPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcTokenPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcTokenPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcTokenPostLambdaCustomAuthorizer)
                        .environment(exchangeHmrcTokenLambdaEnv)
                        .build());
        this.hmrcTokenPostLambdaProps = exchangeHmrcTokenLambdaUrlOrigin.apiProps;
        this.hmrcTokenPostLambda = exchangeHmrcTokenLambdaUrlOrigin.lambda;
        this.hmrcTokenPostLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcTokenPostLambdaProps);
        infof(
                "Created Lambda %s for HMRC exchange token with handler %s",
                this.hmrcTokenPostLambda.getNode().getId(), props.sharedNames().hmrcTokenPostLambdaHandler);

        // Grant the exchange token Lambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.hmrcTokenPostLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.hmrcTokenPostLambda.getFunctionName(), bundlesTable.getTableName());

        // Allow the token exchange Lambda to write HMRC API request audit records to DynamoDB
        hmrcApiRequestsTable.grantWriteData(this.hmrcTokenPostLambda);

        // Grant access to HMRC client secret in Secrets Manager
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            // Use the provided ARN with wildcard suffix to handle AWS Secrets Manager's automatic suffix
            String secretArnWithWildcard = props.hmrcClientSecretArn().endsWith("-*")
                    ? props.hmrcClientSecretArn()
                    : props.hmrcClientSecretArn() + "-*";
            this.hmrcTokenPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(secretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for secret %s (with wildcard: %s)",
                    this.hmrcTokenPostLambda.getFunctionName(), props.hmrcClientSecretArn(), secretArnWithWildcard);
        }

        // Grant access to HMRC sandbox client secret in Secrets Manager
        if (StringUtils.isNotBlank(props.hmrcSandboxClientSecretArn())) {
            String sandboxSecretArnWithWildcard =
                    props.hmrcSandboxClientSecretArn().endsWith("-*")
                            ? props.hmrcSandboxClientSecretArn()
                            : props.hmrcSandboxClientSecretArn() + "-*";
            this.hmrcTokenPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(sandboxSecretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for sandbox secret %s (with wildcard: %s)",
                    this.hmrcTokenPostLambda.getFunctionName(),
                    props.hmrcSandboxClientSecretArn(),
                    sandboxSecretArnWithWildcard);
        }

        infof(
                "Created Lambda %s for HMRC exchange token with handler %s",
                this.hmrcTokenPostLambda.getNode().getId(), props.sharedNames().hmrcTokenPostLambdaHandler);

        // Grant the token exchange Lambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.hmrcTokenPostLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.hmrcTokenPostLambda.getFunctionName(), bundlesTable.getTableName());

        // submitVat
        var submitVatLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName)
                .with("HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME", hmrcVatReturnPostAsyncRequestsTable.getTableName());
        var submitVatLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatReturnPostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcVatReturnPostLambdaFunctionName)
                        .handler(props.sharedNames().hmrcVatReturnPostLambdaHandler)
                        .ingestDefaultAliasLambdaArn("%s:zero".formatted(props.sharedNames().hmrcVatReturnPostLambdaArn))
                        .ingestProvisionedConcurrencyHot(1)
                        .workerFunctionName("%s-consumer".formatted(props.sharedNames().hmrcVatReturnPostLambdaFunctionName))
                        .workerHandler(props.sharedNames().hmrcVatReturnPostLambdaConsumerHandler)
                        .workerLambdaArn("%s-consumer".formatted(props.sharedNames().hmrcVatReturnPostLambdaArn))
                        .workerDefaultAliasLambdaArn("%s-consumer:%s".formatted(props.sharedNames().hmrcVatReturnPostLambdaArn, "zero"))
                        .workerProvisionedConcurrencyHot(0)
                        .workerReservedConcurrency(2)
                        .lambdaArn(props.sharedNames().hmrcVatReturnPostLambdaArn)
                        .httpMethod(props.sharedNames().hmrcVatReturnPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatReturnPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatReturnPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatReturnPostLambdaCustomAuthorizer)
                        .environment(submitVatLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        submitVatLambdaEnv.put("SQS_QUEUE_URL", submitVatLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatReturnPostLambdaProps = submitVatLambdaUrlOrigin.apiProps;
        this.hmrcVatReturnPostLambda = submitVatLambdaUrlOrigin.lambda;
        this.hmrcVatReturnPostLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatReturnPostLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT submission with handler %s and consumer %s",
                this.hmrcVatReturnPostLambda.getNode().getId(),
                props.sharedNames().hmrcVatReturnPostLambdaHandler,
                props.sharedNames().hmrcVatReturnPostLambdaConsumerHandler);

        // Grant the VAT submission Lambda and its consumer permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatReturnPostLambda, submitVatLambdaUrlOrigin.consumerLambda).forEach(fn -> {
            bundlesTable.grantReadData(fn);
            hmrcApiRequestsTable.grantWriteData(fn);
            receiptsTable.grantWriteData(fn);
            hmrcVatReturnPostAsyncRequestsTable.grantReadWriteData(fn);
        });
        infof(
                "Granted DynamoDB permissions to %s and its consumer",
                this.hmrcVatReturnPostLambda.getFunctionName());

        // VAT obligations GET
        var vatObligationLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME", hmrcVatObligationGetAsyncRequestsTable.getTableName());
        var hmrcVatObligationGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatObligationGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcVatObligationGetLambdaFunctionName)
                        .handler(props.sharedNames().hmrcVatObligationGetLambdaHandler)
                        .ingestDefaultAliasLambdaArn("%s:zero".formatted(props.sharedNames().hmrcVatObligationGetLambdaArn))
                        .ingestProvisionedConcurrencyHot(0)
                        .workerFunctionName("%s-consumer".formatted(props.sharedNames().hmrcVatObligationGetLambdaFunctionName))
                        .workerHandler(props.sharedNames().hmrcVatObligationGetLambdaConsumerHandler)
                        .workerLambdaArn("%s-consumer".formatted(props.sharedNames().hmrcVatObligationGetLambdaArn))
                        .workerDefaultAliasLambdaArn("%s-consumer:%s".formatted(props.sharedNames().hmrcVatObligationGetLambdaArn, "zero"))
                        .workerProvisionedConcurrencyHot(0)
                        .workerReservedConcurrency(2)
                        .lambdaArn(props.sharedNames().hmrcVatObligationGetLambdaArn)
                        .httpMethod(props.sharedNames().hmrcVatObligationGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatObligationGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatObligationGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatObligationGetLambdaCustomAuthorizer)
                        .environment(vatObligationLambdaEnv)
                        .workerReservedConcurrency(1) // Avoid HMRC throttling
                        .build());

        // Update API environment with SQS queue URL
        vatObligationLambdaEnv.put("SQS_QUEUE_URL", hmrcVatObligationGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatObligationGetLambdaProps = hmrcVatObligationGetLambdaUrlOrigin.apiProps;
        this.hmrcVatObligationGetLambda = hmrcVatObligationGetLambdaUrlOrigin.lambda;
        this.hmrcVatObligationGetLambdaLogGroup = hmrcVatObligationGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatObligationGetLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT obligations with handler %s and consumer %s",
                this.hmrcVatObligationGetLambda.getNode().getId(),
                props.sharedNames().hmrcVatObligationGetLambdaHandler,
                props.sharedNames().hmrcVatObligationGetLambdaConsumerHandler);

        // Grant the VAT obligations Lambda and its consumer permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatObligationGetLambda, hmrcVatObligationGetLambdaUrlOrigin.consumerLambda).forEach(fn -> {
            bundlesTable.grantReadData(fn);
            hmrcApiRequestsTable.grantWriteData(fn);
            hmrcVatObligationGetAsyncRequestsTable.grantReadWriteData(fn);
        });
        infof(
                "Granted DynamoDB permissions to %s and its consumer",
                this.hmrcVatObligationGetLambda.getFunctionName());

        // VAT return GET
        var vatReturnGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME", hmrcVatReturnGetAsyncRequestsTable.getTableName());
        var hmrcVatReturnGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatReturnGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcVatReturnGetLambdaFunctionName)
                        .handler(props.sharedNames().hmrcVatReturnGetLambdaHandler)
                        .ingestDefaultAliasLambdaArn("%s:zero".formatted(props.sharedNames().hmrcVatReturnGetLambdaArn))
                        .ingestProvisionedConcurrencyHot(0)
                        .workerFunctionName("%s-consumer".formatted(props.sharedNames().hmrcVatReturnGetLambdaFunctionName))
                        .workerHandler(props.sharedNames().hmrcVatReturnGetLambdaConsumerHandler)
                        .workerLambdaArn("%s-consumer".formatted(props.sharedNames().hmrcVatReturnGetLambdaArn))
                        .workerDefaultAliasLambdaArn("%s-consumer:%s".formatted(props.sharedNames().hmrcVatReturnGetLambdaArn, "zero"))
                        .workerProvisionedConcurrencyHot(0)
                        .workerReservedConcurrency(2)
                        .lambdaArn(props.sharedNames().hmrcVatReturnGetLambdaArn)
                        .httpMethod(props.sharedNames().hmrcVatReturnGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatReturnGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatReturnGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatReturnGetLambdaCustomAuthorizer)
                        .environment(vatReturnGetLambdaEnv)
                        .workerReservedConcurrency(1) // Avoid HMRC throttling
                        .build());

        // Update API environment with SQS queue URL
        vatReturnGetLambdaEnv.put("SQS_QUEUE_URL", hmrcVatReturnGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatReturnGetLambdaProps = hmrcVatReturnGetLambdaUrlOrigin.apiProps;
        this.hmrcVatReturnGetLambda = hmrcVatReturnGetLambdaUrlOrigin.lambda;
        this.hmrcVatReturnGetLambdaLogGroup = hmrcVatReturnGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatReturnGetLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT return retrieval with handler %s and consumer %s",
                this.hmrcVatReturnGetLambda.getNode().getId(),
                props.sharedNames().hmrcVatReturnGetLambdaHandler,
                props.sharedNames().hmrcVatReturnGetLambdaConsumerHandler);

        // Grant the VAT return retrieval Lambda and its consumer permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatReturnGetLambda, hmrcVatReturnGetLambdaUrlOrigin.consumerLambda).forEach(fn -> {
            bundlesTable.grantReadData(fn);
            hmrcApiRequestsTable.grantWriteData(fn);
            hmrcVatReturnGetAsyncRequestsTable.grantReadWriteData(fn);
        });
        infof(
                "Granted DynamoDB permissions to %s and its consumer",
                this.hmrcVatReturnGetLambda.getFunctionName());

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName);
        var myReceiptsLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().receiptGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().receiptGetLambdaFunctionName)
                        .handler(props.sharedNames().receiptGetLambdaHandler)
                        .ingestProvisionedConcurrencyHot(0)
                        .lambdaArn(props.sharedNames().receiptGetLambdaArn)
                        .httpMethod(props.sharedNames().receiptGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().receiptGetLambdaUrlPath)
                        .ingestDefaultAliasLambdaArn("%s:zero".formatted(props.sharedNames().receiptGetLambdaArn))
                        .jwtAuthorizer(props.sharedNames().receiptGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().receiptGetLambdaCustomAuthorizer)
                        .environment(myReceiptsLambdaEnv)
                        .build());
        this.receiptGetLambdaProps = myReceiptsLambdaUrlOrigin.apiProps;
        this.receiptGetLambda = myReceiptsLambdaUrlOrigin.lambda;
        this.receiptGetLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.receiptGetLambdaProps);
        // Also expose a second route for retrieving a single receipt by name using the same Lambda
        this.lambdaFunctionProps.add(ApiLambdaProps.builder()
                .idPrefix(props.sharedNames().receiptGetLambdaFunctionName + "-ByNameRoute")
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                .functionName(props.sharedNames().receiptGetLambdaFunctionName)
                .handler(props.sharedNames().receiptGetLambdaHandler)
                .ingestDefaultAliasLambdaArn("%s:zero".formatted(props.sharedNames().receiptGetLambdaArn))
                .ingestProvisionedConcurrencyHot(0)
                .lambdaArn(props.sharedNames().receiptGetLambdaArn)
                .httpMethod(props.sharedNames().receiptGetLambdaHttpMethod)
                .urlPath(props.sharedNames().receiptGetByNameLambdaUrlPath)
                .jwtAuthorizer(props.sharedNames().receiptGetLambdaJwtAuthorizer)
                .customAuthorizer(props.sharedNames().receiptGetLambdaCustomAuthorizer)
                .build());
        infof(
                "Created Lambda %s for my receipts retrieval with handler %s",
                this.receiptGetLambda.getNode().getId(), props.sharedNames().receiptGetLambdaHandler);

        // Grant the MyReceiptsLambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.receiptGetLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.receiptGetLambda.getFunctionName(), bundlesTable.getTableName());

        // Grant the LogReceiptLambda and MyReceiptsLambda write and read access respectively to the receipts DynamoDB
        // table
        receiptsTable.grantReadData(this.receiptGetLambda);

        cfnOutput(this, "ExchangeHmrcTokenLambdaArn", this.hmrcTokenPostLambda.getFunctionArn());
        cfnOutput(this, "SubmitVatLambdaArn", this.hmrcVatReturnPostLambda.getFunctionArn());
        cfnOutput(this, "MyReceiptsLambdaArn", this.receiptGetLambda.getFunctionArn());

        infof(
                "HmrcStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
