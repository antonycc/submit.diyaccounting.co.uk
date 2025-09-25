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
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static co.uk.diyaccounting.submit.awssdk.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.awssdk.S3.createLifecycleRules;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildFunctionName;

public class ApplicationStack extends Stack {

    // CDK resources here
    public Function authUrlHmrcLambda;
    // public FunctionUrl authUrlHmrcLambdaUrl;
    public LogGroup authUrlHmrcLambdaLogGroup;
    public Function exchangeHmrcTokenLambda;
    // public FunctionUrl exchangeHmrcTokenLambdaUrl;
    public LogGroup exchangeHmrcTokenLambdaLogGroup;
    public Function submitVatLambda;
    // public FunctionUrl submitVatLambdaUrl;
    public LogGroup submitVatLambdaLogGroup;
    public Function logReceiptLambda;
    // public FunctionUrl logReceiptLambdaUrl;
    public LogGroup logReceiptLambdaLogGroup;
    // public Function bundleLambda;
    // public FunctionUrl bundleLambdaUrl;
    // public LogGroup bundleLambdaLogGroup;
    public Function catalogLambda;
    // public FunctionUrl catalogLambdaUrl;
    public LogGroup catalogLambdaLogGroup;
    public Function requestBundlesLambda;
    public LogGroup requestBundlesLambdaLogGroup;
    public Function myBundlesLambda;
    // public FunctionUrl myBundlesLambdaUrl;
    public LogGroup myBundlesLambdaLogGroup;
    public Function myReceiptsLambda;
    // public FunctionUrl myReceiptsLambdaUrl;
    public LogGroup myReceiptsLambdaLogGroup;
    public IBucket receiptsBucket;
    // public Map<String, String> additionalOriginsBehaviourMappings;

    @Value.Immutable
    public interface ApplicationStackProps extends StackProps {
        String envName();

        String subDomainName();

        String hostedZoneName();

        String resourceNamePrefix();

        String compressedResourceNamePrefix();

        String cloudTrailEnabled();

        String xRayEnabled();

        String verboseLogging();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        String lambdaUrlAuthType();

        String lambdaEntry();

        String homeUrl();

        String hmrcBaseUri();

        String hmrcClientId();

        String hmrcClientSecretArn();

        String cognitoUserPoolId();

        // @Value.Default
        Optional<String> optionalTestAccessToken(); // {
        // return Optional.empty();
        // }

        // @Value.Default
        Optional<String> optionalTestS3Endpoint(); // {
        // return Optional.empty();
        // }

        // @Value.Default
        Optional<String> optionalTestS3AccessKey(); // {
        // return Optional.empty();
        // }

        // @Value.Default
        Optional<String> optionalTestS3SecretKey(); // {
        // return Optional.empty();
        // }

        String receiptsBucketPostfix();

        String s3RetainReceiptsBucket();

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        static ImmutableApplicationStackProps.Builder builder() {
            return ImmutableApplicationStackProps.builder();
        }
    }

    public ApplicationStack(Construct scope, String id, ApplicationStackProps props) {
        this(scope, id, null, props);
    }

