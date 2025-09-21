package co.uk.diyaccounting.submit;

public class SubmitApplicationProps {
    // Fields match cdk-application.json context keys (camelCase). Environment overrides are applied in SubmitApplication
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
    public String hmrcClientId;
    public String hmrcClientSecretArn;
    public String googleClientId;
    public String googleClientSecretArn;
    public String antonyccClientId;
    public String antonyccBaseUri;
    public String antonyccClientSecretArn;
    public String cognitoDomainPrefix;
    public String hmrcBaseUri;
    public String baseImageTag;
    public String selfDestructHandlerSource;
    public String selfDestructDelayHours;
    public String authCertificateArn;
    public String optionalTestAccessToken;
    public String optionalTestS3Endpoint;
    public String optionalTestS3AccessKey;
    public String optionalTestS3SecretKey;
    public String receiptsBucketPostfix;
    public String lambdaEntry;
    public String lambdaUrlAuthType;


    public static class Builder {
        private final SubmitApplicationProps p = new SubmitApplicationProps();

        public static Builder create() {
            return new Builder();
        }

        public SubmitApplicationProps build() {
            return p;
        }

        public Builder set(String key, String value) {
            try {
                var f = SubmitApplicationProps.class.getDeclaredField(key);
                f.setAccessible(true);
                f.set(p, value);
            } catch (Exception ignored) {
            }
            return this;
        }
    }
}
