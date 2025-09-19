package co.uk.diyaccounting.submit.stacks;

public class ApplicationStackProps {
    public final String env;
    public final String subDomainName;
    public final String hostedZoneName;
    public final String cloudTrailEnabled;
    public final String xRayEnabled;
    public final String verboseLogging;
    public final String baseImageTag;
    public final String ecrRepositoryArn;
    public final String ecrRepositoryName;
    public final String lambdaUrlAuthType;
    public final String lambdaEntry;
    public final String homeUrl;
    public final String hmrcBaseUri;
    public final String hmrcClientId;
    public final String hmrcClientSecretArn;
    public final String optionalTestAccessToken;
    public final String optionalTestS3Endpoint;
    public final String optionalTestS3AccessKey;
    public final String optionalTestS3SecretKey;
    public final String receiptsBucketPostfix;
    public final String s3RetainReceiptsBucket;

    private ApplicationStackProps(Builder b) {
        this.env = b.env;
        this.subDomainName = b.subDomainName;
        this.hostedZoneName = b.hostedZoneName;
        this.cloudTrailEnabled = b.cloudTrailEnabled;
        this.xRayEnabled = b.xRayEnabled;
        this.verboseLogging = b.verboseLogging;
        this.baseImageTag = b.baseImageTag;
        this.ecrRepositoryArn = b.ecrRepositoryArn;
        this.ecrRepositoryName = b.ecrRepositoryName;
        this.lambdaUrlAuthType = b.lambdaUrlAuthType;
        this.lambdaEntry = b.lambdaEntry;
        this.homeUrl = b.homeUrl;
        this.hmrcBaseUri = b.hmrcBaseUri;
        this.hmrcClientId = b.hmrcClientId;
        this.hmrcClientSecretArn = b.hmrcClientSecretArn;
        this.optionalTestAccessToken = b.optionalTestAccessToken;
        this.optionalTestS3Endpoint = b.optionalTestS3Endpoint;
        this.optionalTestS3AccessKey = b.optionalTestS3AccessKey;
        this.optionalTestS3SecretKey = b.optionalTestS3SecretKey;
        this.receiptsBucketPostfix = b.receiptsBucketPostfix;
        this.s3RetainReceiptsBucket = b.s3RetainReceiptsBucket;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String env;
        private String subDomainName;
        private String hostedZoneName;
        private String cloudTrailEnabled;
        private String xRayEnabled;
        private String verboseLogging;
        private String baseImageTag;
        private String ecrRepositoryArn;
        private String ecrRepositoryName;
        private String lambdaUrlAuthType;
        private String lambdaEntry;
        private String homeUrl;
        private String hmrcBaseUri;
        private String hmrcClientId;
        private String hmrcClientSecretArn;
        private String optionalTestAccessToken;
        private String optionalTestS3Endpoint;
        private String optionalTestS3AccessKey;
        private String optionalTestS3SecretKey;
        private String receiptsBucketPostfix;
        private String s3RetainReceiptsBucket;

        public Builder env(String v) {
            this.env = v;
            return this;
        }

        public Builder subDomainName(String v) {
            this.subDomainName = v;
            return this;
        }

        public Builder hostedZoneName(String v) {
            this.hostedZoneName = v;
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

        public Builder lambdaUrlAuthType(String v) {
            this.lambdaUrlAuthType = v;
            return this;
        }

        public Builder lambdaEntry(String v) {
            this.lambdaEntry = v;
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

        public Builder hmrcClientId(String v) {
            this.hmrcClientId = v;
            return this;
        }

        public Builder hmrcClientSecretArn(String v) {
            this.hmrcClientSecretArn = v;
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

        public Builder s3RetainReceiptsBucket(String v) {
            this.s3RetainReceiptsBucket = v;
            return this;
        }

        public ApplicationStackProps build() {
            return new ApplicationStackProps(this);
        }
    }
}