    public ApplicationStack(Construct scope, String id, StackProps stackProps, ApplicationStackProps props) {
        super(scope, id, stackProps);

        // Values are provided via SubmitApplication after context/env resolution

        // Build naming using same patterns as WebStack
        String dashedDomainName = buildDashedDomainName(props.envName(), props.subDomainName(), props.hostedZoneName());

        boolean cloudTrailEnabled = Boolean.parseBoolean(props.cloudTrailEnabled());
        boolean xRayEnabled = Boolean.parseBoolean(props.xRayEnabled());
        boolean verboseLogging = props.verboseLogging() == null || Boolean.parseBoolean(props.verboseLogging());

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(props.lambdaUrlAuthType())
                ? FunctionUrlAuthType.AWS_IAM
                : FunctionUrlAuthType.NONE;

        // authUrl - HMRC
        var authUrlHmrcLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
                "DIY_SUBMIT_HMRC_BASE_URI", props.hmrcBaseUri(),
                "DIY_SUBMIT_HMRC_CLIENT_ID", props.hmrcClientId()));
        var authUrlHmrcLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("AuthUrlHmrc")
                        .imageFilename("authUrlHmrc.Dockerfile")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .functionName(buildFunctionName(dashedDomainName, "authUrl.httpGetHmrc"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .handler(props.lambdaEntry() + "authUrl.httpGetHmrc")
                        .environment(authUrlHmrcLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.authUrlHmrcLambda = authUrlHmrcLambdaUrlOrigin.lambda;
        // this.authUrlHmrcLambdaUrl = authUrlHmrcLambdaUrlOrigin.functionUrl;
        this.authUrlHmrcLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for HMRC auth URL with handler %s",
                this.authUrlHmrcLambda.getNode().getId(), props.lambdaEntry() + "authUrl.httpGetHmrc");
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/hmrc/auth-url" + "*", authUrlHmrcLambdaUrlOrigin.lambda.getFunctionArn());

        // exchangeToken - HMRC
        Map<String, String> exchangeHmrcEnvBase = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
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
        var exchangeHmrcTokenLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("ExchangeHmrcToken")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .imageFilename("exchangeHmrcToken.Dockerfile")
                        .functionName(buildFunctionName(dashedDomainName, "exchangeToken.httpPostHmrc"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "exchangeToken.httpPostHmrc")
                        .environment(exchangeHmrcEnvBase)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.exchangeHmrcTokenLambda = exchangeHmrcTokenLambdaUrlOrigin.lambda;
        // this.exchangeHmrcTokenLambdaUrl = exchangeHmrcTokenLambdaUrlOrigin.functionUrl;
        this.exchangeHmrcTokenLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;

        // Grant access to HMRC client secret in Secrets Manager
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            var hmrcSecret = Secret.fromSecretPartialArn(this, "HmrcClientSecret", props.hmrcClientSecretArn());
            this.exchangeHmrcTokenLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(hmrcSecret.getSecretArn()))
                    .build());
            infof("Granted Secrets Manager access to %s for secret %s",
                    this.exchangeHmrcTokenLambda.getFunctionName(), props.hmrcClientSecretArn());
        }

        infof(
                "Created Lambda %s for HMRC exchange token with handler %s",
                this.exchangeHmrcTokenLambda.getNode().getId(), props.lambdaEntry() + "exchangeToken.httpPostHmrc");
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/hmrc/exchange-token" + "*", exchangeHmrcTokenLambdaUrlOrigin.lambda.getFunctionArn());

        // submitVat
        var submitVatLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
                "DIY_SUBMIT_HMRC_BASE_URI", props.hmrcBaseUri()));
        var submitVatLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("SubmitVat")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .imageFilename("submitVat.Dockerfile")
                        .functionName(buildFunctionName(dashedDomainName, "submitVat.httpPost"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "submitVat.httpPost")
                        .environment(submitVatLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("60000")))
                        .build());
        this.submitVatLambda = submitVatLambdaUrlOrigin.lambda;
        // this.submitVatLambdaUrl = submitVatLambdaUrlOrigin.functionUrl;
        this.submitVatLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for VAT submission with handler %s",
                this.submitVatLambda.getNode().getId(), props.lambdaEntry() + "submitVat.httpPost");
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/submit-vat" + "*", submitVatLambdaUrlOrigin.lambda.getFunctionArn());

        var logReceiptLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
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
        var logReceiptLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("LogReceipt")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .imageFilename("logReceipt.Dockerfile")
                        .functionName(buildFunctionName(dashedDomainName, "logReceipt.httpPost"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "logReceipt.httpPost")
                        .environment(logReceiptLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.logReceiptLambda = logReceiptLambdaUrlOrigin.lambda;
        // this.logReceiptLambdaUrl = logReceiptLambdaUrlOrigin.functionUrl;
        this.logReceiptLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for logging receipts with handler %s",
                this.logReceiptLambda.getNode().getId(), props.lambdaEntry() + "logReceipt.httpPost");
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/log-receipt" + "*", logReceiptLambdaUrlOrigin.lambda.getFunctionArn());

        // Create Bundle Management Lambda
        // Catalog Lambda
        var catalogLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", props.homeUrl()));
        var catalogLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("Catalog")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .imageFilename("getCatalog.Dockerfile")
                        .functionName(buildFunctionName(dashedDomainName, "getCatalog.httpGet"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "getCatalog.httpGet")
                        .environment(catalogLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.catalogLambda = catalogLambdaUrlOrigin.lambda;
        // this.catalogLambdaUrl = catalogLambdaUrlOrigin.functionUrl;
        this.catalogLambdaLogGroup = catalogLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for catalog retrieval with handler %s",
                this.catalogLambda.getNode().getId(), props.lambdaEntry() + "getCatalog.httpGet");
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/catalog" + "*", catalogLambdaUrlOrigin.lambda.getFunctionArn());

        // Request Bundles Lambda
        var requestBundlesLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_USER_POOL_ID", props.cognitoUserPoolId(),
                "DIY_SUBMIT_BUNDLE_EXPIRY_DATE", "2025-12-31",
                "DIY_SUBMIT_BUNDLE_USER_LIMIT", "10"));
        var requestBundlesLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("RequestBundles")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .imageFilename("requestBundles.Dockerfile")
                        .functionName(buildFunctionName(dashedDomainName, "bundle.httpPost"))
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
        var cognitoUserPoolArn = String.format("arn:aws:cognito-idp:%s:%s:userpool/%s",
                props.getEnv().getRegion(),
                props.getEnv().getAccount(),
                props.cognitoUserPoolId());

        this.requestBundlesLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "cognito-idp:AdminGetUser",
                        "cognito-idp:AdminUpdateUserAttributes",
                        "cognito-idp:ListUsers"))
                .resources(List.of(cognitoUserPoolArn))
                .build());

        infof("Granted Cognito permissions to %s for User Pool %s",
                this.requestBundlesLambda.getFunctionName(), props.cognitoUserPoolId());

        // My Bundles Lambda
        var myBundlesLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", props.homeUrl()));
        var myBundlesLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("MyBundles")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .imageFilename("myBundles.Dockerfile")
                        .functionName(buildFunctionName(dashedDomainName, "myBundles.httpGet"))
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
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/my-bundles" + "*", myBundlesLambdaUrlOrigin.lambda.getFunctionArn());

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", props.receiptsBucketPostfix()));
        var myReceiptsLambdaUrlOrigin = new LambdaUrlOrigin(
                this,
                LambdaUrlOriginProps.builder()
                        .idPrefix("MyReceipts")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .imageFilename("myReceipts.Dockerfile")
                        .functionName(buildFunctionName(dashedDomainName, "myReceipts.httpGet"))
                        .cloudFrontAllowedMethods(AllowedMethods.ALLOW_ALL)
                        .handler(props.lambdaEntry() + "myReceipts.httpGet")
                        .environment(myReceiptsLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("30000")))
                        .build());
        this.myReceiptsLambda = myReceiptsLambdaUrlOrigin.lambda;
        // this.myReceiptsLambdaUrl = myReceiptsLambdaUrlOrigin.functionUrl;
        this.myReceiptsLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        infof(
                "Created Lambda %s for my receipts retrieval with handler %s",
                this.myReceiptsLambda.getNode().getId(), props.lambdaEntry() + "myReceipts.httpGet");
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/my-receipts" + "*", myReceiptsLambdaUrlOrigin.behaviorOptions);
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/my-receipts" + "*", myReceiptsLambdaUrlOrigin.lambda.getFunctionArn());

        // Create receipts bucket for storing VAT submission receipts
        boolean s3RetainReceiptsBucket =
                props.s3RetainReceiptsBucket() != null && Boolean.parseBoolean(props.s3RetainReceiptsBucket());
        String receiptsBucketPostfix =
                StringUtils.isNotBlank(props.receiptsBucketPostfix()) ? props.receiptsBucketPostfix() : "receipts";
        String receiptsBucketFullName = "%s-%s".formatted(dashedDomainName, receiptsBucketPostfix);
        this.receiptsBucket = Bucket.Builder.create(this, "ReceiptsBucket")
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
        // cfnOutput(this, "BundleLambdaArn", this.bundleLambda.getFunctionArn());
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

        infof("ApplicationStack %s created successfully for %s", this.getNode().getId(), dashedDomainName);
    }
}
