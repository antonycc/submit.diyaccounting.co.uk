package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.awssdk.RetentionDaysConverter;
import co.uk.diyaccounting.submit.functions.LogGzippedS3ObjectEvent;
import co.uk.diyaccounting.submit.functions.LogS3ObjectEvent;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.hc.core5.http.HttpStatus;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.Fn;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.CertificateValidation;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.ErrorResponse;
import software.amazon.awscdk.services.cloudfront.HttpVersion;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestCookieBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestHeaderBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOAIProps;
import software.amazon.awscdk.services.cloudtrail.S3EventSelector;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.lambda.AssetImageCodeProps;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlCorsOptions;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.HttpMethod;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupProps;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.ISource;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.text.MessageFormat;
import java.util.AbstractMap;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class WebStack extends Stack {

    private static final Logger logger = LogManager.getLogger(WebStack.class);

    public String domainName;
    public IBucket originBucket;
    public LogGroup originBucketLogGroup;
    public IBucket originAccessLogBucket;
    public IOrigin origin;
    public BucketDeployment deployment;
    public IHostedZone hostedZone;
    public ICertificate certificate;
    public IBucket distributionAccessLogBucket;
    public OriginAccessIdentity originIdentity;
    public Distribution distribution;
    public String distributionUrl;
    public ISource docRootSource;
    public ARecord aRecord;
    public AaaaRecord aaaaRecord;
    public Trail originBucketTrail;
    public Function authUrlLambda;
    public FunctionUrl authUrlLambdaUrl;
    public LogGroup authUrlLambdaLogGroup;
    public Function exchangeTokenLambda;
    public FunctionUrl exchangeTokenLambdaUrl;
    public LogGroup exchangeTokenLambdaLogGroup;
    public Function submitVatLambda;
    public FunctionUrl submitVatLambdaUrl;
    public LogGroup submitVatLambdaLogGroup;
    public Function logReceiptLambda;
    public FunctionUrl logReceiptLambdaUrl;
    public LogGroup logReceiptLambdaLogGroup;
    public IBucket receiptsBucket;
    public LogGroup receiptsBucketLogGroup;
    public Trail receiptsBucketTrail;

    public static class Builder {
        public Construct scope;
        public String id;
        public StackProps props;

        public String env;
        public String hostedZoneName;
        public String hostedZoneId;
        public String subDomainName;
        public String useExistingHostedZone;
        public String certificateArn;
        public String useExistingCertificate;
        public String cloudTrailEnabled;
        public String cloudTrailLogGroupPrefix;
        public String cloudTrailLogGroupRetentionPeriodDays;
        public String accessLogGroupRetentionPeriodDays;
        public String s3UseExistingBucket;
        public String s3RetainBucket;
        public String cloudTrailEventSelectorPrefix;
        public String logS3ObjectEventHandlerSource;
        public String logGzippedS3ObjectEventHandlerSource;
        public String docRootPath;
        public String defaultDocumentAtOrigin;
        public String error404NotFoundAtDistribution;
        public String skipLambdaUrlOrigins;
        public String hmrcClientId;
        public String homeUrl;
        public String hmrcBaseUri;
        public String optionalTestRedirectUri;
        public String optionalTestAccessToken;
        public String optionalTestS3Endpoint;
        public String optionalTestS3AccessKey;
        public String optionalTestS3SecretKey;
        public String receiptsBucketPostfix;
        public String lambdaEntry;
        public String authUrlLambdaHandlerFunctionName;
        public String authUrlLambdaDuration;
        public String exchangeTokenLambdaHandlerFunctionName;
        public String exchangeTokenLambdaDuration;
        public String submitVatLambdaHandlerFunctionName;
        public String submitVatLambdaDuration;
        public String logReceiptLambdaHandlerFunctionName;
        public String logReceiptLambdaDuration;

        public Builder(Construct scope, String id, StackProps props) {
            this.scope = scope;
            this.id = id;
            this.props = props;
            // Load values from cdk.json here, then let the properties be overridden by the mutators
            this.env = getContextValueString(scope, "env");
        }

        private String getContextValueString(Construct scope, String contextKey) {
            return getContextValueString(scope, contextKey, null);
        }

        private String getContextValueString(Construct scope, String contextKey, String defaultValue) {
            var contextValue = scope.getNode().tryGetContext(contextKey);
            var defaultedValue = StringUtils.isNotBlank(contextValue.toString()) ? contextValue.toString() : defaultValue;
            String source;
            if (StringUtils.isNotBlank(contextValue.toString())) {
                source = "CDK context";
            } else {
                source = "default value";
            }
            CfnOutput.Builder.create(scope, contextKey)
                    .value(MessageFormat.format(  "{0} (Source: CDK {1})",defaultedValue, source))
                    .build();
            return contextValue.toString();
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

        public Builder useExistingHostedZone(String useExistingHostedZone) {
            this.useExistingHostedZone = useExistingHostedZone;
            return this;
        }

        public Builder certificateArn(String certificateArn) {
            this.certificateArn = certificateArn;
            return this;
        }

        public Builder useExistingCertificate(String useExistingCertificate) {
            this.useExistingCertificate = useExistingCertificate;
            return this;
        }

        public Builder cloudTrailEnabled(String cloudTrailEnabled) {
            this.cloudTrailEnabled = cloudTrailEnabled;
            return this;
        }

        public Builder cloudTrailLogGroupPrefix(String cloudTrailLogGroupPrefix) {
            this.cloudTrailLogGroupPrefix = cloudTrailLogGroupPrefix;
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

        public Builder s3RetainBucket(String s3RetainBucket) {
            this.s3RetainBucket = s3RetainBucket;
            return this;
        }

        public Builder cloudTrailEventSelectorPrefix(String cloudTrailEventSelectorPrefix) {
            this.cloudTrailEventSelectorPrefix = cloudTrailEventSelectorPrefix;
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

        public Builder authUrlLambdaHandlerFunctionName(String authUrlLambdaHandlerFunctionName) {
            this.authUrlLambdaHandlerFunctionName = authUrlLambdaHandlerFunctionName;
            return this;
        }

        public Builder authUrlLambdaDurationMillis(String authUrlLambdaDuration) {
            this.authUrlLambdaDuration = authUrlLambdaDuration;
            return this;
        }

        public Builder exchangeTokenLambdaHandlerFunctionName(String exchangeTokenLambdaHandlerFunctionName) {
            this.exchangeTokenLambdaHandlerFunctionName = exchangeTokenLambdaHandlerFunctionName;
            return this;
        }

        public Builder exchangeTokenLambdaDurationMillis(String exchangeTokenLambdaDuration) {
            this.exchangeTokenLambdaDuration = exchangeTokenLambdaDuration;
            return this;
        }

        public Builder submitVatLambdaHandlerFunctionName(String submitVatLambdaHandlerFunctionName) {
            this.submitVatLambdaHandlerFunctionName = submitVatLambdaHandlerFunctionName;
            return this;
        }

        public Builder submitVatLambdaDurationMillis(String submitVatLambdaDuration) {
            this.submitVatLambdaDuration = submitVatLambdaDuration;
            return this;
        }

        public Builder logReceiptLambdaHandlerFunctionName(String logReceiptLambdaHandlerFunctionName) {
            this.logReceiptLambdaHandlerFunctionName = logReceiptLambdaHandlerFunctionName;
            return this;
        }

        public Builder logReceiptLambdaDurationMillis(String logReceiptLambdaDuration) {
            this.logReceiptLambdaDuration = logReceiptLambdaDuration;
            return this;
        }

        public WebStack build() {
            return new WebStack(this.scope, this.id, this.props, this);
        }

        public static String buildDomainName(String env, String subDomainName, String hostedZoneName) { return env.equals("prod") ? hostedZoneName : Builder.buildNonProdDomainName(env, subDomainName, hostedZoneName); }
        public static String buildNonProdDomainName(String env, String subDomainName, String hostedZoneName) { return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName); }
        public static String buildDashedDomainName(String env, String subDomainName, String hostedZoneName) { return ResourceNameUtils.convertDashSeparatedToDotSeparated("%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings); }
        public static String buildOriginBucketName(String dashedDomainName){ return dashedDomainName; }
        public static String buildCloudTrailLogBucketName(String dashedDomainName) { return "%s-cloud-trail".formatted(dashedDomainName); }
        public static String buildOriginAccessLogBucketName(String dashedDomainName) { return "%s-origin-access-logs".formatted(dashedDomainName); }
        public static String buildDistributionAccessLogBucketName(String dashedDomainName) { return "%s-dist-access-logs".formatted(dashedDomainName);}

        private static String buildFunctionName(String dashedDomainName, String functionName) {
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

        boolean useExistingHostedZone = Boolean.parseBoolean(this.getConfigValue(builder.useExistingHostedZone, "useExistingHostedZone"));
        String hostedZoneName = this.getConfigValue(builder.hostedZoneName, "hostedZoneName");
        if (useExistingHostedZone) {
            String hostedZoneId = this.getConfigValue(builder.hostedZoneId, "hostedZoneId");
            this.hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", HostedZoneAttributes.builder()
                    .zoneName(hostedZoneName)
                    .hostedZoneId(hostedZoneId)
                    .build());
        } else {
            this.hostedZone = HostedZone.Builder
                    .create(this, "HostedZone")
                    .zoneName(hostedZoneName)
                    .build();
        }

        String env = this.getConfigValue(builder.env, "env");
        String subDomainName = this.getConfigValue(builder.subDomainName, "subDomainName");
        this.domainName = Builder.buildDomainName(env, subDomainName, hostedZoneName);
        String dashedDomainName = Builder.buildDashedDomainName(env, subDomainName, hostedZoneName);
        String originBucketName = Builder.buildOriginBucketName(dashedDomainName);

        boolean s3UseExistingBucket = Boolean.parseBoolean(this.getConfigValue(builder.s3UseExistingBucket, "s3UseExistingBucket"));
        boolean s3RetainBucket = Boolean.parseBoolean(this.getConfigValue(builder.s3RetainBucket, "s3RetainBucket"));

        String cloudTrailEventSelectorPrefix = this.getConfigValue(builder.cloudTrailEventSelectorPrefix, "cloudTrailEventSelectorPrefix");
        String cloudTrailLogBucketName = Builder.buildCloudTrailLogBucketName(dashedDomainName);
        boolean cloudTrailEnabled = Boolean.parseBoolean(this.getConfigValue(builder.cloudTrailEnabled, "cloudTrailEnabled"));
        String cloudTrailLogGroupPrefix = this.getConfigValue(builder.cloudTrailLogGroupPrefix, "cloudTrailLogGroupPrefix");
        int cloudTrailLogGroupRetentionPeriodDays = Integer.parseInt(this.getConfigValue(builder.cloudTrailLogGroupRetentionPeriodDays, "cloudTrailLogGroupRetentionPeriodDays"));

        String certificateArn = this.getConfigValue(builder.certificateArn, "certificateArn");
        boolean useExistingCertificate = Boolean.parseBoolean(this.getConfigValue(builder.useExistingCertificate, "useExistingCertificate"));

        int accessLogGroupRetentionPeriodDays = Integer.parseInt(this.getConfigValue(builder.accessLogGroupRetentionPeriodDays, "accessLogGroupRetentionPeriodDays"));
        String originAccessLogBucketName = Builder.buildOriginAccessLogBucketName(dashedDomainName);
        String logS3ObjectEventHandlerSource = this.getConfigValue(builder.logS3ObjectEventHandlerSource, "logS3ObjectEventHandlerSource");

        String distributionAccessLogBucketName = Builder.buildDistributionAccessLogBucketName(dashedDomainName);
        String logGzippedS3ObjectEventHandlerSource = this.getConfigValue(builder.logGzippedS3ObjectEventHandlerSource, "logGzippedS3ObjectEventHandlerSource");

        String docRootPath = this.getConfigValue(builder.docRootPath, "docRootPath");
        String defaultDocumentAtOrigin = this.getConfigValue(builder.defaultDocumentAtOrigin, "defaultDocumentAtOrigin");
        String error404NotFoundAtDistribution = this.getConfigValue(builder.error404NotFoundAtDistribution, "error404NotFoundAtDistribution");
        boolean skipLambdaUrlOrigins = Boolean.parseBoolean(this.getConfigValue(builder.skipLambdaUrlOrigins, "skipLambdaUrlOrigins"));

        // Receipts bucket
        String receiptsBucketPostfix = this.getConfigValue(builder.receiptsBucketPostfix, "receiptsBucketPostfix");
        String receiptsBucketFullName = Builder.buildBucketName(dashedDomainName, receiptsBucketPostfix);

        // Lambdas
        String lambaEntry =  this.getConfigValue(builder.lambdaEntry, "lambdaEntry");

        String authUrlLambdaHandlerFunctionName = Builder.buildFunctionName(dashedDomainName, this.getConfigValue(builder.authUrlLambdaHandlerFunctionName, "authUrlLambdaHandlerFunctionName"));
        String authUrlLambdaHandlerCmd = lambaEntry + authUrlLambdaHandlerFunctionName;
        Duration authUrlLambdaDuration = Duration.millis(Long.parseLong(this.getConfigValue(builder.authUrlLambdaDuration, "authUrlLambdaDuration")));

        String exchangeTokenLambdaHandlerFunctionName = Builder.buildFunctionName(dashedDomainName, this.getConfigValue(builder.exchangeTokenLambdaHandlerFunctionName, "exchangeTokenLambdaHandlerFunctionName"));
        String exchangeTokenLambdaHandlerCmd = lambaEntry + exchangeTokenLambdaHandlerFunctionName;
        Duration exchangeTokenLambdaDuration = Duration.millis(Long.parseLong(this.getConfigValue(builder.exchangeTokenLambdaDuration, "exchangeTokenLambdaDuration")));

        String submitVatLambdaHandlerFunctionName = Builder.buildFunctionName(dashedDomainName, this.getConfigValue(builder.submitVatLambdaHandlerFunctionName, "submitVatLambdaHandlerFunctionName"));
        String submitVatLambdaHandlerCmd = lambaEntry + submitVatLambdaHandlerFunctionName;
        Duration submitVatLambdaDuration = Duration.millis(Long.parseLong(this.getConfigValue(builder.submitVatLambdaDuration, "submitVatLambdaDuration")));

        String logReceiptLambdaHandlerFunctionName = Builder.buildFunctionName(dashedDomainName, this.getConfigValue(builder.logReceiptLambdaHandlerFunctionName, "logReceiptLambdaHandlerFunctionName"));
        String logReceiptLambdaHandlerCmd = lambaEntry + logReceiptLambdaHandlerFunctionName;
        Duration logReceiptLambdaDuration = Duration.millis(Long.parseLong(this.getConfigValue(builder.logReceiptLambdaDuration, "logReceiptLambdaDuration")));

        // Lambda config values
        String hmrcClientId = this.getConfigValue(builder.hmrcClientId, "hmrcClientId");
        String homeUrl = this.getConfigValue(builder.homeUrl, "homeUrl");
        String hmrcBaseUri = this.getConfigValue(builder.hmrcBaseUri, "hmrcBaseUri");
        String optionalTestAccessToken = this.getConfigValue(builder.optionalTestAccessToken, "optionalTestAccessToken");
        String optionalTestS3Endpoint;
        String optionalTestS3AccessKey;
        String optionalTestS3SecretKey;
        try {
            optionalTestS3Endpoint = this.getConfigValue(builder.optionalTestS3Endpoint, "optionalTestS3Endpoint");
            optionalTestS3AccessKey = this.getConfigValue(builder.optionalTestS3AccessKey, "optionalTestS3AccessKey");
            optionalTestS3SecretKey = this.getConfigValue(builder.optionalTestS3SecretKey, "optionalTestS3SecretKey");
        } catch (Exception e) {
            // If test S3 values are not provided, set them to null
            optionalTestS3Endpoint = null;
            optionalTestS3AccessKey = null;
            optionalTestS3SecretKey = null;
        }

        if (s3UseExistingBucket) {
            this.originBucket = Bucket.fromBucketName(this, "OriginBucket", originBucketName);
        } else {
            // Web bucket as origin for the CloudFront distribution with a bucket for access logs forwarded to CloudWatch
            this.originAccessLogBucket = LogForwardingBucket.Builder
                    .create(this, "OriginAccess", logS3ObjectEventHandlerSource, LogS3ObjectEvent.class)
                    .bucketName(originAccessLogBucketName)
                    .functionNamePrefix("%s-origin-access-".formatted(dashedDomainName))
                    .retentionPeriodDays(accessLogGroupRetentionPeriodDays)
                    .build();
            this.originBucket = Bucket.Builder.create(this, "OriginBucket")
                    .bucketName(originBucketName)
                    .versioned(false)
                    .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                    .encryption(BucketEncryption.S3_MANAGED)
                    .removalPolicy(s3RetainBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                    .autoDeleteObjects(true)
                    .autoDeleteObjects(!s3RetainBucket)
                    .serverAccessLogsBucket(this.originAccessLogBucket)
                    .build();
        }

        // Grant the read access to an origin identity
        this.originIdentity = OriginAccessIdentity.Builder
                .create(this, "OriginAccessIdentity")
                .comment("Identity created for access to the web website bucket via the CloudFront distribution")
                .build();
        originBucket.grantRead(this.originIdentity); // This adds "s3:List*" so that 404s are handled.
        this.origin = S3BucketOrigin.withOriginAccessIdentity(this.originBucket, 
                S3BucketOriginWithOAIProps.builder()
                        .originAccessIdentity(this.originIdentity)
                        .build());

        // Create the CloudFront distribution with a bucket as an origin
        final OriginRequestPolicy s3BucketOriginRequestPolicy = OriginRequestPolicy.Builder
                .create(this, "OriginRequestPolicy")
                .comment("Policy to allow content headers but no cookies from the origin")
                .cookieBehavior(OriginRequestCookieBehavior.none())
                .headerBehavior(OriginRequestHeaderBehavior.allowList("Accept", "Accept-Language", "Origin"))
                .build();
        final BehaviorOptions s3BucketOriginBehaviour = BehaviorOptions.builder()
                .origin(this.origin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(s3BucketOriginRequestPolicy)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();
        this.distributionAccessLogBucket = LogForwardingBucket.Builder
                .create(this, "DistributionAccess", logGzippedS3ObjectEventHandlerSource, LogGzippedS3ObjectEvent.class)
                .bucketName(distributionAccessLogBucketName)
                .functionNamePrefix("%s-dist-access-".formatted(dashedDomainName))
                .retentionPeriodDays(accessLogGroupRetentionPeriodDays)
                .build();

        // Add cloud trail to the origin bucket if enabled
        // CloudTrail for the origin bucket
        RetentionDays cloudTrailLogGroupRetentionPeriod = RetentionDaysConverter.daysToRetentionDays(cloudTrailLogGroupRetentionPeriodDays);
        if (cloudTrailEnabled) {
            this.originBucketLogGroup = LogGroup.Builder.create(this, "OriginBucketLogGroup")
                    .logGroupName("%s%s-cloud-trail".formatted(cloudTrailLogGroupPrefix, this.originBucket.getBucketName()))
                    .retention(cloudTrailLogGroupRetentionPeriod)
                    .removalPolicy(s3RetainBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                    .build();
            this.originBucketTrail = Trail.Builder.create(this, "OriginBucketTrail")
                    .trailName(cloudTrailLogBucketName)
                    .cloudWatchLogGroup(this.originBucketLogGroup)
                    .sendToCloudWatchLogs(true)
                    .cloudWatchLogsRetention(cloudTrailLogGroupRetentionPeriod)
                    .includeGlobalServiceEvents(false)
                    .isMultiRegionTrail(false)
                    .build();
            // Add S3 event selector to the CloudTrail
            if (cloudTrailEventSelectorPrefix == null || !cloudTrailEventSelectorPrefix.isBlank() || "none".equals(cloudTrailEventSelectorPrefix)) {
                originBucketTrail.addS3EventSelector(List.of(S3EventSelector.builder()
                        .bucket(this.originBucket)
                        .build()
                ));
            } else {
                originBucketTrail.addS3EventSelector(List.of(S3EventSelector.builder()
                        .bucket(this.originBucket)
                        .objectPrefix(cloudTrailEventSelectorPrefix)
                        .build()
                ));
            }
        } else {
            logger.info("CloudTrail is not enabled for the origin bucket.");
        }

        var lambdaUrlToOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

        // authUrlHandler
        if ("test".equals(env)) {
            // For testing, create a simple Function instead of DockerImageFunction to avoid Docker builds
            this.authUrlLambda = Function.Builder.create(this, "AuthUrlLambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(Runtime.NODEJS_20_X)
                    .functionName(authUrlLambdaHandlerFunctionName)
                    .timeout(authUrlLambdaDuration)
                    .build();
        } else {
            var authUrlLambdaEnv = Map.of(
                    //"HANDLER", authUrlLambdaHandler,
                    "DIY_SUBMIT_HMRC_CLIENT_ID", hmrcClientId,
                    "DIY_SUBMIT_HOME_URL", homeUrl,
                    "DIY_SUBMIT_HMRC_BASE_URI", hmrcBaseUri
            );
            var assetImageCodeProps = AssetImageCodeProps.builder()
                    .cmd(List.of(authUrlLambdaHandlerCmd))
                    .build();
            this.authUrlLambda = DockerImageFunction.Builder.create(this, "AuthUrlLambda")
                    .code(DockerImageCode.fromImageAsset(".", assetImageCodeProps))
                    .environment(authUrlLambdaEnv)
                    .functionName(authUrlLambdaHandlerFunctionName)
                    .timeout(authUrlLambdaDuration)
                    .build();
        }
        this.authUrlLambdaLogGroup = new LogGroup(this, "AuthUrlLambdaLogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.authUrlLambda.getFunctionName())
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build());
        this.authUrlLambdaUrl = this.authUrlLambda.addFunctionUrl(
                FunctionUrlOptions.builder()
                        .authType(FunctionUrlAuthType.NONE)  // No auth for the auth URL
                        .cors(FunctionUrlCorsOptions.builder()
                                .allowedOrigins(List.of("https://" + this.domainName))
                                .allowedMethods(List.of(HttpMethod.GET))
                                .build())
                        .build()
        );
        if (skipLambdaUrlOrigins) {
            logger.info("Skipping Lambda URL origins for authUrlLambdaUrl as per configuration.");
        } else {
            String authUrlLambdaUrl = this.getLambdaUrlHostToken(this.authUrlLambdaUrl);
            HttpOrigin authUrlApiOrigin = HttpOrigin.Builder.create(authUrlLambdaUrl)
                    .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                    .build();
            final BehaviorOptions authUrlOriginBehaviour = BehaviorOptions.builder()
                    .origin(authUrlApiOrigin)
                    .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                    .cachePolicy(CachePolicy.CACHING_DISABLED)
                    .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                    .build();
            lambdaUrlToOriginsBehaviourMappings.put("/api/auth-url*", authUrlOriginBehaviour);
        }

        // exchangeTokenHandler
        if ("test".equals(env)) {
            // For testing, create a simple Function instead of DockerImageFunction to avoid Docker builds
            this.exchangeTokenLambda = Function.Builder.create(this, "ExchangeTokenLambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(Runtime.NODEJS_20_X)
                    .functionName(exchangeTokenLambdaHandlerFunctionName)
                    .timeout(exchangeTokenLambdaDuration)
                    .build();
        } else {
            // AssetImageCodeProps.builder().buildArgs(Map.of("HANDLER", exchangeTokenLambdaHandler)).build())
            var exchangeTokenLambdaEnv = new HashMap<>(Map.of(
                    "HANDLER", exchangeTokenLambdaHandlerCmd,
                    "DIY_SUBMIT_HMRC_CLIENT_ID", hmrcClientId,
                    "DIY_SUBMIT_HOME_URL", homeUrl,
                    "DIY_SUBMIT_HMRC_BASE_URI", hmrcBaseUri
            ));
            if (StringUtils.isNotBlank(optionalTestAccessToken)){
                exchangeTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", optionalTestAccessToken);
            }
            this.exchangeTokenLambda = DockerImageFunction.Builder.create(this, "ExchangeTokenLambda")
                    .code(DockerImageCode.fromImageAsset("."))
                    .environment(exchangeTokenLambdaEnv)
                    .functionName(exchangeTokenLambdaHandlerFunctionName)
                    .timeout(exchangeTokenLambdaDuration)
                    .build();
        }
        this.exchangeTokenLambdaLogGroup = new LogGroup(this, "ExchangeTokenLambdaLogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.exchangeTokenLambda.getFunctionName())
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build());
        this.exchangeTokenLambdaUrl = this.exchangeTokenLambda.addFunctionUrl(
                FunctionUrlOptions.builder()
                        .authType(FunctionUrlAuthType.NONE)  // No auth for the auth URL
                        .cors(FunctionUrlCorsOptions.builder()
                                .allowedOrigins(List.of("https://" + this.domainName))
                                .allowedMethods(List.of(HttpMethod.POST))
                                .build())
                        .build()
        );
        if (skipLambdaUrlOrigins) {
            logger.info("Skipping Lambda URL origins for exchangeTokenLambdaUrl as per configuration.");
        } else {
            String exchangeTokenLambdaUrl = this.getLambdaUrlHostToken(this.exchangeTokenLambdaUrl);
            HttpOrigin exchangeTokenApiOrigin = HttpOrigin.Builder.create(exchangeTokenLambdaUrl)
                    .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                    .build();
            final BehaviorOptions exchangeTokenOriginBehaviour = BehaviorOptions.builder()
                    .origin(exchangeTokenApiOrigin)
                    .allowedMethods(AllowedMethods.ALLOW_ALL)
                    .cachePolicy(CachePolicy.CACHING_DISABLED)
                    .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                    .build();
            lambdaUrlToOriginsBehaviourMappings.put("/api/exchange-token*", exchangeTokenOriginBehaviour);
        }

        // submitVatHandler
        if ("test".equals(env)) {
            // For testing, create a simple Function instead of DockerImageFunction to avoid Docker builds
            this.submitVatLambda = Function.Builder.create(this, "SubmitVatLambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(Runtime.NODEJS_20_X)
                    .functionName(submitVatLambdaHandlerFunctionName)
                    .timeout(submitVatLambdaDuration)
                    .build();
        } else {
            var submitVatLambdaEnv = Map.of(
                    "HANDLER", submitVatLambdaHandlerCmd,
                    "DIY_SUBMIT_HOME_URL", homeUrl,
                    "DIY_SUBMIT_HMRC_BASE_URI", hmrcBaseUri
            );
            this.submitVatLambda = DockerImageFunction.Builder.create(this, "SubmitVatLambda")
                    .code(DockerImageCode.fromImageAsset("."))
                    .environment(submitVatLambdaEnv)
                    .functionName(submitVatLambdaHandlerFunctionName)
                    .timeout(submitVatLambdaDuration)
                    .build();
        }
        this.submitVatLambdaLogGroup = new LogGroup(this, "SubmitVatLambdaLogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.submitVatLambda.getFunctionName())
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build());
        this.submitVatLambdaUrl = this.submitVatLambda.addFunctionUrl(
                FunctionUrlOptions.builder()
                        .authType(FunctionUrlAuthType.NONE)  // No auth for the auth URL
                        .cors(FunctionUrlCorsOptions.builder()
                                .allowedOrigins(List.of("https://" + this.domainName))
                                .allowedMethods(List.of(HttpMethod.POST))
                                .build())
                        .build()
        );
        if (skipLambdaUrlOrigins) {
            logger.info("Skipping Lambda URL origins for submitVatLambdaUrl as per configuration.");
        } else {
            String submitVatLambdaUrl = this.getLambdaUrlHostToken(this.submitVatLambdaUrl);
            HttpOrigin submitVatApiOrigin = HttpOrigin.Builder.create(submitVatLambdaUrl)
                    .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                    .build();
            final BehaviorOptions submitVatOriginBehaviour = BehaviorOptions.builder()
                    .origin(submitVatApiOrigin)
                    .allowedMethods(AllowedMethods.ALLOW_ALL)
                    .cachePolicy(CachePolicy.CACHING_DISABLED)
                    .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                    .build();
            lambdaUrlToOriginsBehaviourMappings.put("/api/submit-vat*", submitVatOriginBehaviour);
        }

        // Create receipts bucket for storing VAT submission receipts
        this.receiptsBucket = Bucket.Builder.create(this, "ReceiptsBucket")
                .bucketName(receiptsBucketFullName)
                .versioned(false)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(s3RetainBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .autoDeleteObjects(!s3RetainBucket)
                .build();

        // Add CloudTrail for the receipts bucket if enabled
        if (cloudTrailEnabled) {
            this.receiptsBucketLogGroup = LogGroup.Builder.create(this, "ReceiptsBucketLogGroup")
                    .logGroupName("%s%s-receipts-cloud-trail".formatted(cloudTrailLogGroupPrefix, receiptsBucketFullName))
                    .retention(cloudTrailLogGroupRetentionPeriod)
                    .removalPolicy(s3RetainBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                    .build();
            this.receiptsBucketTrail = Trail.Builder.create(this, "ReceiptsBucketTrail")
                    .trailName("%s-receipts-trail".formatted(dashedDomainName))
                    .cloudWatchLogGroup(this.receiptsBucketLogGroup)
                    .sendToCloudWatchLogs(true)
                    .cloudWatchLogsRetention(cloudTrailLogGroupRetentionPeriod)
                    .includeGlobalServiceEvents(false)
                    .isMultiRegionTrail(false)
                    .build();
            // Add S3 event selector to the CloudTrail for receipts bucket
            receiptsBucketTrail.addS3EventSelector(List.of(S3EventSelector.builder()
                    .bucket(this.receiptsBucket)
                    .build()
            ));
        }

        // logReceiptHandler
        if ("test".equals(env)) {
            // For testing, create a simple Function instead of DockerImageFunction to avoid Docker builds
            this.logReceiptLambda = Function.Builder.create(this, "LogReceiptLambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(Runtime.NODEJS_20_X)
                    .functionName(logReceiptLambdaHandlerFunctionName)
                    .timeout(logReceiptLambdaDuration)
                    .build();
        } else {
            if(StringUtils.isNotBlank( optionalTestS3Endpoint) && StringUtils.isNotBlank(optionalTestS3AccessKey) || StringUtils.isNotBlank(optionalTestS3SecretKey)) {
                // For production like integrations without AWS we can use test S3 credentials
                var logReceiptLambdaTestEnv = Map.of(
                        "HANDLER", logReceiptLambdaHandlerCmd,
                        "DIY_SUBMIT_TEST_S3_ENDPOINT", optionalTestS3Endpoint,
                        "DIY_SUBMIT_TEST_S3_ACCESS_KEY", optionalTestS3AccessKey,
                        "DIY_SUBMIT_TEST_S3_SECRET_KEY", optionalTestS3SecretKey,
                        "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", receiptsBucketPostfix
                );
                this.logReceiptLambda = DockerImageFunction.Builder.create(this, "LogReceiptLambda")
                        .code(DockerImageCode.fromImageAsset("."))
                        .environment(logReceiptLambdaTestEnv)
                        .functionName(logReceiptLambdaHandlerFunctionName)
                        .timeout(logReceiptLambdaDuration)
                        .build();
            } else {
                var logReceiptLambdaEnv = Map.of(
                        "HANDLER", logReceiptLambdaHandlerCmd,
                        "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", receiptsBucketPostfix
                );
                this.logReceiptLambda = DockerImageFunction.Builder.create(this, "LogReceiptLambda")
                        .code(DockerImageCode.fromImageAsset("."))
                        .environment(logReceiptLambdaEnv)
                        .functionName(logReceiptLambdaHandlerFunctionName)
                        .timeout(logReceiptLambdaDuration)
                        .build();
            }
        }
        this.receiptsBucket.grantWrite(this.logReceiptLambda);
        this.logReceiptLambdaLogGroup = new LogGroup(this, "LogReceiptLambdaLogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.logReceiptLambda.getFunctionName())
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build());
        this.logReceiptLambdaUrl = this.logReceiptLambda.addFunctionUrl(
                FunctionUrlOptions.builder()
                        .authType(FunctionUrlAuthType.NONE)  // No auth for the auth URL
                        .cors(FunctionUrlCorsOptions.builder()
                                .allowedOrigins(List.of("https://" + this.domainName))
                                .allowedMethods(List.of(HttpMethod.POST))
                                .build())
                        .build()
        );
        if (skipLambdaUrlOrigins) {
            logger.info("Skipping Lambda URL origins for logReceiptLambdaUrl as per configuration.");
        } else {
            String logReceiptLambdaUrl = this.getLambdaUrlHostToken(this.logReceiptLambdaUrl);
            HttpOrigin logReceiptApiOrigin = HttpOrigin.Builder.create(logReceiptLambdaUrl)
                    .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                    .build();
            final BehaviorOptions logReceiptOriginBehaviour = BehaviorOptions.builder()
                    .origin(logReceiptApiOrigin)
                    .allowedMethods(AllowedMethods.ALLOW_ALL)
                    .cachePolicy(CachePolicy.CACHING_DISABLED)
                    .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                    .build();
            lambdaUrlToOriginsBehaviourMappings.put("/api/log-receipt*", logReceiptOriginBehaviour);
        }

        // Create a certificate for the website domain
        if (useExistingCertificate) {
            this.certificate = Certificate.fromCertificateArn(this, "Certificate", certificateArn);
        } else {
            this.certificate = Certificate.Builder
                    .create(this, "Certificate")
                    .domainName(this.domainName)
                    .certificateName(certificateArn)
                    .validation(CertificateValidation.fromDns(this.hostedZone))
                    .transparencyLoggingEnabled(true)
                    .build();
        }

        // Create the CloudFront distribution using the web website bucket as the origin and Origin Access Identity
        this.distribution = Distribution.Builder
                .create(this, "Distribution")
                .domainNames(Collections.singletonList(this.domainName))
                .defaultBehavior(s3BucketOriginBehaviour)
                .additionalBehaviors(lambdaUrlToOriginsBehaviourMappings)
                .defaultRootObject(defaultDocumentAtOrigin)
                .errorResponses(List.of(ErrorResponse.builder()
                        .httpStatus(HttpStatus.SC_NOT_FOUND)
                        .responseHttpStatus(HttpStatus.SC_NOT_FOUND)
                        .responsePagePath("/%s".formatted(error404NotFoundAtDistribution))
                        .build()))
                .certificate(this.certificate)
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .httpVersion(HttpVersion.HTTP2_AND_3)
                .enableLogging(true)
                .logBucket(this.distributionAccessLogBucket)
                .logIncludesCookies(true)
                .build();
        this.distributionUrl = "https://%s/".formatted(this.distribution.getDomainName());
        logger.info("Distribution URL: %s".formatted(distributionUrl));

        // Deploy the web website files to the web website bucket and invalidate distribution
        this.docRootSource = Source.asset(docRootPath, AssetOptions.builder()
                .assetHashType(AssetHashType.SOURCE)
                .build());
        logger.info("Will deploy files from: %s".formatted(docRootPath));
        
        // Create LogGroup for BucketDeployment
        LogGroup bucketDeploymentLogGroup = LogGroup.Builder.create(this, "BucketDeploymentLogGroup")
                .logGroupName("/aws/lambda/bucket-deployment-%s".formatted(dashedDomainName))
                .retention(cloudTrailLogGroupRetentionPeriod)
                .removalPolicy(s3RetainBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .build();
        
        this.deployment = BucketDeployment.Builder.create(this, "DocRootToOriginDeployment")
                .sources(List.of(this.docRootSource))
                .destinationBucket(this.originBucket)
                .distribution(this.distribution)
                .distributionPaths(List.of("/*"))
                .retainOnDelete(false)
                .logGroup(bucketDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(true)
                .build();

        // Create Route53 record for use with CloudFront distribution
        this.aRecord = ARecord.Builder
                .create(this, "ARecord-%s".formatted(dashedDomainName))
                .zone(this.hostedZone)
                .recordName(this.domainName)
                .deleteExisting(true)
                .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                .build();
        this.aaaaRecord = AaaaRecord.Builder
                .create(this, "AaaaRecord-%s".formatted(dashedDomainName))
                .zone(this.hostedZone)
                .recordName(this.domainName)
                .deleteExisting(true)
                .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                .build();
    }

    private String getConfigValue(String customValue, String contextKey) {
        if (customValue == null || customValue.isEmpty()) {
            Object contextValue = null;
            try {
                contextValue = this.getNode().tryGetContext(contextKey);
            }catch (Exception e) {
                // NOP
            }
            if (contextValue != null && !contextValue.toString().isEmpty()) {
                CfnOutput.Builder.create(this, contextKey)
                        .value(contextValue.toString() + " (Source: CDK context.)")
                        .build();
                return contextValue.toString();
            } else {
                if (contextKey.startsWith("optional")) {
                    logger.warn("No customValue or non-empty context key value found for optional context key: {}", contextKey);
                } else {
                    throw new IllegalArgumentException("No customValue or non-empty context key value found for non-optional context key" + contextKey);
                }
            }
        }
        return customValue;
    }

    private String getLambdaUrlHostToken(FunctionUrl functionUrl) {
        String urlHostToken = Fn.select(2, Fn.split("/", functionUrl.getUrl()));
        return urlHostToken;
    }
}
