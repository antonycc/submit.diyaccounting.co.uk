package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.awssdk.RetentionDaysConverter;
import co.uk.diyaccounting.submit.functions.LogGzippedS3ObjectEvent;
import co.uk.diyaccounting.submit.functions.LogS3ObjectEvent;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.ICachePolicy;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestCookieBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestHeaderBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.IResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersCorsBehavior;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOAIProps;
import software.amazon.awscdk.services.cloudtrail.S3EventSelector;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

import java.util.List;

public class BucketOrigin {

    private static final Logger logger = LogManager.getLogger(BucketOrigin.class);

    public final IBucket originBucket;
    public final IBucket originAccessLogBucket;
    public final OriginAccessIdentity originIdentity;
    public final IOrigin origin;
    public final String receiptsBucketFullName;
    public final BehaviorOptions s3BucketOriginBehaviour;
    public final IBucket distributionAccessLogBucket;
    public final Trail originBucketTrail;
    public final LogGroup originBucketLogGroup;

    private BucketOrigin(Builder builder) {
        // Calculate receiptsBucketFullName
        this.receiptsBucketFullName = buildBucketName(builder.dashedDomainName, builder.receiptsBucketPostfix);
        
        // Create access log bucket using LogForwardingBucket
        if (builder.useExistingBucket) {
            this.originBucket = Bucket.fromBucketName(builder.scope, "OriginBucket", builder.bucketName);
            this.originAccessLogBucket = null;
        } else {
            this.originAccessLogBucket = LogForwardingBucket.Builder
                    .create(builder.scope, "OriginAccess", builder.logS3ObjectEventHandlerSource, LogS3ObjectEvent.class)
                    .bucketName(builder.originAccessLogBucketName)
                    .functionNamePrefix(builder.functionNamePrefix)
                    .retentionPeriodDays(builder.accessLogGroupRetentionPeriodDays)
                    .cloudTrailEnabled(builder.cloudTrailEnabled)
                    .xRayEnabled(builder.xRayEnabled)
                    .verboseLogging(builder.verboseLogging)
                    .build();

            // Create the origin bucket
            this.originBucket = Bucket.Builder.create(builder.scope, "OriginBucket")
                    .bucketName(builder.bucketName)
                    .versioned(false)
                    .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                    .encryption(BucketEncryption.S3_MANAGED)
                    .removalPolicy(builder.retainBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                    .autoDeleteObjects(!builder.retainBucket)
                    .serverAccessLogsBucket(this.originAccessLogBucket)
                    .build();
        }

        // Create origin access identity
        this.originIdentity = OriginAccessIdentity.Builder
                .create(builder.scope, "OriginAccessIdentity")
                .comment("Identity created for access to the web website bucket via the CloudFront distribution")
                .build();

        // Grant read access to the origin identity
        originBucket.grantRead(this.originIdentity);

        // Create the S3 bucket origin
        this.origin = S3BucketOrigin.withOriginAccessIdentity(this.originBucket,
                S3BucketOriginWithOAIProps.builder()
                        .originAccessIdentity(this.originIdentity)
                        .build());

        // Create CloudFront s3BucketOriginBehaviour
        final OriginRequestPolicy s3BucketOriginRequestPolicy = OriginRequestPolicy.Builder
                .create(builder.scope, "OriginRequestPolicy")
                .comment("Policy to allow content headers but no cookies from the origin")
                .cookieBehavior(OriginRequestCookieBehavior.none())
                .headerBehavior(OriginRequestHeaderBehavior.allowList("Accept", "Accept-Language", "Origin"))
                .build();
        this.s3BucketOriginBehaviour = BehaviorOptions.builder()
                .origin(this.origin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(s3BucketOriginRequestPolicy)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();

        // Create distributionAccessLogBucket
        this.distributionAccessLogBucket = LogForwardingBucket.Builder
                .create(builder.scope, "DistributionAccess", builder.logGzippedS3ObjectEventHandlerSource, LogGzippedS3ObjectEvent.class)
                .bucketName(builder.distributionAccessLogBucketName)
                .functionNamePrefix(String.format("%s-dist-access-", builder.dashedDomainName))
                .retentionPeriodDays(builder.accessLogGroupRetentionPeriodDays)
                .cloudTrailEnabled(builder.cloudTrailEnabled)
                .xRayEnabled(builder.xRayEnabled)
                .verboseLogging(builder.verboseLogging)
                .build();

        // Create originBucketTrail if CloudTrail is enabled
        RetentionDays cloudTrailLogGroupRetentionPeriod = builder.verboseLogging ? 
            RetentionDaysConverter.daysToRetentionDays(30) : 
            RetentionDaysConverter.daysToRetentionDays(builder.cloudTrailLogGroupRetentionPeriodDays);
        if (builder.cloudTrailEnabled) {
            this.originBucketLogGroup = LogGroup.Builder.create(builder.scope, "OriginBucketLogGroup")
                    .logGroupName(String.format("%s%s-cloud-trail", builder.cloudTrailLogGroupPrefix, this.originBucket.getBucketName()))
                    .retention(cloudTrailLogGroupRetentionPeriod)
                    .removalPolicy(builder.retainBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                    .build();
            this.originBucketTrail = Trail.Builder.create(builder.scope, "OriginBucketTrail")
                    .trailName(buildCloudTrailLogBucketName(builder.dashedDomainName))
                    .cloudWatchLogGroup(this.originBucketLogGroup)
                    .sendToCloudWatchLogs(true)
                    .cloudWatchLogsRetention(cloudTrailLogGroupRetentionPeriod)
                    .includeGlobalServiceEvents(false)
                    .isMultiRegionTrail(false)
                    .build();
            // Add S3 event selector to the CloudTrail
            if (builder.cloudTrailEventSelectorPrefix == null || builder.cloudTrailEventSelectorPrefix.isBlank() || "none".equals(builder.cloudTrailEventSelectorPrefix)) {
                originBucketTrail.addS3EventSelector(List.of(S3EventSelector.builder()
                        .bucket(this.originBucket)
                        .build()
                ));
            } else {
                originBucketTrail.addS3EventSelector(List.of(S3EventSelector.builder()
                        .bucket(this.originBucket)
                        .objectPrefix(builder.cloudTrailEventSelectorPrefix)
                        .build()
                ));
            }
        } else {
            this.originBucketLogGroup = null;
            this.originBucketTrail = null;
            logger.info("CloudTrail is not enabled for the origin bucket.");
        }

        logger.info("Created BucketOrigin with bucket: {}", this.originBucket.getBucketName());
    }

    // Static helper methods from WebStack
    public static String buildOriginBucketName(String dashedDomainName){ return dashedDomainName; }
    public static String buildCloudTrailLogBucketName(String dashedDomainName) { return "%s-cloud-trail".formatted(dashedDomainName); }
    public static String buildOriginAccessLogBucketName(String dashedDomainName) { return "%s-origin-access-logs".formatted(dashedDomainName); }
    public static String buildDistributionAccessLogBucketName(String dashedDomainName) { return "%s-dist-access-logs".formatted(dashedDomainName);}
    
    private static String buildBucketName(String dashedDomainName, String bucketName) {
        return "%s-%s".formatted(dashedDomainName, bucketName);
    }

    public static class Builder {
        private final Construct scope;
        private final String idPrefix;
        private String bucketName = null;
        private String originAccessLogBucketName = null;
        private String functionNamePrefix = null;
        private String logS3ObjectEventHandlerSource = null;
        private int accessLogGroupRetentionPeriodDays = 30;
        private boolean retainBucket = false;
        private boolean useExistingBucket = false;
        
        // New fields for enhanced functionality
        private String dashedDomainName = null;
        private String receiptsBucketPostfix = "receipts";
        private String logGzippedS3ObjectEventHandlerSource = null;
        private String distributionAccessLogBucketName = null;
        private boolean cloudTrailEnabled = false;
        private String cloudTrailLogGroupPrefix = "/aws/cloudtrail/";
        private int cloudTrailLogGroupRetentionPeriodDays = 30;
        private String cloudTrailEventSelectorPrefix = null;
        private boolean xRayEnabled = false;
        private boolean verboseLogging = false;
        
        // Log group configuration
        private RetentionDays logGroupRetention = RetentionDays.THREE_DAYS;
        private RemovalPolicy logGroupRemovalPolicy = RemovalPolicy.DESTROY;
        
        // ResponseHeadersPolicy configuration
        private IResponseHeadersPolicy responseHeadersPolicy = ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS;
        private boolean corsAccessControlAllowCredentials = true;
        private List<String> corsAccessControlAllowHeaders = List.of("*");
        private List<String> corsAccessControlAllowMethods = List.of("GET", "HEAD", "OPTIONS");
        private List<String> corsAccessControlAllowOrigins = List.of("*");
        private List<String> corsAccessControlExposeHeaders = List.of("*");
        private software.amazon.awscdk.Duration corsAccessControlMaxAge = software.amazon.awscdk.Duration.seconds(600);
        private boolean corsOriginOverride = true;
        
        // BehaviorOptions configuration
        private ICachePolicy cachePolicy = CachePolicy.CACHING_OPTIMIZED;
        private ViewerProtocolPolicy viewerProtocolPolicy = ViewerProtocolPolicy.REDIRECT_TO_HTTPS;

        private Builder(final Construct scope, final String idPrefix) {
            this.scope = scope;
            this.idPrefix = idPrefix;
        }

        public static Builder create(final Construct scope, final String idPrefix) {
            return new Builder(scope, idPrefix);
        }

        public Builder bucketName(String bucketName) {
            this.bucketName = bucketName;
            return this;
        }

        public Builder originAccessLogBucketName(String originAccessLogBucketName) {
            this.originAccessLogBucketName = originAccessLogBucketName;
            return this;
        }

        public Builder functionNamePrefix(String functionNamePrefix) {
            this.functionNamePrefix = functionNamePrefix;
            return this;
        }

        public Builder logS3ObjectEventHandlerSource(String logS3ObjectEventHandlerSource) {
            this.logS3ObjectEventHandlerSource = logS3ObjectEventHandlerSource;
            return this;
        }

        public Builder accessLogGroupRetentionPeriodDays(int accessLogGroupRetentionPeriodDays) {
            this.accessLogGroupRetentionPeriodDays = accessLogGroupRetentionPeriodDays;
            return this;
        }

        public Builder retainBucket(boolean retainBucket) {
            this.retainBucket = retainBucket;
            return this;
        }

        public Builder useExistingBucket(boolean useExistingBucket) {
            this.useExistingBucket = useExistingBucket;
            return this;
        }

        // New builder methods for enhanced functionality
        public Builder dashedDomainName(String dashedDomainName) {
            this.dashedDomainName = dashedDomainName;
            return this;
        }

        public Builder receiptsBucketPostfix(String receiptsBucketPostfix) {
            this.receiptsBucketPostfix = receiptsBucketPostfix;
            return this;
        }

        public Builder logGzippedS3ObjectEventHandlerSource(String logGzippedS3ObjectEventHandlerSource) {
            this.logGzippedS3ObjectEventHandlerSource = logGzippedS3ObjectEventHandlerSource;
            return this;
        }

        public Builder distributionAccessLogBucketName(String distributionAccessLogBucketName) {
            this.distributionAccessLogBucketName = distributionAccessLogBucketName;
            return this;
        }

        public Builder cloudTrailEnabled(boolean cloudTrailEnabled) {
            this.cloudTrailEnabled = cloudTrailEnabled;
            return this;
        }

        public Builder cloudTrailLogGroupPrefix(String cloudTrailLogGroupPrefix) {
            this.cloudTrailLogGroupPrefix = cloudTrailLogGroupPrefix;
            return this;
        }

        public Builder cloudTrailLogGroupRetentionPeriodDays(int cloudTrailLogGroupRetentionPeriodDays) {
            this.cloudTrailLogGroupRetentionPeriodDays = cloudTrailLogGroupRetentionPeriodDays;
            return this;
        }

        public Builder cloudTrailEventSelectorPrefix(String cloudTrailEventSelectorPrefix) {
            this.cloudTrailEventSelectorPrefix = cloudTrailEventSelectorPrefix;
            return this;
        }

        public Builder xRayEnabled(boolean xRayEnabled) {
            this.xRayEnabled = xRayEnabled;
            return this;
        }

        public Builder verboseLogging(boolean verboseLogging) {
            this.verboseLogging = verboseLogging;
            return this;
        }

        // Log group configuration methods
        public Builder logGroupRetention(RetentionDays logGroupRetention) {
            this.logGroupRetention = logGroupRetention;
            return this;
        }

        public Builder logGroupRemovalPolicy(RemovalPolicy logGroupRemovalPolicy) {
            this.logGroupRemovalPolicy = logGroupRemovalPolicy;
            return this;
        }

        // ResponseHeadersPolicy configuration methods
        public Builder responseHeadersPolicy(IResponseHeadersPolicy responseHeadersPolicy) {
            this.responseHeadersPolicy = responseHeadersPolicy;
            return this;
        }

        public Builder corsAccessControlAllowCredentials(boolean corsAccessControlAllowCredentials) {
            this.corsAccessControlAllowCredentials = corsAccessControlAllowCredentials;
            return this;
        }

        public Builder corsAccessControlAllowHeaders(List<String> corsAccessControlAllowHeaders) {
            this.corsAccessControlAllowHeaders = corsAccessControlAllowHeaders;
            return this;
        }

        public Builder corsAccessControlAllowMethods(List<String> corsAccessControlAllowMethods) {
            this.corsAccessControlAllowMethods = corsAccessControlAllowMethods;
            return this;
        }

        public Builder corsAccessControlAllowOrigins(List<String> corsAccessControlAllowOrigins) {
            this.corsAccessControlAllowOrigins = corsAccessControlAllowOrigins;
            return this;
        }

        public Builder corsAccessControlExposeHeaders(List<String> corsAccessControlExposeHeaders) {
            this.corsAccessControlExposeHeaders = corsAccessControlExposeHeaders;
            return this;
        }

        public Builder corsAccessControlMaxAge(software.amazon.awscdk.Duration corsAccessControlMaxAge) {
            this.corsAccessControlMaxAge = corsAccessControlMaxAge;
            return this;
        }

        public Builder corsOriginOverride(boolean corsOriginOverride) {
            this.corsOriginOverride = corsOriginOverride;
            return this;
        }

        // BehaviorOptions configuration methods
        public Builder cachePolicy(ICachePolicy cachePolicy) {
            this.cachePolicy = cachePolicy;
            return this;
        }

        public Builder viewerProtocolPolicy(ViewerProtocolPolicy viewerProtocolPolicy) {
            this.viewerProtocolPolicy = viewerProtocolPolicy;
            return this;
        }

        public BucketOrigin build() {
            if (bucketName == null || bucketName.isBlank()) {
                throw new IllegalArgumentException("bucketName is required");
            }
            if (dashedDomainName == null || dashedDomainName.isBlank()) {
                throw new IllegalArgumentException("dashedDomainName is required");
            }
            
            // Set default values using static helper methods if not provided
            if (originAccessLogBucketName == null || originAccessLogBucketName.isBlank()) {
                this.originAccessLogBucketName = buildOriginAccessLogBucketName(dashedDomainName);
            }
            if (distributionAccessLogBucketName == null || distributionAccessLogBucketName.isBlank()) {
                this.distributionAccessLogBucketName = buildDistributionAccessLogBucketName(dashedDomainName);
            }
            if (functionNamePrefix == null || functionNamePrefix.isBlank()) {
                this.functionNamePrefix = String.format("%s-origin-access-", dashedDomainName);
            }
            
            if (!useExistingBucket) {
                if (logS3ObjectEventHandlerSource == null || logS3ObjectEventHandlerSource.isBlank()) {
                    throw new IllegalArgumentException("logS3ObjectEventHandlerSource is required when not using existing bucket");
                }
                if (logGzippedS3ObjectEventHandlerSource == null || logGzippedS3ObjectEventHandlerSource.isBlank()) {
                    throw new IllegalArgumentException("logGzippedS3ObjectEventHandlerSource is required when not using existing bucket");
                }
            }
            return new BucketOrigin(this);
        }
    }
}