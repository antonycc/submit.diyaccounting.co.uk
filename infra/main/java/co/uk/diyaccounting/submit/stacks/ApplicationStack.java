package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.awssdk.S3.createLifecycleRules;

import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginOpts;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.util.AbstractMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class ApplicationStack extends Stack {

    private static final Logger logger = LogManager.getLogger(ApplicationStack.class);

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
    public Function bundleLambda;
    // public FunctionUrl bundleLambdaUrl;
    public LogGroup bundleLambdaLogGroup;
    public Function catalogLambda;
    // public FunctionUrl catalogLambdaUrl;
    public LogGroup catalogLambdaLogGroup;
    public Function myBundlesLambda;
    // public FunctionUrl myBundlesLambdaUrl;
    public LogGroup myBundlesLambdaLogGroup;
    public Function myReceiptsLambda;
    // public FunctionUrl myReceiptsLambdaUrl;
    public LogGroup myReceiptsLambdaLogGroup;
    public IBucket receiptsBucket;
    // public Map<String, String> additionalOriginsBehaviourMappings;

    public ApplicationStack(Construct scope, String id, ApplicationStackProps props) {
        this(scope, id, null, props);
    }

    public ApplicationStack(Construct scope, String id, StackProps stackProps, ApplicationStackProps props) {
        super(scope, id, stackProps);

        // Values are provided via SubmitApplication after context/env resolution

        // Build naming using same patterns as WebStack
        // String domainName = buildDomainName(props.env(), props.subDomainName(), props.hostedZoneName());
        String dashedDomainName =
                buildDashedDomainName(props.env(), props.subDomainName(), props.hostedZoneName());

        boolean cloudTrailEnabled = Boolean.parseBoolean(props.cloudTrailEnabled());
        boolean xRayEnabled = Boolean.parseBoolean(props.xRayEnabled());
        boolean verboseLogging = props.verboseLogging() == null || Boolean.parseBoolean(props.verboseLogging());

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(props.lambdaUrlAuthType())
                ? FunctionUrlAuthType.AWS_IAM
                : FunctionUrlAuthType.NONE;

        // var lambdaUrlToOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();
        // var lambdaUrlToOriginsBehaviourMappings = new HashMap<String, String>();

        // Common options for all Lambda URL origins to reduce repetition
        var lambdaCommonOpts = LambdaUrlOriginOpts.builder()
                .env(props.env())
                .imageDirectory("infra/runtimes")
                .functionUrlAuthType(functionUrlAuthType)
                .cloudTrailEnabled(cloudTrailEnabled)
                .xRayEnabled(xRayEnabled)
                .verboseLogging(verboseLogging)
                .baseImageTag(props.baseImageTag())
                .build();

        // authUrl - HMRC
        var authUrlHmrcLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
                "DIY_SUBMIT_HMRC_BASE_URI", props.hmrcBaseUri(),
                "DIY_SUBMIT_HMRC_CLIENT_ID", props.hmrcClientId()));
        var authUrlHmrcLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlHmrc")
                .imageFilename("authUrlHmrc.Dockerfile")
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.ecrRepositoryName())
                .ecrRepositoryArn(props.ecrRepositoryArn())
                .functionName(WebStack.buildFunctionName(dashedDomainName, "authUrl.httpGetHmrc"))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .handler(props.lambdaEntry() + "authUrl.httpGetHmrc")
                .environment(authUrlHmrcLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .options(lambdaCommonOpts)
                .build(this);
        this.authUrlHmrcLambda = authUrlHmrcLambdaUrlOrigin.lambda;
        // this.authUrlHmrcLambdaUrl = authUrlHmrcLambdaUrlOrigin.functionUrl;
        this.authUrlHmrcLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/hmrc/auth-url" + "*", authUrlHmrcLambdaUrlOrigin.lambda.getFunctionArn());

        // exchangeToken - HMRC
        Map<String, String> exchangeHmrcEnvBase = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
                "DIY_SUBMIT_HMRC_BASE_URI", props.hmrcBaseUri(),
                "DIY_SUBMIT_HMRC_CLIENT_ID", props.hmrcClientId()));
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            var hmrcSecret = Secret.fromSecretPartialArn(this, "HmrcClientSecret", props.hmrcClientSecretArn());
            exchangeHmrcEnvBase.put("DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", hmrcSecret.getSecretArn());
        }
        if (StringUtils.isNotBlank(props.optionalTestAccessToken())) {
            exchangeHmrcEnvBase.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", props.optionalTestAccessToken());
        }
        var exchangeHmrcTokenLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "ExchangeHmrcToken")
                .options(lambdaCommonOpts)
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.ecrRepositoryName())
                .ecrRepositoryArn(props.ecrRepositoryArn())
                .imageFilename("exchangeHmrcToken.Dockerfile")
                .functionName(WebStack.buildFunctionName(dashedDomainName, "exchangeToken.httpPostHmrc"))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(props.lambdaEntry() + "exchangeToken.httpPostHmrc")
                .environment(exchangeHmrcEnvBase)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build(this);
        this.exchangeHmrcTokenLambda = exchangeHmrcTokenLambdaUrlOrigin.lambda;
        // this.exchangeHmrcTokenLambdaUrl = exchangeHmrcTokenLambdaUrlOrigin.functionUrl;
        this.exchangeHmrcTokenLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/hmrc/exchange-token" + "*", exchangeHmrcTokenLambdaUrlOrigin.lambda.getFunctionArn());

        // submitVat
        var submitVatLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
                "DIY_SUBMIT_HMRC_BASE_URI", props.hmrcBaseUri()));
        var submitVatLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "SubmitVat")
                .options(lambdaCommonOpts)
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.ecrRepositoryName())
                .ecrRepositoryArn(props.ecrRepositoryArn())
                .imageFilename("submitVat.Dockerfile")
                .functionName(WebStack.buildFunctionName(dashedDomainName, "submitVat.httpPost"))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(props.lambdaEntry() + "submitVat.httpPost")
                .environment(submitVatLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("60000")))
                .build(this);
        this.submitVatLambda = submitVatLambdaUrlOrigin.lambda;
        // this.submitVatLambdaUrl = submitVatLambdaUrlOrigin.functionUrl;
        this.submitVatLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/submit-vat" + "*", submitVatLambdaUrlOrigin.lambda.getFunctionArn());

        var logReceiptLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", props.receiptsBucketPostfix()));
        if (StringUtils.isNotBlank(props.optionalTestS3Endpoint())
                && StringUtils.isNotBlank(props.optionalTestS3AccessKey())
                && StringUtils.isNotBlank(props.optionalTestS3SecretKey())) {
            // For production like integrations without AWS we can use test S3 credentials
            var logReceiptLambdaTestEnv = new HashMap<>(Map.of(
                    "DIY_SUBMIT_TEST_S3_ENDPOINT", props.optionalTestS3Endpoint(),
                    "DIY_SUBMIT_TEST_S3_ACCESS_KEY", props.optionalTestS3AccessKey(),
                    "DIY_SUBMIT_TEST_S3_SECRET_KEY", props.optionalTestS3SecretKey()));
            logReceiptLambdaEnv.putAll(logReceiptLambdaTestEnv);
        }
        var logReceiptLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "LogReceipt")
                .options(lambdaCommonOpts)
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.ecrRepositoryName())
                .ecrRepositoryArn(props.ecrRepositoryArn())
                .imageFilename("logReceipt.Dockerfile")
                .functionName(WebStack.buildFunctionName(dashedDomainName, "logReceipt.httpPost"))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(props.lambdaEntry() + "logReceipt.httpPost")
                .environment(logReceiptLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build(this);
        this.logReceiptLambda = logReceiptLambdaUrlOrigin.lambda;
        // this.logReceiptLambdaUrl = logReceiptLambdaUrlOrigin.functionUrl;
        this.logReceiptLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/log-receipt" + "*", logReceiptLambdaUrlOrigin.lambda.getFunctionArn());

        // Create Bundle Management Lambda
        // Catalog Lambda
        var catalogLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", props.homeUrl()));
        var catalogLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "Catalog")
                .options(lambdaCommonOpts)
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.ecrRepositoryName())
                .ecrRepositoryArn(props.ecrRepositoryArn())
                .imageFilename("getCatalog.Dockerfile")
                .functionName(WebStack.buildFunctionName(dashedDomainName, "getCatalog.httpGet"))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(props.lambdaEntry() + "getCatalog.httpGet")
                .environment(catalogLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build(this);
        this.catalogLambda = catalogLambdaUrlOrigin.lambda;
        // this.catalogLambdaUrl = catalogLambdaUrlOrigin.functionUrl;
        this.catalogLambdaLogGroup = catalogLambdaUrlOrigin.logGroup;
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/catalog" + "*", catalogLambdaUrlOrigin.lambda.getFunctionArn());

        // My Bundles Lambda
        var myBundlesLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", props.homeUrl()));
        var myBundlesLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "MyBundles")
                .options(lambdaCommonOpts)
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.ecrRepositoryName())
                .ecrRepositoryArn(props.ecrRepositoryArn())
                .imageFilename("myBundles.Dockerfile")
                .functionName(WebStack.buildFunctionName(dashedDomainName, "myBundles.httpGet"))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(props.lambdaEntry() + "myBundles.httpGet")
                .environment(myBundlesLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build(this);
        this.myBundlesLambda = myBundlesLambdaUrlOrigin.lambda;
        // this.myBundlesLambdaUrl = myBundlesLambdaUrlOrigin.functionUrl;
        this.myBundlesLambdaLogGroup = myBundlesLambdaUrlOrigin.logGroup;
        // lambdaUrlToOriginsBehaviourMappings.put(
        //    "/api/my-bundles" + "*", myBundlesLambdaUrlOrigin.lambda.getFunctionArn());

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", props.homeUrl(),
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", props.receiptsBucketPostfix()));
        var myReceiptsLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "MyReceipts")
                .options(lambdaCommonOpts)
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.ecrRepositoryName())
                .ecrRepositoryArn(props.ecrRepositoryArn())
                .imageFilename("myReceipts.Dockerfile")
                .functionName(WebStack.buildFunctionName(dashedDomainName, "myReceipts.httpGet"))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(props.lambdaEntry() + "myReceipts.httpGet")
                .environment(myReceiptsLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build(this);
        this.myReceiptsLambda = myReceiptsLambdaUrlOrigin.lambda;
        // this.myReceiptsLambdaUrl = myReceiptsLambdaUrlOrigin.functionUrl;
        this.myReceiptsLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
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
        if (this.logReceiptLambda != null) this.receiptsBucket.grantWrite(this.logReceiptLambda);
        if (this.myReceiptsLambda != null) this.receiptsBucket.grantRead(this.myReceiptsLambda);

        // this.additionalOriginsBehaviourMappings = lambdaUrlToOriginsBehaviourMappings;

        if (this.authUrlHmrcLambda != null) {
            CfnOutput.Builder.create(this, "AuthUrlHmrcLambdaArn")
                    .value(this.authUrlHmrcLambda.getFunctionArn())
                    .build();
        }
        if (this.exchangeHmrcTokenLambda != null) {
            CfnOutput.Builder.create(this, "ExchangeHmrcTokenLambdaArn")
                    .value(this.exchangeHmrcTokenLambda.getFunctionArn())
                    .build();
        }
        if (this.submitVatLambda != null) {
            CfnOutput.Builder.create(this, "SubmitVatLambdaArn")
                    .value(this.submitVatLambda.getFunctionArn())
                    .build();
        }
        if (this.logReceiptLambda != null) {
            CfnOutput.Builder.create(this, "LogReceiptLambdaArn")
                    .value(this.logReceiptLambda.getFunctionArn())
                    .build();
        }
        if (this.bundleLambda != null) {
            CfnOutput.Builder.create(this, "BundleLambdaArn")
                    .value(this.bundleLambda.getFunctionArn())
                    .build();
        }
        if (this.myReceiptsLambda != null) {
            CfnOutput.Builder.create(this, "MyReceiptsLambdaArn")
                    .value(this.myReceiptsLambda.getFunctionArn())
                    .build();
        }

        logger.info("ApplicationStack created successfully for {}", dashedDomainName);
    }

    // Naming utility methods following WebStack patterns
        public static String buildDomainName(String env, String subDomainName, String hostedZoneName) {
            return env.equals("prod")
                    ? buildProdDomainName(subDomainName, hostedZoneName)
                    : buildNonProdDomainName(env, subDomainName, hostedZoneName);
        }

        public static String buildProdDomainName(String subDomainName, String hostedZoneName) {
            return "%s.%s".formatted(subDomainName, hostedZoneName);
        }
    public static String buildNonProdDomainName(String env, String subDomainName, String hostedZoneName) {
        return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName);
    }

    public static String buildDashedDomainName(String env, String subDomainName, String hostedZoneName) {
        return ResourceNameUtils.convertDotSeparatedToDashSeparated(
                "%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings);
    }

    // Use same domain name mappings as WebStack
    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();
}
