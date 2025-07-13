package co.uk.diyaccounting.submit;

import org.apache.hc.core5.http.HttpStatus;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.RemovalPolicy;
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
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestCookieBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestHeaderBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3Origin;
import software.amazon.awscdk.services.cloudtrail.S3EventSelector;
import software.amazon.awscdk.services.cloudtrail.Trail;
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
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.ISource;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

import java.util.AbstractMap;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

public class WebStack extends Stack {

    private static final Logger logger = LogManager.getLogger(WebStack.class);

    public String domainName;
    public IBucket originBucket;
    public LogGroup originBucketLogGroup;
    public IBucket originAccessLogBucket;
    public S3Origin origin;
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

        public Builder(Construct scope, String id, StackProps props) {
            this.scope = scope;
            this.id = id;
            this.props = props;
        }

        public static Builder create(Construct scope, String id) {
            Builder builder = new Builder(scope, id, null);
            return builder;
        }

        public static Builder create(Construct scope, String id, StackProps props) {
            Builder builder = new Builder(scope, id, props);
            return builder;
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

        public WebStack build() {
            WebStack stack = new WebStack(this.scope, this.id, this.props, this);
            return stack;
        }

        public static String buildDomainName(String env, String subDomainName, String hostedZoneName) { return env.equals("prod") ? hostedZoneName : Builder.buildNonProdDomainName(env, subDomainName, hostedZoneName); }
        public static String buildNonProdDomainName(String env, String subDomainName, String hostedZoneName) { return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName); }
        public static String buildDashedDomainName(String env, String subDomainName, String hostedZoneName) { return ResourceNameUtils.convertDashSeparatedToDotSeparated("%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings); }
        public static String buildOriginBucketName(String dashedDomainName){ return dashedDomainName; }
        public static String buildCloudTrailLogBucketName(String dashedDomainName) { return "%s-cloud-trail".formatted(dashedDomainName); }
        public static String buildOriginAccessLogBucketName(String dashedDomainName) { return "%s-origin-access-logs".formatted(dashedDomainName); }
        public static String buildDistributionAccessLogBucketName(String dashedDomainName) { return "%s-distribution-access-logs".formatted(dashedDomainName);}

    }

    // TODO: Move to cdk.json
    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of(
            new AbstractMap.SimpleEntry<>(Pattern.compile("xn--intenton-z2a"), "intention")
    );

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
                originBucketTrail.addS3EventSelector(Arrays.asList(S3EventSelector.builder()
                        .bucket(this.originBucket)
                        .build()
                ));
            } else {
                originBucketTrail.addS3EventSelector(Arrays.asList(S3EventSelector.builder()
                        .bucket(this.originBucket)
                        .objectPrefix(cloudTrailEventSelectorPrefix)
                        .build()
                ));
            }
        } else {
            logger.info("CloudTrail is not enabled for the origin bucket.");
        }

        // Grant the read access to an origin identity
        this.originIdentity = OriginAccessIdentity.Builder
                .create(this, "OriginAccessIdentity")
                .comment("Identity created for access to the web website bucket via the CloudFront distribution")
                .build();
        originBucket.grantRead(this.originIdentity); // This adds "s3:List*" so that 404s are handled.
        this.origin = S3Origin.Builder.create(this.originBucket)
                .originAccessIdentity(this.originIdentity)
                .build();

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
        this.distributionAccessLogBucket = LogForwardingBucket.Builder
                .create(this, "DistributionAccess", logGzippedS3ObjectEventHandlerSource, LogGzippedS3ObjectEvent.class)
                .bucketName(distributionAccessLogBucketName)
                .functionNamePrefix("%s-distribution-access-".formatted(dashedDomainName))
                .retentionPeriodDays(accessLogGroupRetentionPeriodDays)
                .build();
        final OriginRequestPolicy originRequestPolicy = OriginRequestPolicy.Builder
                .create(this, "OriginRequestPolicy")
                .comment("Policy to allow content headers but no cookies from the origin")
                .cookieBehavior(OriginRequestCookieBehavior.none())
                .headerBehavior(OriginRequestHeaderBehavior.allowList("Accept", "Accept-Language", "Origin"))
                .build();
        final BehaviorOptions defaultBehaviour = BehaviorOptions.builder()
                .origin(this.origin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(originRequestPolicy)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();
        this.distribution = Distribution.Builder
                .create(this, "Distribution")
                .domainNames(Collections.singletonList(this.domainName))
                .defaultBehavior(defaultBehaviour)
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
        this.deployment = BucketDeployment.Builder.create(this, "DocRootToOriginDeployment")
                .sources(List.of(this.docRootSource))
                .destinationBucket(this.originBucket)
                .distribution(this.distribution)
                .distributionPaths(List.of("/*"))
                .retainOnDelete(false)
                .logRetention(cloudTrailLogGroupRetentionPeriod)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(true)
                .build();

        // Create Route53 record for use with CloudFront distribution
        this.aRecord = ARecord.Builder
                .create(this, "ARecord-%s".formatted(dashedDomainName))
                .zone(this.hostedZone)
                .recordName(this.domainName)
                .deleteExisting(true)
                .ttl(Duration.seconds(60))
                .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                .build();
        this.aaaaRecord = AaaaRecord.Builder
                .create(this, "AaaaRecord-%s".formatted(dashedDomainName))
                .zone(this.hostedZone)
                .recordName(this.domainName)
                .deleteExisting(true)
                .ttl(Duration.seconds(60))
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
                throw new IllegalArgumentException("No customValue found or context key " + contextKey);
            }
        }
        return customValue;
    }
}
