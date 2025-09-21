package co.uk.diyaccounting.submit;

// Fields match cdk-delivery.json context keys (camelCase). Environment overrides are applied in SubmitDelivery
public class SubmitDeliveryProps {
    public String env;
    public String deploymentName;
    public String hostedZoneName;
    public String hostedZoneId;
    public String subDomainName;
    public String certificateArn;
    public String cloudTrailEnabled;
    public String xRayEnabled;
    public String verboseLogging;
    public String cloudTrailLogGroupRetentionPeriodDays;
    public String accessLogGroupRetentionPeriodDays;
    public String docRootPath;
    public String lambdaEntry;
    public String commitHash;
    public String domainName;
    public String baseUrl;
    public String originBucketArn;
    public String authUrlMockLambdaFunctionArn;
    public String authUrlCognitoLambdaFunctionArn;
    public String exchangeCognitoTokenLambdaFunctionArn;
    public String authUrlHmrcLambdaFunctionArn;
    public String exchangeHmrcTokenLambdaFunctionArn;
    public String submitVatLambdaFunctionArn;
    public String logReceiptLambdaFunctionArn;
    public String catalogLambdaFunctionArn;
    public String myBundlesLambdaFunctionArn;
    public String myReceiptsLambdaFunctionArn;
    public String selfDestructHandlerSource;
    public String selfDestructDelayHours;

    public static class Builder {
        private final SubmitDeliveryProps p = new SubmitDeliveryProps();

        public static Builder create() {
            return new Builder();
        }

        public SubmitDeliveryProps build() {
            return p;
        }

        public Builder set(String key, String value) {
            try {
                var f = SubmitDeliveryProps.class.getDeclaredField(key);
                f.setAccessible(true);
                f.set(p, value);
            } catch (Exception ignored) {
            }
            return this;
        }
    }
}
