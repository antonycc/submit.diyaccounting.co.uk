package co.uk.diyaccounting.submit;

public class WebAppProps {
  // Fields match cdk.json context keys (camelCase). Environment overrides are applied in WebApp selectively.
  // common
  public String env;
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
  public String logS3ObjectEventHandlerSource;
  public String logGzippedS3ObjectEventHandlerSource;
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
  public String authUrlLambdaUrlPath;
  public String authUrlHmrcLambdaHandlerFunctionName;
  public String authUrlHmrcLambdaDuration;
  public String authUrlMockLambdaUrlPath;
  public String authUrlMockLambdaHandlerFunctionName;
  public String authUrlMockLambdaDuration;
  public String authUrlGoogleLambdaUrlPath;
  public String authUrlGoogleLambdaHandlerFunctionName;
  public String authUrlGoogleLambdaDuration;
  public String authUrlAntonyccLambdaUrlPath;
  public String authUrlAntonyccLambdaHandlerFunctionName;
  public String authUrlAntonyccLambdaDuration;
  public String authUrlAcCogLambdaUrlPath;
  public String authUrlAcCogLambdaHandlerFunctionName;
  public String authUrlAcCogLambdaDuration;
  public String exchangeHmrcTokenLambdaUrlPath;
  public String exchangeHmrcTokenLambdaHandlerFunctionName;
  public String exchangeHmrcTokenLambdaDuration;
  public String exchangeGoogleTokenLambdaUrlPath;
  public String exchangeGoogleTokenLambdaHandlerFunctionName;
  public String exchangeGoogleTokenLambdaDuration;
  public String exchangeAntonyccTokenLambdaUrlPath;
  public String exchangeAntonyccTokenLambdaHandlerFunctionName;
  public String exchangeAntonyccTokenLambdaDuration;
  public String submitVatLambdaUrlPath;
  public String submitVatLambdaHandlerFunctionName;
  public String submitVatLambdaDuration;
  public String logReceiptLambdaUrlPath;
  public String logReceiptLambdaHandlerFunctionName;
  public String logReceiptLambdaDuration;
  public String lambdaUrlAuthType;
  public String commitHash;
  // Cognito / Google
  public String googleClientId;
  public String googleBaseUri;
  public String googleClientSecretArn;
  public String cognitoDomainPrefix;
  public String bundleLambdaUrlPath;
  public String bundleLambdaHandlerFunctionName;
  public String bundleLambdaDuration;
  public String bundleExpiryDate;
  public String bundleUserLimit;
  public String baseImageTag;
  public String cognitoFeaturePlan;
  public String cognitoEnableLogDelivery;
  public String logCognitoEventHandlerSource;
  public String myReceiptsLambdaUrlPath;
  public String myReceiptsLambdaHandlerFunctionName;
  public String myReceiptsLambdaDuration;
  public String antonyccClientId;
  public String antonyccBaseUri;
  public String acCogClientId;
  public String acCogBaseUri;
  public String authCertificateArn;

  public static class Builder {
    private final WebAppProps p = new WebAppProps();
    public static Builder create(){return new Builder();}
    public WebAppProps build(){return p;}
    public Builder set(String key, String value){
      try {
        var f = WebAppProps.class.getDeclaredField(key);
        f.setAccessible(true);
        f.set(p, value);
      } catch (Exception ignored) {}
      return this;
    }
  }
}
