package co.uk.diyaccounting.submit.stacks;

public class WebStackProps {
    public final String env;
    public final String hostedZoneName;
    public final String hostedZoneId;
    public final String subDomainName;
    public final String certificateArn;
    public final String userPoolArn;
    public final String cloudTrailEnabled;
    public final String xRayEnabled;
    public final String verboseLogging;
    public final String cloudTrailLogGroupRetentionPeriodDays;
    public final String accessLogGroupRetentionPeriodDays;
    public final String s3UseExistingBucket;
    public final String s3RetainOriginBucket;
    public final String s3RetainReceiptsBucket;
    public final String cloudTrailEventSelectorPrefix;
    public final String docRootPath;
    public final String defaultDocumentAtOrigin;
    public final String error404NotFoundAtDistribution;
    public final String skipLambdaUrlOrigins;
    public final String hmrcClientId;
    public final String hmrcClientSecretArn;
    public final String homeUrl;
    public final String hmrcBaseUri;
    public final String optionalTestAccessToken;
    public final String optionalTestS3Endpoint;
    public final String optionalTestS3AccessKey;
    public final String optionalTestS3SecretKey;
    public final String receiptsBucketPostfix;
    public final String lambdaEntry;
    public final String lambdaUrlAuthType;
    public final String commitHash;
    public final String googleClientId;
    public final String googleBaseUri;
    public final String googleClientSecretArn;
    public final String cognitoDomainPrefix;
    public final String bundleExpiryDate;
    public final String bundleUserLimit;
    public final String antonyccClientId;
    public final String antonyccBaseUri;
    public final String cognitoClientId;
    public final String cognitoBaseUri;
    public final String baseImageTag;
    public final String ecrRepositoryArn;
    public final String ecrRepositoryName;

