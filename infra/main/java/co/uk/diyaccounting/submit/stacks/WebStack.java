package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOAIProps;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.ISource;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.constructs.Construct;

import java.util.AbstractMap;
import java.util.List;
import java.util.regex.Pattern;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class WebStack extends Stack {

    private static final Logger logger = LogManager.getLogger(WebStack.class);

    public String resourceNamePrefix;
    public String compressedResourceNamePrefix;
    public String baseUrl;
    public String domainName;
    public Bucket originBucket;
    public IBucket originAccessLogBucket;
    public BehaviorOptions behaviorOptions;
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
    public String cognitoBaseUri;

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

        public Builder props(WebStackProps p) {
            if (p == null) return this;
            this.env = p.env;
            this.hostedZoneName = p.hostedZoneName;
            this.hostedZoneId = p.hostedZoneId;
            this.subDomainName = p.subDomainName;
            this.cloudTrailEnabled = p.cloudTrailEnabled;
            this.xRayEnabled = p.xRayEnabled;
            this.verboseLogging = p.verboseLogging;
            this.accessLogGroupRetentionPeriodDays = p.accessLogGroupRetentionPeriodDays;
            this.s3UseExistingBucket = p.s3UseExistingBucket;
            this.s3RetainOriginBucket = p.s3RetainOriginBucket;
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

        public static String buildFunctionName(String dashedDomainName, String functionName) {
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
        this.resourceNamePrefix = resourceNamePrefix;
        this.compressedResourceNamePrefix = compressedResourceNamePrefix;

        boolean s3UseExistingBucket = Boolean.parseBoolean(builder.s3UseExistingBucket);
        boolean s3RetainOriginBucket = Boolean.parseBoolean(builder.s3RetainOriginBucket);
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
        boolean verboseLogging = builder.verboseLogging == null || Boolean.parseBoolean(builder.verboseLogging);

        // Origin bucket for the CloudFront distribution
        //BucketOrigin bucketOrigin;
        //if (s3UseExistingBucket) {
        //    bucketOrigin = BucketOrigin.Builder.create(this, "Origin")
        //            .bucketName(originBucketName)
        //            .useExistingBucket(true)
        //            .build();
        //} else {
            //bucketOrigin = BucketOrigin.Builder.create(this, "Origin")
                    //.bucketName(originBucketName)
                    //.originAccessLogBucketName(originAccessLogBucketName)
                    //.functionNamePrefix("%s-origin-access-".formatted(dashedDomainName))
                    //.accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                    //.retainBucket(s3RetainOriginBucket)
                    //.verboseLogging(verboseLogging)
                    //.useExistingBucket(false)
                    //.build();
        //}

        var idPrefix = "%s-origin-access-".formatted(dashedDomainName);
        logger.info("Setting expiration period to %d days for %s".formatted(accessLogGroupRetentionPeriodDays, idPrefix));
        this.originAccessLogBucket = Bucket.Builder.create(scope, "%sLogBucket".formatted(idPrefix))
            .bucketName(originAccessLogBucketName)
            .objectOwnership(ObjectOwnership.OBJECT_WRITER)
            .versioned(false)
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .encryption(BucketEncryption.S3_MANAGED)
            .removalPolicy(RemovalPolicy.DESTROY)
            .autoDeleteObjects(true)
            .lifecycleRules(List.of(LifecycleRule.builder()
                .id("%sLogsLifecycleRule".formatted(idPrefix))
                .enabled(true)
                .expiration(Duration.days(accessLogGroupRetentionPeriodDays))
                .build())
            )
            .build();
        logger.info("Created log bucket %s".formatted(this.originAccessLogBucket));

        // Create the origin bucket
        this.originBucket = Bucket.Builder.create(builder.scope, "OriginBucket")
            .bucketName(originBucketName)
            .versioned(false)
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .encryption(BucketEncryption.S3_MANAGED)
            .removalPolicy(RemovalPolicy.DESTROY)
            .autoDeleteObjects(true)
            .serverAccessLogsBucket(this.originAccessLogBucket)
            .build();
        //}

        // Create origin access identity
        this.originIdentity = OriginAccessIdentity.Builder.create(builder.scope, "OriginAccessIdentity")
            .comment("Identity created for access to the web website bucket via the CloudFront" + " distribution")
            .build();

        // Grant read access to the origin identity
        originBucket.grantRead(this.originIdentity);

        // Create the S3 bucket origin
        this.origin = S3BucketOrigin.withOriginAccessIdentity(
            this.originBucket,
            S3BucketOriginWithOAIProps.builder()
                .originAccessIdentity(this.originIdentity)
                .build());

        logger.info("Created BucketOrigin with bucket: {}", this.originBucket.getBucketName());

        this.behaviorOptions = BehaviorOptions.builder()
                .origin(this.origin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();

        /*
        IUserPool userPool = UserPool.fromUserPoolArn(this, "UserPool", builder.userPoolArn);

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
*/
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
        //this.aRecord = ARecord.Builder.create(this, "ARecord-%s".formatted(dashedDomainName))
        //        .zone(this.hostedZone)
        //        .recordName(this.domainName)
        //        .deleteExisting(true)
        //        .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
        //        .build();
        //this.aaaaRecord = AaaaRecord.Builder.create(this, "AaaaRecord-%s".formatted(dashedDomainName))
        //        .zone(this.hostedZone)
        //        .recordName(this.domainName)
        //        .deleteExisting(true)
        //        .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
        //        .build();

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
        /*
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
        */
        //if (this.hmrcClientSecretsManagerSecret != null) {
        //    CfnOutput.Builder.create(this, "HmrcClientSecretsManagerSecretArn")
        //            .value(this.hmrcClientSecretsManagerSecret.getSecretArn())
        //            .build();
        //}
        //if (this.cognitoBaseUri != null) {
        //    CfnOutput.Builder.create(this, "CognitoBaseUri")
        //            .value(this.cognitoBaseUri)
        //            .build();
        //    CfnOutput.Builder.create(this, "CognitoGoogleIdpRedirectUri")
        //            .value(this.cognitoBaseUri + "/oauth2/idpresponse")
        //            .build();
        //}
        //if (this.aRecord != null) {
        //    CfnOutput.Builder.create(this, "ARecord")
        //            .value(this.aRecord.getDomainName())
        //            .build();
        //}
        //if (this.aaaaRecord != null) {
        //    CfnOutput.Builder.create(this, "AaaaRecord")
        //            .value(this.aaaaRecord.getDomainName())
        //            .build();
        //}
    }
}
