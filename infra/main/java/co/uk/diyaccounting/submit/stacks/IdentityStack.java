package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.constructs.CognitoAuth;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cognito.CfnUserPoolIdentityProvider;
import software.amazon.awscdk.services.cognito.StandardAttribute;
import software.amazon.awscdk.services.cognito.StandardAttributes;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolIdentityProviderGoogle;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.lang.reflect.Field;
import java.text.MessageFormat;
import java.util.AbstractMap;
import java.util.List;
import java.util.regex.Pattern;

public class IdentityStack extends Stack {

  private static final Logger logger = LogManager.getLogger(IdentityStack.class);

  public String domainName;
  public IHostedZone hostedZone;
  public ICertificate certificate;
  public ISecret googleClientSecretsManagerSecret;

  // Cognito resources
  public UserPool userPool;
  public UserPoolClient userPoolClient;
  public UserPoolIdentityProviderGoogle googleIdentityProvider;
  public CfnUserPoolIdentityProvider acCogIdentityProvider;

  // Cognito URIs
  public String cognitoDomainName;
  public String cognitoBaseUri;


  public static class Builder {
    public Construct scope;
    public String id;
    public StackProps props;

    public String env;
    public String hostedZoneName;
    public String hostedZoneId;
    public String subDomainName;
    public String authCertificateArn;
    public String useExistingAuthCertificate;
    public String cloudTrailEnabled;
    public String cloudTrailEventSelectorPrefix;
    public String accessLogGroupRetentionPeriodDays;
    public String xRayEnabled;
    public String verboseLogging;
    public String homeUrl;
    public String antonyccClientId;
    public String antonyccBaseUri;
    //public String antonyccClientSecretArn;
    public String acCogClientId;
    public String acCogBaseUri;
    //public String acCogClientSecretArn;

    // Cognito and Bundle Management properties
    public String googleClientId;
    public String googleClientSecretArn;
    public String cognitoDomainPrefix;
    // Cognito advanced security/logging flags
    public String cognitoFeaturePlan;
    public String cognitoEnableLogDelivery;
    public String logCognitoEventHandlerSource;

    public Builder(Construct scope, String id, StackProps props) {
      this.scope = scope;
      this.id = id;
      this.props = props;
    }

    public void loadContextValuesUsingReflection(Construct scope) {
      Field[] fields = this.getClass().getDeclaredFields();
      for (Field field : fields) {
        if (field.getType() == String.class
            && !field.getName().equals("scope")
            && !field.getName().equals("id")
            && !field.getName().equals("props")) {
          try {
            field.setAccessible(true);

            // Skip if already set
            if (field.get(this) != null) {
              continue;
            }

            // Set from config
            String contextValue = getContextValueString(scope, field.getName());
            if (contextValue != null) {
              field.set(this, contextValue);
            }
          } catch (IllegalAccessException e) {
            logger.warn(
                "Failed to set field {} using reflection: {}", field.getName(), e.getMessage());
          }
        }
      }
    }

    public String getContextValueString(Construct scope, String contextKey) {
      return getContextValueString(scope, contextKey, null);
    }

    public String getContextValueString(Construct scope, String contextKey, String defaultValue) {
      var contextValue = scope.getNode().tryGetContext(contextKey);
      String defaultedValue;
      String source;
      if (contextValue != null && StringUtils.isNotBlank(contextValue.toString())) {
        defaultedValue = contextValue.toString();
        source = "CDK context";
      } else {
        defaultedValue = defaultValue;
        source = "default value";
      }

      CfnOutput.Builder.create(scope, contextKey)
          .value(MessageFormat.format("{0} (Source: CDK {1})", defaultedValue, source))
          .build();

      return defaultedValue;
    }

    public static Builder create(Construct scope, String id) {
      return new Builder(scope, id, null);
    }

