package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginOpts;
import co.uk.diyaccounting.submit.constructs.LogForwardingBucket;
import co.uk.diyaccounting.submit.functions.LogS3ObjectEvent;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.util.AbstractMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class ApplicationStack extends Stack {

    private static final Logger logger = LogManager.getLogger(ApplicationStack.class);

    // CDK resources here
    public Function authUrlHmrcLambda;
    public FunctionUrl authUrlHmrcLambdaUrl;
    public LogGroup authUrlHmrcLambdaLogGroup;
    public Function exchangeHmrcTokenLambda;
    public FunctionUrl exchangeHmrcTokenLambdaUrl;
    public LogGroup exchangeHmrcTokenLambdaLogGroup;
    public Function submitVatLambda;
    public FunctionUrl submitVatLambdaUrl;
    public LogGroup submitVatLambdaLogGroup;
    public Function logReceiptLambda;
    public FunctionUrl logReceiptLambdaUrl;
    public LogGroup logReceiptLambdaLogGroup;
    public Function bundleLambda;
    public FunctionUrl bundleLambdaUrl;
    public LogGroup bundleLambdaLogGroup;
    public Function catalogLambda;
    public FunctionUrl catalogLambdaUrl;
    public LogGroup catalogLambdaLogGroup;
    public Function myBundlesLambda;
    public FunctionUrl myBundlesLambdaUrl;
    public LogGroup myBundlesLambdaLogGroup;
    public Function myReceiptsLambda;
    public FunctionUrl myReceiptsLambdaUrl;
    public LogGroup myReceiptsLambdaLogGroup;
    public IBucket receiptsBucket;


    public ApplicationStack(Construct scope, String id, ApplicationStack.Builder builder) {
        this(scope, id, null, builder);
    }

    public ApplicationStack(Construct scope, String id, StackProps props, ApplicationStack.Builder builder) {
        super(scope, id, props);

        // Values are provided via WebApp after context/env resolution

        // Build naming using same patterns as WebStack
        String domainName = Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String dashedDomainName =
                Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);

        boolean cloudTrailEnabled = Boolean.parseBoolean(builder.cloudTrailEnabled);
        boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);

        // Lambdas

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(builder.lambdaUrlAuthType)
            ? FunctionUrlAuthType.AWS_IAM
            : FunctionUrlAuthType.NONE;

        // Common options for all Lambda URL origins to reduce repetition
        var lambdaCommonOpts = LambdaUrlOriginOpts.Builder.create()
            .env(builder.env)
            .imageDirectory("infra/runtimes")
            .functionUrlAuthType(functionUrlAuthType)
            .cloudTrailEnabled(cloudTrailEnabled)
            .xRayEnabled(xRayEnabled)
            .verboseLogging(verboseLogging)
            .baseImageTag(builder.baseImageTag)
            .build();

        var lambdaUrlToOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

        // authUrl - HMRC
        var authUrlHmrcLambdaEnv = new HashMap<>(Map.of(
            "DIY_SUBMIT_HOME_URL", builder.homeUrl,
            "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri,
            "DIY_SUBMIT_HMRC_CLIENT_ID", builder.hmrcClientId));
        var authUrlHmrcLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlHmrc")
            .imageFilename("authUrlHmrc.Dockerfile")
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .functionName(WebStack.Builder.buildFunctionName(dashedDomainName, "authUrl.httpGetHmrc"))
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .handler(builder.lambdaEntry + "authUrl.httpGetHmrc")
            .environment(authUrlHmrcLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("30000")))
            .options(lambdaCommonOpts)
            .build(this);
        this.authUrlHmrcLambda = authUrlHmrcLambdaUrlOrigin.lambda;
        this.authUrlHmrcLambdaUrl = authUrlHmrcLambdaUrlOrigin.functionUrl;
        this.authUrlHmrcLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/hmrc/auth-url" + "*", authUrlHmrcLambdaUrlOrigin.behaviorOptions);

        // exchangeToken - HMRC
        this.hmrcClientSecretsManagerSecret =
            Secret.fromSecretPartialArn(this, "HmrcClientSecret", builder.hmrcClientSecretArn);
        var hmrcClientSecretArn = this.hmrcClientSecretsManagerSecret.getSecretArn();
        var exchangeHmrcTokenLambdaEnv = new HashMap<>(Map.of(
            "DIY_SUBMIT_HOME_URL", builder.homeUrl,
            "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri,
            "DIY_SUBMIT_HMRC_CLIENT_ID", builder.hmrcClientId,
            "DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", hmrcClientSecretArn));
        if (StringUtils.isNotBlank(builder.optionalTestAccessToken)) {
            exchangeHmrcTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
        }
        var exchangeHmrcTokenLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "ExchangeHmrcToken")
            .options(lambdaCommonOpts)
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .imageFilename("exchangeHmrcToken.Dockerfile")
            .functionName(
                WebStack.Builder.buildFunctionName(dashedDomainName, "exchangeToken.httpPostHmrc"))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + "exchangeToken.httpPostHmrc")
            .environment(exchangeHmrcTokenLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("30000")))
            .build(this);
        this.exchangeHmrcTokenLambda = exchangeHmrcTokenLambdaUrlOrigin.lambda;
        this.exchangeHmrcTokenLambdaUrl = exchangeHmrcTokenLambdaUrlOrigin.functionUrl;
        this.exchangeHmrcTokenLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/hmrc/exchange-token" + "*", exchangeHmrcTokenLambdaUrlOrigin.behaviorOptions);
        this.hmrcClientSecretsManagerSecret.grantRead(this.exchangeHmrcTokenLambda);

        // submitVat
        var submitVatLambdaEnv = new HashMap<>(Map.of(
            "DIY_SUBMIT_HOME_URL", builder.homeUrl,
            "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri));
        var submitVatLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "SubmitVat")
            .options(lambdaCommonOpts)
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .imageFilename("submitVat.Dockerfile")
            .functionName(WebStack.Builder.buildFunctionName(dashedDomainName, "submitVat.httpPost"))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + "submitVat.httpPost")
            .environment(submitVatLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("60000")))
            .build(this);
        this.submitVatLambda = submitVatLambdaUrlOrigin.lambda;
        this.submitVatLambdaUrl = submitVatLambdaUrlOrigin.functionUrl;
        this.submitVatLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/submit-vat" + "*", submitVatLambdaUrlOrigin.behaviorOptions);

        var logReceiptLambdaEnv = new HashMap<>(Map.of(
            "DIY_SUBMIT_HOME_URL", builder.homeUrl,
            "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", builder.receiptsBucketPostfix));
        if (StringUtils.isNotBlank(builder.optionalTestS3Endpoint)
            && StringUtils.isNotBlank(builder.optionalTestS3AccessKey)
            || StringUtils.isNotBlank(builder.optionalTestS3SecretKey)) {
            // For production like integrations without AWS we can use test S3 credentials
            var logReceiptLambdaTestEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_TEST_S3_ENDPOINT", builder.optionalTestS3Endpoint,
                "DIY_SUBMIT_TEST_S3_ACCESS_KEY", builder.optionalTestS3AccessKey,
                "DIY_SUBMIT_TEST_S3_SECRET_KEY", builder.optionalTestS3SecretKey));
            logReceiptLambdaEnv.putAll(logReceiptLambdaTestEnv);
        }
        var logReceiptLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "LogReceipt")
            .options(lambdaCommonOpts)
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .imageFilename("logReceipt.Dockerfile")
            .functionName(WebStack.Builder.buildFunctionName(dashedDomainName, "logReceipt.httpPost"))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + "logReceipt.httpPost")
            .environment(logReceiptLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("30000")))
            .build(this);
        this.logReceiptLambda = logReceiptLambdaUrlOrigin.lambda;
        this.logReceiptLambdaUrl = logReceiptLambdaUrlOrigin.functionUrl;
        this.logReceiptLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/log-receipt" + "*", logReceiptLambdaUrlOrigin.behaviorOptions);

        // Create Bundle Management Lambda
        if (StringUtils.isNotBlank("bundle.httpPost")) {
            var bundleLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL",
                builder.homeUrl,
                "DIY_SUBMIT_USER_POOL_ID",
                userPool.getUserPoolId(),
                "DIY_SUBMIT_BUNDLE_EXPIRY_DATE",
                builder.bundleExpiryDate != null ? builder.bundleExpiryDate : "2025-12-31",
                "DIY_SUBMIT_BUNDLE_USER_LIMIT",
                builder.bundleUserLimit != null ? builder.bundleUserLimit : "1000"));
            var bundleLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "BundleLambda")
                .options(lambdaCommonOpts)
                .baseImageTag(builder.baseImageTag)
                .ecrRepositoryName(builder.ecrRepositoryName)
                .ecrRepositoryArn(builder.ecrRepositoryArn)
                .imageFilename("bundle.Dockerfile")
                .functionName(WebStack.Builder.buildFunctionName(dashedDomainName, "bundle.httpPost"))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + "bundle.httpPost")
                .environment(bundleLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build(this);
            this.bundleLambda = bundleLambdaUrlOrigin.lambda;
            this.bundleLambdaUrl = bundleLambdaUrlOrigin.functionUrl;
            this.bundleLambdaLogGroup = bundleLambdaUrlOrigin.logGroup;
            lambdaUrlToOriginsBehaviourMappings.put(
                "/api/request-bundle" + "*", bundleLambdaUrlOrigin.behaviorOptions);

            // Grant Cognito permissions to the bundle Lambda
            this.bundleLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                    "cognito-idp:AdminGetUser",
                    "cognito-idp:AdminUpdateUserAttributes",
                    "cognito-idp:ListUsers"))
                .resources(List.of(userPool.getUserPoolArn()))
                .build());
        }

        // Catalog Lambda
        var catalogLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        var catalogLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "Catalog")
            .options(lambdaCommonOpts)
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .imageFilename("getCatalog.Dockerfile")
            .functionName(WebStack.Builder.buildFunctionName(dashedDomainName, "getCatalog.httpGet"))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + "getCatalog.httpGet")
            .environment(catalogLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("30000")))
            .build(this);
        this.catalogLambda = catalogLambdaUrlOrigin.lambda;
        this.catalogLambdaUrl = catalogLambdaUrlOrigin.functionUrl;
        this.catalogLambdaLogGroup = catalogLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/catalog" + "*", catalogLambdaUrlOrigin.behaviorOptions);

        // My Bundles Lambda
        var myBundlesLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        var myBundlesLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "MyBundles")
            .options(lambdaCommonOpts)
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .imageFilename("myBundles.Dockerfile")
            .functionName(WebStack.Builder.buildFunctionName(dashedDomainName, "myBundles.httpGet"))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + "myBundles.httpGet")
            .environment(myBundlesLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("30000")))
            .build(this);
        this.myBundlesLambda = myBundlesLambdaUrlOrigin.lambda;
        this.myBundlesLambdaUrl = myBundlesLambdaUrlOrigin.functionUrl;
        this.myBundlesLambdaLogGroup = myBundlesLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/my-bundles" + "*", myBundlesLambdaUrlOrigin.behaviorOptions);

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new HashMap<>(Map.of(
            "DIY_SUBMIT_HOME_URL", builder.homeUrl,
            "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", builder.receiptsBucketPostfix));
        var myReceiptsLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "MyReceipts")
            .options(lambdaCommonOpts)
            .baseImageTag(builder.baseImageTag)
            .ecrRepositoryName(builder.ecrRepositoryName)
            .ecrRepositoryArn(builder.ecrRepositoryArn)
            .imageFilename("myReceipts.Dockerfile")
            .functionName(WebStack.Builder.buildFunctionName(dashedDomainName, "myReceipts.httpGet"))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + "myReceipts.httpGet")
            .environment(myReceiptsLambdaEnv)
            .timeout(Duration.millis(Long.parseLong("30000")))
            .build(this);
        this.myReceiptsLambda = myReceiptsLambdaUrlOrigin.lambda;
        this.myReceiptsLambdaUrl = myReceiptsLambdaUrlOrigin.functionUrl;
        this.myReceiptsLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
            "/api/my-receipts" + "*", myReceiptsLambdaUrlOrigin.behaviorOptions);

        // Create receipts bucket for storing VAT submission receipts
        this.receiptsBucket = LogForwardingBucket.Builder.create(
                this, "ReceiptsBucket", builder.logS3ObjectEventHandlerSource, LogS3ObjectEvent.class)
            .bucketName(receiptsBucketFullName)
            .versioned(true)
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .objectOwnership(ObjectOwnership.OBJECT_WRITER)
            .autoDeleteObjects(!s3RetainReceiptsBucket)
            .functionNamePrefix("%s-receipts-bucket-".formatted(dashedDomainName))
            .retentionPeriodDays(2555) // 7 years for tax records as per HMRC requirements
            .cloudTrailEnabled(cloudTrailEnabled)
            .verboseLogging(verboseLogging)
            .removalPolicy(s3RetainReceiptsBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
            .build();
        this.receiptsBucket.grantWrite(this.logReceiptLambda);
        this.receiptsBucket.grantRead(this.myReceiptsLambda);


        if (this.authUrlHmrcLambda != null) {
            CfnOutput.Builder.create(this, "AuthUrlHmrcLambdaArn")
                .value(this.authUrlHmrcLambda.getFunctionArn())
                .build();
            CfnOutput.Builder.create(this, "AuthUrlHmrcLambdaUrl")
                .value(this.authUrlHmrcLambdaUrl.getUrl())
                .build();
        }

        if (this.exchangeHmrcTokenLambda != null) {
            CfnOutput.Builder.create(this, "ExchangeHmrcTokenLambdaArn")
                .value(this.exchangeHmrcTokenLambda.getFunctionArn())
                .build();
            CfnOutput.Builder.create(this, "ExchangeHmrcTokenLambdaUrl")
                .value(this.exchangeHmrcTokenLambdaUrl.getUrl())
                .build();
        }
        if (this.submitVatLambda != null) {
            CfnOutput.Builder.create(this, "SubmitVatLambdaArn")
                .value(this.submitVatLambda.getFunctionArn())
                .build();
            CfnOutput.Builder.create(this, "SubmitVatLambdaUrl")
                .value(this.submitVatLambdaUrl.getUrl())
                .build();
        }
        if (this.logReceiptLambda != null) {
            CfnOutput.Builder.create(this, "LogReceiptLambdaArn")
                .value(this.logReceiptLambda.getFunctionArn())
                .build();
            CfnOutput.Builder.create(this, "LogReceiptLambdaUrl")
                .value(this.logReceiptLambdaUrl.getUrl())
                .build();
        }
        if (this.bundleLambda != null) {
            CfnOutput.Builder.create(this, "BundleLambdaArn")
                .value(this.bundleLambda.getFunctionArn())
                .build();
            CfnOutput.Builder.create(this, "BundleLambdaUrl")
                .value(this.bundleLambdaUrl.getUrl())
                .build();
        }
        if (this.myReceiptsLambda != null) {
            CfnOutput.Builder.create(this, "MyReceiptsLambdaArn")
                .value(this.myReceiptsLambda.getFunctionArn())
                .build();
            CfnOutput.Builder.create(this, "MyReceiptsLambdaUrl")
                .value(this.myReceiptsLambdaUrl.getUrl())
                .build();
        }




        logger.info("ApplicationStack created successfully for {}", dashedDomainName);
    }

    /**
     * Builder class following the same pattern as WebStack.Builder
     */
    public static class Builder {
        private Construct scope;
        private String id;
        private StackProps props;

        // Environment configuration
        public String env;
        public String subDomainName;
        public String hostedZoneName;
        public String cloudTrailEnabled;
        public String xRayEnabled;

        private Builder() {}

        public static Builder create(Construct scope, String id) {
            Builder builder = new Builder();
            builder.scope = scope;
            builder.id = id;
            return builder;
        }

        public Builder props(StackProps props) {
            this.props = props;
            return this;
        }

        public Builder env(String env) {
            this.env = env;
            return this;
        }

        public Builder subDomainName(String subDomainName) {
            this.subDomainName = subDomainName;
            return this;
        }

        public Builder hostedZoneName(String hostedZoneName) {
            this.hostedZoneName = hostedZoneName;
            return this;
        }

        public Builder cloudTrailEnabled(String cloudTrailEnabled) {
            this.cloudTrailEnabled = cloudTrailEnabled;
            return this;
        }

        public Builder xRayEnabled(String xRayEnabled) {
            this.xRayEnabled = xRayEnabled;
            return this;
        }

        public Builder props(ApplicationStackProps p) {
            if (p == null) return this;
            this.env = p.env;
            this.subDomainName = p.subDomainName;
            this.hostedZoneName = p.hostedZoneName;
            this.cloudTrailEnabled = p.cloudTrailEnabled;
            this.xRayEnabled = p.xRayEnabled;
            return this;
        }

        public ApplicationStack build() {
            return new ApplicationStack(this.scope, this.id, this.props, this);
        }

        // Naming utility methods following WebStack patterns
        public static String buildDomainName(String env, String subDomainName, String hostedZoneName) {
            return env.equals("prod")
                    ? Builder.buildProdDomainName(subDomainName, hostedZoneName)
                    : Builder.buildNonProdDomainName(env, subDomainName, hostedZoneName);
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
    }

    // Use same domain name mappings as WebStack
    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();
}
