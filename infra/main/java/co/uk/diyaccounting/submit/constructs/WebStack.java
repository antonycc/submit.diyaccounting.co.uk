package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.awssdk.RetentionDaysConverter;
import co.uk.diyaccounting.submit.functions.LogS3ObjectEvent;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.lang.reflect.Field;
import java.text.MessageFormat;
import java.util.AbstractMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.apache.hc.core5.http.HttpStatus;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.CertificateValidation;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudtrail.S3EventSelector;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.cognito.StandardAttribute;
import software.amazon.awscdk.services.cognito.StandardAttributes;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolDomain;
import software.amazon.awscdk.services.cognito.UserPoolIdentityProviderGoogle;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.route53.targets.UserPoolDomainTarget;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.ISource;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class WebStack extends Stack {

  private static final Logger logger = LogManager.getLogger(WebStack.class);

  public String domainName;
  public IBucket originBucket;
  public LogGroup cloudTrailLogGroup;
  public IBucket originAccessLogBucket;
  public IOrigin origin;
  public BucketDeployment deployment;
  public IHostedZone hostedZone;
  public ICertificate certificate;
  public ICertificate authCertificate;
  public ISecret hmrcClientSecretsManagerSecret;
  public ISecret googleClientSecretsManagerSecret;
  public IBucket distributionAccessLogBucket;
  public OriginAccessIdentity originIdentity;
  public Distribution distribution;
  public String distributionUrl;
  public ISource docRootSource;
  public ARecord aRecord;
  public AaaaRecord aaaaRecord;
  public Bucket trailBucket;
  public Trail trail;
  public Function authUrlHmrcLambda;
  public FunctionUrl authUrlHmrcLambdaUrl;
  public LogGroup authUrlLambdaLogGroup;
  public Function authUrlMockLambda;
  public FunctionUrl authUrlMockLambdaUrl;
  public LogGroup authUrlMockLambdaLogGroup;
  public Function authUrlGoogleLambda;
  public FunctionUrl authUrlGoogleLambdaUrl;
  public LogGroup authUrlGoogleLambdaLogGroup;
  public Function exchangeHmrcTokenLambda;
  public FunctionUrl exchangeHmrcTokenLambdaUrl;
  public LogGroup exchangeHmrcTokenLambdaLogGroup;
  public Function exchangeGoogleTokenLambda;
  public FunctionUrl exchangeGoogleTokenLambdaUrl;
  public LogGroup exchangeGoogleTokenLambdaLogGroup;
  public Function submitVatLambda;
  public FunctionUrl submitVatLambdaUrl;
  public LogGroup submitVatLambdaLogGroup;
  public Function logReceiptLambda;
  public FunctionUrl logReceiptLambdaUrl;
  public LogGroup logReceiptLambdaLogGroup;

  // Cognito resources
  public UserPool userPool;
  public UserPoolClient userPoolClient;
  public ARecord userPoolDomainARecord;
  public AaaaRecord userPoolDomainAaaaRecord;
  public UserPoolDomain userPoolDomain;
  public UserPoolIdentityProviderGoogle googleIdentityProvider;

  // Cognito URIs
  public String cognitoDomainName;
  public String cognitoBaseUri;

  // Bundle management Lambda
  public Function bundleLambda;
  public FunctionUrl bundleLambdaUrl;
  public LogGroup bundleLambdaLogGroup;

  // Catalog Lambda
  public Function catalogLambda;
  public FunctionUrl catalogLambdaUrl;
  public LogGroup catalogLambdaLogGroup;

  // My Bundles Lambda
  public Function myBundlesLambda;
  public FunctionUrl myBundlesLambdaUrl;
  public LogGroup myBundlesLambdaLogGroup;

  public IBucket receiptsBucket;

  public Function myReceiptsLambda;
  public FunctionUrl myReceiptsLambdaUrl;
  public LogGroup myReceiptsLambdaLogGroup;

  public static class Builder {
    public Construct scope;
    public String id;
    public StackProps props;

    public String env;
    public String hostedZoneName;
    public String hostedZoneId;
    public String subDomainName;
    public String useExistingHostedZone;
    public String certificateArn;
    public String useExistingCertificate;
    public String authCertificateArn;
    public String useExistingAuthCertificate;
    public String cloudTrailEnabled;
    public String cloudTrailLogGroupPrefix;
    public String cloudTrailLogGroupRetentionPeriodDays;
    public String accessLogGroupRetentionPeriodDays;
    public String s3UseExistingBucket;
    public String s3RetainOriginBucket;
    public String s3RetainReceiptsBucket;
    public String cloudTrailEventSelectorPrefix;
    public String xRayEnabled;
    public String verboseLogging;
    public String logS3ObjectEventHandlerSource;
    public String logGzippedS3ObjectEventHandlerSource;
    public String docRootPath;
    public String defaultDocumentAtOrigin;
    public String error404NotFoundAtDistribution;
    public String skipLambdaUrlOrigins;
    public String hmrcClientId;
    public String hmrcClientSecretArn;
    public String homeUrl;
    public String hmrcBaseUri;
    public String optionalTestRedirectUri;
    public String optionalTestAccessToken;
    public String optionalTestS3Endpoint;
    public String optionalTestS3AccessKey;
    public String optionalTestS3SecretKey;
    public String receiptsBucketPostfix;
    public String lambdaEntry;
    public String authUrlHmrcLambdaHandlerFunctionName;
    public String authUrlLambdaUrlPath;
    public String authUrlHmrcLambdaDuration;
    public String authUrlMockLambdaHandlerFunctionName;
    public String authUrlMockLambdaUrlPath;
    public String authUrlMockLambdaDuration;
    public String authUrlGoogleLambdaHandlerFunctionName;
    public String authUrlGoogleLambdaUrlPath;
    public String authUrlGoogleLambdaDuration;
    public String exchangeHmrcTokenLambdaHandlerFunctionName;
    public String exchangeHmrcTokenLambdaUrlPath;
    public String exchangeHmrcTokenLambdaDuration;
    public String exchangeGoogleTokenLambdaHandlerFunctionName;
    public String exchangeGoogleTokenLambdaUrlPath;
    public String exchangeGoogleTokenLambdaDuration;
    public String submitVatLambdaHandlerFunctionName;
    public String submitVatLambdaUrlPath;
    public String submitVatLambdaDuration;
    public String logReceiptLambdaHandlerFunctionName;
    public String logReceiptLambdaUrlPath;
    public String logReceiptLambdaDuration;
    public String lambdaUrlAuthType;
    public String commitHash;

    // Cognito and Bundle Management properties
    public String googleClientId;
    public String googleClientSecretArn;
    public String cognitoDomainPrefix;
    public String bundleExpiryDate;
    public String bundleUserLimit;
    public String bundleLambdaHandlerFunctionName;
    public String bundleLambdaUrlPath;
    public String bundleLambdaDuration;
    // Catalog and My Bundles lambdas
    public String catalogLambdaHandlerFunctionName;
    public String catalogLambdaUrlPath;
    public String catalogLambdaDuration;
    public String myBundlesLambdaHandlerFunctionName;
    public String myBundlesLambdaUrlPath;
    public String myBundlesLambdaDuration;
    public String baseImageTag;
    // Cognito advanced security/logging flags
    public String cognitoFeaturePlan;
    public String cognitoEnableLogDelivery;
    public String logCognitoEventHandlerSource;
    public String myReceiptsLambdaHandlerFunctionName;
    public String myReceiptsLambdaUrlPath;
    public String myReceiptsLambdaDuration;

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
      // try {
      CfnOutput.Builder.create(scope, contextKey)
          .value(MessageFormat.format("{0} (Source: CDK {1})", defaultedValue, source))
          .build();
      // }catch (Exception e) {
      //    logger.warn("Failed to create CfnOutput for context key {}: {}", contextKey,
      // e.getMessage());
      // }
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

    public Builder useExistingHostedZone(String useExistingHostedZone) {
      this.useExistingHostedZone = useExistingHostedZone;
      return this;
    }

    public Builder certificateArn(String certificateArn) {
      this.certificateArn = certificateArn;
      return this;
    }

    public Builder useExistingCertificate(String useExistingCertificate) {
      this.useExistingCertificate = useExistingCertificate;
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

    public Builder cloudTrailEnabled(String cloudTrailEnabled) {
      this.cloudTrailEnabled = cloudTrailEnabled;
      return this;
    }

    public Builder cloudTrailLogGroupPrefix(String cloudTrailLogGroupPrefix) {
      this.cloudTrailLogGroupPrefix = cloudTrailLogGroupPrefix;
      return this;
    }

    public Builder cloudTrailLogGroupRetentionPeriodDays(
        String cloudTrailLogGroupRetentionPeriodDays) {
      this.cloudTrailLogGroupRetentionPeriodDays = cloudTrailLogGroupRetentionPeriodDays;
      return this;
    }

    public Builder accessLogGroupRetentionPeriodDays(String accessLogGroupRetentionPeriodDays) {
      this.accessLogGroupRetentionPeriodDays = accessLogGroupRetentionPeriodDays;
      return this;
    }

    public Builder s3UseExistingBucket(String s3UseExistingBucket) {
      this.s3UseExistingBucket = s3UseExistingBucket;
      return this;
    }

    public Builder s3RetainOriginBucket(String s3RetainOriginBucket) {
      this.s3RetainOriginBucket = s3RetainOriginBucket;
      return this;
    }

    public Builder s3RetainReceiptsBucket(String s3RetainReceiptsBucket) {
      this.s3RetainReceiptsBucket = s3RetainReceiptsBucket;
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

    public Builder logS3ObjectEventHandlerSource(String logS3ObjectEventHandlerSource) {
      this.logS3ObjectEventHandlerSource = logS3ObjectEventHandlerSource;
      return this;
    }

    public Builder logGzippedS3ObjectEventHandlerSource(
        String logGzippedS3ObjectEventHandlerSource) {
      this.logGzippedS3ObjectEventHandlerSource = logGzippedS3ObjectEventHandlerSource;
      return this;
    }

    public Builder logCognitoEventHandlerSource(String logCognitoEventHandlerSource) {
      this.logCognitoEventHandlerSource = logCognitoEventHandlerSource;
      return this;
    }

    public Builder docRootPath(String docRootPath) {
      this.docRootPath = docRootPath;
      return this;
    }

    public Builder defaultDocumentAtOrigin(String defaultDocumentAtOrigin) {
      this.defaultDocumentAtOrigin = defaultDocumentAtOrigin;
      return this;
    }

    public Builder error404NotFoundAtDistribution(String error404NotFoundAtDistribution) {
      this.error404NotFoundAtDistribution = error404NotFoundAtDistribution;
      return this;
    }

    public Builder skipLambdaUrlOrigins(String skipLambdaUrlOrigins) {
      this.skipLambdaUrlOrigins = skipLambdaUrlOrigins;
      return this;
    }

    public Builder hmrcClientId(String hmrcClientId) {
      this.hmrcClientId = hmrcClientId;
      return this;
    }

    public Builder hmrcClientSecretArn(String hmrcClientSecretArn) {
      this.hmrcClientSecretArn = hmrcClientSecretArn;
      return this;
    }

    public Builder homeUrl(String homeUrl) {
      this.homeUrl = homeUrl;
      return this;
    }

    public Builder hmrcBaseUri(String hmrcBaseUri) {
      this.hmrcBaseUri = hmrcBaseUri;
      return this;
    }

    public Builder optionalTestRedirectUri(String optionalTestRedirectUri) {
      this.optionalTestRedirectUri = optionalTestRedirectUri;
      return this;
    }

    public Builder optionalTestAccessToken(String optionalTestAccessToken) {
      this.optionalTestAccessToken = optionalTestAccessToken;
      return this;
    }

    public Builder optionalTestS3Endpoint(String optionalTestS3Endpoint) {
      this.optionalTestS3Endpoint = optionalTestS3Endpoint;
      return this;
    }

    public Builder optionalTestS3AccessKey(String optionalTestS3AccessKey) {
      this.optionalTestS3AccessKey = optionalTestS3AccessKey;
      return this;
    }

    public Builder optionalTestS3SecretKey(String optionalTestS3SecretKey) {
      this.optionalTestS3SecretKey = optionalTestS3SecretKey;
      return this;
    }

    public Builder receiptsBucketPostfix(String receiptsBucketPostfix) {
      this.receiptsBucketPostfix = receiptsBucketPostfix;
      return this;
    }

    public Builder lambdaEntry(String lambdaEntry) {
      this.lambdaEntry = lambdaEntry;
      return this;
    }

    public Builder authUrlHmrcLambdaHandlerFunctionName(
        String authUrlHmrcLambdaHandlerFunctionName) {
      this.authUrlHmrcLambdaHandlerFunctionName = authUrlHmrcLambdaHandlerFunctionName;
      return this;
    }

    public Builder authUrlHmrcLambdaUrlPath(String authUrlHmrcLambdaUrlPath) {
      this.authUrlLambdaUrlPath = authUrlHmrcLambdaUrlPath;
      return this;
    }

    public Builder authUrlHmrcLambdaDurationMillis(String authUrlHmrcLambdaDuration) {
      this.authUrlHmrcLambdaDuration = authUrlHmrcLambdaDuration;
      return this;
    }

    public Builder authUrlMockLambdaHandlerFunctionName(
        String authUrlMockLambdaHandlerFunctionName) {
      this.authUrlMockLambdaHandlerFunctionName = authUrlMockLambdaHandlerFunctionName;
      return this;
    }

    public Builder authUrlMockLambdaUrlPath(String authUrlMockLambdaUrlPath) {
      this.authUrlMockLambdaUrlPath = authUrlMockLambdaUrlPath;
      return this;
    }

    public Builder authUrlMockLambdaDurationMillis(String authUrlMockLambdaDuration) {
      this.authUrlMockLambdaDuration = authUrlMockLambdaDuration;
      return this;
    }

    public Builder authUrlGoogleLambdaHandlerFunctionName(
        String authUrlGoogleLambdaHandlerFunctionName) {
      this.authUrlGoogleLambdaHandlerFunctionName = authUrlGoogleLambdaHandlerFunctionName;
      return this;
    }

    public Builder authUrlGoogleLambdaUrlPath(String authUrlGoogleLambdaUrlPath) {
      this.authUrlGoogleLambdaUrlPath = authUrlGoogleLambdaUrlPath;
      return this;
    }

    public Builder authUrlGoogleLambdaDurationMillis(String authUrlGoogleLambdaDuration) {
      this.authUrlGoogleLambdaDuration = authUrlGoogleLambdaDuration;
      return this;
    }

    public Builder exchangeHmrcTokenLambdaHandlerFunctionName(
        String exchangeHmrcTokenLambdaHandlerFunctionName) {
      this.exchangeHmrcTokenLambdaHandlerFunctionName = exchangeHmrcTokenLambdaHandlerFunctionName;
      return this;
    }

    public Builder exchangeHmrcTokenLambdaUrlPath(String exchangeHmrcTokenLambdaUrlPath) {
      this.exchangeHmrcTokenLambdaUrlPath = exchangeHmrcTokenLambdaUrlPath;
      return this;
    }

    public Builder exchangeHmrcTokenLambdaDurationMillis(String exchangeHmrcTokenLambdaDuration) {
      this.exchangeHmrcTokenLambdaDuration = exchangeHmrcTokenLambdaDuration;
      return this;
    }

    public Builder exchangeGoogleTokenLambdaHandlerFunctionName(
        String exchangeGoogleTokenLambdaHandlerFunctionName) {
      this.exchangeGoogleTokenLambdaHandlerFunctionName =
          exchangeGoogleTokenLambdaHandlerFunctionName;
      return this;
    }

    public Builder exchangeGoogleTokenLambdaUrlPath(String exchangeGoogleTokenLambdaUrlPath) {
      this.exchangeGoogleTokenLambdaUrlPath = exchangeGoogleTokenLambdaUrlPath;
      return this;
    }

    public Builder exchangeGoogleTokenLambdaDurationMillis(
        String exchangeGoogleTokenLambdaDuration) {
      this.exchangeGoogleTokenLambdaDuration = exchangeGoogleTokenLambdaDuration;
      return this;
    }

    public Builder submitVatLambdaHandlerFunctionName(String submitVatLambdaHandlerFunctionName) {
      this.submitVatLambdaHandlerFunctionName = submitVatLambdaHandlerFunctionName;
      return this;
    }

    public Builder submitVatLambdaUrlPath(String submitVatLambdaUrlPath) {
      this.submitVatLambdaUrlPath = submitVatLambdaUrlPath;
      return this;
    }

    public Builder submitVatLambdaDurationMillis(String submitVatLambdaDuration) {
      this.submitVatLambdaDuration = submitVatLambdaDuration;
      return this;
    }

    public Builder logReceiptLambdaHandlerFunctionName(String logReceiptLambdaHandlerFunctionName) {
      this.logReceiptLambdaHandlerFunctionName = logReceiptLambdaHandlerFunctionName;
      return this;
    }

    public Builder logReceiptLambdaUrlPath(String logReceiptLambdaUrlPath) {
      this.logReceiptLambdaUrlPath = logReceiptLambdaUrlPath;
      return this;
    }

    public Builder logReceiptLambdaDurationMillis(String logReceiptLambdaDuration) {
      this.logReceiptLambdaDuration = logReceiptLambdaDuration;
      return this;
    }

    public Builder lambdaUrlAuthType(String lambdaUrlAuthType) {
      this.lambdaUrlAuthType = lambdaUrlAuthType;
      return this;
    }

    public Builder commitHash(String commitHash) {
      this.commitHash = commitHash;
      return this;
    }

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

    public Builder bundleExpiryDate(String bundleExpiryDate) {
      this.bundleExpiryDate = bundleExpiryDate;
      return this;
    }

    public Builder bundleUserLimit(String bundleUserLimit) {
      this.bundleUserLimit = bundleUserLimit;
      return this;
    }

    public Builder bundleLambdaHandlerFunctionName(String bundleLambdaHandlerFunctionName) {
      this.bundleLambdaHandlerFunctionName = bundleLambdaHandlerFunctionName;
      return this;
    }

    public Builder bundleLambdaUrlPath(String bundleLambdaUrlPath) {
      this.bundleLambdaUrlPath = bundleLambdaUrlPath;
      return this;
    }

    public Builder bundleLambdaDurationMillis(String bundleLambdaDuration) {
      this.bundleLambdaDuration = bundleLambdaDuration;
      return this;
    }

    // Catalog Lambda setters
    public Builder catalogLambdaHandlerFunctionName(String catalogLambdaHandlerFunctionName) {
      this.catalogLambdaHandlerFunctionName = catalogLambdaHandlerFunctionName;
      return this;
    }

    public Builder catalogLambdaUrlPath(String catalogLambdaUrlPath) {
      this.catalogLambdaUrlPath = catalogLambdaUrlPath;
      return this;
    }

    public Builder catalogLambdaDurationMillis(String catalogLambdaDuration) {
      this.catalogLambdaDuration = catalogLambdaDuration;
      return this;
    }

    // My Bundles Lambda setters
    public Builder myBundlesLambdaHandlerFunctionName(String myBundlesLambdaHandlerFunctionName) {
      this.myBundlesLambdaHandlerFunctionName = myBundlesLambdaHandlerFunctionName;
      return this;
    }

    public Builder myBundlesLambdaUrlPath(String myBundlesLambdaUrlPath) {
      this.myBundlesLambdaUrlPath = myBundlesLambdaUrlPath;
      return this;
    }

    public Builder myBundlesLambdaDurationMillis(String myBundlesLambdaDuration) {
      this.myBundlesLambdaDuration = myBundlesLambdaDuration;
      return this;
    }

    public Builder baseImageTag(String baseImageTag) {
      this.baseImageTag = baseImageTag;
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

    public Builder myReceiptsLambdaHandlerFunctionName(String myReceiptsLambdaHandlerFunctionName) {
      this.myReceiptsLambdaHandlerFunctionName = myReceiptsLambdaHandlerFunctionName;
      return this;
    }

    public Builder myReceiptsLambdaUrlPath(String myReceiptsLambdaUrlPath) {
      this.myReceiptsLambdaUrlPath = myReceiptsLambdaUrlPath;
      return this;
    }

    public Builder myReceiptsLambdaDurationMillis(String myReceiptsLambdaDuration) {
      this.myReceiptsLambdaDuration = myReceiptsLambdaDuration;
      return this;
    }

    // TODO: Split into Edge, Identity, Data, App, and Ops. See:
    // _developers/backlog/diverse-versions-at-origin.md

    public WebStack build() {
      return new WebStack(this.scope, this.id, this.props, this);
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

    public static String buildOriginBucketName(String dashedDomainName) {
      return dashedDomainName;
    }

    public static String buildTrailName(String dashedDomainName) {
      return "%s-cloud-trail".formatted(dashedDomainName);
    }

    public static String buildOriginAccessLogBucketName(String dashedDomainName) {
      return "%s-origin-access-logs".formatted(dashedDomainName);
    }

    public static String buildDistributionAccessLogBucketName(String dashedDomainName) {
      return "%s-dist-access-logs".formatted(dashedDomainName);
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

    public static String buildDashedCognitoDomainName(String cognitoDomainName) {
      return ResourceNameUtils.convertDotSeparatedToDashSeparated(
          cognitoDomainName, domainNameMappings);
    }

    public static String buildCognitoBaseUri(String cognitoDomain) {
      return "https://%s".formatted(cognitoDomain);
    }

    private static String buildFunctionName(String dashedDomainName, String functionName) {
      return "%s-%s"
          .formatted(
              dashedDomainName, ResourceNameUtils.convertCamelCaseToDashSeparated(functionName));
    }

    private static String buildBucketName(String dashedDomainName, String bucketName) {
      return "%s-%s".formatted(dashedDomainName, bucketName);
    }
  }

  public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();

  public WebStack(Construct scope, String id, WebStack.Builder builder) {
    this(scope, id, null, builder);
  }

  public WebStack(Construct scope, String id, StackProps props, WebStack.Builder builder) {
    super(scope, id, props);

    // Load values from cdk.json here using reflection, then let the properties be overridden by the
    // mutators
    builder.loadContextValuesUsingReflection(this);

    boolean useExistingHostedZone = Boolean.parseBoolean(builder.useExistingHostedZone);
    if (useExistingHostedZone) {
      String hostedZoneId = builder.hostedZoneId;
      this.hostedZone =
          HostedZone.fromHostedZoneAttributes(
              this,
              "HostedZone",
              HostedZoneAttributes.builder()
                  .zoneName(builder.hostedZoneName)
                  .hostedZoneId(hostedZoneId)
                  .build());
    } else {
      this.hostedZone =
          HostedZone.Builder.create(this, "HostedZone").zoneName(builder.hostedZoneName).build();
    }

    this.domainName =
        Builder.buildDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
    String dashedDomainName =
        Builder.buildDashedDomainName(builder.env, builder.subDomainName, builder.hostedZoneName);
    String originBucketName = Builder.buildOriginBucketName(dashedDomainName);

    boolean s3UseExistingBucket = Boolean.parseBoolean(builder.s3UseExistingBucket);
    boolean s3RetainOriginBucket = Boolean.parseBoolean(builder.s3RetainOriginBucket);
    boolean s3RetainReceiptsBucket = Boolean.parseBoolean(builder.s3RetainReceiptsBucket);

    String trailName = Builder.buildTrailName(dashedDomainName);
    boolean cloudTrailEnabled = Boolean.parseBoolean(builder.cloudTrailEnabled);
    int cloudTrailLogGroupRetentionPeriodDays =
        Integer.parseInt(builder.cloudTrailLogGroupRetentionPeriodDays);
    boolean xRayEnabled = Boolean.parseBoolean(builder.xRayEnabled);

    boolean useExistingCertificate = Boolean.parseBoolean(builder.useExistingCertificate);

    boolean useExistingAuthCertificate = Boolean.parseBoolean(builder.useExistingAuthCertificate);

    int accessLogGroupRetentionPeriodDays =
        Integer.parseInt(builder.accessLogGroupRetentionPeriodDays);
    String originAccessLogBucketName = Builder.buildOriginAccessLogBucketName(dashedDomainName);

    String distributionAccessLogBucketName =
        Builder.buildDistributionAccessLogBucketName(dashedDomainName);

    var cognitoDomainName =
        Builder.buildCognitoDomainName(
            builder.env,
            builder.cognitoDomainPrefix != null ? builder.cognitoDomainPrefix : "auth",
            builder.subDomainName,
            builder.hostedZoneName);
    var dashedCognitoDomainName = Builder.buildDashedCognitoDomainName(cognitoDomainName);
    var cognitoBaseUri = Builder.buildCognitoBaseUri(cognitoDomainName);
    this.cognitoDomainName = cognitoDomainName;
    this.cognitoBaseUri = cognitoBaseUri;

    // Check for environment variable override for verboseLogging
    String verboseLoggingEnv = System.getenv("VERBOSE_LOGGING");
    boolean verboseLogging =
        verboseLoggingEnv != null
            ? Boolean.parseBoolean(verboseLoggingEnv)
            : Boolean.parseBoolean(builder.verboseLogging);

    if (verboseLoggingEnv != null) {
      logger.info(
          "Verbose logging setting overridden by environment variable VERBOSE_LOGGING: {}",
          verboseLogging);
    }

    // Determine Lambda URL authentication type
    FunctionUrlAuthType functionUrlAuthType =
        "AWS_IAM".equalsIgnoreCase(builder.lambdaUrlAuthType)
            ? FunctionUrlAuthType.AWS_IAM
            : FunctionUrlAuthType.NONE;

    // Common options for all Lambda URL origins to reduce repetition
    var lambdaCommonOpts =
        LambdaUrlOriginOpts.Builder.create()
            .env(builder.env)
            .imageDirectory("infra/runtimes")
            .functionUrlAuthType(functionUrlAuthType)
            .cloudTrailEnabled(cloudTrailEnabled)
            .xRayEnabled(xRayEnabled)
            .verboseLogging(verboseLogging)
            .baseImageTag(builder.baseImageTag)
            .build();

    // Create a CloudTrail for the stack resources
    RetentionDays cloudTrailLogGroupRetentionPeriod =
        RetentionDaysConverter.daysToRetentionDays(cloudTrailLogGroupRetentionPeriodDays);
    if (cloudTrailEnabled) {
      this.cloudTrailLogGroup =
          LogGroup.Builder.create(this, "OriginBucketLogGroup")
              .logGroupName(
                  "%s%s-cloud-trail".formatted(builder.cloudTrailLogGroupPrefix, dashedDomainName))
              .retention(cloudTrailLogGroupRetentionPeriod)
              .removalPolicy(RemovalPolicy.DESTROY)
              .build();
      this.trailBucket =
          Bucket.Builder.create(this, trailName + "CloudTrailBucket")
              // optional: stable name, otherwise CDK adds a hash (fine too)
              // .bucketName(ResourceNameUtils.buildBucketName(env, "originbuckettrail"))
              .encryption(BucketEncryption.S3_MANAGED)
              .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
              .versioned(false)
              .autoDeleteObjects(true)
              .removalPolicy(RemovalPolicy.DESTROY)
              .lifecycleRules(
                  List.of(
                      LifecycleRule.builder()
                          .expiration(Duration.days(cloudTrailLogGroupRetentionPeriodDays))
                          .build()))
              .build();
      this.trail =
          Trail.Builder.create(this, "OriginBucketTrail")
              .trailName(trailName)
              .cloudWatchLogGroup(this.cloudTrailLogGroup)
              .sendToCloudWatchLogs(true)
              .cloudWatchLogsRetention(cloudTrailLogGroupRetentionPeriod)
              .includeGlobalServiceEvents(false)
              .isMultiRegionTrail(false)
              .build();
    }

    // Origin bucket for the CloudFront distribution
    String receiptsBucketFullName =
        Builder.buildBucketName(dashedDomainName, builder.receiptsBucketPostfix);
    BucketOrigin bucketOrigin;
    if (s3UseExistingBucket) {
      bucketOrigin =
          BucketOrigin.Builder.create(this, "Origin")
              .bucketName(originBucketName)
              .useExistingBucket(true)
              .build();
    } else {
      bucketOrigin =
          BucketOrigin.Builder.create(this, "Origin")
              .bucketName(originBucketName)
              .originAccessLogBucketName(originAccessLogBucketName)
              .functionNamePrefix("%s-origin-access-".formatted(dashedDomainName))
              .logS3ObjectEventHandlerSource(builder.logS3ObjectEventHandlerSource)
              .accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
              .retainBucket(s3RetainOriginBucket)
              .verboseLogging(verboseLogging)
              .useExistingBucket(false)
              .build();
    }
    this.originBucket = bucketOrigin.originBucket;
    this.originAccessLogBucket = bucketOrigin.originAccessLogBucket;
    this.originIdentity = bucketOrigin.originIdentity;
    this.origin = bucketOrigin.origin;

    // Create the CloudFront distribution with a bucket as an origin
    // final OriginRequestPolicy s3BucketOriginRequestPolicy = OriginRequestPolicy.Builder
    //        .create(this, "S3BucketOriginRequestPolicy")
    //        .comment("Policy to allow content headers but no cookies from the origin")
    //        .cookieBehavior(OriginRequestCookieBehavior.none())
    //        .headerBehavior(OriginRequestHeaderBehavior.allowList("Accept", "Accept-Language",
    // "Origin"))
    //        .build();
    final BehaviorOptions s3BucketOriginBehaviour =
        BehaviorOptions.builder()
            .origin(this.origin)
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            // .originRequestPolicy(s3BucketOriginRequestPolicy)
            .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .responseHeadersPolicy(
                ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
            .compress(true)
            .build();
    // Distribution access log bucket creation moved to DistributionWithLogging

    // Add cloud trail to the origin bucket if enabled
    // CloudTrail for the origin bucket
    if (cloudTrailEnabled) {
      // Add S3 event selector to the CloudTrail
      if (builder.cloudTrailEventSelectorPrefix == null
          || builder.cloudTrailEventSelectorPrefix.isBlank()
          || "none".equals(builder.cloudTrailEventSelectorPrefix)) {
        trail.addS3EventSelector(
            List.of(S3EventSelector.builder().bucket(this.originBucket).build()));
      } else {
        trail.addS3EventSelector(
            List.of(
                S3EventSelector.builder()
                    .bucket(this.originBucket)
                    .objectPrefix(builder.cloudTrailEventSelectorPrefix)
                    .build()));
      }
    } else {
      logger.info("CloudTrail is not enabled for the origin bucket.");
    }

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
    var googleClientSecretArn = this.googleClientSecretsManagerSecret.getSecretArn();

    // Create Cognito User Pool for authentication
    var standardAttributes =
        StandardAttributes.builder()
            .email(StandardAttribute.builder().required(true).mutable(true).build())
            .givenName(StandardAttribute.builder().required(false).mutable(true).build())
            .familyName(StandardAttribute.builder().required(false).mutable(true).build())
            .build();
    if (StringUtils.isNotBlank(builder.googleClientId)
        && StringUtils.isNotBlank(builder.googleClientSecretArn)) {
      var googleClientSecretValue = this.googleClientSecretsManagerSecret.getSecretValue();
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
              .callbackUrls(
                  List.of(
                      "https://" + this.domainName + "/",
                      "https://" + this.domainName + "/auth/loginWithGoogleCallback.html"))
              .logoutUrls(List.of("https://" + this.domainName + "/"))
              .supportedIdentityProviders(
                  List.of(
                      software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider
                          .GOOGLE))
              .featurePlan(
                  builder.cognitoFeaturePlan != null && !builder.cognitoFeaturePlan.isBlank()
                      ? builder.cognitoFeaturePlan
                      : "ESSENTIALS")
              .enableLogDelivery(
                  builder.cognitoEnableLogDelivery == null
                          || builder.cognitoEnableLogDelivery.isBlank()
                      ? false
                      : Boolean.parseBoolean(builder.cognitoEnableLogDelivery))
              .xRayEnabled(xRayEnabled)
              .accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
              .logGroupNamePrefix(dashedDomainName)
              .lambdaJarPath(builder.logCognitoEventHandlerSource)
              .build();
      this.userPool = cognito.userPool;
      this.googleIdentityProvider = cognito.googleIdentityProvider;
      this.userPoolClient = cognito.userPoolClient;
    }

    // Lambdas

    var lambdaUrlToOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

    // authUrl - HMRC
    var authUrlHmrcLambdaEnv =
        new HashMap<>(
            Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri,
                "DIY_SUBMIT_HMRC_CLIENT_ID", builder.hmrcClientId));
    var authUrlHmrcLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "AuthUrlHmrcLambda")
            .imageFilename("authUrlHmrc.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.authUrlHmrcLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .handler(builder.lambdaEntry + builder.authUrlHmrcLambdaHandlerFunctionName)
            .environment(authUrlHmrcLambdaEnv)
            .timeout(Duration.millis(Long.parseLong(builder.authUrlHmrcLambdaDuration)))
            .options(lambdaCommonOpts)
            .build();
    this.authUrlHmrcLambda = authUrlHmrcLambdaUrlOrigin.lambda;
    this.authUrlHmrcLambdaUrl = authUrlHmrcLambdaUrlOrigin.functionUrl;
    this.authUrlLambdaLogGroup = authUrlHmrcLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.authUrlLambdaUrlPath + "*", authUrlHmrcLambdaUrlOrigin.behaviorOptions);

    // authUrl - mock
    var authUrlMockLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
    var authUrlMockLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "AuthUrlMockLambda")
            .options(lambdaCommonOpts)
            .imageFilename("authUrlMock.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.authUrlMockLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .handler(builder.lambdaEntry + builder.authUrlMockLambdaHandlerFunctionName)
            .environment(authUrlMockLambdaEnv)
            .timeout(Duration.millis(Long.parseLong(builder.authUrlMockLambdaDuration)))
            .build();
    this.authUrlMockLambda = authUrlMockLambdaUrlOrigin.lambda;
    this.authUrlMockLambdaUrl = authUrlMockLambdaUrlOrigin.functionUrl;
    this.authUrlMockLambdaLogGroup = authUrlMockLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.authUrlMockLambdaUrlPath + "*", authUrlMockLambdaUrlOrigin.behaviorOptions);

    // authUrl - Google
    var authUrlGoogleLambdaEnv =
        new HashMap<>(
            Map.of(
                "DIY_SUBMIT_HOME_URL",
                builder.homeUrl,
                "DIY_SUBMIT_COGNITO_BASE_URI",
                cognitoBaseUri));
    if (this.userPool != null) {
      authUrlGoogleLambdaEnv.put(
          "DIY_SUBMIT_COGNITO_CLIENT_ID", this.userPoolClient.getUserPoolClientId());
    }
    // Provide Google client ID for direct-Google fallback when Cognito is not configured
    if (StringUtils.isNotBlank(builder.googleClientId)) {
      authUrlGoogleLambdaEnv.put("DIY_SUBMIT_GOOGLE_CLIENT_ID", builder.googleClientId);
    }
    var authUrlGoogleLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "AuthUrlGoogleLambda")
            .options(lambdaCommonOpts)
            .imageFilename("authUrlGoogle.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.authUrlGoogleLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .handler(builder.lambdaEntry + builder.authUrlGoogleLambdaHandlerFunctionName)
            .environment(authUrlGoogleLambdaEnv)
            .timeout(Duration.millis(Long.parseLong(builder.authUrlGoogleLambdaDuration)))
            .build();
    this.authUrlGoogleLambda = authUrlGoogleLambdaUrlOrigin.lambda;
    this.authUrlGoogleLambdaUrl = authUrlGoogleLambdaUrlOrigin.functionUrl;
    this.authUrlGoogleLambdaLogGroup = authUrlGoogleLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.authUrlGoogleLambdaUrlPath + "*", authUrlGoogleLambdaUrlOrigin.behaviorOptions);

    // exchangeToken - HMRC
    // Create a secret for the HMRC client secret and set the ARN to be used in the Lambda
    // environment variable
    // this.hmrcClientSecretsManagerSecret = Secret.Builder.create(this, "HmrcClientSecret")
    //        .secretStringValue(SecretValue.unsafePlainText(builder.hmrcClientSecret))
    //        .description("HMRC Client Secret for OAuth authentication")
    //        .build();
    // Look up the client secret by arn
    this.hmrcClientSecretsManagerSecret =
        Secret.fromSecretPartialArn(this, "HmrcClientSecret", builder.hmrcClientSecretArn);
    var hmrcClientSecretArn = this.hmrcClientSecretsManagerSecret.getSecretArn();
    var exchangeHmrcTokenLambdaEnv =
        new HashMap<>(
            Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri,
                "DIY_SUBMIT_HMRC_CLIENT_ID", builder.hmrcClientId,
                "DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", hmrcClientSecretArn));
    if (StringUtils.isNotBlank(builder.optionalTestAccessToken)) {
      exchangeHmrcTokenLambdaEnv.put(
          "DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
    }
    var exchangeHmrcTokenLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "ExchangeHmrcTokenLambda")
            .options(lambdaCommonOpts)
            .imageFilename("exchangeHmrcToken.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.exchangeHmrcTokenLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + builder.exchangeHmrcTokenLambdaHandlerFunctionName)
            .environment(exchangeHmrcTokenLambdaEnv)
            .timeout(Duration.millis(Long.parseLong(builder.exchangeHmrcTokenLambdaDuration)))
            .build();
    this.exchangeHmrcTokenLambda = exchangeHmrcTokenLambdaUrlOrigin.lambda;
    this.exchangeHmrcTokenLambdaUrl = exchangeHmrcTokenLambdaUrlOrigin.functionUrl;
    this.exchangeHmrcTokenLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.exchangeHmrcTokenLambdaUrlPath + "*",
        exchangeHmrcTokenLambdaUrlOrigin.behaviorOptions);
    this.hmrcClientSecretsManagerSecret.grantRead(this.exchangeHmrcTokenLambda);

    // exchangeToken - Google
    var exchangeGoogleTokenLambdaEnv =
        new HashMap<>(
            Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_COGNITO_BASE_URI", cognitoBaseUri,
                "DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN", googleClientSecretArn));
    if (this.userPool != null) {
      exchangeGoogleTokenLambdaEnv.put(
          "DIY_SUBMIT_COGNITO_CLIENT_ID", this.userPoolClient.getUserPoolClientId());
    }
    // Provide Google client ID for direct-Google fallback when Cognito is not configured
    if (StringUtils.isNotBlank(builder.googleClientId)) {
      exchangeGoogleTokenLambdaEnv.put("DIY_SUBMIT_GOOGLE_CLIENT_ID", builder.googleClientId);
    }
    if (StringUtils.isNotBlank(builder.optionalTestAccessToken)) {
      exchangeGoogleTokenLambdaEnv.put(
          "DIY_SUBMIT_TEST_ACCESS_TOKEN", builder.optionalTestAccessToken);
    }
    var exchangeGoogleTokenLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "ExchangeGoogleTokenLambda")
            .options(lambdaCommonOpts)
            .imageFilename("exchangeGoogleToken.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.exchangeGoogleTokenLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + builder.exchangeGoogleTokenLambdaHandlerFunctionName)
            .environment(exchangeGoogleTokenLambdaEnv)
            .timeout(
                Duration.millis(
                    Long.parseLong(
                        builder.exchangeGoogleTokenLambdaDuration != null
                            ? builder.exchangeGoogleTokenLambdaDuration
                            : "30000")))
            .build();
    this.exchangeGoogleTokenLambda = exchangeGoogleTokenLambdaUrlOrigin.lambda;
    this.exchangeGoogleTokenLambdaUrl = exchangeGoogleTokenLambdaUrlOrigin.functionUrl;
    this.exchangeGoogleTokenLambdaLogGroup = exchangeGoogleTokenLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.exchangeGoogleTokenLambdaUrlPath + "*",
        exchangeGoogleTokenLambdaUrlOrigin.behaviorOptions);
    this.googleClientSecretsManagerSecret.grantRead(this.exchangeGoogleTokenLambda);

    // submitVat
    var submitVatLambdaEnv =
        new HashMap<>(
            Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_HMRC_BASE_URI", builder.hmrcBaseUri));
    var submitVatLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "SubmitVatLambda")
            .options(lambdaCommonOpts)
            .imageFilename("submitVat.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.submitVatLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + builder.submitVatLambdaHandlerFunctionName)
            .environment(submitVatLambdaEnv)
            .timeout(Duration.millis(Long.parseLong(builder.submitVatLambdaDuration)))
            .build();
    this.submitVatLambda = submitVatLambdaUrlOrigin.lambda;
    this.submitVatLambdaUrl = submitVatLambdaUrlOrigin.functionUrl;
    this.submitVatLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.submitVatLambdaUrlPath + "*", submitVatLambdaUrlOrigin.behaviorOptions);

    var logReceiptLambdaEnv =
        new HashMap<>(
            Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", builder.receiptsBucketPostfix));
    if (StringUtils.isNotBlank(builder.optionalTestS3Endpoint)
            && StringUtils.isNotBlank(builder.optionalTestS3AccessKey)
        || StringUtils.isNotBlank(builder.optionalTestS3SecretKey)) {
      // For production like integrations without AWS we can use test S3 credentials
      var logReceiptLambdaTestEnv =
          new HashMap<>(
              Map.of(
                  "DIY_SUBMIT_TEST_S3_ENDPOINT", builder.optionalTestS3Endpoint,
                  "DIY_SUBMIT_TEST_S3_ACCESS_KEY", builder.optionalTestS3AccessKey,
                  "DIY_SUBMIT_TEST_S3_SECRET_KEY", builder.optionalTestS3SecretKey));
      logReceiptLambdaEnv.putAll(logReceiptLambdaTestEnv);
    }
    var logReceiptLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "LogReceiptLambda")
            .options(lambdaCommonOpts)
            .imageFilename("logReceipt.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.logReceiptLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + builder.logReceiptLambdaHandlerFunctionName)
            .environment(logReceiptLambdaEnv)
            .timeout(Duration.millis(Long.parseLong(builder.logReceiptLambdaDuration)))
            .build();
    this.logReceiptLambda = logReceiptLambdaUrlOrigin.lambda;
    this.logReceiptLambdaUrl = logReceiptLambdaUrlOrigin.functionUrl;
    this.logReceiptLambdaLogGroup = logReceiptLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.logReceiptLambdaUrlPath + "*", logReceiptLambdaUrlOrigin.behaviorOptions);

    // Create Bundle Management Lambda
    if (StringUtils.isNotBlank(builder.bundleLambdaHandlerFunctionName)) {
      var bundleLambdaEnv =
          new HashMap<>(
              Map.of(
                  "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                  "DIY_SUBMIT_BUNDLE_EXPIRY_DATE",
                      builder.bundleExpiryDate != null ? builder.bundleExpiryDate : "2025-12-31",
                  "DIY_SUBMIT_BUNDLE_USER_LIMIT",
                      builder.bundleUserLimit != null ? builder.bundleUserLimit : "1000"));

      if (this.userPool != null) {
        bundleLambdaEnv.put("DIY_SUBMIT_USER_POOL_ID", this.userPool.getUserPoolId());
      }

      var bundleLambdaUrlOrigin =
          LambdaUrlOrigin.Builder.create(this, "BundleLambda")
              .options(lambdaCommonOpts)
              .imageFilename("bundle.Dockerfile")
              .functionName(
                  Builder.buildFunctionName(
                      dashedDomainName, builder.bundleLambdaHandlerFunctionName))
              .allowedMethods(AllowedMethods.ALLOW_ALL)
              .handler(builder.lambdaEntry + builder.bundleLambdaHandlerFunctionName)
              .environment(bundleLambdaEnv)
              .timeout(
                  Duration.millis(
                      Long.parseLong(
                          builder.bundleLambdaDuration != null
                              ? builder.bundleLambdaDuration
                              : "30000")))
              .build();
      this.bundleLambda = bundleLambdaUrlOrigin.lambda;
      this.bundleLambdaUrl = bundleLambdaUrlOrigin.functionUrl;
      this.bundleLambdaLogGroup = bundleLambdaUrlOrigin.logGroup;
      lambdaUrlToOriginsBehaviourMappings.put(
          builder.bundleLambdaUrlPath + "*", bundleLambdaUrlOrigin.behaviorOptions);

      // Grant Cognito permissions to the bundle Lambda
      if (this.userPool != null) {
        this.bundleLambda.addToRolePolicy(
            PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(
                    List.of(
                        "cognito-idp:AdminGetUser",
                        "cognito-idp:AdminUpdateUserAttributes",
                        "cognito-idp:ListUsers"))
                .resources(List.of(this.userPool.getUserPoolArn()))
                .build());
      }
    }

    // Catalog Lambda
    // if (StringUtils.isNotBlank(builder.catalogLambdaHandlerFunctionName)) {
    var catalogLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
    var catalogLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "CatalogLambda")
            .options(lambdaCommonOpts)
            .imageFilename("getCatalog.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.catalogLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + builder.catalogLambdaHandlerFunctionName)
            .environment(catalogLambdaEnv)
            .timeout(
                Duration.millis(
                    Long.parseLong(
                        builder.catalogLambdaDuration != null
                            ? builder.catalogLambdaDuration
                            : "30000")))
            .build();
    this.catalogLambda = catalogLambdaUrlOrigin.lambda;
    this.catalogLambdaUrl = catalogLambdaUrlOrigin.functionUrl;
    this.catalogLambdaLogGroup = catalogLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.catalogLambdaUrlPath + "*", catalogLambdaUrlOrigin.behaviorOptions);
    // }

    // My Bundles Lambda
    // if (StringUtils.isNotBlank(builder.myBundlesLambdaHandlerFunctionName)) {
    var myBundlesLambdaEnv = new HashMap<>(Map.of("DIY_SUBMIT_HOME_URL", builder.homeUrl));
    var myBundlesLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "MyBundlesLambda")
            .options(lambdaCommonOpts)
            .imageFilename("myBundles.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.myBundlesLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + builder.myBundlesLambdaHandlerFunctionName)
            .environment(myBundlesLambdaEnv)
            .timeout(
                Duration.millis(
                    Long.parseLong(
                        builder.myBundlesLambdaDuration != null
                            ? builder.myBundlesLambdaDuration
                            : "30000")))
            .build();
    this.myBundlesLambda = myBundlesLambdaUrlOrigin.lambda;
    this.myBundlesLambdaUrl = myBundlesLambdaUrlOrigin.functionUrl;
    this.myBundlesLambdaLogGroup = myBundlesLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.myBundlesLambdaUrlPath + "*", myBundlesLambdaUrlOrigin.behaviorOptions);
    // }

    // myReceipts Lambda
    // if (StringUtils.isNotBlank(builder.myReceiptsLambdaHandlerFunctionName)) {
    var myReceiptsLambdaEnv =
        new HashMap<>(
            Map.of(
                "DIY_SUBMIT_HOME_URL", builder.homeUrl,
                "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", builder.receiptsBucketPostfix));
    var myReceiptsLambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(this, "MyReceiptsLambda")
            .options(lambdaCommonOpts)
            .imageFilename("myReceipts.Dockerfile")
            .functionName(
                Builder.buildFunctionName(
                    dashedDomainName, builder.myReceiptsLambdaHandlerFunctionName))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .handler(builder.lambdaEntry + builder.myReceiptsLambdaHandlerFunctionName)
            .environment(myReceiptsLambdaEnv)
            .timeout(
                Duration.millis(
                    Long.parseLong(
                        builder.myReceiptsLambdaDuration != null
                            ? builder.myReceiptsLambdaDuration
                            : "30000")))
            .build();
    this.myReceiptsLambda = myReceiptsLambdaUrlOrigin.lambda;
    this.myReceiptsLambdaUrl = myReceiptsLambdaUrlOrigin.functionUrl;
    this.myReceiptsLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
    lambdaUrlToOriginsBehaviourMappings.put(
        builder.myReceiptsLambdaUrlPath + "*", myReceiptsLambdaUrlOrigin.behaviorOptions);
    // }

    // Create receipts bucket for storing VAT submission receipts
    this.receiptsBucket =
        LogForwardingBucket.Builder.create(
                this,
                "ReceiptsBucket",
                builder.logS3ObjectEventHandlerSource,
                LogS3ObjectEvent.class)
            .bucketName(receiptsBucketFullName)
            .versioned(true)
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .objectOwnership(ObjectOwnership.OBJECT_WRITER)
            .autoDeleteObjects(!s3RetainReceiptsBucket)
            .functionNamePrefix("%s-receipts-bucket-".formatted(dashedDomainName))
            .retentionPeriodDays(2555) // 7 years for tax records as per HMRC requirements
            .cloudTrailEnabled(cloudTrailEnabled)
            .verboseLogging(verboseLogging)
            .removalPolicy(s3RetainReceiptsBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
            .build();
    this.receiptsBucket.grantWrite(this.logReceiptLambda);
    this.receiptsBucket.grantRead(this.myReceiptsLambda);

    // Add S3 event selector to the CloudTrail for receipts bucket
    // TODO Move to the LogForwardingBucket
    if (cloudTrailEnabled) {
      if (builder.cloudTrailEventSelectorPrefix == null
          || builder.cloudTrailEventSelectorPrefix.isBlank()
          || "none".equals(builder.cloudTrailEventSelectorPrefix)) {
        trail.addS3EventSelector(
            List.of(S3EventSelector.builder().bucket(this.receiptsBucket).build()));
      } else {
        trail.addS3EventSelector(
            List.of(
                S3EventSelector.builder()
                    .bucket(this.receiptsBucket)
                    .objectPrefix(builder.cloudTrailEventSelectorPrefix)
                    .build()));
      }
    } else {
      logger.info("CloudTrail is not enabled for the bucket.");
    }

    // Create a certificate for the website domain
    if (useExistingCertificate) {
      this.certificate =
          Certificate.fromCertificateArn(this, "Certificate", builder.certificateArn);
    } else {
      this.certificate =
          Certificate.Builder.create(this, "Certificate")
              .domainName(this.domainName)
              .certificateName(builder.certificateArn)
              .validation(CertificateValidation.fromDns(this.hostedZone))
              .transparencyLoggingEnabled(true)
              .build();
    }

    // Create the CloudFront distribution using a helper to preserve IDs and reduce inline noise
    var distWithLogging =
        DistributionWithLogging.Builder.create(this)
            .domainName(this.domainName)
            .defaultBehavior(s3BucketOriginBehaviour)
            .additionalBehaviors(lambdaUrlToOriginsBehaviourMappings)
            .defaultRootObject(builder.defaultDocumentAtOrigin)
            .errorPageKey(builder.error404NotFoundAtDistribution)
            .errorStatusCode(HttpStatus.SC_NOT_FOUND)
            .certificate(this.certificate)
            .logBucketName(distributionAccessLogBucketName)
            .logFunctionNamePrefix("%s-dist-access-".formatted(dashedDomainName))
            .logRetentionDays(accessLogGroupRetentionPeriodDays)
            .cloudTrailEnabled(cloudTrailEnabled)
            .logIncludesCookies(verboseLogging)
            .logHandlerSource(builder.logGzippedS3ObjectEventHandlerSource)
            .build();
    this.distributionAccessLogBucket = distWithLogging.logBucket;
    this.distribution = distWithLogging.distribution;

    Permission invokeFunctionUrlPermission =
        Permission.builder()
            .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
            .action("lambda:InvokeFunctionUrl")
            .functionUrlAuthType(functionUrlAuthType)
            .sourceArn(this.distribution.getDistributionArn()) // restrict to your distribution
            .build();
    authUrlHmrcLambda.addPermission("AuthLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
    exchangeHmrcTokenLambda.addPermission(
        "ExchangeTokenLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
    submitVatLambda.addPermission(
        "SubmitVatLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
    logReceiptLambda.addPermission(
        "LogReceiptLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
    if (this.bundleLambda != null)
      this.bundleLambda.addPermission(
          "BundleLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
    if (this.catalogLambda != null)
      this.catalogLambda.addPermission(
          "CatalogLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
    if (this.myBundlesLambda != null)
      this.myBundlesLambda.addPermission(
          "MyBundlesLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);

    this.distributionUrl = "https://%s/".formatted(this.distribution.getDomainName());
    logger.info("Distribution URL: %s".formatted(distributionUrl));

    // Generate submit.version file with commit hash if provided
    if (builder.commitHash != null && !builder.commitHash.isBlank()) {
      try {
        java.nio.file.Path sourceFilePath =
            java.nio.file.Paths.get(builder.docRootPath, "submit.version");
        java.nio.file.Files.writeString(sourceFilePath, builder.commitHash.trim());
        logger.info(
            "Created submit.version file with commit hash: %s".formatted(builder.commitHash));
      } catch (Exception e) {
        logger.warn("Failed to create submit.version file: %s".formatted(e.getMessage()));
      }
    } else {
      logger.info("No commit hash provided, skipping submit.version generation");
    }

    // Deploy the web website files to the web website bucket and invalidate distribution
    this.docRootSource =
        Source.asset(
            builder.docRootPath,
            AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
    logger.info("Will deploy files from: %s".formatted(builder.docRootPath));

    // Create LogGroup for BucketDeployment
    LogGroup bucketDeploymentLogGroup =
        LogGroup.Builder.create(this, "BucketDeploymentLogGroup")
            .logGroupName("/aws/lambda/bucket-deployment-%s".formatted(dashedDomainName))
            .retention(cloudTrailLogGroupRetentionPeriod)
            .removalPolicy(s3RetainOriginBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
            .build();

    this.deployment =
        BucketDeployment.Builder.create(this, "DocRootToOriginDeployment")
            .sources(List.of(this.docRootSource))
            .destinationBucket(this.originBucket)
            .distribution(this.distribution)
            .distributionPaths(List.of("/*"))
            .retainOnDelete(false)
            .logGroup(bucketDeploymentLogGroup)
            .expires(Expiration.after(Duration.minutes(5)))
            .prune(true)
            .build();

    // Create Route53 record for use with CloudFront distribution
    this.aRecord =
        ARecord.Builder.create(this, "ARecord-%s".formatted(dashedDomainName))
            .zone(this.hostedZone)
            .recordName(this.domainName)
            .deleteExisting(true)
            .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
            .build();
    this.aaaaRecord =
        AaaaRecord.Builder.create(this, "AaaaRecord-%s".formatted(dashedDomainName))
            .zone(this.hostedZone)
            .recordName(this.domainName)
            .deleteExisting(true)
            .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
            .build();

    // Create a certificate for Cognito
    if (useExistingAuthCertificate) {
      this.authCertificate =
          Certificate.fromCertificateArn(this, "AuthCertificate", builder.authCertificateArn);
    } else {
      this.authCertificate =
          Certificate.Builder.create(this, "AuthCertificate")
              .domainName(cognitoDomainName)
              .certificateName(builder.authCertificateArn)
              .validation(CertificateValidation.fromDns(this.hostedZone))
              .transparencyLoggingEnabled(true)
              .build();
    }

    // Create Cognito User Pool Domain only if userPool exists
    if (this.userPool != null) {
      this.userPoolDomain =
          UserPoolDomain.Builder.create(this, "UserPoolDomain")
              .userPool(this.userPool)
              .customDomain(
                  software.amazon.awscdk.services.cognito.CustomDomainOptions.builder()
                      .domainName(cognitoDomainName)
                      .certificate(this.authCertificate)
                      .build())
              .build();
      this.userPoolDomain.getNode().addDependency(this.aRecord);
      this.userPoolDomain.getNode().addDependency(this.aaaaRecord);

      // Create Route53 records for the Cognito UserPoolDomain
      this.userPoolDomainARecord =
          ARecord.Builder.create(
                  this, "UserPoolDomainARecord-%s".formatted(dashedCognitoDomainName))
              .zone(this.hostedZone)
              .recordName(cognitoDomainName)
              .deleteExisting(true)
              .target(RecordTarget.fromAlias(new UserPoolDomainTarget(this.userPoolDomain)))
              .build();
      this.userPoolDomainARecord.getNode().addDependency(this.aRecord);
      this.userPoolDomainAaaaRecord =
          AaaaRecord.Builder.create(
                  this, "UserPoolDomainAaaaRecord-%s".formatted(dashedCognitoDomainName))
              .zone(this.hostedZone)
              .recordName(cognitoDomainName)
              .deleteExisting(true)
              .target(RecordTarget.fromAlias(new UserPoolDomainTarget(this.userPoolDomain)))
              .build();
      this.userPoolDomainAaaaRecord.getNode().addDependency(this.aaaaRecord);
    }
  }
}
