package co.uk.diyaccounting.submit.constructs;

import java.util.HashMap;
import java.util.List;
import software.amazon.awscdk.services.cognito.StandardAttributes;
import software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider;
import software.constructs.IDependable;

public class CognitoAuthProps {
    public final String userPoolArn;
    public final String userPoolClientName;
    public final StandardAttributes standardAttributes;
    public final List<String> callbackUrls;
    public final List<String> logoutUrls;
    public final String env;
    public final String hostedZoneName;
    public final String hostedZoneId;
    public final String subDomainName;
    public final String certificateArn;
    public final String authCertificateArn;
    public final String cognitoDomainPrefix;
    public final HashMap<UserPoolClientIdentityProvider, IDependable> identityProviders;
    public final String featurePlan;
    public final boolean enableLogDelivery;
    public final boolean xRayEnabled;
    public final int accessLogGroupRetentionPeriodDays;
    public final String logGroupNamePrefix;
    public final String lambdaJarPath;

    private CognitoAuthProps(Builder b) {
        this.userPoolArn = b.userPoolArn;
        this.userPoolClientName = b.userPoolClientName;
        this.standardAttributes = b.standardAttributes;
        this.callbackUrls = b.callbackUrls;
        this.logoutUrls = b.logoutUrls;
        this.env = b.env;
        this.hostedZoneName = b.hostedZoneName;
        this.hostedZoneId = b.hostedZoneId;
        this.subDomainName = b.subDomainName;
        this.certificateArn = b.certificateArn;
        this.authCertificateArn = b.authCertificateArn;
        this.cognitoDomainPrefix = b.cognitoDomainPrefix;
        this.identityProviders = b.identityProviders;
        this.featurePlan = b.featurePlan;
        this.enableLogDelivery = b.enableLogDelivery;
        this.xRayEnabled = b.xRayEnabled;
        this.accessLogGroupRetentionPeriodDays = b.accessLogGroupRetentionPeriodDays;
        this.logGroupNamePrefix = b.logGroupNamePrefix;
        this.lambdaJarPath = b.lambdaJarPath;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String userPoolArn;
        private String userPoolClientName;
        private StandardAttributes standardAttributes;
        private List<String> callbackUrls;
        private List<String> logoutUrls;
        private String env;
        private String hostedZoneName;
        private String hostedZoneId;
        private String subDomainName;
        private String certificateArn;
        private String authCertificateArn;
        private String cognitoDomainPrefix;
        private HashMap<UserPoolClientIdentityProvider, IDependable> identityProviders = new HashMap<>();
        private String featurePlan;
        private boolean enableLogDelivery = false;
        private boolean xRayEnabled = false;
        private int accessLogGroupRetentionPeriodDays = 30;
        private String logGroupNamePrefix = "cognito";
        private String lambdaJarPath;

        public Builder identityProviders(HashMap<UserPoolClientIdentityProvider, IDependable> ip) {
            this.identityProviders = ip;
            return this;
        }

        public Builder userPoolArn(String v) {
            this.userPoolArn = v;
            return this;
        }

        public Builder userPoolClientName(String v) {
            this.userPoolClientName = v;
            return this;
        }

        public Builder standardAttributes(StandardAttributes v) {
            this.standardAttributes = v;
            return this;
        }

        public Builder callbackUrls(List<String> v) {
            this.callbackUrls = v;
            return this;
        }

        public Builder logoutUrls(List<String> v) {
            this.logoutUrls = v;
            return this;
        }

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

        public Builder authCertificateArn(String v) {
            this.authCertificateArn = v;
            return this;
        }

        public Builder cognitoDomainPrefix(String v) {
            this.cognitoDomainPrefix = v;
            return this;
        }

        public Builder featurePlan(String v) {
            this.featurePlan = v;
            return this;
        }

        public Builder enableLogDelivery(boolean v) {
            this.enableLogDelivery = v;
            return this;
        }

        public Builder xRayEnabled(boolean v) {
            this.xRayEnabled = v;
            return this;
        }

        public Builder accessLogGroupRetentionPeriodDays(int v) {
            this.accessLogGroupRetentionPeriodDays = v;
            return this;
        }

        public Builder logGroupNamePrefix(String v) {
            this.logGroupNamePrefix = v;
            return this;
        }

        public Builder lambdaJarPath(String v) {
            this.lambdaJarPath = v;
            return this;
        }

        public CognitoAuthProps build() {
            return new CognitoAuthProps(this);
        }
    }
}