    private WebStackProps(Builder b) {
        this.env = b.env;
        this.hostedZoneName = b.hostedZoneName;
        this.hostedZoneId = b.hostedZoneId;
        this.subDomainName = b.subDomainName;
        this.certificateArn = b.certificateArn;
        this.userPoolArn = b.userPoolArn;
        this.cloudTrailEnabled = b.cloudTrailEnabled;
        this.xRayEnabled = b.xRayEnabled;
        this.verboseLogging = b.verboseLogging;
        this.cloudTrailLogGroupRetentionPeriodDays = b.cloudTrailLogGroupRetentionPeriodDays;
        this.accessLogGroupRetentionPeriodDays = b.accessLogGroupRetentionPeriodDays;
        this.s3UseExistingBucket = b.s3UseExistingBucket;
        this.s3RetainOriginBucket = b.s3RetainOriginBucket;
        this.s3RetainReceiptsBucket = b.s3RetainReceiptsBucket;
        this.cloudTrailEventSelectorPrefix = b.cloudTrailEventSelectorPrefix;
        this.docRootPath = b.docRootPath;
        this.defaultDocumentAtOrigin = b.defaultDocumentAtOrigin;
        this.error404NotFoundAtDistribution = b.error404NotFoundAtDistribution;
        this.skipLambdaUrlOrigins = b.skipLambdaUrlOrigins;
        this.hmrcClientId = b.hmrcClientId;
        this.hmrcClientSecretArn = b.hmrcClientSecretArn;
        this.homeUrl = b.homeUrl;
        this.hmrcBaseUri = b.hmrcBaseUri;
        this.optionalTestAccessToken = b.optionalTestAccessToken;
        this.optionalTestS3Endpoint = b.optionalTestS3Endpoint;
        this.optionalTestS3AccessKey = b.optionalTestS3AccessKey;
        this.optionalTestS3SecretKey = b.optionalTestS3SecretKey;
        this.receiptsBucketPostfix = b.receiptsBucketPostfix;
        this.lambdaEntry = b.lambdaEntry;
        this.lambdaUrlAuthType = b.lambdaUrlAuthType;
        this.commitHash = b.commitHash;
        this.googleClientId = b.googleClientId;
        this.googleBaseUri = b.googleBaseUri;
        this.googleClientSecretArn = b.googleClientSecretArn;
        this.cognitoDomainPrefix = b.cognitoDomainPrefix;
        this.bundleExpiryDate = b.bundleExpiryDate;
        this.bundleUserLimit = b.bundleUserLimit;
        this.antonyccClientId = b.antonyccClientId;
        this.antonyccBaseUri = b.antonyccBaseUri;
        this.cognitoClientId = b.cognitoClientId;
        this.cognitoBaseUri = b.cognitoBaseUri;
        this.baseImageTag = b.baseImageTag;
        this.ecrRepositoryArn = b.ecrRepositoryArn;
        this.ecrRepositoryName = b.ecrRepositoryName;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String env,
                hostedZoneName,
                hostedZoneId,
                subDomainName,
                certificateArn,
                userPoolArn,
                cloudTrailEnabled,
                xRayEnabled,
                verboseLogging,
                cloudTrailLogGroupRetentionPeriodDays,
                accessLogGroupRetentionPeriodDays,
                s3UseExistingBucket,
                s3RetainOriginBucket,
                s3RetainReceiptsBucket,
                cloudTrailEventSelectorPrefix,
                docRootPath,
                defaultDocumentAtOrigin,
                error404NotFoundAtDistribution,
                skipLambdaUrlOrigins,
                hmrcClientId,
                hmrcClientSecretArn,
                homeUrl,
                hmrcBaseUri,
                optionalTestAccessToken,
                optionalTestS3Endpoint,
                optionalTestS3AccessKey,
                optionalTestS3SecretKey,
                receiptsBucketPostfix,
                lambdaEntry,
                lambdaUrlAuthType,
                commitHash,
                googleClientId,
                googleBaseUri,
                googleClientSecretArn,
                cognitoDomainPrefix,
                bundleExpiryDate,
                bundleUserLimit,
                antonyccClientId,
                antonyccBaseUri,
                cognitoClientId,
                cognitoBaseUri,
                baseImageTag,
                ecrRepositoryArn,
                ecrRepositoryName;

        public Builder env(String v) {
            this.env = v;
            return this;
        }

        public Builder hostedZoneName(String v) {
            this.hostedZoneName = v;
            return this;
        }

        public Builder hostedZoneId(String v) {
            this.hostedZoneId = v;
            return this;
        }

        public Builder subDomainName(String v) {
            this.subDomainName = v;
            return this;
        }

        public Builder certificateArn(String v) {
            this.certificateArn = v;
            return this;
        }

        public Builder userPoolArn(String v) {
            this.userPoolArn = v;
            return this;
        }

        public Builder cloudTrailEnabled(String v) {
            this.cloudTrailEnabled = v;
            return this;
        }

        public Builder xRayEnabled(String v) {
            this.xRayEnabled = v;
            return this;
        }

        public Builder verboseLogging(String v) {
            this.verboseLogging = v;
            return this;
        }

        public Builder cloudTrailLogGroupRetentionPeriodDays(String v) {
            this.cloudTrailLogGroupRetentionPeriodDays = v;
            return this;
        }

        public Builder accessLogGroupRetentionPeriodDays(String v) {
            this.accessLogGroupRetentionPeriodDays = v;
            return this;
        }

        public Builder s3UseExistingBucket(String v) {
            this.s3UseExistingBucket = v;
            return this;
        }

        public Builder s3RetainOriginBucket(String v) {
            this.s3RetainOriginBucket = v;
            return this;
        }

        public Builder s3RetainReceiptsBucket(String v) {
            this.s3RetainReceiptsBucket = v;
            return this;
        }

        public Builder cloudTrailEventSelectorPrefix(String v) {
            this.cloudTrailEventSelectorPrefix = v;
            return this;
        }

        public Builder docRootPath(String v) {
            this.docRootPath = v;
            return this;
        }

        public Builder defaultDocumentAtOrigin(String v) {
            this.defaultDocumentAtOrigin = v;
            return this;
        }

        public Builder error404NotFoundAtDistribution(String v) {
            this.error404NotFoundAtDistribution = v;
            return this;
        }

        public Builder skipLambdaUrlOrigins(String v) {
            this.skipLambdaUrlOrigins = v;
            return this;
        }

        public Builder hmrcClientId(String v) {
            this.hmrcClientId = v;
            return this;
        }

        public Builder hmrcClientSecretArn(String v) {
            this.hmrcClientSecretArn = v;
            return this;
        }

        public Builder homeUrl(String v) {
            this.homeUrl = v;
            return this;
        }

        public Builder hmrcBaseUri(String v) {
            this.hmrcBaseUri = v;
            return this;
        }

        public Builder optionalTestAccessToken(String v) {
            this.optionalTestAccessToken = v;
            return this;
        }

        public Builder optionalTestS3Endpoint(String v) {
            this.optionalTestS3Endpoint = v;
            return this;
        }

        public Builder optionalTestS3AccessKey(String v) {
            this.optionalTestS3AccessKey = v;
            return this;
        }

        public Builder optionalTestS3SecretKey(String v) {
            this.optionalTestS3SecretKey = v;
            return this;
        }

        public Builder receiptsBucketPostfix(String v) {
            this.receiptsBucketPostfix = v;
            return this;
        }

        public Builder lambdaEntry(String v) {
            this.lambdaEntry = v;
            return this;
        }

        public Builder lambdaUrlAuthType(String v) {
            this.lambdaUrlAuthType = v;
            return this;
        }

        public Builder commitHash(String v) {
            this.commitHash = v;
            return this;
        }

        public Builder googleClientId(String v) {
            this.googleClientId = v;
            return this;
        }

        public Builder googleBaseUri(String v) {
            this.googleBaseUri = v;
            return this;
        }

        public Builder googleClientSecretArn(String v) {
            this.googleClientSecretArn = v;
            return this;
        }

        public Builder cognitoDomainPrefix(String v) {
            this.cognitoDomainPrefix = v;
            return this;
        }

        public Builder bundleExpiryDate(String v) {
            this.bundleExpiryDate = v;
            return this;
        }

        public Builder bundleUserLimit(String v) {
            this.bundleUserLimit = v;
            return this;
        }

        public Builder antonyccClientId(String v) {
            this.antonyccClientId = v;
            return this;
        }

        public Builder antonyccBaseUri(String v) {
            this.antonyccBaseUri = v;
            return this;
        }

        public Builder cognitoClientId(String v) {
            this.cognitoClientId = v;
            return this;
        }

        public Builder cognitoBaseUri(String v) {
            this.cognitoBaseUri = v;
            return this;
        }

        public Builder baseImageTag(String v) {
            this.baseImageTag = v;
            return this;
        }

        public Builder ecrRepositoryArn(String v) {
            this.ecrRepositoryArn = v;
            return this;
        }

        public Builder ecrRepositoryName(String v) {
            this.ecrRepositoryName = v;
            return this;
        }

        public WebStackProps build() {
            return new WebStackProps(this);
        }
    }
}
