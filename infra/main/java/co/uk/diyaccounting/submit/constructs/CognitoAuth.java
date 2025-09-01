package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.awssdk.RetentionDaysConverter;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.SecretValue;
import software.amazon.awscdk.services.cognito.AttributeMapping;
import software.amazon.awscdk.services.cognito.CfnLogDeliveryConfiguration;
import software.amazon.awscdk.services.cognito.CfnUserPool;
import software.amazon.awscdk.services.cognito.OAuthFlows;
import software.amazon.awscdk.services.cognito.OAuthScope;
import software.amazon.awscdk.services.cognito.OAuthSettings;
import software.amazon.awscdk.services.cognito.OidcEndpoints;
import software.amazon.awscdk.services.cognito.ProviderAttribute;
import software.amazon.awscdk.services.cognito.SignInAliases;
import software.amazon.awscdk.services.cognito.StandardAttributes;
import software.amazon.awscdk.services.cognito.StringAttribute;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider;
import software.amazon.awscdk.services.cognito.UserPoolIdentityProviderGoogle;
import software.amazon.awscdk.services.cognito.UserPoolIdentityProviderOidc;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

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

  public final UserPool userPool;
  public final UserPoolIdentityProviderGoogle googleIdentityProvider;
  public final UserPoolIdentityProviderOidc antonyccIdentityProvider;
  public final UserPoolIdentityProviderOidc AcCogIdentityProvider;
  public final UserPoolClient userPoolClient;

  private CognitoAuth(Builder b) {
    UserPool up =
        UserPool.Builder.create(b.scope, "UserPool")
            .userPoolName(b.userPoolName)
            .selfSignUpEnabled(true)
            .signInAliases(SignInAliases.builder().email(true).build())
            .standardAttributes(b.standardAttributes)
            .customAttributes(
                Map.of(
                    "bundles", StringAttribute.Builder.create().maxLen(2048).mutable(true).build()))
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();
    this.userPool = up;

    // Enable advanced security via L1 CfnUserPool AddOns (AUDIT/ENFORCED)
    var cfnUserPool = (CfnUserPool) up.getNode().getDefaultChild();
    if (cfnUserPool != null && b.featurePlan != null && b.featurePlan.equalsIgnoreCase("PLUS")) {
      String asm = b.featurePlan.equalsIgnoreCase("PLUS") ? "ENFORCED" : "AUDIT";
      cfnUserPool.setUserPoolAddOns(
          CfnUserPool.UserPoolAddOnsProperty.builder().advancedSecurityMode(asm).build());
    }

    // Google IdP
    UserPoolIdentityProviderGoogle googleIdp = null;
    if (b.googleClientId != null
        && !b.googleClientId.isBlank()
        && b.googleClientSecretValue != null) {
      googleIdp =
          UserPoolIdentityProviderGoogle.Builder.create(b.scope, "GoogleIdentityProvider")
              .userPool(up)
              .clientId(b.googleClientId)
              .clientSecretValue(b.googleClientSecretValue)
              .scopes(List.of("email", "openid", "profile"))
              .attributeMapping(
                  AttributeMapping.builder()
                      .email(ProviderAttribute.GOOGLE_EMAIL)
                      .givenName(ProviderAttribute.GOOGLE_GIVEN_NAME)
                      .familyName(ProviderAttribute.GOOGLE_FAMILY_NAME)
                      .build())
              .build();
    }
    this.googleIdentityProvider = googleIdp;

    // Antonycc OIDC IdP
    UserPoolIdentityProviderOidc antonyccIdp = null;
    if (b.antonyccClientId != null
              && !b.antonyccClientId.isBlank()
              && b.antonyccClientSecretValue != null) {
        OidcEndpoints oidcEndpoints = OidcEndpoints.builder()
                .authorization(b.antonyccIssuerUrl + "/authorize")
                .token(b.antonyccIssuerUrl + "/token")
                .userInfo(b.antonyccIssuerUrl + "/userinfo")
                .jwksUri(b.antonyccIssuerUrl + "/.well-known/jwks")
                .build();
          antonyccIdp =
                  UserPoolIdentityProviderOidc.Builder.create(b.scope, "AntonyccIdentityProvider")
                          .userPool(up)
                          .clientId(b.antonyccClientId)
                          .clientSecret(b.antonyccClientSecretValue.unsafeUnwrap())
                          .issuerUrl(b.antonyccIssuerUrl)
                          .endpoints(oidcEndpoints)
                          .attributeMapping(
                                  AttributeMapping.builder()
                                          .email(ProviderAttribute.other("email"))
                                          .givenName(ProviderAttribute.other("given_name"))
                                          .familyName(ProviderAttribute.other("family_name"))
                                          .build())
                          .build();
    }
    this.antonyccIdentityProvider = antonyccIdp;

    // Antonycc OIDC via Cognito IdP
    UserPoolIdentityProviderOidc AcCogIdp = null;
    if (b.acCogClientId != null
              && !b.acCogClientId.isBlank()
              && b.acCogClientSecretValue != null) {
          AcCogIdp =
                  UserPoolIdentityProviderOidc.Builder.create(b.scope, "AcCogIdentityProvider")
                          .userPool(up)
                          .clientId(b.acCogClientId)
                          .clientSecret(b.acCogClientSecretValue.unsafeUnwrap())
                          //.issuerUrl("https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_default")
                          .issuerUrl(b.acCogIssuerUrl)
                          .scopes(List.of("email", "openid", "profile"))
                          .attributeMapping(
                                  AttributeMapping.builder()
                                          .email(ProviderAttribute.other("email"))
                                          .givenName(ProviderAttribute.other("given_name"))
                                          .familyName(ProviderAttribute.other("family_name"))
                                          .build())
                          .build();
    }
    this.AcCogIdentityProvider = AcCogIdp;

    // User Pool Client
    UserPoolClient client =
        UserPoolClient.Builder.create(b.scope, "UserPoolClient")
            .userPool(up)
            .userPoolClientName(b.userPoolClientName)
            .generateSecret(false)
            .oAuth(
                OAuthSettings.builder()
                    .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                    .scopes(List.of(OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE))
                    .callbackUrls(b.callbackUrls)
                    .logoutUrls(b.logoutUrls)
                    .build())
            .supportedIdentityProviders(b.supportedIdentityProviders)
            .build();
    if (googleIdp != null) {
      client.getNode().addDependency(googleIdp);
    }
    this.userPoolClient = client;

    // Configure log delivery to CloudWatch if enabled
    if (b.enableLogDelivery) {
      RetentionDays retention =
          RetentionDaysConverter.daysToRetentionDays(b.accessLogGroupRetentionPeriodDays);
      LogGroup authEventsLog =
          LogGroup.Builder.create(b.scope, "CognitoUserAuthEventsLogGroup")
              .logGroupName("/aws/cognito/" + b.logGroupNamePrefix + "/userAuthEvents")
              .retention(retention)
              .removalPolicy(RemovalPolicy.DESTROY)
              .build();
      LogGroup notificationLog =
          LogGroup.Builder.create(b.scope, "CognitoUserNotificationLogGroup")
              .logGroupName("/aws/cognito/" + b.logGroupNamePrefix + "/userNotification")
              .retention(retention)
              .removalPolicy(RemovalPolicy.DESTROY)
              .build();

      var logConfigs =
          List.of(
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
      var delivery =
          CfnLogDeliveryConfiguration.Builder.create(b.scope, "UserPoolLogDelivery")
              .userPoolId(up.getUserPoolId())
              .logConfigurations(logConfigs)
              .build();
      delivery.getNode().addDependency(up);
    }
  }

  public static class Builder {
    private final Construct scope;
    private String userPoolName;
    private String userPoolClientName;
    private StandardAttributes standardAttributes;
    private String googleClientId;
    private SecretValue googleClientSecretValue;
    private String antonyccClientId;
    private SecretValue antonyccClientSecretValue;
    private String antonyccIssuerUrl;
    private String acCogClientId;
    private SecretValue acCogClientSecretValue;
    private String acCogIssuerUrl;
    private List<String> callbackUrls;
    private List<String> logoutUrls;
    private List<UserPoolClientIdentityProvider> supportedIdentityProviders = List.of();

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

    public Builder userPoolName(String name) {
      this.userPoolName = name;
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

    public Builder antonyccClientId(String id) {
          this.antonyccClientId = id;
          return this;
    }

    public Builder antonyccClientSecretValue(SecretValue value) {
          this.antonyccClientSecretValue = value;
          return this;
    }

    public Builder antonyccIssuerUrl(String url) {
          this.antonyccIssuerUrl = url;
          return this;
    }

      public Builder acCogClientId(String id) {
          this.acCogClientId = id;
          return this;
      }

      public Builder acCogClientSecretValue(SecretValue value) {
          this.acCogClientSecretValue = value;
          return this;
      }

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

    public Builder supportedIdentityProviders(List<UserPoolClientIdentityProvider> providers) {
      this.supportedIdentityProviders = providers;
      return this;
    }

    // New builder methods
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
      if (userPoolName == null || userPoolName.isBlank())
        throw new IllegalArgumentException("userPoolName is required");
      if (userPoolClientName == null || userPoolClientName.isBlank())
        throw new IllegalArgumentException("userPoolClientName is required");
      if (standardAttributes == null)
        throw new IllegalArgumentException("standardAttributes is required");
      if (callbackUrls == null || callbackUrls.isEmpty())
        throw new IllegalArgumentException("callbackUrls are required");
      if (logoutUrls == null || logoutUrls.isEmpty())
        throw new IllegalArgumentException("logoutUrls are required");
      return new CognitoAuth(this);
    }
  }
}
