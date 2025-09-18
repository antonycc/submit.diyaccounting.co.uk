package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.constructs.BucketOrigin;
import co.uk.diyaccounting.submit.constructs.DistributionWithLogging;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOrigin;
import co.uk.diyaccounting.submit.constructs.LambdaUrlOriginOpts;
import co.uk.diyaccounting.submit.constructs.LogForwardingBucket;
import co.uk.diyaccounting.submit.functions.LogS3ObjectEvent;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.hc.core5.http.HttpStatus;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cognito.IUserPool;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.ISource;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.util.AbstractMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class WebStack extends Stack {

    private static final Logger logger = LogManager.getLogger(WebStack.class);

    public String resourceNamePrefix;
    public String baseUrl;
    public String domainName;
    public Bucket originBucket;
    public IBucket originAccessLogBucket;
    public IOrigin origin;
    public BucketDeployment deployment;
    public IHostedZone hostedZone;
    public ICertificate certificate;
    public ISecret hmrcClientSecretsManagerSecret;
    // public ISecret googleClientSecretsManagerSecret;
    // public ISecret antonyccClientSecretsManagerSecret;
    public IBucket distributionAccessLogBucket;
    public OriginAccessIdentity originIdentity;
    public Distribution distribution;
    public String distributionUrl;
    public ISource docRootSource;
    public ARecord aRecord;
    public AaaaRecord aaaaRecord;
    public Function authUrlHmrcLambda;
    public FunctionUrl authUrlHmrcLambdaUrl;
    public LogGroup authUrlLambdaLogGroup;
    public Function authUrlMockLambda;
    public FunctionUrl authUrlMockLambdaUrl;
    public LogGroup authUrlMockLambdaLogGroup;
    public Function authUrlCognitoLambda;
    public FunctionUrl authUrlCognitoLambdaUrl;
    public LogGroup authUrlCognitoLambdaLogGroup;
    public Function exchangeHmrcTokenLambda;
    public FunctionUrl exchangeHmrcTokenLambdaUrl;
    public LogGroup exchangeHmrcTokenLambdaLogGroup;
    public Function exchangeCognitoTokenLambda;
    public FunctionUrl exchangeCognitoTokenLambdaUrl;
    public LogGroup exchangeCognitoTokenLambdaLogGroup;
    public Function submitVatLambda;
    public FunctionUrl submitVatLambdaUrl;
    public LogGroup submitVatLambdaLogGroup;
    public Function logReceiptLambda;
    public FunctionUrl logReceiptLambdaUrl;
    public LogGroup logReceiptLambdaLogGroup;
    public String cognitoBaseUri;
    public Function bundleLambda;
    public FunctionUrl bundleLambdaUrl;
    public LogGroup bundleLambdaLogGroup;
    public Function catalogLambda;
    public FunctionUrl catalogLambdaUrl;
    public LogGroup catalogLambdaLogGroup;
    public Function myBundlesLambda;
    public FunctionUrl myBundlesLambdaUrl;
    public LogGroup myBundlesLambdaLogGroup;
    public IBucket receiptsBucket;
    public Function myReceiptsLambda;
    public FunctionUrl myReceiptsLambdaUrl;
    public LogGroup myReceiptsLambdaLogGroup;

    public static class Builder {
        public Construct scope;
        public String id;
        public StackProps props;

        public String env;
        public String hostedZoneName;
        public String hostedZoneId;
        public String subDomainName;
        public String certificateArn;
        public String cloudTrailEnabled;
        public String cloudTrailLogGroupRetentionPeriodDays;
        public String accessLogGroupRetentionPeriodDays;
        public String s3UseExistingBucket;
        public String s3RetainOriginBucket;
        public String s3RetainReceiptsBucket;
        public String cloudTrailEventSelectorPrefix;
        public String xRayEnabled;
        public String verboseLogging;
        public String logS3ObjectEventHandlerSource;
        public String logGzippedS3ObjectEventHandlerSource;
        public String docRootPath;
        public String defaultDocumentAtOrigin;
        public String error404NotFoundAtDistribution;
        public String skipLambdaUrlOrigins;
        public String hmrcClientId;
        public String hmrcClientSecretArn;
        public String homeUrl;
        public String hmrcBaseUri;
        public String optionalTestRedirectUri;
        public String optionalTestAccessToken;
        public String optionalTestS3Endpoint;
        public String optionalTestS3AccessKey;
        public String optionalTestS3SecretKey;
        public String receiptsBucketPostfix;
        public String lambdaEntry;
        public String lambdaUrlAuthType;
        public String commitHash;
        public String antonyccClientId;
        public String antonyccBaseUri;
        // public String antonyccClientSecretArn;
        public String cognitoClientId;
        public String cognitoBaseUri;
        public String googleClientId;
        public String googleBaseUri;
        public String googleClientSecretArn;
        public String cognitoDomainPrefix;
        public String userPoolArn;
        public String bundleExpiryDate;
        public String bundleUserLimit;
        public String baseImageTag;
        public String cognitoFeaturePlan;
        public String cognitoEnableLogDelivery;
        public String logCognitoEventHandlerSource;
        public String ecrRepositoryArn;
        public String ecrRepositoryName;

        // public Trail trail;

        public Builder(Construct scope, String id, StackProps props) {
            this.scope = scope;
            this.id = id;
            this.props = props;
        }

        public static Builder create(Construct scope, String id) {
            return new Builder(scope, id, null);
        }

        public static Builder create(Construct scope, String id, StackProps props) {
            return new Builder(scope, id, props);
        }

        public Builder env(String env) {
            this.env = env;
            return this;
        }

        public Builder hostedZoneName(String hostedZoneName) {
            this.hostedZoneName = hostedZoneName;
            return this;
        }

        public Builder hostedZoneId(String hostedZoneId) {
            this.hostedZoneId = hostedZoneId;
            return this;
        }

        public Builder subDomainName(String subDomainName) {
            this.subDomainName = subDomainName;
            return this;
        }

        public Builder certificateArn(String certificateArn) {
            this.certificateArn = certificateArn;
            return this;
        }

        public Builder cloudTrailEnabled(String cloudTrailEnabled) {
            this.cloudTrailEnabled = cloudTrailEnabled;
            return this;
        }

        public Builder cloudTrailLogGroupRetentionPeriodDays(String cloudTrailLogGroupRetentionPeriodDays) {
            this.cloudTrailLogGroupRetentionPeriodDays = cloudTrailLogGroupRetentionPeriodDays;
            return this;
        }

        public Builder accessLogGroupRetentionPeriodDays(String accessLogGroupRetentionPeriodDays) {
            this.accessLogGroupRetentionPeriodDays = accessLogGroupRetentionPeriodDays;
            return this;
        }

        public Builder s3UseExistingBucket(String s3UseExistingBucket) {
            this.s3UseExistingBucket = s3UseExistingBucket;
            return this;
        }

        public Builder s3RetainOriginBucket(String s3RetainOriginBucket) {
            this.s3RetainOriginBucket = s3RetainOriginBucket;
            return this;
        }

        public Builder s3RetainReceiptsBucket(String s3RetainReceiptsBucket) {
            this.s3RetainReceiptsBucket = s3RetainReceiptsBucket;
            return this;
        }

        public Builder cloudTrailEventSelectorPrefix(String cloudTrailEventSelectorPrefix) {
            this.cloudTrailEventSelectorPrefix = cloudTrailEventSelectorPrefix;
            return this;
        }

        public Builder xRayEnabled(String xRayEnabled) {
            this.xRayEnabled = xRayEnabled;
            return this;
        }

        public Builder verboseLogging(String verboseLogging) {
            this.verboseLogging = verboseLogging;
            return this;
        }

        public Builder logS3ObjectEventHandlerSource(String logS3ObjectEventHandlerSource) {
            this.logS3ObjectEventHandlerSource = logS3ObjectEventHandlerSource;
            return this;
        }

        public Builder logGzippedS3ObjectEventHandlerSource(String logGzippedS3ObjectEventHandlerSource) {
            this.logGzippedS3ObjectEventHandlerSource = logGzippedS3ObjectEventHandlerSource;
            return this;
        }

        public Builder logCognitoEventHandlerSource(String logCognitoEventHandlerSource) {
            this.logCognitoEventHandlerSource = logCognitoEventHandlerSource;
            return this;
        }

        public Builder props(WebStackProps p) {
            if (p == null) return this;
            this.env = p.env;
            this.hostedZoneName = p.hostedZoneName;
            this.hostedZoneId = p.hostedZoneId;
            this.subDomainName = p.subDomainName;
            this.certificateArn = p.certificateArn;
            this.userPoolArn = p.userPoolArn;
            this.cloudTrailEnabled = p.cloudTrailEnabled;
            this.xRayEnabled = p.xRayEnabled;
            this.verboseLogging = p.verboseLogging;
            this.cloudTrailLogGroupRetentionPeriodDays = p.cloudTrailLogGroupRetentionPeriodDays;
            this.accessLogGroupRetentionPeriodDays = p.accessLogGroupRetentionPeriodDays;
            this.s3UseExistingBucket = p.s3UseExistingBucket;
            this.s3RetainOriginBucket = p.s3RetainOriginBucket;
            this.s3RetainReceiptsBucket = p.s3RetainReceiptsBucket;
            this.cloudTrailEventSelectorPrefix = p.cloudTrailEventSelectorPrefix;
            this.logS3ObjectEventHandlerSource = p.logS3ObjectEventHandlerSource;
            this.logGzippedS3ObjectEventHandlerSource = p.logGzippedS3ObjectEventHandlerSource;
            this.docRootPath = p.docRootPath;
            this.defaultDocumentAtOrigin = p.defaultDocumentAtOrigin;
            this.error404NotFoundAtDistribution = p.error404NotFoundAtDistribution;
            this.skipLambdaUrlOrigins = p.skipLambdaUrlOrigins;
            this.hmrcClientId = p.hmrcClientId;
            this.hmrcClientSecretArn = p.hmrcClientSecretArn;
            this.homeUrl = p.homeUrl;
            this.hmrcBaseUri = p.hmrcBaseUri;
            this.optionalTestAccessToken = p.optionalTestAccessToken;
            this.optionalTestS3Endpoint = p.optionalTestS3Endpoint;
            this.optionalTestS3AccessKey = p.optionalTestS3AccessKey;
            this.optionalTestS3SecretKey = p.optionalTestS3SecretKey;
            this.receiptsBucketPostfix = p.receiptsBucketPostfix;
            this.lambdaEntry = p.lambdaEntry;
            this.lambdaUrlAuthType = p.lambdaUrlAuthType;
            this.commitHash = p.commitHash;
            this.googleClientId = p.googleClientId;
            this.googleBaseUri = p.googleBaseUri;
            this.googleClientSecretArn = p.googleClientSecretArn;
            this.cognitoDomainPrefix = p.cognitoDomainPrefix;
            this.bundleExpiryDate = p.bundleExpiryDate;
            this.bundleUserLimit = p.bundleUserLimit;
            this.baseImageTag = p.baseImageTag;
            this.cognitoFeaturePlan = p.cognitoFeaturePlan;
            this.cognitoEnableLogDelivery = p.cognitoEnableLogDelivery;
            this.logCognitoEventHandlerSource = p.logCognitoEventHandlerSource;
            this.antonyccClientId = p.antonyccClientId;
            this.antonyccBaseUri = p.antonyccBaseUri;
            this.cognitoClientId = p.cognitoClientId;
            this.cognitoBaseUri = p.cognitoBaseUri;
            this.ecrRepositoryArn = p.ecrRepositoryArn;
            this.ecrRepositoryName = p.ecrRepositoryName;
            return this;
        }

        public Builder docRootPath(String docRootPath) {
            this.docRootPath = docRootPath;
            return this;
        }

        public Builder defaultDocumentAtOrigin(String defaultDocumentAtOrigin) {
            this.defaultDocumentAtOrigin = defaultDocumentAtOrigin;
            return this;
        }

        public Builder error404NotFoundAtDistribution(String error404NotFoundAtDistribution) {
            this.error404NotFoundAtDistribution = error404NotFoundAtDistribution;
            return this;
        }

        public Builder skipLambdaUrlOrigins(String skipLambdaUrlOrigins) {
            this.skipLambdaUrlOrigins = skipLambdaUrlOrigins;
            return this;
        }

        public Builder hmrcClientId(String hmrcClientId) {
            this.hmrcClientId = hmrcClientId;
            return this;
        }

        public Builder hmrcClientSecretArn(String hmrcClientSecretArn) {
            this.hmrcClientSecretArn = hmrcClientSecretArn;
            return this;
        }

        public Builder homeUrl(String homeUrl) {
            this.homeUrl = homeUrl;
            return this;
        }

        public Builder hmrcBaseUri(String hmrcBaseUri) {
            this.hmrcBaseUri = hmrcBaseUri;
            return this;
        }

        public Builder optionalTestRedirectUri(String optionalTestRedirectUri) {
            this.optionalTestRedirectUri = optionalTestRedirectUri;
            return this;
        }

        public Builder optionalTestAccessToken(String optionalTestAccessToken) {
            this.optionalTestAccessToken = optionalTestAccessToken;
            return this;
        }

        public Builder optionalTestS3Endpoint(String optionalTestS3Endpoint) {
            this.optionalTestS3Endpoint = optionalTestS3Endpoint;
            return this;
        }

        public Builder optionalTestS3AccessKey(String optionalTestS3AccessKey) {
            this.optionalTestS3AccessKey = optionalTestS3AccessKey;
            return this;
        }

        public Builder optionalTestS3SecretKey(String optionalTestS3SecretKey) {
            this.optionalTestS3SecretKey = optionalTestS3SecretKey;
            return this;
        }

        public Builder receiptsBucketPostfix(String receiptsBucketPostfix) {
            this.receiptsBucketPostfix = receiptsBucketPostfix;
            return this;
        }

        public Builder lambdaEntry(String lambdaEntry) {
            this.lambdaEntry = lambdaEntry;
            return this;
        }

        public Builder antonyccClientId(String antonyccClientId) {
            this.antonyccClientId = antonyccClientId;
            return this;
        }

        public Builder antonyccBaseUri(String antonyccBaseUri) {
            this.antonyccBaseUri = antonyccBaseUri;
            return this;
        }

        // public Builder antonyccClientSecretArn(String antonyccClientSecretArn) {
        //  this.antonyccClientSecretArn = antonyccClientSecretArn;
        //  return this;
        // }

        public Builder cognitoClientId(String cognitoClientId) {
            this.cognitoClientId = cognitoClientId;
            return this;
        }

        public Builder cognitoBaseUri(String cognitoBaseUri) {
            this.cognitoBaseUri = cognitoBaseUri;
            return this;
        }

        public Builder lambdaUrlAuthType(String lambdaUrlAuthType) {
            this.lambdaUrlAuthType = lambdaUrlAuthType;
            return this;
        }

        public Builder commitHash(String commitHash) {
            this.commitHash = commitHash;
            return this;
        }

        public Builder googleBaseUri(String googleBaseUri) {
            this.googleBaseUri = googleBaseUri;
            return this;
        }

        public Builder googleClientId(String googleClientId) {
            this.googleClientId = googleClientId;
            return this;
        }

        public Builder googleClientSecretArn(String googleClientSecretArn) {
            this.googleClientSecretArn = googleClientSecretArn;
            return this;
        }

        public Builder cognitoDomainPrefix(String cognitoDomainPrefix) {
            this.cognitoDomainPrefix = cognitoDomainPrefix;
            return this;
        }

        public Builder userPoolArn(String userPoolArn) {
            this.userPoolArn = userPoolArn;
            return this;
        }

        public Builder bundleExpiryDate(String bundleExpiryDate) {
            this.bundleExpiryDate = bundleExpiryDate;
            return this;
        }

        public Builder bundleUserLimit(String bundleUserLimit) {
            this.bundleUserLimit = bundleUserLimit;
            return this;
        }

        public Builder baseImageTag(String baseImageTag) {
            this.baseImageTag = baseImageTag;
            return this;
        }

        public Builder cognitoFeaturePlan(String cognitoFeaturePlan) {
            this.cognitoFeaturePlan = cognitoFeaturePlan;
            return this;
        }

        public Builder cognitoEnableLogDelivery(String cognitoEnableLogDelivery) {
            this.cognitoEnableLogDelivery = cognitoEnableLogDelivery;
            return this;
        }

        public Builder ecrRepositoryArn(String ecrRepositoryArn) {
            this.ecrRepositoryArn = ecrRepositoryArn;
            return this;
        }

        public Builder ecrRepositoryName(String ecrRepositoryName) {
            this.ecrRepositoryName = ecrRepositoryName;
            return this;
        }

        public WebStack build() {
            return new WebStack(this.scope, this.id, this.props, this);
        }

        public static String buildDomainName(String env, String subDomainName, String hostedZoneName) {
            if (env == null || env.isBlank()) {
                throw new IllegalArgumentException("env is required to build domain name");
            }
            if (subDomainName == null || subDomainName.isBlank()) {
                throw new IllegalArgumentException("subDomainName is required to build domain name");
            }
            if (hostedZoneName == null || hostedZoneName.isBlank()) {
                throw new IllegalArgumentException("hostedZoneName is required to build domain name");
            }
            return "prod".equals(env)
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

        public static String buildOriginBucketName(String dashedDomainName) {
            return dashedDomainName;
        }

        public static String buildTrailName(String dashedDomainName) {
            return "%s-cloud-trail".formatted(dashedDomainName);
        }

        public static String buildOriginAccessLogBucketName(String dashedDomainName) {
            return "%s-origin-access-logs".formatted(dashedDomainName);
        }

        public static String buildDistributionAccessLogBucketName(String dashedDomainName) {
            return "%s-dist-access-logs".formatted(dashedDomainName);
        }

        private static String buildFunctionName(String dashedDomainName, String functionName) {
            if (functionName == null || functionName.isBlank()) {
                throw new IllegalArgumentException("Function name cannot be null or blank");
            }
            return "%s-%s".formatted(dashedDomainName, ResourceNameUtils.convertCamelCaseToDashSeparated(functionName));
        }

        private static String buildBucketName(String dashedDomainName, String bucketName) {
            return "%s-%s".formatted(dashedDomainName, bucketName);
        }
    }

    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();

    public WebStack(Construct scope, String id, WebStack.Builder builder) {
        this(scope, id, null, builder);
    }

    public WebStack(Construct scope, String id, StackProps props, WebStack.Builder builder) {
        super(scope, id, props);

        this.hostedZone = HostedZone.fromHostedZoneAttributes(
                this,
                "HostedZone",
                HostedZoneAttributes.builder()
                        .zoneName(builder.hostedZoneName)
                        .hostedZoneId(builder.hostedZoneId)
                        .build());

        this.domainName = Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String dashedDomainName =
                Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String originBucketName = Builder.buildOriginBucketName(dashedDomainName);

        this.baseUrl = "https://" + domainName;

        // Generate predictable resource name prefix based on domain and environment
        String resourceNamePrefix =
            generateResourceNamePrefix(domainName, builder.env);
        String compressedResourceNamePrefix =
            generateCompressedResourceNamePrefix(domainName, builder.env);

        boolean s3UseExistingBucket = Boolean.parseBoolean(builder.s3UseExistingBucket);
        boolean s3RetainOriginBucket = Boolean.parseBoolean(builder.s3RetainOriginBucket);
        boolean s3RetainReceiptsBucket = Boolean.parseBoolean(builder.s3RetainReceiptsBucket);
        boolean cloudTrailEnabled = Boolean.parseBoolean(builder.cloudTrailEnabled);
        boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);
        int accessLogGroupRetentionPeriodDays;
        try {
            accessLogGroupRetentionPeriodDays = Integer.parseInt(builder.accessLogGroupRetentionPeriodDays);
        } catch (Exception e) {
            logger.warn(
                    "Invalid access log group retention period days '{}', defaulting to 30 days",
                    builder.accessLogGroupRetentionPeriodDays);
            accessLogGroupRetentionPeriodDays = 30;
        }
        String originAccessLogBucketName = Builder.buildOriginAccessLogBucketName(dashedDomainName);
        String distributionAccessLogBucketName = Builder.buildDistributionAccessLogBucketName(dashedDomainName);
        boolean verboseLogging = builder.verboseLogging == null || Boolean.parseBoolean(builder.verboseLogging);

        // Origin bucket for the CloudFront distribution
        String receiptsBucketFullName = Builder.buildBucketName(dashedDomainName, builder.receiptsBucketPostfix);
        BucketOrigin bucketOrigin;
        //if (s3UseExistingBucket) {
        //    bucketOrigin = BucketOrigin.Builder.create(this, "Origin")
        //            .bucketName(originBucketName)
        //            .useExistingBucket(true)
        //            .build();
        //} else {
            bucketOrigin = BucketOrigin.Builder.create(this, "Origin")
                    .bucketName(originBucketName)
                    .originAccessLogBucketName(originAccessLogBucketName)
                    .functionNamePrefix("%s-origin-access-".formatted(dashedDomainName))
                    .logS3ObjectEventHandlerSource(builder.logS3ObjectEventHandlerSource)
                    .accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                    .retainBucket(s3RetainOriginBucket)
                    .verboseLogging(verboseLogging)
                    .useExistingBucket(false)
                    .build();
        //}

        this.originBucket = bucketOrigin.originBucket;
        this.originAccessLogBucket = bucketOrigin.originAccessLogBucket;
        this.originIdentity = bucketOrigin.originIdentity;
        this.origin = bucketOrigin.origin;

        final BehaviorOptions s3BucketOriginBehaviour = BehaviorOptions.builder()
                .origin(this.origin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();

        IUserPool userPool = UserPool.fromUserPoolArn(this, "UserPool", builder.userPoolArn);

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
                .functionName(Builder.buildFunctionName(dashedDomainName, "authUrl.httpGetHmrc"))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .handler(builder.lambdaEntry + "authUrl.httpGetHmrc")
                .environment(authUrlHmrcLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .options(lambdaCommonOpts)
                .build(this);
        this.authUrlHmrcLambda = authUrlHmrcLambdaUrlOrigin.lambda;
        this.authUrlHmrcLambdaUrl = authUrlHmrcLambdaUrlOrigin.functionUrl;
        this.authUrlLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                "/api/hmrc/auth-url" + "*", authUrlHmrcLambdaUrlOrigin.behaviorOptions);

        // authUrl - mock
        var authUrlMockLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        var authUrlMockLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlMock")
                .options(lambdaCommonOpts)
                .baseImageTag(builder.baseImageTag)
                .ecrRepositoryName(builder.ecrRepositoryName)
                .ecrRepositoryArn(builder.ecrRepositoryArn)
                .imageFilename("authUrlMock.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, "authUrl.httpGetMock"))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .handler(builder.lambdaEntry + "authUrl.httpGetMock")
                .environment(authUrlMockLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build(this);
        this.authUrlMockLambda = authUrlMockLambdaUrlOrigin.lambda;
        this.authUrlMockLambdaUrl = authUrlMockLambdaUrlOrigin.functionUrl;
        this.authUrlMockLambdaLogGroup = authUrlMockLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                "/api/mock/auth-url" + "*", authUrlMockLambdaUrlOrigin.behaviorOptions);

        // authUrl - Google or Antonycc via Cognito
        var authUrlCognitoLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL",
                builder.homeUrl,
                "DIY_SUBMIT_COGNITO_CLIENT_ID",
                builder.cognitoClientId,
                "DIY_SUBMIT_COGNITO_BASE_URI",
                builder.cognitoBaseUri));
        var authUrlCognitoLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlCognito")
                .options(lambdaCommonOpts)
                .baseImageTag(builder.baseImageTag)
                .ecrRepositoryName(builder.ecrRepositoryName)
                .ecrRepositoryArn(builder.ecrRepositoryArn)
                .imageFilename("authUrlCognito.Dockerfile")
                .functionName(
                        Builder.buildFunctionName(dashedDomainName, "authUrl.httpGetCognito"))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .handler(builder.lambdaEntry + "authUrl.httpGetCognito")
                .environment(authUrlCognitoLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build(this);
        this.authUrlCognitoLambda = authUrlCognitoLambdaUrlOrigin.lambda;
        this.authUrlCognitoLambdaUrl = authUrlCognitoLambdaUrlOrigin.functionUrl;
        this.authUrlCognitoLambdaLogGroup = authUrlCognitoLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                "/api/cognito/auth-url" + "*", authUrlCognitoLambdaUrlOrigin.behaviorOptions);

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
                        Builder.buildFunctionName(dashedDomainName, "exchangeToken.httpPostHmrc"))
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

        // exchangeToken - Google or Antonycc via Cognito
        var exchangeCognitoTokenLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
        if (StringUtils.isNotBlank(builder.cognitoBaseUri)) {
            exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_COGNITO_BASE_URI", builder.cognitoBaseUri);
        }
        if (StringUtils.isNotBlank(builder.cognitoClientId)) {
            exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_COGNITO_CLIENT_ID", builder.cognitoClientId);
        }
        if (StringUtils.isNotBlank(builder.optionalTestAccessToken)) {
            exchangeCognitoTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
        }
        var exchangeCognitoTokenLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "ExchangeCognitoToken")
                .options(lambdaCommonOpts)
                .baseImageTag(builder.baseImageTag)
                .ecrRepositoryName(builder.ecrRepositoryName)
                .ecrRepositoryArn(builder.ecrRepositoryArn)
                .imageFilename("exchangeCognitoToken.Dockerfile")
                .functionName(Builder.buildFunctionName(
                        dashedDomainName, "exchangeToken.httpPostCognito"))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .handler(builder.lambdaEntry + "exchangeToken.httpPostCognito")
                .environment(exchangeCognitoTokenLambdaEnv)
                .timeout(Duration.millis(Long.parseLong("30000")))
                .build(this);
        this.exchangeCognitoTokenLambda = exchangeCognitoTokenLambdaUrlOrigin.lambda;
        this.exchangeCognitoTokenLambdaUrl = exchangeCognitoTokenLambdaUrlOrigin.functionUrl;
        this.exchangeCognitoTokenLambdaLogGroup = exchangeCognitoTokenLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(
                "/api/cognito/exchange-token" + "*", exchangeCognitoTokenLambdaUrlOrigin.behaviorOptions);

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
                .functionName(Builder.buildFunctionName(dashedDomainName, "submitVat.httpPost"))
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
                .functionName(Builder.buildFunctionName(dashedDomainName, "logReceipt.httpPost"))
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
                    .functionName(Builder.buildFunctionName(dashedDomainName, "bundle.httpPost"))
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
                .functionName(Builder.buildFunctionName(dashedDomainName, "getCatalog.httpGet"))
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
                .functionName(Builder.buildFunctionName(dashedDomainName, "myBundles.httpGet"))
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
                .functionName(Builder.buildFunctionName(dashedDomainName, "myReceipts.httpGet"))
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

        // Create a certificate for the website domain
        this.certificate = Certificate.fromCertificateArn(this, "Certificate", builder.certificateArn);

        // Create the CloudFront distribution using a helper to preserve IDs and reduce inline noise
        var distWithLogging = DistributionWithLogging.Builder.create(this)
                .domainName(this.domainName)
                .defaultBehavior(s3BucketOriginBehaviour)
                .additionalBehaviors(lambdaUrlToOriginsBehaviourMappings)
                .defaultRootObject(builder.defaultDocumentAtOrigin)
                .errorPageKey(builder.error404NotFoundAtDistribution)
                .errorStatusCode(HttpStatus.SC_NOT_FOUND)
                .certificate(this.certificate)
                .logBucketName(distributionAccessLogBucketName)
                .logFunctionNamePrefix("%s-dist-access-".formatted(dashedDomainName))
                .logRetentionDays(accessLogGroupRetentionPeriodDays)
                .cloudTrailEnabled(cloudTrailEnabled)
                .logIncludesCookies(verboseLogging)
                .logHandlerSource(builder.logGzippedS3ObjectEventHandlerSource)
                .build();
        this.distributionAccessLogBucket = distWithLogging.logBucket;
        this.distribution = distWithLogging.distribution;

        Permission invokeFunctionUrlPermission = Permission.builder()
                .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                .action("lambda:InvokeFunctionUrl")
                .functionUrlAuthType(functionUrlAuthType)
                .sourceArn(this.distribution.getDistributionArn()) // restrict to your distribution
                .build();
        authUrlHmrcLambda.addPermission("AuthLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        exchangeHmrcTokenLambda.addPermission("ExchangeTokenLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        submitVatLambda.addPermission("SubmitVatLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        logReceiptLambda.addPermission("LogReceiptLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        if (this.bundleLambda != null)
            this.bundleLambda.addPermission("BundleLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        if (this.catalogLambda != null)
            this.catalogLambda.addPermission("CatalogLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        if (this.myBundlesLambda != null)
            this.myBundlesLambda.addPermission("MyBundlesLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);

        this.distributionUrl = "https://%s/".formatted(this.distribution.getDomainName());
        logger.info("Distribution URL: %s".formatted(distributionUrl));
        logger.info("Base URL: %s".formatted(baseUrl));

        /*

        // Generate submit.version file with commit hash if provided
        if (builder.commitHash != null && !builder.commitHash.isBlank()) {
            try {
                java.nio.file.Path sourceFilePath = java.nio.file.Paths.get(builder.docRootPath, "submit.version");
                java.nio.file.Files.writeString(sourceFilePath, builder.commitHash.trim());
                logger.info("Created submit.version file with commit hash: %s".formatted(builder.commitHash));
            } catch (Exception e) {
                logger.warn("Failed to create submit.version file: %s".formatted(e.getMessage()));
            }
        } else {
            logger.info("No commit hash provided, skipping submit.version generation");
        }

        var deployPostfix = java.util.UUID.randomUUID().toString().substring(0, 8);

        // Deploy the web website files to the web website bucket and invalidate distribution
        this.docRootSource = Source.asset(
                builder.docRootPath,
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        logger.info("Will deploy files from: %s".formatted(builder.docRootPath));

        // Create LogGroup for BucketDeployment
        var bucketDeploymentRetentionPeriodDays = Integer.parseInt(builder.cloudTrailLogGroupRetentionPeriodDays);
        var bucketDeploymentRetentionPeriod =
                RetentionDaysConverter.daysToRetentionDays(bucketDeploymentRetentionPeriodDays);
        LogGroup bucketDeploymentLogGroup = LogGroup.Builder.create(this, "BucketDeploymentLogGroup-" + deployPostfix)
                .logGroupName("/aws/lambda/bucket-deployment-%s-%s".formatted(dashedDomainName, deployPostfix))
                .retention(bucketDeploymentRetentionPeriod)
                .removalPolicy(s3RetainOriginBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .build();

        this.deployment = BucketDeployment.Builder.create(this, "DocRootToOriginDeployment")
                .sources(List.of(this.docRootSource))
                .destinationBucket(this.originBucket)
                .distribution(this.distribution)
                .distributionPaths(List.of(
                    "/account/*",
                    "/activities/*",
                    "/auth/*",
                    "/errors/*",
                    "/images/*",
                    "/widgets/*",
                    "/favicon.ico",
                    "/index.html",
                    "/submit.css",
                    "/submit.js",
                    "/submit.version"
                ))
                .logGroup(bucketDeploymentLogGroup)
                .retainOnDelete(true)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(false)
                .memoryLimit(1024)
                .ephemeralStorageSize(Size.gibibytes(2))
                .build();
*/
        // Create Route53 record for use with CloudFront distribution
        this.aRecord = ARecord.Builder.create(this, "ARecord-%s".formatted(dashedDomainName))
                .zone(this.hostedZone)
                .recordName(this.domainName)
                .deleteExisting(true)
                .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                .build();
        this.aaaaRecord = AaaaRecord.Builder.create(this, "AaaaRecord-%s".formatted(dashedDomainName))
                .zone(this.hostedZone)
                .recordName(this.domainName)
                .deleteExisting(true)
                .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                .build();

        // Stack Outputs for Web resources
        if (this.originBucket != null) {
            CfnOutput.Builder.create(this, "OriginBucketArn")
                    .value(this.originBucket.getBucketArn())
                    .build();
        }
        if (this.originAccessLogBucket != null) {
            CfnOutput.Builder.create(this, "OriginAccessLogBucketArn")
                    .value(this.originAccessLogBucket.getBucketArn())
                    .build();
        }
        if (this.distributionAccessLogBucket != null) {
            CfnOutput.Builder.create(this, "DistributionAccessLogBucketArn")
                    .value(this.distributionAccessLogBucket.getBucketArn())
                    .build();
        }
        if (this.distribution != null) {
            CfnOutput.Builder.create(this, "DistributionId")
                    .value(this.distribution.getDistributionId())
                    .build();
        }
        if (this.hostedZone != null) {
            CfnOutput.Builder.create(this, "HostedZoneId")
                    .value(this.hostedZone.getHostedZoneId())
                    .build();
        }
        if (this.certificate != null) {
            CfnOutput.Builder.create(this, "CertificateArn")
                    .value(this.certificate.getCertificateArn())
                    .build();
        }
        if (this.hmrcClientSecretsManagerSecret != null) {
            CfnOutput.Builder.create(this, "HmrcClientSecretsManagerSecretArn")
                    .value(this.hmrcClientSecretsManagerSecret.getSecretArn())
                    .build();
        }
        if (this.cognitoBaseUri != null) {
            CfnOutput.Builder.create(this, "CognitoBaseUri")
                    .value(this.cognitoBaseUri)
                    .build();
            CfnOutput.Builder.create(this, "CognitoGoogleIdpRedirectUri")
                    .value(this.cognitoBaseUri + "/oauth2/idpresponse")
                    .build();
        }
        if (this.aRecord != null) {
            CfnOutput.Builder.create(this, "ARecord")
                    .value(this.aRecord.getDomainName())
                    .build();
        }
        if (this.aaaaRecord != null) {
            CfnOutput.Builder.create(this, "AaaaRecord")
                    .value(this.aaaaRecord.getDomainName())
                    .build();
        }

        if (this.authUrlHmrcLambda != null) {
            CfnOutput.Builder.create(this, "AuthUrlHmrcLambdaArn")
                    .value(this.authUrlHmrcLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "AuthUrlHmrcLambdaUrl")
                    .value(this.authUrlHmrcLambdaUrl.getUrl())
                    .build();
        }
        if (this.authUrlMockLambda != null) {
            CfnOutput.Builder.create(this, "AuthUrlMockLambdaArn")
                    .value(this.authUrlMockLambda.getFunctionArn())
                    .build();
            CfnOutput.Builder.create(this, "AuthUrlMockLambdaUrl")
                    .value(this.authUrlMockLambdaUrl.getUrl())
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
    }
}
