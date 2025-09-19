package co.uk.diyaccounting.submit;

public class WebAppProps {
    // Fields match cdk.json context keys (camelCase). Environment overrides are applied in WebApp
    // selectively.
    // common
    public String env;
    public String deploymentName;
    public String hostedZoneName;
    public String hostedZoneId;
    public String subDomainName;
    public String certificateArn;
    public String cloudTrailEnabled;
    public String xRayEnabled;
    public String verboseLogging;
    public String cloudTrailLogGroupPrefix;
    public String cloudTrailLogGroupRetentionPeriodDays;
    public String accessLogGroupRetentionPeriodDays;
    public String s3UseExistingBucket;
    public String s3RetainOriginBucket;
    public String s3RetainReceiptsBucket;
    public String cloudTrailEventSelectorPrefix;
    public String docRootPath;
    public String defaultDocumentAtOrigin;
    public String error404NotFoundAtDistribution;
    public String skipLambdaUrlOrigins;
    // OAuth/HMRC and others
    public String hmrcClientId;
    public String hmrcClientSecretArn;
    public String homeUrl;
    public String hmrcBaseUri;
    public String optionalTestAccessToken;
    public String optionalTestS3Endpoint;
    public String optionalTestS3AccessKey;
    public String optionalTestS3SecretKey;
    public String receiptsBucketPostfix;
    // Lambda entry and function config
    public String lambdaEntry;
    public String lambdaUrlAuthType;
    public String commitHash;
    public String googleClientId;
    public String googleBaseUri;
    public String googleClientSecretArn;
    public String cognitoDomainPrefix;
    public String bundleExpiryDate;
    public String bundleUserLimit;
    public String baseImageTag;
    public String antonyccClientId;
    public String antonyccBaseUri;
    public String antonyccClientSecretArn;
    public String authCertificateArn;

    public static class Builder {
        private final WebAppProps p = new WebAppProps();

        public static Builder create() {
            return new Builder();
        }

        public WebAppProps build() {
            return p;
        }

        public Builder set(String key, String value) {
            try {
                var f = WebAppProps.class.getDeclaredField(key);
                f.setAccessible(true);
                f.set(p, value);
            } catch (Exception ignored) {
            }
            return this;
        }
    }
}
