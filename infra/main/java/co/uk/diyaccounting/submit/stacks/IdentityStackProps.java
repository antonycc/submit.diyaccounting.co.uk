package co.uk.diyaccounting.submit.stacks;

public class IdentityStackProps {
    public final String env;
    public final String subDomainName;
    public final String hostedZoneName;
    public final String hostedZoneId;
    public final String authCertificateArn;
    public final String useExistingAuthCertificate;
    public final String accessLogGroupRetentionPeriodDays;
    public final String cloudTrailEnabled;
    public final String cloudTrailEventSelectorPrefix;
    public final String xRayEnabled;
    public final String verboseLogging;
    public final String logCognitoEventHandlerSource;
    public final String homeUrl;
    public final String antonyccClientId;
    public final String antonyccBaseUri;
    public final String googleClientId;
    public final String googleClientSecretArn;
    public final String cognitoDomainPrefix;
    public final String cognitoFeaturePlan;
    public final String cognitoEnableLogDelivery;

    private IdentityStackProps(Builder b) {
        this.env = b.env;
        this.subDomainName = b.subDomainName;
        this.hostedZoneName = b.hostedZoneName;
        this.hostedZoneId = b.hostedZoneId;
        this.authCertificateArn = b.authCertificateArn;
        this.useExistingAuthCertificate = b.useExistingAuthCertificate;
        this.accessLogGroupRetentionPeriodDays = b.accessLogGroupRetentionPeriodDays;
        this.cloudTrailEnabled = b.cloudTrailEnabled;
        this.cloudTrailEventSelectorPrefix = b.cloudTrailEventSelectorPrefix;
        this.xRayEnabled = b.xRayEnabled;
        this.verboseLogging = b.verboseLogging;
        this.logCognitoEventHandlerSource = b.logCognitoEventHandlerSource;
        this.homeUrl = b.homeUrl;
        this.antonyccClientId = b.antonyccClientId;
        this.antonyccBaseUri = b.antonyccBaseUri;
        this.googleClientId = b.googleClientId;
        this.googleClientSecretArn = b.googleClientSecretArn;
        this.cognitoDomainPrefix = b.cognitoDomainPrefix;
        this.cognitoFeaturePlan = b.cognitoFeaturePlan;
        this.cognitoEnableLogDelivery = b.cognitoEnableLogDelivery;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String env,
                subDomainName,
                hostedZoneName,
                hostedZoneId,
                authCertificateArn,
                useExistingAuthCertificate,
                accessLogGroupRetentionPeriodDays,
                cloudTrailEnabled,
                cloudTrailEventSelectorPrefix,
                xRayEnabled,
                verboseLogging,
                logCognitoEventHandlerSource,
                homeUrl,
                antonyccClientId,
                antonyccBaseUri,
                googleClientId,
                googleClientSecretArn,
                cognitoDomainPrefix,
                cognitoFeaturePlan,
                cognitoEnableLogDelivery;

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

        public Builder hostedZoneId(String v) {
            this.hostedZoneId = v;
            return this;
        }

        public Builder authCertificateArn(String v) {
            this.authCertificateArn = v;
            return this;
        }

        public Builder useExistingAuthCertificate(String v) {
            this.useExistingAuthCertificate = v;
            return this;
        }

        public Builder accessLogGroupRetentionPeriodDays(String v) {
            this.accessLogGroupRetentionPeriodDays = v;
            return this;
        }

        public Builder cloudTrailEnabled(String v) {
            this.cloudTrailEnabled = v;
            return this;
        }

        public Builder cloudTrailEventSelectorPrefix(String v) {
            this.cloudTrailEventSelectorPrefix = v;
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

        public Builder logCognitoEventHandlerSource(String v) {
            this.logCognitoEventHandlerSource = v;
            return this;
        }

        public Builder homeUrl(String v) {
            this.homeUrl = v;
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

        public Builder googleClientId(String v) {
            this.googleClientId = v;
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

        public Builder cognitoFeaturePlan(String v) {
            this.cognitoFeaturePlan = v;
            return this;
        }

        public Builder cognitoEnableLogDelivery(String v) {
            this.cognitoEnableLogDelivery = v;
            return this;
        }

        public IdentityStackProps build() {
            return new IdentityStackProps(this);
        }
    }
}
