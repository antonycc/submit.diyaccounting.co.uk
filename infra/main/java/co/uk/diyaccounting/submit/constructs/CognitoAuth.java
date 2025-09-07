package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.awssdk.RetentionDaysConverter;
import java.util.HashMap;
import java.util.List;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.SecretValue;
import software.amazon.awscdk.services.cognito.CfnLogDeliveryConfiguration;
import software.amazon.awscdk.services.cognito.CfnUserPool;
import software.amazon.awscdk.services.cognito.OAuthFlows;
import software.amazon.awscdk.services.cognito.OAuthScope;
import software.amazon.awscdk.services.cognito.OAuthSettings;
import software.amazon.awscdk.services.cognito.StandardAttributes;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;
import software.constructs.IDependable;

/**
 * Thin coordinator for Cognito resources, created at WebStack scope to preserve logical IDs.
 * Creates UserPool (id: "UserPool"), optional Google IdP (id: "GoogleIdentityProvider"),
 * and UserPoolClient (id: "UserPoolClient").
 *
 * Extended to:
 *  - Enable advanced security (AUDIT/ENFORCED via CfnUserPool add-ons)
 *  - Deliver Cognito userAuthEvents and userNotification logs to CloudWatch
 *  - Attach logging Lambdas for common Cognito triggers with optional X-Ray
 */
public class CognitoAuth {

    private static final Logger logger = LogManager.getLogger(CognitoAuth.class);

    public final UserPoolClient userPoolClient;

    private CognitoAuth(Builder b) {

        var userPool = UserPool.fromUserPoolArn(b.scope, "UserPoolInCognitoStack", b.userPoolArn);

        // Enable advanced security via L1 CfnUserPool AddOns (AUDIT/ENFORCED)
        var cfnUserPool = (CfnUserPool) userPool.getNode().getDefaultChild();
        if (cfnUserPool != null && b.featurePlan != null && b.featurePlan.equalsIgnoreCase("PLUS")) {
            String asm = b.featurePlan.equalsIgnoreCase("PLUS") ? "ENFORCED" : "AUDIT";
            cfnUserPool.setUserPoolAddOns(CfnUserPool.UserPoolAddOnsProperty.builder()
                    .advancedSecurityMode(asm)
                    .build());
        }

        // User Pool Client
        this.userPoolClient = UserPoolClient.Builder.create(b.scope, "UserPoolClient")
                .userPool(userPool)
                .userPoolClientName(b.userPoolClientName)
                .generateSecret(false)
                .oAuth(OAuthSettings.builder()
                        .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                        .scopes(List.of(OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE))
                        .callbackUrls(b.callbackUrls)
                        .logoutUrls(b.logoutUrls)
                        .build())
                .supportedIdentityProviders(
                        b.identityProviders.keySet().stream().toList())
                .build();
        b.identityProviders
                .values()
                .forEach(idp -> this.userPoolClient.getNode().addDependency(idp));

        // Configure log delivery to CloudWatch if enabled
        if (b.enableLogDelivery) {
            RetentionDays retention = RetentionDaysConverter.daysToRetentionDays(b.accessLogGroupRetentionPeriodDays);
            LogGroup authEventsLog = LogGroup.Builder.create(b.scope, "CognitoUserAuthEventsLogGroup")
                    .logGroupName("/aws/cognito/" + b.logGroupNamePrefix + "/userAuthEvents")
                    .retention(retention)
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .build();
            LogGroup notificationLog = LogGroup.Builder.create(b.scope, "CognitoUserNotificationLogGroup")
                    .logGroupName("/aws/cognito/" + b.logGroupNamePrefix + "/userNotification")
                    .retention(retention)
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .build();

            var logConfigs = List.of(
                    CfnLogDeliveryConfiguration.LogConfigurationProperty.builder()
                            .eventSource("userAuthEvents")
                            .logLevel("INFO")
                            .cloudWatchLogsConfiguration(
                                    CfnLogDeliveryConfiguration.CloudWatchLogsConfigurationProperty.builder()
                                            .logGroupArn(authEventsLog.getLogGroupArn())
                                            .build())
                            .build(),
                    CfnLogDeliveryConfiguration.LogConfigurationProperty.builder()
                            .eventSource("userNotification")
                            .logLevel("ERROR")
                            .cloudWatchLogsConfiguration(
                                    CfnLogDeliveryConfiguration.CloudWatchLogsConfigurationProperty.builder()
                                            .logGroupArn(notificationLog.getLogGroupArn())
                                            .build())
                            .build());
            var delivery = CfnLogDeliveryConfiguration.Builder.create(b.scope, "UserPoolLogDelivery")
                    .userPoolId(userPool.getUserPoolId())
                    .logConfigurations(logConfigs)
                    .build();
            delivery.getNode().addDependency(userPool);
        }
    }

    public static class Builder {
        private final Construct scope;
        private String userPoolArn;
        private String userPoolClientName;
        private StandardAttributes standardAttributes;
        private String googleClientId;
        private SecretValue googleClientSecretValue;
        // private String antonyccClientId;
        // private SecretValue antonyccClientSecretValue;
        // private String antonyccIssuerUrl;
        private String acCogClientId;
        // private SecretValue acCogClientSecretValue;
        private String acCogIssuerUrl;
        private List<String> callbackUrls;
        private List<String> logoutUrls;
        public String env;
        public String hostedZoneName;
        public String hostedZoneId;
        public String subDomainName;
        public String certificateArn;
        public String authCertificateArn;
        public String cognitoDomainPrefix;
        public HashMap<UserPoolClientIdentityProvider, IDependable> identityProviders;

