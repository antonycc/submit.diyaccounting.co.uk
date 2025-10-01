package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginProps;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;
import static co.uk.diyaccounting.submit.utils.S3.createLifecycleRules;

public class ApplicationStack extends Stack {

    // CDK resources here
    public Function authUrlHmrcLambda;
    public LogGroup authUrlHmrcLambdaLogGroup;
    public Function exchangeHmrcTokenLambda;
    public LogGroup exchangeHmrcTokenLambdaLogGroup;
    public Function submitVatLambda;
    public LogGroup submitVatLambdaLogGroup;
    public Function logReceiptLambda;
    public LogGroup logReceiptLambdaLogGroup;
    public Function catalogLambda;
    public LogGroup catalogLambdaLogGroup;
    public Function requestBundlesLambda;
    public LogGroup requestBundlesLambdaLogGroup;
    public Function myBundlesLambda;
    public LogGroup myBundlesLambdaLogGroup;
    public Function myReceiptsLambda;
    public LogGroup myReceiptsLambdaLogGroup;
    public IBucket receiptsBucket;

    @Value.Immutable
    public interface ApplicationStackProps extends StackProps, SubmitStackProps {

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

        String hmrcBaseUri();

        String hmrcClientId();

        String hmrcClientSecretArn();

        String cognitoUserPoolId();

        Optional<String> optionalTestAccessToken(); // {

        Optional<String> optionalTestS3Endpoint(); // {

        Optional<String> optionalTestS3AccessKey(); // {

        Optional<String> optionalTestS3SecretKey(); // {

        String receiptsBucketPostfix();

        String s3RetainReceiptsBucket();

        static ImmutableApplicationStackProps.Builder builder() {
            return ImmutableApplicationStackProps.builder();
        }
    }

    public ApplicationStack(Construct scope, String id, ApplicationStackProps props) {
        this(scope, id, null, props);
    }