    public static Builder create(Construct scope, String id, StackProps props) {
      return new Builder(scope, id, props);
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

    public Builder authCertificateArn(String authCertificateArn) {
      this.authCertificateArn = authCertificateArn;
      return this;
    }

    public Builder useExistingAuthCertificate(String useExistingAuthCertificate) {
      this.useExistingAuthCertificate = useExistingAuthCertificate;
      return this;
    }

    public Builder accessLogGroupRetentionPeriodDays(String accessLogGroupRetentionPeriodDays) {
      this.accessLogGroupRetentionPeriodDays = accessLogGroupRetentionPeriodDays;
      return this;
    }

    public Builder cloudTrailEnabled(String cloudTrailEnabled) {
      this.cloudTrailEnabled = cloudTrailEnabled;
      return this;
    }

    public Builder cloudTrailEventSelectorPrefix(String cloudTrailEventSelectorPrefix) {
      this.cloudTrailEventSelectorPrefix = cloudTrailEventSelectorPrefix;
      return this;
    }

    public Builder xRayEnabled(String xRayEnabled) {
      this.xRayEnabled = xRayEnabled;
      return this;
    }

    public Builder verboseLogging(String verboseLogging) {
      this.verboseLogging = verboseLogging;
      return this;
    }

    public Builder logCognitoEventHandlerSource(String logCognitoEventHandlerSource) {
      this.logCognitoEventHandlerSource = logCognitoEventHandlerSource;
      return this;
    }

    public Builder homeUrl(String homeUrl) {
      this.homeUrl = homeUrl;
      return this;
    }

    public Builder antonyccClientId(String antonyccClientId) {
      this.antonyccClientId = antonyccClientId;
      return this;
    }

    public Builder antonyccBaseUri(String antonyccBaseUri) {
      this.antonyccBaseUri = antonyccBaseUri;
      return this;
    }

    //public Builder antonyccClientSecretArn(String antonyccClientSecretArn) {
    //  this.antonyccClientSecretArn = antonyccClientSecretArn;
    //  return this;
    //}

      public Builder acCogClientId(String acCogClientId) {
          this.acCogClientId = acCogClientId;
          return this;
      }

      public Builder acCogBaseUri(String acCogBaseUri) {
          this.acCogBaseUri = acCogBaseUri;
          return this;
      }

      //public Builder acCogClientSecretArn(String acCogClientSecretArn) {
      //    this.acCogClientSecretArn = acCogClientSecretArn;
      //    return this;
      //}

    public Builder googleClientId(String googleClientId) {
      this.googleClientId = googleClientId;
      return this;
    }

    public Builder googleClientSecretArn(String googleClientSecretArn) {
      this.googleClientSecretArn = googleClientSecretArn;
      return this;
    }

    public Builder cognitoDomainPrefix(String cognitoDomainPrefix) {
      this.cognitoDomainPrefix = cognitoDomainPrefix;
      return this;
    }

    public Builder cognitoFeaturePlan(String cognitoFeaturePlan) {
      this.cognitoFeaturePlan = cognitoFeaturePlan;
      return this;
    }

    public Builder cognitoEnableLogDelivery(String cognitoEnableLogDelivery) {
      this.cognitoEnableLogDelivery = cognitoEnableLogDelivery;
      return this;
    }

    public IdentityStack build() {
      return new IdentityStack(this.scope, this.id, this.props, this);
    }

    public static String buildDomainName(String env, String subDomainName, String hostedZoneName) {
      return env.equals("prod")
          ? Builder.buildProdDomainName(subDomainName, hostedZoneName)
          : Builder.buildNonProdDomainName(env, subDomainName, hostedZoneName);
    }

    public static String buildProdDomainName(String subDomainName, String hostedZoneName) {
      return "%s.%s".formatted(subDomainName, hostedZoneName);
    }

    public static String buildNonProdDomainName(
        String env, String subDomainName, String hostedZoneName) {
      return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName);
    }

    public static String buildDashedDomainName(
        String env, String subDomainName, String hostedZoneName) {
      return ResourceNameUtils.convertDotSeparatedToDashSeparated(
          "%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings);
    }

    public static String buildCognitoDomainName(
        String env, String cognitoDomainPrefix, String subDomainName, String hostedZoneName) {
      return env.equals("prod")
          ? Builder.buildProdCognitoDomainName(cognitoDomainPrefix, subDomainName, hostedZoneName)
          : Builder.buildNonProdCognitoDomainName(
              env, cognitoDomainPrefix, subDomainName, hostedZoneName);
    }

    public static String buildProdCognitoDomainName(
        String cognitoDomainPrefix, String subDomainName, String hostedZoneName) {
      return "%s.%s.%s".formatted(cognitoDomainPrefix, subDomainName, hostedZoneName);
    }

    public static String buildNonProdCognitoDomainName(
        String env, String cognitoDomainPrefix, String subDomainName, String hostedZoneName) {
      return "%s.%s.%s.%s".formatted(env, cognitoDomainPrefix, subDomainName, hostedZoneName);
    }

    public static String buildCognitoBaseUri(String cognitoDomain) {
      return "https://%s".formatted(cognitoDomain);
    }
  }

  public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();

  public IdentityStack(Construct scope, String id, IdentityStack.Builder builder) {
    this(scope, id, null, builder);
  }

  public IdentityStack(Construct scope, String id, StackProps props, IdentityStack.Builder builder) {
      super(scope, id, props);

      // Load values from cdk.json here using reflection, then let the properties be overridden by the
      // mutators
      builder.loadContextValuesUsingReflection(this);

      var hostedZone =
              HostedZone.fromHostedZoneAttributes(
                      this,
                      "HostedZone",
                      HostedZoneAttributes.builder()
                              .zoneName(builder.hostedZoneName)
                              .hostedZoneId(builder.hostedZoneId)
                              .build());

      this.domainName =
              Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
      String dashedDomainName =
              Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);