        // New optional settings
        private String featurePlan; // PLUS or ESSENTIALS (default ESSENTIALS)
        private boolean enableLogDelivery = false;
        private boolean xRayEnabled = false;
        private int accessLogGroupRetentionPeriodDays = 30;
        private String logGroupNamePrefix = "cognito";
        private String lambdaJarPath = null;

        private Builder(Construct scope) {
            this.scope = scope;
        }

        public static Builder create(Construct scope) {
            return new Builder(scope);
        }

        public Builder identityProviders(HashMap<UserPoolClientIdentityProvider, IDependable> identityProviders) {
            this.identityProviders = identityProviders;
            return this;
        }

        public Builder userPoolArn(String name) {
            this.userPoolArn = name;
            return this;
        }

        public Builder userPoolClientName(String name) {
            this.userPoolClientName = name;
            return this;
        }

        public Builder standardAttributes(StandardAttributes attrs) {
            this.standardAttributes = attrs;
            return this;
        }

        public Builder googleClientId(String id) {
            this.googleClientId = id;
            return this;
        }

        public Builder googleClientSecretValue(SecretValue value) {
            this.googleClientSecretValue = value;
            return this;
        }

        // public Builder antonyccClientId(String id) {
        //      this.antonyccClientId = id;
        //      return this;
        // }

        // public Builder antonyccClientSecretValue(SecretValue value) {
        //      this.antonyccClientSecretValue = value;
        //      return this;
        // }

        // public Builder antonyccIssuerUrl(String url) {
        //      this.antonyccIssuerUrl = url;
        //      return this;
        // }

        public Builder acCogClientId(String id) {
            this.acCogClientId = id;
            return this;
        }

        // public Builder acCogClientSecretValue(SecretValue value) {
        //    this.acCogClientSecretValue = value;
        //    return this;
        // }

        public Builder acCogIssuerUrl(String url) {
            this.acCogIssuerUrl = url;
            return this;
        }

        public Builder callbackUrls(List<String> urls) {
            this.callbackUrls = urls;
            return this;
        }

        public Builder logoutUrls(List<String> urls) {
            this.logoutUrls = urls;
            return this;
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

        public Builder certificateArn(String certificateArn) {
            this.certificateArn = certificateArn;
            return this;
        }

        public Builder cognitoDomainPrefix(String cognitoDomainPrefix) {
            this.cognitoDomainPrefix = cognitoDomainPrefix;
            return this;
        }

        public Builder featurePlan(String plan) {
            this.featurePlan = plan;
            return this;
        }

        public Builder enableLogDelivery(boolean enable) {
            this.enableLogDelivery = enable;
            return this;
        }

        public Builder xRayEnabled(boolean enabled) {
            this.xRayEnabled = enabled;
            return this;
        }

        public Builder accessLogGroupRetentionPeriodDays(int days) {
            this.accessLogGroupRetentionPeriodDays = days;
            return this;
        }

        public Builder logGroupNamePrefix(String prefix) {
            this.logGroupNamePrefix = prefix;
            return this;
        }

        public Builder lambdaJarPath(String path) {
            this.lambdaJarPath = path;
            return this;
        }

        public CognitoAuth build() {
            if (userPoolArn == null || userPoolArn.isBlank())
                throw new IllegalArgumentException("userPoolName is required");
            if (userPoolClientName == null || userPoolClientName.isBlank())
                throw new IllegalArgumentException("userPoolClientName is required");
            if (standardAttributes == null) throw new IllegalArgumentException("standardAttributes is required");
            if (callbackUrls == null || callbackUrls.isEmpty())
                throw new IllegalArgumentException("callbackUrls are required");
            if (logoutUrls == null || logoutUrls.isEmpty())
                throw new IllegalArgumentException("logoutUrls are required");
            return new CognitoAuth(this);
        }

        public Builder props(CognitoAuthProps props) {
            if (props == null) return this;
            this.userPoolArn = props.userPoolArn;
            this.userPoolClientName = props.userPoolClientName;
            this.standardAttributes = props.standardAttributes;
            this.googleClientId = props.googleClientId;
            this.googleClientSecretValue = props.googleClientSecretValue;
            this.acCogClientId = props.acCogClientId;
            this.acCogIssuerUrl = props.acCogIssuerUrl;
            this.callbackUrls = props.callbackUrls;
            this.logoutUrls = props.logoutUrls;
            this.env = props.env;
            this.hostedZoneName = props.hostedZoneName;
            this.hostedZoneId = props.hostedZoneId;
            this.subDomainName = props.subDomainName;
            this.certificateArn = props.certificateArn;
            this.authCertificateArn = props.authCertificateArn;
            this.cognitoDomainPrefix = props.cognitoDomainPrefix;
            this.identityProviders = props.identityProviders;
            this.featurePlan = props.featurePlan;
            this.enableLogDelivery = props.enableLogDelivery;
            this.xRayEnabled = props.xRayEnabled;
            this.accessLogGroupRetentionPeriodDays = props.accessLogGroupRetentionPeriodDays;
            this.logGroupNamePrefix = props.logGroupNamePrefix;
            this.lambdaJarPath = props.lambdaJarPath;
            return this;
        }
    }
}