    public ApplicationStack(Construct scope, String id, StackProps stackProps, ApplicationStackProps props) {
        super(scope, id, stackProps);

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(props.lambdaUrlAuthType())
                ? FunctionUrlAuthType.AWS_IAM
                : FunctionUrlAuthType.NONE;

        // authUrl - HMRC
        var authUrlHmrcLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.baseUrl(),
                "DIY_SUBMIT_HMRC_BASE_URI", props.hmrcBaseUri(),
                "DIY_SUBMIT_HMRC_CLIENT_ID", props.hmrcClientId()));
        var authUrlHmrcLambdaFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), "authUrl.httpGetHmrc");
        var authUrlHmrcLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(authUrlHmrcLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(authUrlHmrcLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + "authUrl.httpGetHmrc")
                        .environment(authUrlHmrcLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlHmrcLambda = authUrlHmrcLambdaUrlOrigin.lambda;
        this.authUrlHmrcLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for HMRC auth URL with handler %s",
                this.authUrlHmrcLambda.getNode().getId(), props.lambdaEntry() + "authUrl.httpGetHmrc");

        // exchangeToken - HMRC
        Map<String, String> exchangeHmrcEnvBase = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.baseUrl(),
                "DIY_SUBMIT_HMRC_BASE_URI", props.hmrcBaseUri(),
                "DIY_SUBMIT_HMRC_CLIENT_ID", props.hmrcClientId()));
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            exchangeHmrcEnvBase.put("DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", props.hmrcClientSecretArn());
        }
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeHmrcEnvBase.put(
                    "DIY_SUBMIT_TEST_ACCESS_TOKEN",
                    props.optionalTestAccessToken().get());
        }
        var exchangeHmrcTokenLambdaFunctionName =
                buildFunctionName(props.compressedResourceNamePrefix(), "exchangeToken.httpPostHmrc");
        var exchangeHmrcTokenLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(exchangeHmrcTokenLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(exchangeHmrcTokenLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "exchangeToken.httpPostHmrc")
                        .environment(exchangeHmrcEnvBase)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.exchangeHmrcTokenLambda = exchangeHmrcTokenLambdaUrlOrigin.lambda;
        this.exchangeHmrcTokenLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;

        // Grant access to HMRC client secret in Secrets Manager
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            var hmrcSecret = Secret.fromSecretPartialArn(
                    this, props.resourceNamePrefix() + "-HmrcClientSecret", props.hmrcClientSecretArn());
            // Use the provided ARN with wildcard suffix to handle AWS Secrets Manager's automatic suffix
            String secretArnWithWildcard = props.hmrcClientSecretArn().endsWith("-*")
                    ? props.hmrcClientSecretArn()
                    : props.hmrcClientSecretArn() + "-*";
            this.exchangeHmrcTokenLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(secretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for secret %s (with wildcard: %s)",
                    this.exchangeHmrcTokenLambda.getFunctionName(), props.hmrcClientSecretArn(), secretArnWithWildcard);
        }

        infof(
                "Created Lambda %s for HMRC exchange token with handler %s",
                this.exchangeHmrcTokenLambda.getNode().getId(), props.lambdaEntry() + "exchangeToken.httpPostHmrc");

        // submitVat
        var submitVatLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.baseUrl(),
                "DIY_SUBMIT_HMRC_BASE_URI", props.hmrcBaseUri()));
        var submitVatLambdaFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), "submitVat.httpPost");
        var submitVatLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(submitVatLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(submitVatLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "submitVat.httpPost")
                        .environment(submitVatLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("60000")))
                        .build());
        this.submitVatLambda = submitVatLambdaUrlOrigin.lambda;
        this.submitVatLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for VAT submission with handler %s",
                this.submitVatLambda.getNode().getId(), props.lambdaEntry() + "submitVat.httpPost");

        var logReceiptLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.baseUrl(),
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", props.receiptsBucketPostfix()));
        if (props.optionalTestS3Endpoint().isPresent()
                && StringUtils.isNotBlank(props.optionalTestS3Endpoint().get())
                && props.optionalTestS3AccessKey().isPresent()
                && StringUtils.isNotBlank(props.optionalTestS3AccessKey().get())
                && props.optionalTestS3SecretKey().isPresent()
                && StringUtils.isNotBlank(props.optionalTestS3SecretKey().get())) {
            // For production like integrations without AWS we can use test S3 credentials
            var logReceiptLambdaTestEnv = new HashMap<>(Map.of(
                    "DIY_SUBMIT_TEST_S3_ENDPOINT",
                            props.optionalTestS3Endpoint().get(),
                    "DIY_SUBMIT_TEST_S3_ACCESS_KEY",
                            props.optionalTestS3AccessKey().get(),
                    "DIY_SUBMIT_TEST_S3_SECRET_KEY",
                            props.optionalTestS3SecretKey().get()));
            logReceiptLambdaEnv.putAll(logReceiptLambdaTestEnv);
        }
        var logReceiptLambdaUrlOriginFunctionName =
                buildFunctionName(props.compressedResourceNamePrefix(), "logReceipt.httpPost");
        var logReceiptLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(logReceiptLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(logReceiptLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "logReceipt.httpPost")
                        .environment(logReceiptLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.logReceiptLambda = logReceiptLambdaUrlOrigin.lambda;
        this.logReceiptLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for logging receipts with handler %s",
                this.logReceiptLambda.getNode().getId(), props.lambdaEntry() + "logReceipt.httpPost");

        // TODO: Spread this prototype out to other Lambdas
        // Create Bundle Management Lambda
        // Catalog Lambda
        var catalogLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", props.baseUrl()));
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
        var requestBundlesLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_USER_POOL_ID", props.cognitoUserPoolId(),
                "DIY_SUBMIT_BUNDLE_EXPIRY_DATE", "2025-12-31",
                "DIY_SUBMIT_BUNDLE_USER_LIMIT", "10"));
        var requestBundlesLambdaFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), "bundle.httpPost");
        var requestBundlesLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(requestBundlesLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(requestBundlesLambdaFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "bundle.httpPost")
                        .environment(requestBundlesLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.requestBundlesLambda = requestBundlesLambdaUrlOrigin.lambda;
        this.requestBundlesLambdaLogGroup = requestBundlesLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for request bundles with handler %s",
                this.requestBundlesLambda.getNode().getId(), props.lambdaEntry() + "bundle.httpPost");

        // Grant the RequestBundlesLambda permission to access Cognito User Pool
        var cognitoUserPoolArn = String.format(
                "arn:aws:cognito-idp:%s:%s:userpool/%s",
                props.getEnv().getRegion(), props.getEnv().getAccount(), props.cognitoUserPoolId());

        this.requestBundlesLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers"))
                .resources(List.of(cognitoUserPoolArn))
                .build());

        infof(
                "Granted Cognito permissions to %s for User Pool %s",
                this.requestBundlesLambda.getFunctionName(), props.cognitoUserPoolId());

        // My Bundles Lambda
        var myBundlesLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", props.baseUrl()));
        var myBundlesLambdaUrlOriginFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), "myBundles.httpGet");
        var myBundlesLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(myBundlesLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(myBundlesLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "myBundles.httpGet")
                        .environment(myBundlesLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.myBundlesLambda = myBundlesLambdaUrlOrigin.lambda;
        // this.myBundlesLambdaUrl = myBundlesLambdaUrlOrigin.functionUrl;
        this.myBundlesLambdaLogGroup = myBundlesLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for my bundles retrieval with handler %s",
                this.myBundlesLambda.getNode().getId(), props.lambdaEntry() + "myBundles.httpGet");

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.baseUrl(),
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", props.receiptsBucketPostfix()));
        var myReceiptsLambdaUrlOriginFunctionName = buildFunctionName(props.compressedResourceNamePrefix(), "myReceipts.httpGet");
        var myReceiptsLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix(myReceiptsLambdaUrlOriginFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(myReceiptsLambdaUrlOriginFunctionName)
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "myReceipts.httpGet")
                        .environment(myReceiptsLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.myReceiptsLambda = myReceiptsLambdaUrlOrigin.lambda;
        this.myReceiptsLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for my receipts retrieval with handler %s",
                this.myReceiptsLambda.getNode().getId(), props.lambdaEntry() + "myReceipts.httpGet");

        // Create receipts bucket for storing VAT submission receipts
        boolean s3RetainReceiptsBucket =
                props.s3RetainReceiptsBucket() != null && Boolean.parseBoolean(props.s3RetainReceiptsBucket());
        String receiptsBucketPostfix =
                StringUtils.isNotBlank(props.receiptsBucketPostfix()) ? props.receiptsBucketPostfix() : "receipts";
        String receiptsBucketFullName = "%s-%s".formatted(props.dashedDomainName(), receiptsBucketPostfix);
        this.receiptsBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-ReceiptsBucket")
                .bucketName(receiptsBucketFullName)
                .versioned(false)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(s3RetainReceiptsBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(createLifecycleRules(2555)) // 7 years for tax records as per HMRC requirements
                .objectOwnership(ObjectOwnership.OBJECT_WRITER)
                .build();
        infof(
                "Created receipts bucket with name %s and id %s",
                receiptsBucketFullName, this.receiptsBucket.getNode().getId());
        if (this.logReceiptLambda != null) this.receiptsBucket.grantWrite(this.logReceiptLambda);
        if (this.myReceiptsLambda != null) this.receiptsBucket.grantRead(this.myReceiptsLambda);

        // Create Function URLs for cross-region access
        var authUrlHmrcUrl = this.authUrlHmrcLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var exchangeHmrcTokenUrl = this.exchangeHmrcTokenLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var submitVatUrl = this.submitVatLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        var logReceiptUrl = this.logReceiptLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
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
        var myReceiptsUrl = this.myReceiptsLambda.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(functionUrlAuthType)
                .invokeMode(InvokeMode.BUFFERED)
                .build());

        cfnOutput(this, "AuthUrlHmrcLambdaArn", this.authUrlHmrcLambda.getFunctionArn());
        cfnOutput(this, "ExchangeHmrcTokenLambdaArn", this.exchangeHmrcTokenLambda.getFunctionArn());
        cfnOutput(this, "SubmitVatLambdaArn", this.submitVatLambda.getFunctionArn());
        cfnOutput(this, "LogReceiptLambdaArn", this.logReceiptLambda.getFunctionArn());
        cfnOutput(this, "CatalogLambdaArn", this.catalogLambda.getFunctionArn());
        cfnOutput(this, "RequestBundlesLambdaArn", this.requestBundlesLambda.getFunctionArn());
        cfnOutput(this, "MyBundlesLambdaArn", this.myBundlesLambda.getFunctionArn());
        cfnOutput(this, "MyReceiptsLambdaArn", this.myReceiptsLambda.getFunctionArn());

        // Output Function URLs for EdgeStack to use as HTTP origins
        cfnOutput(this, "AuthUrlHmrcLambdaUrl", authUrlHmrcUrl.getUrl());
        cfnOutput(this, "ExchangeHmrcTokenLambdaUrl", exchangeHmrcTokenUrl.getUrl());
        cfnOutput(this, "SubmitVatLambdaUrl", submitVatUrl.getUrl());
        cfnOutput(this, "LogReceiptLambdaUrl", logReceiptUrl.getUrl());
        cfnOutput(this, "CatalogLambdaUrl", catalogUrl.getUrl());
        cfnOutput(this, "RequestBundlesLambdaUrl", requestBundlesUrl.getUrl());
        cfnOutput(this, "MyBundlesLambdaUrl", myBundlesUrl.getUrl());
        cfnOutput(this, "MyReceiptsLambdaUrl", myReceiptsUrl.getUrl());

        cfnOutput(this, "ReceiptsBucketName", this.receiptsBucket.getBucketName());
        cfnOutput(this, "ReceiptsBucketArn", this.receiptsBucket.getBucketArn());

        infof("ApplicationStack %s created successfully for %s", this.getNode().getId(), props.dashedDomainName());
    }
}
