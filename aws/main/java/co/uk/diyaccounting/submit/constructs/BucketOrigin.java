package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.functions.LogS3ObjectEvent;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOAIProps;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

public class BucketOrigin {

    private static final Logger logger = LogManager.getLogger(BucketOrigin.class);

    public final IBucket originBucket;
    public final IBucket originAccessLogBucket;
    public final OriginAccessIdentity originIdentity;
    public final IOrigin origin;

    private BucketOrigin(Builder builder) {
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

        logger.info("Created BucketOrigin with bucket: {}", this.originBucket.getBucketName());
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

        public BucketOrigin build() {
            if (bucketName == null || bucketName.isBlank()) {
                throw new IllegalArgumentException("bucketName is required");
            }
            if (!useExistingBucket) {
                if (originAccessLogBucketName == null || originAccessLogBucketName.isBlank()) {
                    throw new IllegalArgumentException("originAccessLogBucketName is required when not using existing bucket");
                }
                if (logS3ObjectEventHandlerSource == null || logS3ObjectEventHandlerSource.isBlank()) {
                    throw new IllegalArgumentException("logS3ObjectEventHandlerSource is required when not using existing bucket");
                }
                if (functionNamePrefix == null || functionNamePrefix.isBlank()) {
                    throw new IllegalArgumentException("functionNamePrefix is required when not using existing bucket");
                }
            }
            return new BucketOrigin(this);
        }
    }
}