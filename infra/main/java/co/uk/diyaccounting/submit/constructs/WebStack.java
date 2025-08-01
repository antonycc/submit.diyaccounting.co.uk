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
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.SecretValue;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.CertificateValidation;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.ErrorResponse;
import software.amazon.awscdk.services.cloudfront.HttpVersion;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestCookieBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestHeaderBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOAIProps;
import software.amazon.awscdk.services.cloudtrail.S3EventSelector;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.logs.LogGroup;
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
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.ISource;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolIdentityProviderGoogle;
import software.amazon.awscdk.services.cognito.UserPoolDomain;
import software.amazon.awscdk.services.cognito.OAuthSettings;
import software.amazon.awscdk.services.cognito.OAuthFlows;
import software.amazon.awscdk.services.cognito.OAuthScope;
import software.amazon.awscdk.services.cognito.ProviderAttribute;
import software.amazon.awscdk.services.cognito.AttributeMapping;
import software.amazon.awscdk.services.cognito.StandardAttribute;
import software.amazon.awscdk.services.cognito.StandardAttributes;
import software.amazon.awscdk.services.cognito.StringAttribute;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.lang.reflect.Field;
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
    public LogGroup cloudTrailLogGroup;
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
    public Trail cloudTrailLogBucket;
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
    
    // Cognito resources
    public UserPool userPool;
    public UserPoolClient userPoolClient;
    public UserPoolDomain userPoolDomain;
    public UserPoolIdentityProviderGoogle googleIdentityProvider;
    
    // Bundle management Lambda
    public Function bundleLambda;
    public FunctionUrl bundleLambdaUrl;
    public LogGroup bundleLambdaLogGroup;
    public IBucket receiptsBucket;

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
        public String hmrcClientSecret;
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
        public String authUrlLambdaUrlPath;
        public String authUrlLambdaDuration;
        public String exchangeTokenLambdaHandlerFunctionName;
        public String exchangeTokenLambdaUrlPath;
        public String exchangeTokenLambdaDuration;
        public String submitVatLambdaHandlerFunctionName;
        public String submitVatLambdaUrlPath;
        public String submitVatLambdaDuration;
        public String logReceiptLambdaHandlerFunctionName;
        public String logReceiptLambdaUrlPath;
        public String logReceiptLambdaDuration;
        public String lambdaUrlAuthType;
        public String commitHash;
        
        // Cognito and Bundle Management properties
        public String googleClientId;
        public String googleClientSecret;
        public String cognitoDomainPrefix;
        public String bundleExpiryDate;
        public String bundleUserLimit;
        public String bundleLambdaHandlerFunctionName;
        public String bundleLambdaUrlPath;
        public String bundleLambdaDuration;

        public Builder(Construct scope, String id, StackProps props) {
            this.scope = scope;
            this.id = id;
            this.props = props;
        }

        public void loadContextValuesUsingReflection(Construct scope) {
            Field[] fields = this.getClass().getDeclaredFields();
            for (Field field : fields) {
                if (field.getType() == String.class && 
                    !field.getName().equals("scope") && 
                    !field.getName().equals("id") && 
                    !field.getName().equals("props")) {
                    try {
                        field.setAccessible(true);

                        // Skip if already set
                        if (field.get(this) != null) {
                            continue;
                        }

                        // Set from config
                        String contextValue = getContextValueString(scope, field.getName());
                        if (contextValue != null) {
                            field.set(this, contextValue);
                        }
                    } catch (IllegalAccessException e) {
                        logger.warn("Failed to set field {} using reflection: {}", field.getName(), e.getMessage());
                    }
                }
            }
        }

        public String getContextValueString(Construct scope, String contextKey) {
            return getContextValueString(scope, contextKey, null);
        }

        public String getContextValueString(Construct scope, String contextKey, String defaultValue) {
            var contextValue = scope.getNode().tryGetContext(contextKey);
            String defaultedValue;
            String source;
            if (contextValue != null && StringUtils.isNotBlank(contextValue.toString())) {
                defaultedValue = contextValue.toString();
                source = "CDK context";
            } else {
                defaultedValue = defaultValue;
                source = "default value";
            }
            //try {
                CfnOutput.Builder.create(scope, contextKey)
                        .value(MessageFormat.format("{0} (Source: CDK {1})", defaultedValue, source))
                        .build();
            //}catch (Exception e) {
            //    logger.warn("Failed to create CfnOutput for context key {}: {}", contextKey, e.getMessage());
            //}
            return defaultedValue;
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

        public Builder hmrcClientSecret(String hmrcClientSecret) {
            this.hmrcClientSecret = hmrcClientSecret;
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

        public Builder authUrlLambdaUrlPath(String authUrlLambdaUrlPath) {
            this.authUrlLambdaUrlPath = authUrlLambdaUrlPath;
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

        public Builder exchangeTokenLambdaUrlPath(String exchangeTokenLambdaUrlPath) {
            this.exchangeTokenLambdaUrlPath = exchangeTokenLambdaUrlPath;
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

        public Builder submitVatLambdaUrlPath(String submitVatLambdaUrlPath) {
            this.submitVatLambdaUrlPath = submitVatLambdaUrlPath;
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

        public Builder logReceiptLambdaUrlPath(String logReceiptLambdaUrlPath) {
            this.logReceiptLambdaUrlPath = logReceiptLambdaUrlPath;
            return this;
        }

        public Builder logReceiptLambdaDurationMillis(String logReceiptLambdaDuration) {
            this.logReceiptLambdaDuration = logReceiptLambdaDuration;
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

        public Builder googleClientId(String googleClientId) {
            this.googleClientId = googleClientId;
            return this;
        }

        public Builder googleClientSecret(String googleClientSecret) {
            this.googleClientSecret = googleClientSecret;
            return this;
        }

        public Builder cognitoDomainPrefix(String cognitoDomainPrefix) {
            this.cognitoDomainPrefix = cognitoDomainPrefix;
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

        public Builder bundleLambdaHandlerFunctionName(String bundleLambdaHandlerFunctionName) {
            this.bundleLambdaHandlerFunctionName = bundleLambdaHandlerFunctionName;
            return this;
        }

        public Builder bundleLambdaUrlPath(String bundleLambdaUrlPath) {
            this.bundleLambdaUrlPath = bundleLambdaUrlPath;
            return this;
        }

        public Builder bundleLambdaDurationMillis(String bundleLambdaDuration) {
            this.bundleLambdaDuration = bundleLambdaDuration;
            return this;
        }

        public WebStack build() {
            return new WebStack(this.scope, this.id, this.props, this);
        }

        public static String buildDomainName(String env, String subDomainName, String hostedZoneName) { return env.equals("prod") ? Builder.buildProdDomainName(subDomainName, hostedZoneName) : Builder.buildNonProdDomainName(env, subDomainName, hostedZoneName); }
        public static String buildProdDomainName(String subDomainName, String hostedZoneName) { return "%s.%s".formatted(subDomainName, hostedZoneName); }
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

        // Load values from cdk.json here using reflection, then let the properties be overridden by the mutators
        builder.loadContextValuesUsingReflection(this);

        boolean useExistingHostedZone = Boolean.parseBoolean(builder.useExistingHostedZone);
        if (useExistingHostedZone) {
            String hostedZoneId = builder.hostedZoneId;
            this.hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", HostedZoneAttributes.builder()
                    .zoneName(builder.hostedZoneName)
                    .hostedZoneId(hostedZoneId)
                    .build());
        } else {
            this.hostedZone = HostedZone.Builder
                    .create(this, "HostedZone")
                    .zoneName(builder.hostedZoneName)
                    .build();
        }

        this.domainName = Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String dashedDomainName = Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
        String originBucketName = Builder.buildOriginBucketName(dashedDomainName);

        boolean s3UseExistingBucket = Boolean.parseBoolean(builder.s3UseExistingBucket);
        boolean s3RetainOriginBucket = Boolean.parseBoolean(builder.s3RetainOriginBucket);
        boolean s3RetainReceiptsBucket = Boolean.parseBoolean(builder.s3RetainReceiptsBucket);

        String cloudTrailLogBucketName = Builder.buildCloudTrailLogBucketName(dashedDomainName);
        boolean cloudTrailEnabled = Boolean.parseBoolean(builder.cloudTrailEnabled);
        int cloudTrailLogGroupRetentionPeriodDays = Integer.parseInt(builder.cloudTrailLogGroupRetentionPeriodDays);
        boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);

        boolean useExistingCertificate = Boolean.parseBoolean(builder.useExistingCertificate);

        int accessLogGroupRetentionPeriodDays = Integer.parseInt(builder.accessLogGroupRetentionPeriodDays);
        String originAccessLogBucketName = Builder.buildOriginAccessLogBucketName(dashedDomainName);

        String distributionAccessLogBucketName = Builder.buildDistributionAccessLogBucketName(dashedDomainName);

        boolean skipLambdaUrlOrigins = Boolean.parseBoolean(builder.skipLambdaUrlOrigins);
        
        // Check for environment variable override for verboseLogging
        String verboseLoggingEnv = System.getenv("VERBOSE_LOGGING");
        boolean verboseLogging = verboseLoggingEnv != null ? 
            Boolean.parseBoolean(verboseLoggingEnv) : 
            Boolean.parseBoolean(builder.verboseLogging);
        
        if (verboseLoggingEnv != null) {
            logger.info("Verbose logging setting overridden by environment variable VERBOSE_LOGGING: {}", verboseLogging);
        }

        // Determine Lambda URL authentication type
        FunctionUrlAuthType functionUrlAuthType = "AWS_IAM".equalsIgnoreCase(builder.lambdaUrlAuthType) ? 
            FunctionUrlAuthType.AWS_IAM : FunctionUrlAuthType.NONE;

        // Create a CloudTrail for the stack resources
        RetentionDays cloudTrailLogGroupRetentionPeriod = RetentionDaysConverter.daysToRetentionDays(cloudTrailLogGroupRetentionPeriodDays);
        if (cloudTrailEnabled) {
            this.cloudTrailLogGroup = LogGroup.Builder.create(this, "OriginBucketLogGroup")
                    .logGroupName("%s%s-cloud-trail".formatted(builder.cloudTrailLogGroupPrefix, dashedDomainName))
                    .retention(cloudTrailLogGroupRetentionPeriod)
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .build();
            this.cloudTrailLogBucket = Trail.Builder.create(this, "OriginBucketTrail")
                    .trailName(cloudTrailLogBucketName)
                    .cloudWatchLogGroup(this.cloudTrailLogGroup)
                    .sendToCloudWatchLogs(true)
                    .cloudWatchLogsRetention(cloudTrailLogGroupRetentionPeriod)
                    .includeGlobalServiceEvents(false)
                    .isMultiRegionTrail(false)
                    .build();
        }

        // Origin bucket for the CloudFront distribution
        String receiptsBucketFullName = Builder.buildBucketName(dashedDomainName, builder.receiptsBucketPostfix);
        if (s3UseExistingBucket) {
            this.originBucket = Bucket.fromBucketName(this, "OriginBucket", originBucketName);
        } else {
            // Web bucket as origin for the CloudFront distribution with a bucket for access logs forwarded to CloudWatch
            this.originAccessLogBucket = LogForwardingBucket.Builder
                    .create(this, "OriginAccess", builder.logS3ObjectEventHandlerSource, LogS3ObjectEvent.class)
                    .bucketName(originAccessLogBucketName)
                    .functionNamePrefix("%s-origin-access-".formatted(dashedDomainName))
                    .retentionPeriodDays(accessLogGroupRetentionPeriodDays)
                    .verboseLogging(verboseLogging)
                    .build();
            this.originBucket = Bucket.Builder.create(this, "OriginBucket")
                    .bucketName(originBucketName)
                    .versioned(false)
                    .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                    .encryption(BucketEncryption.S3_MANAGED)
                    .removalPolicy(s3RetainOriginBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                    .autoDeleteObjects(!s3RetainOriginBucket)
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
                .create(this, "S3BucketOriginRequestPolicy")
                .comment("Policy to allow content headers but no cookies from the origin")
                .cookieBehavior(OriginRequestCookieBehavior.none())
                .headerBehavior(OriginRequestHeaderBehavior.allowList("Accept", "Accept-Language", "Origin"))
                .build();
        final BehaviorOptions s3BucketOriginBehaviour = BehaviorOptions.builder()
                .origin(this.origin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                //.originRequestPolicy(s3BucketOriginRequestPolicy)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();
        this.distributionAccessLogBucket = LogForwardingBucket.Builder
                .create(this, "DistributionAccess", builder.logGzippedS3ObjectEventHandlerSource, LogGzippedS3ObjectEvent.class)
                .bucketName(distributionAccessLogBucketName)
                .functionNamePrefix("%s-dist-access-".formatted(dashedDomainName))
                .retentionPeriodDays(accessLogGroupRetentionPeriodDays)
                .verboseLogging(verboseLogging)
                .build();

        // Add cloud trail to the origin bucket if enabled
        // CloudTrail for the origin bucket
        if (cloudTrailEnabled) {
            // Add S3 event selector to the CloudTrail
            if (builder.cloudTrailEventSelectorPrefix == null || builder.cloudTrailEventSelectorPrefix.isBlank() || "none".equals(builder.cloudTrailEventSelectorPrefix)) {
                cloudTrailLogBucket.addS3EventSelector(List.of(S3EventSelector.builder()
                        .bucket(this.originBucket)
                        .build()
                ));
            } else {
                cloudTrailLogBucket.addS3EventSelector(List.of(S3EventSelector.builder()
                        .bucket(this.originBucket)
                        .objectPrefix(builder.cloudTrailEventSelectorPrefix)
                        .build()
                ));
            }
        } else {
            logger.info("CloudTrail is not enabled for the origin bucket.");
        }

        var lambdaUrlToOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

        // authUrl
        var authUrlLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HMRC_CLIENT_ID", builder.hmrcClientId,
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri
        ));
        var authUrlLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "AuthUrlLambda")
                .env(builder.env)
                .imageDirectory("infra/runtimes")
                .imageFilename("authUrl.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.authUrlLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .functionUrlAuthType(functionUrlAuthType)
                .handler(builder.lambdaEntry + builder.authUrlLambdaHandlerFunctionName)
                .environment(authUrlLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.authUrlLambdaDuration)))
                .cloudTrailEnabled(cloudTrailEnabled)
                .xRayEnabled(xRayEnabled)
                .verboseLogging(verboseLogging)
                .build();
        this.authUrlLambda = authUrlLambdaUrlOrigin.lambda;
        this.authUrlLambdaUrl = authUrlLambdaUrlOrigin.functionUrl;
        this.authUrlLambdaLogGroup = authUrlLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(builder.authUrlLambdaUrlPath + "*", authUrlLambdaUrlOrigin.behaviorOptions);

        // exchangeToken
        // Create a secret for the HMRC client secret and set the ARN to be used in the Lambda environment variable
        var hmrcClientSecret = Secret.Builder.create(this, "HmrcClientSecret")
                .secretStringValue(SecretValue.unsafePlainText(builder.hmrcClientSecret))
                .description("HMRC Client Secret for OAuth authentication")
                .build();
        var hmrcClientSecretArn = hmrcClientSecret.getSecretArn();
        var exchangeTokenLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HMRC_CLIENT_ID", builder.hmrcClientId,
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri,
                "DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", hmrcClientSecretArn
        ));
        if (StringUtils.isNotBlank(builder.optionalTestAccessToken)){
            exchangeTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
        }
        var exchangeTokenLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "ExchangeTokenLambda")
                .env(builder.env)
                .imageDirectory("infra/runtimes")
                .imageFilename("exchangeToken.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.exchangeTokenLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .functionUrlAuthType(functionUrlAuthType)
                .handler(builder.lambdaEntry + builder.exchangeTokenLambdaHandlerFunctionName)
                .environment(exchangeTokenLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.exchangeTokenLambdaDuration)))
                .cloudTrailEnabled(cloudTrailEnabled)
                .xRayEnabled(xRayEnabled)
                .verboseLogging(verboseLogging)
                .build();
        this.exchangeTokenLambda = exchangeTokenLambdaUrlOrigin.lambda;
        this.exchangeTokenLambdaUrl = exchangeTokenLambdaUrlOrigin.functionUrl;
        this.exchangeTokenLambdaLogGroup = exchangeTokenLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(builder.exchangeTokenLambdaUrlPath + "*", exchangeTokenLambdaUrlOrigin.behaviorOptions);
        hmrcClientSecret.grantRead(this.exchangeTokenLambda);

        // submitVat
        var submitVatLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri
        ));
        var submitVatLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "SubmitVatLambda")
                .env(builder.env)
                .imageDirectory("infra/runtimes")
                .imageFilename("submitVat.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.submitVatLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .functionUrlAuthType(functionUrlAuthType)
                .handler(builder.lambdaEntry + builder.submitVatLambdaHandlerFunctionName)
                .environment(submitVatLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.submitVatLambdaDuration)))
                .cloudTrailEnabled(cloudTrailEnabled)
                .xRayEnabled(xRayEnabled)
                .verboseLogging(verboseLogging)
                .build();
        this.submitVatLambda = submitVatLambdaUrlOrigin.lambda;
        this.submitVatLambdaUrl = submitVatLambdaUrlOrigin.functionUrl;
        this.submitVatLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(builder.submitVatLambdaUrlPath + "*", submitVatLambdaUrlOrigin.behaviorOptions);

        var logReceiptLambdaEnv = new HashMap<>(Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", builder.receiptsBucketPostfix
        ));
        if(StringUtils.isNotBlank(builder.optionalTestS3Endpoint) && StringUtils.isNotBlank(builder.optionalTestS3AccessKey) || StringUtils.isNotBlank(builder.optionalTestS3SecretKey)) {
            // For production like integrations without AWS we can use test S3 credentials
            var logReceiptLambdaTestEnv = new HashMap<>(Map.of(
                    "DIY_SUBMIT_TEST_S3_ENDPOINT", builder.optionalTestS3Endpoint,
                    "DIY_SUBMIT_TEST_S3_ACCESS_KEY", builder.optionalTestS3AccessKey,
                    "DIY_SUBMIT_TEST_S3_SECRET_KEY", builder.optionalTestS3SecretKey
            ));
            logReceiptLambdaEnv.putAll(logReceiptLambdaTestEnv);
        }
        var logReceiptLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "LogReceiptLambda")
                .env(builder.env)
                .imageDirectory("infra/runtimes")
                .imageFilename("logReceipt.Dockerfile")
                .functionName(Builder.buildFunctionName(dashedDomainName, builder.logReceiptLambdaHandlerFunctionName))
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .functionUrlAuthType(functionUrlAuthType)
                .handler(builder.lambdaEntry + builder.logReceiptLambdaHandlerFunctionName)
                .environment(logReceiptLambdaEnv)
                .timeout(Duration.millis(Long.parseLong(builder.logReceiptLambdaDuration)))
                .cloudTrailEnabled(cloudTrailEnabled)
                .xRayEnabled(xRayEnabled)
                .verboseLogging(verboseLogging)
                .build();
        this.logReceiptLambda = logReceiptLambdaUrlOrigin.lambda;
        this.logReceiptLambdaUrl = logReceiptLambdaUrlOrigin.functionUrl;
        this.logReceiptLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
        lambdaUrlToOriginsBehaviourMappings.put(builder.logReceiptLambdaUrlPath + "*", logReceiptLambdaUrlOrigin.behaviorOptions);

        // Create Cognito User Pool for authentication
        if (StringUtils.isNotBlank(builder.googleClientId) && StringUtils.isNotBlank(builder.googleClientSecret)) {
            // Create User Pool with custom attributes for bundles
            this.userPool = UserPool.Builder.create(this, "UserPool")
                    .userPoolName(dashedDomainName + "-user-pool")
                    .selfSignUpEnabled(true)
                    .signInAliases(software.amazon.awscdk.services.cognito.SignInAliases.builder()
                            .email(true)
                            .build())
                    .standardAttributes(StandardAttributes.builder()
                            .email(StandardAttribute.builder()
                                    .required(true)
                                    .mutable(true)
                                    .build())
                            .givenName(StandardAttribute.builder()
                                    .required(false)
                                    .mutable(true)
                                    .build())
                            .familyName(StandardAttribute.builder()
                                    .required(false)
                                    .mutable(true)
                                    .build())
                            .build())
                    .customAttributes(Map.of(
                            "bundles", StringAttribute.Builder.create()
                                    .maxLen(2048)
                                    .mutable(true)
                                    .build()
                    ))
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .build();

            // Create User Pool Domain
            this.userPoolDomain = UserPoolDomain.Builder.create(this, "UserPoolDomain")
                    .userPool(this.userPool)
                    .cognitoDomain(software.amazon.awscdk.services.cognito.CognitoDomainOptions.builder()
                            .domainPrefix(builder.cognitoDomainPrefix != null ? builder.cognitoDomainPrefix : dashedDomainName + "-auth")
                            .build())
                    .build();

            // Create Google Identity Provider
            var googleClientSecret = Secret.Builder.create(this, "GoogleClientSecret")
                    .secretStringValue(SecretValue.unsafePlainText(builder.googleClientSecret))
                    .description("Google OAuth Client Secret for Cognito")
                    .build();

            this.googleIdentityProvider = UserPoolIdentityProviderGoogle.Builder.create(this, "GoogleIdentityProvider")
                    .userPool(this.userPool)
                    .clientId(builder.googleClientId)
                    .clientSecretValue(googleClientSecret.getSecretValue())
                    .scopes(List.of("email", "openid", "profile"))
                    .attributeMapping(AttributeMapping.builder()
                            .email(ProviderAttribute.GOOGLE_EMAIL)
                            .givenName(ProviderAttribute.GOOGLE_GIVEN_NAME)
                            .familyName(ProviderAttribute.GOOGLE_FAMILY_NAME)
                            .build())
                    .build();

            // Create User Pool Client
            this.userPoolClient = UserPoolClient.Builder.create(this, "UserPoolClient")
                    .userPool(this.userPool)
                    .userPoolClientName(dashedDomainName + "-client")
                    .generateSecret(false)
                    .oAuth(OAuthSettings.builder()
                            .flows(OAuthFlows.builder()
                                    .authorizationCodeGrant(true)
                                    .build())
                            .scopes(List.of(OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE))
                            .callbackUrls(List.of(
                                    "https://" + this.domainName + "/",
                                    "https://" + this.domainName + "/login.html",
                                    "https://" + this.domainName + "/bundles.html"
                            ))
                            .logoutUrls(List.of(
                                    "https://" + this.domainName + "/"
                            ))
                            .build())
                    .supportedIdentityProviders(List.of(
                            software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider.GOOGLE
                    ))
                    .build();

            // Make sure the client depends on the identity provider
            this.userPoolClient.getNode().addDependency(this.googleIdentityProvider);
        }

        // Create Bundle Management Lambda
        if (StringUtils.isNotBlank(builder.bundleLambdaHandlerFunctionName)) {
            var bundleLambdaEnv = new HashMap<>(Map.of(
                    "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                    "DIY_SUBMIT_BUNDLE_EXPIRY_DATE", builder.bundleExpiryDate != null ? builder.bundleExpiryDate : "2025-12-31",
                    "DIY_SUBMIT_BUNDLE_USER_LIMIT", builder.bundleUserLimit != null ? builder.bundleUserLimit : "1000"
            ));
            
            if (this.userPool != null) {
                bundleLambdaEnv.put("DIY_SUBMIT_USER_POOL_ID", this.userPool.getUserPoolId());
            }

            var bundleLambdaUrlOrigin = LambdaUrlOrigin.Builder.create(this, "BundleLambda")
                    .env(builder.env)
                    .imageDirectory("infra/runtimes")
                    .imageFilename("bundle.Dockerfile")
                    .functionName(Builder.buildFunctionName(dashedDomainName, builder.bundleLambdaHandlerFunctionName))
                    .allowedMethods(AllowedMethods.ALLOW_ALL)
                    .functionUrlAuthType(functionUrlAuthType)
                    .handler(builder.lambdaEntry + builder.bundleLambdaHandlerFunctionName)
                    .environment(bundleLambdaEnv)
                    .timeout(Duration.millis(Long.parseLong(builder.bundleLambdaDuration != null ? builder.bundleLambdaDuration : "30000")))
                    .cloudTrailEnabled(cloudTrailEnabled)
                    .xRayEnabled(xRayEnabled)
                    .verboseLogging(verboseLogging)
                    .build();
            this.bundleLambda = bundleLambdaUrlOrigin.lambda;
            this.bundleLambdaUrl = bundleLambdaUrlOrigin.functionUrl;
            this.bundleLambdaLogGroup = bundleLambdaUrlOrigin.logGroup;
            lambdaUrlToOriginsBehaviourMappings.put(builder.bundleLambdaUrlPath + "*", bundleLambdaUrlOrigin.behaviorOptions);

            // Grant Cognito permissions to the bundle Lambda
            if (this.userPool != null) {
                this.bundleLambda.addToRolePolicy(PolicyStatement.Builder.create()
                        .effect(Effect.ALLOW)
                        .actions(List.of(
                                "cognito-idp:AdminGetUser",
                                "cognito-idp:AdminUpdateUserAttributes",
                                "cognito-idp:ListUsers"
                        ))
                        .resources(List.of(this.userPool.getUserPoolArn()))
                        .build());
            }
        }

        /*String exchangeTokenLambdaHandlerLambdaFunctionName = Builder.buildFunctionName(dashedDomainName, builder.exchangeTokenLambdaHandlerFunctionName);
        String exchangeTokenLambdaHandlerCmd = builder.lambdaEntry + builder.exchangeTokenLambdaHandlerFunctionName;
        Duration exchangeTokenLambdaDuration = Duration.millis(Long.parseLong(builder.exchangeTokenLambdaDuration));
        if ("test".equals(builder.env)) {
            // For testing, create a simple Function instead of DockerImageFunction to avoid Docker builds
            this.exchangeTokenLambda = Function.Builder.create(this, "ExchangeTokenLambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(Runtime.NODEJS_22_X)
                    .functionName(exchangeTokenLambdaHandlerLambdaFunctionName)
                    .timeout(exchangeTokenLambdaDuration)
                    .build();
        } else {
            var exchangeTokenLambdaEnv = new HashMap<>(Map.of(
                    "DIY_SUBMIT_HMRC_CLIENT_ID", builder.hmrcClientId,
                    "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                    "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri
            ));
            if (StringUtils.isNotBlank(builder.optionalTestAccessToken)){
                exchangeTokenLambdaEnv.put("DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
            }
            if (xRayEnabled) {
                exchangeTokenLambdaEnv.put("AWS_XRAY_TRACING_NAME", exchangeTokenLambdaHandlerLambdaFunctionName);
            }
            var exchangeTokenLambdaAssetImageCodeProps = AssetImageCodeProps.builder()
                    .cmd(List.of(exchangeTokenLambdaHandlerCmd))
                    .build();
            var exchangeTokenLambdaBuilder = DockerImageFunction.Builder.create(this, "ExchangeTokenLambda")
                    .code(DockerImageCode.fromImageAsset(".", exchangeTokenLambdaAssetImageCodeProps))
                    .environment(exchangeTokenLambdaEnv)
                    .functionName(exchangeTokenLambdaHandlerLambdaFunctionName)
                    .timeout(exchangeTokenLambdaDuration);
            if (xRayEnabled) {
                exchangeTokenLambdaBuilder.tracing(Tracing.ACTIVE);
            }
            this.exchangeTokenLambda = exchangeTokenLambdaBuilder.build();
        }
        this.exchangeTokenLambdaLogGroup = new LogGroup(this, "ExchangeTokenLambdaLogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.exchangeTokenLambda.getFunctionName())
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build());
        this.exchangeTokenLambdaUrl = this.exchangeTokenLambda.addFunctionUrl(
                FunctionUrlOptions.builder()
                        .authType(functionUrlAuthType)  // Conditional authentication based on configuration
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
                    .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
                    .build();
            lambdaUrlToOriginsBehaviourMappings.put("/api/exchange-token*", exchangeTokenOriginBehaviour);
        }*/

        // httpPost
        /*
        String submitVatLambdaHandlerLambdaFunctionName = Builder.buildFunctionName(dashedDomainName, builder.submitVatLambdaHandlerFunctionName);
        String submitVatLambdaHandlerCmd = builder.lambdaEntry + builder.submitVatLambdaHandlerFunctionName;
        Duration submitVatLambdaDuration = Duration.millis(Long.parseLong(builder.submitVatLambdaDuration));
        if ("test".equals(builder.env)) {
            // For testing, create a simple Function instead of DockerImageFunction to avoid Docker builds
            this.submitVatLambda = Function.Builder.create(this, "SubmitVatLambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(Runtime.NODEJS_22_X)
                    .functionName(submitVatLambdaHandlerLambdaFunctionName)
                    .timeout(submitVatLambdaDuration)
                    .build();
        } else {
            var submitVatLambdaEnv = new HashMap<>(Map.of(
                    "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                    "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri
            ));
            if (xRayEnabled) {
                submitVatLambdaEnv.put("AWS_XRAY_TRACING_NAME", submitVatLambdaHandlerLambdaFunctionName);
            }
            var submitVatLambdaAssetImageCodeProps = AssetImageCodeProps.builder()
                    .cmd(List.of(submitVatLambdaHandlerCmd))
                    .build();
            var submitVatLambdaBuilder = DockerImageFunction.Builder.create(this, "SubmitVatLambda")
                    .code(DockerImageCode.fromImageAsset(".", submitVatLambdaAssetImageCodeProps))
                    .environment(submitVatLambdaEnv)
                    .functionName(submitVatLambdaHandlerLambdaFunctionName)
                    .timeout(submitVatLambdaDuration);
            if (xRayEnabled) {
                submitVatLambdaBuilder.tracing(Tracing.ACTIVE);
            }
            this.submitVatLambda = submitVatLambdaBuilder.build();
        }
        this.submitVatLambdaLogGroup = new LogGroup(this, "SubmitVatLambdaLogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.submitVatLambda.getFunctionName())
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build());
        this.submitVatLambdaUrl = this.submitVatLambda.addFunctionUrl(
                FunctionUrlOptions.builder()
                        .authType(functionUrlAuthType)  // Conditional authentication based on configuration
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
                    .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
                    .build();
            lambdaUrlToOriginsBehaviourMappings.put("/api/submit-vat*", submitVatOriginBehaviour);
        }
        */

        // Create receipts bucket for storing VAT submission receipts
        // TODO: Add a switch not to write the file contents.
        this.receiptsBucket = LogForwardingBucket.Builder
                .create(this, "ReceiptsBucket", builder.logS3ObjectEventHandlerSource, LogS3ObjectEvent.class)
                .bucketName(receiptsBucketFullName)
                .versioned(true)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .objectOwnership(ObjectOwnership.OBJECT_WRITER)
                .autoDeleteObjects(!s3RetainReceiptsBucket)
                .functionNamePrefix("%s-receipts-bucket-".formatted(dashedDomainName))
                .retentionPeriodDays(accessLogGroupRetentionPeriodDays)
                .verboseLogging(verboseLogging)
                .removalPolicy(s3RetainReceiptsBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .build();
        this.receiptsBucket.grantWrite(this.logReceiptLambda);

        // Add S3 event selector to the CloudTrail for receipts bucket
        // TODO Move to the LogForwardingBucket
        if (cloudTrailEnabled) {
            if (builder.cloudTrailEventSelectorPrefix == null || builder.cloudTrailEventSelectorPrefix.isBlank() || "none".equals(builder.cloudTrailEventSelectorPrefix)) {
                cloudTrailLogBucket.addS3EventSelector(List.of(S3EventSelector.builder()
                        .bucket(this.receiptsBucket)
                        .build()
                ));
            } else {
                cloudTrailLogBucket.addS3EventSelector(List.of(S3EventSelector.builder()
                        .bucket(this.receiptsBucket)
                        .objectPrefix(builder.cloudTrailEventSelectorPrefix)
                        .build()
                ));
            }
        } else {
            logger.info("CloudTrail is not enabled for the bucket.");
        }

        // httpPost
        /*
        String logReceiptLambdaHandlerLambdaFunctionName = Builder.buildFunctionName(dashedDomainName, builder.logReceiptLambdaHandlerFunctionName);
        String logReceiptLambdaHandlerCmd = builder.lambdaEntry + builder.logReceiptLambdaHandlerFunctionName;
        Duration logReceiptLambdaDuration = Duration.millis(Long.parseLong(builder.logReceiptLambdaDuration));
        if ("test".equals(builder.env)) {
            // For testing, create a simple Function instead of DockerImageFunction to avoid Docker builds
            this.logReceiptLambda = Function.Builder.create(this, "LogReceiptLambda")
                    .code(Code.fromInline("exports.handler = async (event) => { return { statusCode: 200, body: 'test' }; }"))
                    .handler("index.handler")
                    .runtime(Runtime.NODEJS_22_X)
                    .functionName(logReceiptLambdaHandlerLambdaFunctionName)
                    .timeout(logReceiptLambdaDuration)
                    .build();
        } else {
            var logReceiptLambdaAssetImageCodeProps = AssetImageCodeProps.builder()
                    .cmd(List.of(logReceiptLambdaHandlerCmd))
                    .build();
            if(StringUtils.isNotBlank(builder.optionalTestS3Endpoint) && StringUtils.isNotBlank(builder.optionalTestS3AccessKey) || StringUtils.isNotBlank(builder.optionalTestS3SecretKey)) {
                // For production like integrations without AWS we can use test S3 credentials
                var logReceiptLambdaTestEnv = new HashMap<>(Map.of(
                        "HANDLER", logReceiptLambdaHandlerCmd,
                        "DIY_SUBMIT_TEST_S3_ENDPOINT", builder.optionalTestS3Endpoint,
                        "DIY_SUBMIT_TEST_S3_ACCESS_KEY", builder.optionalTestS3AccessKey,
                        "DIY_SUBMIT_TEST_S3_SECRET_KEY", builder.optionalTestS3SecretKey,
                        "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", builder.receiptsBucketPostfix
                ));
                if (xRayEnabled) {
                    logReceiptLambdaTestEnv.put("AWS_XRAY_TRACING_NAME", logReceiptLambdaHandlerLambdaFunctionName);
                }
                var logReceiptLambdaTestBuilder = DockerImageFunction.Builder.create(this, "LogReceiptLambda")
                        .code(DockerImageCode.fromImageAsset(".", logReceiptLambdaAssetImageCodeProps))
                        .environment(logReceiptLambdaTestEnv)
                        .functionName(logReceiptLambdaHandlerLambdaFunctionName)
                        .timeout(logReceiptLambdaDuration);
                if (xRayEnabled) {
                    logReceiptLambdaTestBuilder.tracing(Tracing.ACTIVE);
                }
                this.logReceiptLambda = logReceiptLambdaTestBuilder.build();
            } else {
                var logReceiptLambdaEnv = new HashMap<>(Map.of(
                        "HANDLER", logReceiptLambdaHandlerCmd,
                        "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", builder.receiptsBucketPostfix
                ));
                if (xRayEnabled) {
                    logReceiptLambdaEnv.put("AWS_XRAY_TRACING_NAME", logReceiptLambdaHandlerLambdaFunctionName);
                }
                var logReceiptLambdaBuilder = DockerImageFunction.Builder.create(this, "LogReceiptLambda")
                        .code(DockerImageCode.fromImageAsset(".", logReceiptLambdaAssetImageCodeProps))
                        .environment(logReceiptLambdaEnv)
                        .functionName(logReceiptLambdaHandlerLambdaFunctionName)
                        .timeout(logReceiptLambdaDuration);
                if (xRayEnabled) {
                    logReceiptLambdaBuilder.tracing(Tracing.ACTIVE);
                }
                this.logReceiptLambda = logReceiptLambdaBuilder.build();
            }
        }
        this.logReceiptLambdaLogGroup = new LogGroup(this, "LogReceiptLambdaLogGroup", LogGroupProps.builder()
                .logGroupName("/aws/lambda/" + this.logReceiptLambda.getFunctionName())
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build());
        this.logReceiptLambdaUrl = this.logReceiptLambda.addFunctionUrl(
                FunctionUrlOptions.builder()
                        .authType(functionUrlAuthType)  // Conditional authentication based on configuration
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
                    .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
                    .build();
            lambdaUrlToOriginsBehaviourMappings.put("/api/log-receipt*", logReceiptOriginBehaviour);
        }
         */

        // Create a certificate for the website domain
        if (useExistingCertificate) {
            this.certificate = Certificate.fromCertificateArn(this, "Certificate", builder.certificateArn);
        } else {
            this.certificate = Certificate.Builder
                    .create(this, "Certificate")
                    .domainName(this.domainName)
                    .certificateName(builder.certificateArn)
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
                .defaultRootObject(builder.defaultDocumentAtOrigin)
                .errorResponses(List.of(ErrorResponse.builder()
                        .httpStatus(HttpStatus.SC_NOT_FOUND)
                        .responseHttpStatus(HttpStatus.SC_NOT_FOUND)
                        .responsePagePath("/%s".formatted(builder.error404NotFoundAtDistribution))
                        .build()))
                .certificate(this.certificate)
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .httpVersion(HttpVersion.HTTP2_AND_3)
                .enableLogging(true)
                .logBucket(this.distributionAccessLogBucket)
                .logIncludesCookies(verboseLogging)
                .build();

        Permission invokeFunctionUrlPermission = Permission.builder()
                .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                .action("lambda:InvokeFunctionUrl")
                .functionUrlAuthType(functionUrlAuthType)
                .sourceArn(this.distribution.getDistributionArn()) // restrict to your distribution
                .build();
        authUrlLambda.addPermission("AuthLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        exchangeTokenLambda.addPermission("ExchangeTokenLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        submitVatLambda.addPermission("SubmitVatLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        logReceiptLambda.addPermission("LogReceiptLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);

        this.distributionUrl = "https://%s/".formatted(this.distribution.getDomainName());
        logger.info("Distribution URL: %s".formatted(distributionUrl));

        // Generate source.txt file with commit hash if provided
        if (builder.commitHash != null && !builder.commitHash.isBlank()) {
            try {
                java.nio.file.Path sourceFilePath = java.nio.file.Paths.get(builder.docRootPath, "source.txt");
                java.nio.file.Files.writeString(sourceFilePath, builder.commitHash.trim());
                logger.info("Created source.txt file with commit hash: %s".formatted(builder.commitHash));
            } catch (Exception e) {
                logger.warn("Failed to create source.txt file: %s".formatted(e.getMessage()));
            }
        } else {
            logger.info("No commit hash provided, skipping source.txt generation");
        }

        // Deploy the web website files to the web website bucket and invalidate distribution
        this.docRootSource = Source.asset(builder.docRootPath, AssetOptions.builder()
                .assetHashType(AssetHashType.SOURCE)
                .build());
        logger.info("Will deploy files from: %s".formatted(builder.docRootPath));
        
        // Create LogGroup for BucketDeployment
        LogGroup bucketDeploymentLogGroup = LogGroup.Builder.create(this, "BucketDeploymentLogGroup")
                .logGroupName("/aws/lambda/bucket-deployment-%s".formatted(dashedDomainName))
                .retention(cloudTrailLogGroupRetentionPeriod)
                .removalPolicy(s3RetainOriginBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
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
}