      int accessLogGroupRetentionPeriodDays =
              Integer.parseInt(builder.accessLogGroupRetentionPeriodDays);
      String originAccessLogBucketName = WebStack.Builder.buildOriginAccessLogBucketName(dashedDomainName);

      boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);

      var cognitoDomainName =
              Builder.buildCognitoDomainName(
                      builder.env,
                      builder.cognitoDomainPrefix != null ? builder.cognitoDomainPrefix : "auth",
                      builder.subDomainName,
                      hostedZone.getZoneName());
      var cognitoBaseUri = Builder.buildCognitoBaseUri(cognitoDomainName);
      this.cognitoDomainName = cognitoDomainName;
      this.cognitoBaseUri = cognitoBaseUri;

      // Create a secret for the Google client secret and set the ARN to be used in the Lambda
      // environment variable
      // this.googleClientSecretsManagerSecret = Secret.Builder.create(this,
      // "GoogleClientSecretValue")
      //        .secretStringValue(SecretValue.unsafePlainText(builder.googleClientSecret))
      //        .description("Google Client Secret for OAuth authentication")
      //        .build();
      // Look up the client secret by arn
      this.googleClientSecretsManagerSecret =
              Secret.fromSecretPartialArn(this, "GoogleClientSecret", builder.googleClientSecretArn);

      //this.antonyccClientSecretsManagerSecret =
      //          Secret.fromSecretPartialArn(this, "AntonyccClientSecret", builder.antonyccClientSecretArn);
      //var antonyccClientSecretArn = this.antonyccClientSecretsManagerSecret.getSecretArn();

      //this.acCogClientSecretsManagerSecret =
      //          Secret.fromSecretPartialArn(this, "AcCogClientSecret", builder.acCogClientSecretArn);
      //var acCogClientSecretArn = this.acCogClientSecretsManagerSecret.getSecretArn();

      // Create Cognito User Pool for authentication
      var standardAttributes =
          StandardAttributes.builder()
                  .email(StandardAttribute.builder().required(true).mutable(true).build())
                  .givenName(StandardAttribute.builder().required(false).mutable(true).build())
                  .familyName(StandardAttribute.builder().required(false).mutable(true).build())
                  .build();

      var googleClientSecretValue = this.googleClientSecretsManagerSecret.getSecretValue();
      //var antonyccClientSecretValue = this.antonyccClientSecretsManagerSecret.getSecretValue();
      //var acCogClientSecretValue = this.acCogClientSecretsManagerSecret.getSecretValue();
      // var googleClientSecretValue = this.googleClientSecretsManagerSecret != null
      //        ? this.googleClientSecretsManagerSecret.getSecretValue()
      //        : SecretValue.unsafePlainText(builder.googleClientSecret);

      var cognito =
              CognitoAuth.Builder.create(this)
                      .userPoolName(dashedDomainName + "-user-pool")
                      .userPoolClientName(dashedDomainName + "-client")
                      .standardAttributes(standardAttributes)
                      .googleClientId(builder.googleClientId)
                      .googleClientSecretValue(googleClientSecretValue)
                      //.antonyccClientId(builder.antonyccClientId)
                      //.antonyccIssuerUrl(builder.antonyccBaseUri)
                      //.antonyccClientSecretValue(antonyccClientSecretValue)
                      .acCogClientId(builder.acCogClientId)
                      .acCogIssuerUrl(builder.acCogBaseUri)
                      //.acCogClientSecretValue(acCogClientSecretValue)
                      .callbackUrls(
                              List.of(
                                      "https://" + this.domainName + "/",
                                      "https://" + this.domainName + "/auth/loginWithGoogleCallback.html",
                                      "https://" + this.domainName + "/auth/loginWithAcCogCallback.html"))
                      .logoutUrls(List.of("https://" + this.domainName + "/"))
                      .featurePlan(
                              builder.cognitoFeaturePlan != null && !builder.cognitoFeaturePlan.isBlank()
                                      ? builder.cognitoFeaturePlan
                                      : "ESSENTIALS")
                      .enableLogDelivery(
                              builder.cognitoEnableLogDelivery != null
                                      && !builder.cognitoEnableLogDelivery.isBlank() && Boolean.parseBoolean(builder.cognitoEnableLogDelivery))
                      .xRayEnabled(xRayEnabled)
                      .accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                      .logGroupNamePrefix(dashedDomainName)
                      .lambdaJarPath(builder.logCognitoEventHandlerSource)
                      .build();
      this.userPool = cognito.userPool;
      this.googleIdentityProvider = cognito.googleIdentityProvider;
      this.acCogIdentityProvider = cognito.acCogIdentityProvider;
      this.userPoolClient = cognito.userPoolClient;
  }
}
