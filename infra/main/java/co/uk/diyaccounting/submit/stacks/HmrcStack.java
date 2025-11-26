package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class HmrcStack extends Stack {

    public ApiLambdaProps hmrcAuthUrlGetLambdaProps;
    public Function hmrcAuthUrlGetLambda;
    public ILogGroup hmrcAuthUrlGetLambdaLogGroup;

    public ApiLambdaProps hmrcTokenPostLambdaProps;
    public Function hmrcTokenPostLambda;
    public ILogGroup hmrcTokenPostLambdaLogGroup;

    public ApiLambdaProps hmrcVatReturnPostLambdaProps;
    public Function hmrcVatReturnPostLambda;
    public ILogGroup hmrcVatReturnPostLambdaLogGroup;

    // New HMRC VAT GET Lambdas
    public ApiLambdaProps hmrcVatObligationGetLambdaProps;
    public Function hmrcVatObligationGetLambda;
    public ILogGroup hmrcVatObligationGetLambdaLogGroup;

    public ApiLambdaProps hmrcVatReturnGetLambdaProps;
    public Function hmrcVatReturnGetLambda;
    public ILogGroup hmrcVatReturnGetLambdaLogGroup;

    public ApiLambdaProps receiptPostLambdaProps;
    public Function receiptPostLambda;
    public ILogGroup receiptPostLambdaLogGroup;

    public ApiLambdaProps receiptGetLambdaProps;
    public Function receiptGetLambda;
    public ILogGroup receiptGetLambdaLogGroup;

    public List<ApiLambdaProps> lambdaFunctionProps;

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

        // TODO: Delete these and ensure the tests set environment which the server.js reads
        Optional<String> optionalTestAccessToken(); // {

        Optional<String> optionalTestS3Endpoint(); // {

        Optional<String> optionalTestS3AccessKey(); // {

        Optional<String> optionalTestS3SecretKey(); // {

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

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // authUrl - HMRC
        var authUrlHmrcLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_CLIENT_ID", props.hmrcClientId())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("HMRC_SANDBOX_CLIENT_ID", props.hmrcSandboxClientId())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName);
        var authUrlHmrcLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcAuthUrlGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcAuthUrlGetLambdaFunctionName)
                        .handler(props.sharedNames().hmrcAuthUrlGetLambdaHandler)
                        .lambdaArn(props.sharedNames().hmrcAuthUrlGetLambdaArn)
                        .httpMethod(props.sharedNames().hmrcAuthUrlGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcAuthUrlGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcAuthUrlGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcAuthUrlGetLambdaCustomAuthorizer)
                        .environment(authUrlHmrcLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.hmrcAuthUrlGetLambdaProps = authUrlHmrcLambdaUrlOrigin.apiProps;
        this.hmrcAuthUrlGetLambda = authUrlHmrcLambdaUrlOrigin.lambda;
        this.hmrcAuthUrlGetLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcAuthUrlGetLambdaProps);
        infof(
                "Created Lambda %s for HMRC auth URL with handler %s",
                this.hmrcAuthUrlGetLambda.getNode().getId(), props.sharedNames().hmrcAuthUrlGetLambdaHandler);

        // Grant the Lambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.hmrcAuthUrlGetLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.hmrcAuthUrlGetLambda.getFunctionName(), bundlesTable.getTableName());

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
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeHmrcTokenLambdaEnv.with(
                    "TEST_ACCESS_TOKEN", props.optionalTestAccessToken().get());
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
                        .lambdaArn(props.sharedNames().hmrcTokenPostLambdaArn)
                        .httpMethod(props.sharedNames().hmrcTokenPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcTokenPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcTokenPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcTokenPostLambdaCustomAuthorizer)
                        .environment(exchangeHmrcTokenLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
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
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName);
        var submitVatLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatReturnPostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcVatReturnPostLambdaFunctionName)
                        .handler(props.sharedNames().hmrcVatReturnPostLambdaHandler)
                        .lambdaArn(props.sharedNames().hmrcVatReturnPostLambdaArn)
                        .httpMethod(props.sharedNames().hmrcVatReturnPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatReturnPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatReturnPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatReturnPostLambdaCustomAuthorizer)
                        .environment(submitVatLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("60000")))
                        .build());
        this.hmrcVatReturnPostLambdaProps = submitVatLambdaUrlOrigin.apiProps;
        this.hmrcVatReturnPostLambda = submitVatLambdaUrlOrigin.lambda;
        this.hmrcVatReturnPostLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatReturnPostLambdaProps);
        infof(
                "Created Lambda %s for VAT submission with handler %s",
                this.hmrcVatReturnPostLambda.getNode().getId(), props.sharedNames().hmrcVatReturnPostLambdaHandler);

        // Grant the VAT submission Lambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.hmrcVatReturnPostLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.hmrcVatReturnPostLambda.getFunctionName(), bundlesTable.getTableName());

        // Allow the VAT submission Lambda to write HMRC API request audit records to DynamoDB
        hmrcApiRequestsTable.grantWriteData(this.hmrcVatReturnPostLambda);

        // VAT obligations GET
        var vatObligationLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName());
        var hmrcVatObligationGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatObligationGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcVatObligationGetLambdaFunctionName)
                        .handler(props.sharedNames().hmrcVatObligationGetLambdaHandler)
                        .lambdaArn(props.sharedNames().hmrcVatObligationGetLambdaArn)
                        .httpMethod(props.sharedNames().hmrcVatObligationGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatObligationGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatObligationGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatObligationGetLambdaCustomAuthorizer)
                        .environment(vatObligationLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.hmrcVatObligationGetLambdaProps = hmrcVatObligationGetLambdaUrlOrigin.apiProps;
        this.hmrcVatObligationGetLambda = hmrcVatObligationGetLambdaUrlOrigin.lambda;
        this.hmrcVatObligationGetLambdaLogGroup = hmrcVatObligationGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatObligationGetLambdaProps);
        infof(
                "Created Lambda %s for VAT obligations with handler %s",
                this.hmrcVatObligationGetLambda.getNode().getId(),
                props.sharedNames().hmrcVatObligationGetLambdaHandler);

        // Grant the VAT obligations Lambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.hmrcVatObligationGetLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.hmrcVatObligationGetLambda.getFunctionName(), bundlesTable.getTableName());

        // Allow the VAT obligations Lambda to write HMRC API request audit records to DynamoDB
        hmrcApiRequestsTable.grantWriteData(this.hmrcVatObligationGetLambda);

        // VAT return GET
        var vatReturnGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName());
        var hmrcVatReturnGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatReturnGetLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().hmrcVatReturnGetLambdaFunctionName)
                        .handler(props.sharedNames().hmrcVatReturnGetLambdaHandler)
                        .lambdaArn(props.sharedNames().hmrcVatReturnGetLambdaArn)
                        .httpMethod(props.sharedNames().hmrcVatReturnGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatReturnGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatReturnGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatReturnGetLambdaCustomAuthorizer)
                        .environment(vatReturnGetLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.hmrcVatReturnGetLambdaProps = hmrcVatReturnGetLambdaUrlOrigin.apiProps;
        this.hmrcVatReturnGetLambda = hmrcVatReturnGetLambdaUrlOrigin.lambda;
        this.hmrcVatReturnGetLambdaLogGroup = hmrcVatReturnGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatReturnGetLambdaProps);
        infof(
                "Created Lambda %s for VAT return retrieval with handler %s",
                this.hmrcVatReturnGetLambda.getNode().getId(), props.sharedNames().hmrcVatReturnGetLambdaHandler);

        // Grant the VAT return retrieval Lambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.hmrcVatReturnGetLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.hmrcVatReturnGetLambda.getFunctionName(), bundlesTable.getTableName());

        // Allow the VAT return retrieval Lambda to write HMRC API request audit records to DynamoDB
        hmrcApiRequestsTable.grantWriteData(this.hmrcVatReturnGetLambda);

        var logReceiptLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().envBaseUrl)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName);
        if (props.optionalTestS3Endpoint().isPresent()
                && StringUtils.isNotBlank(props.optionalTestS3Endpoint().get())
                && props.optionalTestS3AccessKey().isPresent()
                && StringUtils.isNotBlank(props.optionalTestS3AccessKey().get())
                && props.optionalTestS3SecretKey().isPresent()
                && StringUtils.isNotBlank(props.optionalTestS3SecretKey().get())) {
            // For production like integrations without AWS we can use test S3 credentials
            logReceiptLambdaEnv
                    .with("TEST_S3_ENDPOINT", props.optionalTestS3Endpoint().get())
                    .with("TEST_S3_ACCESS_KEY", props.optionalTestS3AccessKey().get())
                    .with("TEST_S3_SECRET_KEY", props.optionalTestS3SecretKey().get());
        }
        var logReceiptLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().receiptPostLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.sharedNames().receiptPostLambdaFunctionName)
                        .handler(props.sharedNames().receiptPostLambdaHandler)
                        .lambdaArn(props.sharedNames().receiptPostLambdaArn)
                        .httpMethod(props.sharedNames().receiptPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().receiptPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().receiptPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().receiptPostLambdaCustomAuthorizer)
                        .environment(logReceiptLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.receiptPostLambdaProps = logReceiptLambdaUrlOrigin.apiProps;
        this.receiptPostLambda = logReceiptLambdaUrlOrigin.lambda;
        this.receiptPostLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.receiptPostLambdaProps);
        infof(
                "Created Lambda %s for logging receipts with handler %s",
                this.receiptPostLambda.getNode().getId(), props.sharedNames().receiptPostLambdaHandler);

        // Grant the LogReceiptLambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.receiptPostLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.receiptPostLambda.getFunctionName(), bundlesTable.getTableName());

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
                        .lambdaArn(props.sharedNames().receiptGetLambdaArn)
                        .httpMethod(props.sharedNames().receiptGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().receiptGetLambdaUrlPath)
                        .handler(props.sharedNames().receiptGetLambdaHandler)
                        .jwtAuthorizer(props.sharedNames().receiptGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().receiptGetLambdaCustomAuthorizer)
                        .environment(myReceiptsLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
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
                .lambdaArn(props.sharedNames().receiptGetLambdaArn)
                .httpMethod(props.sharedNames().receiptGetLambdaHttpMethod)
                .urlPath(props.sharedNames().receiptGetByNameLambdaUrlPath)
                .jwtAuthorizer(props.sharedNames().receiptGetLambdaJwtAuthorizer)
                .customAuthorizer(props.sharedNames().receiptGetLambdaCustomAuthorizer)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build());
        infof(
                "Created Lambda %s for my receipts retrieval with handler %s",
                this.receiptGetLambda.getNode().getId(), props.sharedNames().receiptGetLambdaHandler);

        // Grant the MyReceiptsLambda permission to access DynamoDB Bundles Table
        bundlesTable.grantReadData(this.receiptGetLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.receiptGetLambda.getFunctionName(), bundlesTable.getTableName());

        // Lookup existing DynamoDB Receipts Table
        ITable receiptsTable = Table.fromTableName(
                this,
                "ImportedReceiptsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().receiptsTableName);

        // Grant the LogReceiptLambda and MyReceiptsLambda write and read access respectively to the receipts DynamoDB
        // table
        receiptsTable.grantWriteData(this.receiptPostLambda);
        receiptsTable.grantReadData(this.receiptGetLambda);

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        cfnOutput(this, "AuthUrlHmrcLambdaArn", this.hmrcAuthUrlGetLambda.getFunctionArn());
        cfnOutput(this, "ExchangeHmrcTokenLambdaArn", this.hmrcTokenPostLambda.getFunctionArn());
        cfnOutput(this, "SubmitVatLambdaArn", this.hmrcVatReturnPostLambda.getFunctionArn());
        cfnOutput(this, "LogReceiptLambdaArn", this.receiptPostLambda.getFunctionArn());
        cfnOutput(this, "MyReceiptsLambdaArn", this.receiptGetLambda.getFunctionArn());

        infof(
                "HmrcStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
