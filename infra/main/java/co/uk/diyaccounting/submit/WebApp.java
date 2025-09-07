package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.ApplicationStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.IdentityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityStack;
import co.uk.diyaccounting.submit.stacks.WebStack;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.App;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.StackProps;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.lang.reflect.Field;
import java.text.MessageFormat;

public class WebApp {

    private static final Logger logger = LogManager.getLogger(WebApp.class);

    public static void main(final String[] args) {

    App app = new App();

    // TODO: Consult environment for all props in the builder / props file.

    // Load values from cdk.json here using reflection, then let the properties be overridden by the
    // mutators
    WebApp.Builder builder = WebApp.Builder.create(app, "WebApp");
    builder.loadContextValuesUsingReflection(app);

    String envName = System.getenv("ENV_NAME");

    String observabilityStackId = "SubmitObservabilityStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    ObservabilityStack observabilityStack =
        ObservabilityStack.Builder.create(app, observabilityStackId)
            .env(System.getenv("ENV_NAME"))
            .hostedZoneName(System.getenv("HOSTED_ZONE_NAME"))
            .subDomainName(System.getenv("SUB_DOMAIN_NAME"))
            .cloudTrailEnabled(System.getenv("CLOUD_TRAIL_ENABLED"))
                .xRayEnabled(System.getenv("X_RAY_ENABLED"))
                .cloudTrailLogGroupPrefix(System.getenv("CLOUD_TRAIL_LOG_GROUP_PREFIX"))
                .cloudTrailLogGroupRetentionPeriodDays(
                        System.getenv("CLOUD_TRAIL_LOG_GROUP_RETENTION_PERIOD_DAYS"))
            .build();



      // Create DevStack with resources only used during development or deployment (e.g. ECR)
    String devStackId = "SubmitDevStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    DevStack devStack =
        DevStack.Builder.create(app, devStackId)
            .env(System.getenv("ENV_NAME"))
            .hostedZoneName(System.getenv("HOSTED_ZONE_NAME"))
            .subDomainName(System.getenv("SUB_DOMAIN_NAME"))
            .retainEcrRepository(System.getenv("RETAIN_ECR_REPOSITORY"))
            .build();

    // Create the identity stack before any user aware services
    String identityStackId = "SubmitIdentityStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    IdentityStack identityStack =
        IdentityStack.Builder.create(app, identityStackId)
            .env(System.getenv("ENV_NAME"))
            .authCertificateArn(System.getenv("AUTH_CERTIFICATE_ARN"))
            .cognitoFeaturePlan(System.getenv("DIY_SUBMIT_COGNITO_FEATURE_PLAN"))
            .cognitoEnableLogDelivery(System.getenv("DIY_SUBMIT_ENABLE_LOG_DELIVERY"))
            .logCognitoEventHandlerSource(System.getenv("LOG_COGNITO_EVENT_HANDLER_SOURCE"))
            .googleClientId(System.getenv("DIY_SUBMIT_GOOGLE_CLIENT_ID"))
            .googleClientSecretArn(System.getenv("DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN"))
            .cognitoDomainPrefix(System.getenv("DIY_SUBMIT_COGNITO_DOMAIN_PREFIX"))
            .antonyccClientId(System.getenv("DIY_SUBMIT_ANTONYCC_CLIENT_ID"))
            .antonyccBaseUri(System.getenv("DIY_SUBMIT_ANTONYCC_BASE_URI"))
            //.antonyccClientSecretArn(System.getenv("DIY_SUBMIT_ANTONYCC_CLIENT_SECRET_ARN"))
            .acCogClientId(System.getenv("DIY_SUBMIT_AC_COG_CLIENT_ID"))
            .acCogBaseUri(System.getenv("DIY_SUBMIT_AC_COG_BASE_URI"))
            //.acCogClientSecretArn(System.getenv("DIY_SUBMIT_AC_COG_CLIENT_SECRET_ARN"))
            .build();

    // Create the ApplicationStack
    String applicationStackId = "SubmitApplicationStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    ApplicationStack applicationStack = ApplicationStack.Builder.create(app, applicationStackId)
            .env(System.getenv("ENV_NAME"))
            .hostedZoneName(System.getenv("HOSTED_ZONE_NAME"))
            .subDomainName(System.getenv("SUB_DOMAIN_NAME"))
            .cloudTrailEnabled(System.getenv("CLOUD_TRAIL_ENABLED"))
            .xRayEnabled(System.getenv("X_RAY_ENABLED"))
            .build();

    // Create WebStack with resources used in running the application
    String webStackId = "SubmitWebStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    WebStack webStack =
        WebStack.Builder.create(app, webStackId)
            .env(System.getenv("ENV_NAME"))
            .hostedZoneName(System.getenv("HOSTED_ZONE_NAME"))
            .hostedZoneId(System.getenv("HOSTED_ZONE_ID"))
            .subDomainName(System.getenv("SUB_DOMAIN_NAME"))
            .certificateArn(System.getenv("CERTIFICATE_ARN"))
            .userPoolArn(identityStack.userPool.getUserPoolArn())
            .cloudTrailEnabled(System.getenv("CLOUD_TRAIL_ENABLED"))
            .trail(observabilityStack.trail)
            .xRayEnabled(System.getenv("X_RAY_ENABLED"))
            .verboseLogging(System.getenv("VERBOSE_LOGGING"))
            .cloudTrailLogGroupRetentionPeriodDays(
                System.getenv("CLOUD_TRAIL_LOG_GROUP_RETENTION_PERIOD_DAYS"))
            .accessLogGroupRetentionPeriodDays(
                System.getenv("ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS"))
            .s3UseExistingBucket(System.getenv("USE_EXISTING_BUCKET"))
            .s3RetainOriginBucket(System.getenv("RETAIN_ORIGIN_BUCKET"))
            .s3RetainReceiptsBucket(System.getenv("RETAIN_RECEIPTS_BUCKET"))
            .cloudTrailEventSelectorPrefix(System.getenv("OBJECT_PREFIX"))
            .logS3ObjectEventHandlerSource(System.getenv("LOG_S3_OBJECT_EVENT_HANDLER_SOURCE"))
            .logGzippedS3ObjectEventHandlerSource(
                System.getenv("LOG_GZIPPED_S3_OBJECT_EVENT_HANDLER_SOURCE"))
            .docRootPath(System.getenv("DOC_ROOT_PATH"))
            .defaultDocumentAtOrigin(System.getenv("DEFAULT_HTML_DOCUMENT"))
            .error404NotFoundAtDistribution(System.getenv("ERROR_HTML_DOCUMENT"))
            .skipLambdaUrlOrigins(System.getenv("SKIP_LAMBDA_URL_ORIGINS"))
            .hmrcClientId(System.getenv("DIY_SUBMIT_HMRC_CLIENT_ID"))
            .hmrcClientSecretArn(System.getenv("DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN"))
            .homeUrl(System.getenv("DIY_SUBMIT_HOME_URL"))
            .hmrcBaseUri(System.getenv("DIY_SUBMIT_HMRC_BASE_URI"))
            .optionalTestAccessToken(System.getenv("DIY_SUBMIT_TEST_ACCESS_TOKEN"))
            .optionalTestS3Endpoint(System.getenv("DIY_SUBMIT_TEST_S3_ENDPOINT"))
            .optionalTestS3AccessKey(System.getenv("DIY_SUBMIT_TEST_S3_ACCESS_KEY"))
            .optionalTestS3SecretKey(System.getenv("DIY_SUBMIT_TEST_S3_SECRET_KEY"))
            .receiptsBucketPostfix(System.getenv("DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX"))
            .lambdaEntry(System.getenv("LAMBDA_ENTRY"))
            .authUrlHmrcLambdaHandlerFunctionName(
                System.getenv("AUTH_URL_LAMBDA_HANDLER_FUNCTION_NAME"))
            .authUrlHmrcLambdaUrlPath(System.getenv("AUTH_URL_LAMBDA_URL_PATH"))
            .authUrlHmrcLambdaDurationMillis(System.getenv("AUTH_URL_LAMBDA_DURATION"))
            .authUrlMockLambdaHandlerFunctionName(
                System.getenv("AUTH_URL_MOCK_LAMBDA_HANDLER_FUNCTION_NAME"))
            .authUrlMockLambdaUrlPath(System.getenv("AUTH_URL_MOCK_LAMBDA_URL_PATH"))
            .authUrlMockLambdaDurationMillis(System.getenv("AUTH_URL_MOCK_LAMBDA_DURATION"))
            .authUrlGoogleLambdaHandlerFunctionName(
                System.getenv("AUTH_URL_GOOGLE_LAMBDA_HANDLER_FUNCTION_NAME"))
            .authUrlGoogleLambdaUrlPath(System.getenv("AUTH_URL_GOOGLE_LAMBDA_URL_PATH"))
            .authUrlGoogleLambdaDurationMillis(System.getenv("AUTH_URL_GOOGLE_LAMBDA_DURATION"))
            .authUrlAntonyccLambdaHandlerFunctionName(
                System.getenv("AUTH_URL_ANTONYCC_LAMBDA_HANDLER_FUNCTION_NAME"))
            .authUrlAntonyccLambdaUrlPath(System.getenv("AUTH_URL_ANTONYCC_LAMBDA_URL_PATH"))
            .authUrlAntonyccLambdaDurationMillis(System.getenv("AUTH_URL_ANTONYCC_LAMBDA_DURATION"))
            .authUrlAcCogLambdaHandlerFunctionName(
                    System.getenv("AUTH_URL_AC_COG_LAMBDA_HANDLER_FUNCTION_NAME"))
            .authUrlAcCogLambdaUrlPath(System.getenv("AUTH_URL_AC_COG_LAMBDA_URL_PATH"))
            .authUrlAcCogLambdaDurationMillis(System.getenv("AUTH_URL_AC_COG_LAMBDA_DURATION"))
            .exchangeHmrcTokenLambdaHandlerFunctionName(
                System.getenv("EXCHANGE_HMRC_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME"))
            .exchangeHmrcTokenLambdaUrlPath(System.getenv("EXCHANGE_HMRC_TOKEN_LAMBDA_URL_PATH"))
            .exchangeHmrcTokenLambdaDurationMillis(
                System.getenv("EXCHANGE_HMRC_TOKEN_LAMBDA_DURATION"))
            .exchangeGoogleTokenLambdaHandlerFunctionName(
                System.getenv("EXCHANGE_GOOGLE_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME"))
            .exchangeGoogleTokenLambdaUrlPath(
                System.getenv("EXCHANGE_GOOGLE_TOKEN_LAMBDA_URL_PATH"))
            .exchangeGoogleTokenLambdaDurationMillis(
                System.getenv("EXCHANGE_GOOGLE_TOKEN_LAMBDA_DURATION"))
            .exchangeAntonyccTokenLambdaHandlerFunctionName(
                System.getenv("EXCHANGE_ANTONYCC_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME"))
            .exchangeAntonyccTokenLambdaUrlPath(
                System.getenv("EXCHANGE_ANTONYCC_TOKEN_LAMBDA_URL_PATH"))
            .exchangeAntonyccTokenLambdaDurationMillis(
                System.getenv("EXCHANGE_ANTONYCC_TOKEN_LAMBDA_DURATION"))
            .submitVatLambdaHandlerFunctionName(
                System.getenv("SUBMIT_VAT_LAMBDA_HANDLER_FUNCTION_NAME"))
            .submitVatLambdaUrlPath(System.getenv("SUBMIT_VAT_LAMBDA_URL_PATH"))
            .submitVatLambdaDurationMillis(System.getenv("SUBMIT_VAT_LAMBDA_DURATION"))
            .logReceiptLambdaHandlerFunctionName(
                System.getenv("LOG_RECEIPT_LAMBDA_HANDLER_FUNCTION_NAME"))
            .logReceiptLambdaUrlPath(System.getenv("LOG_RECEIPT_LAMBDA_URL_PATH"))
            .logReceiptLambdaDurationMillis(System.getenv("LOG_RECEIPT_LAMBDA_DURATION"))
            .lambdaUrlAuthType(System.getenv("LAMBDA_URL_AUTH_TYPE"))
            .commitHash(System.getenv("COMMIT_HASH"))
            // Cognito and Bundle Management configuration
            .googleClientId(System.getenv("DIY_SUBMIT_GOOGLE_CLIENT_ID"))
            .googleBaseUri(System.getenv("DIY_SUBMIT_GOOGLE_BASE_URI"))
            .googleClientSecretArn(System.getenv("DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN"))
            .cognitoDomainPrefix(System.getenv("DIY_SUBMIT_COGNITO_DOMAIN_PREFIX"))
            .bundleExpiryDate(System.getenv("DIY_SUBMIT_BUNDLE_EXPIRY_DATE"))
            .bundleUserLimit(System.getenv("DIY_SUBMIT_BUNDLE_USER_LIMIT"))
            .bundleLambdaHandlerFunctionName(System.getenv("BUNDLE_LAMBDA_HANDLER_FUNCTION_NAME"))
            .bundleLambdaUrlPath(System.getenv("BUNDLE_LAMBDA_URL_PATH"))
            .bundleLambdaDurationMillis(System.getenv("BUNDLE_LAMBDA_DURATION"))
            .baseImageTag(System.getenv("BASE_IMAGE_TAG"))
            // Cognito advanced security/logging flags
            .cognitoFeaturePlan(System.getenv("DIY_SUBMIT_COGNITO_FEATURE_PLAN"))
            .cognitoEnableLogDelivery(System.getenv("DIY_SUBMIT_ENABLE_LOG_DELIVERY"))
            .logCognitoEventHandlerSource(System.getenv("LOG_COGNITO_EVENT_HANDLER_SOURCE"))
            .myReceiptsLambdaHandlerFunctionName(
                System.getenv("MY_RECEIPTS_LAMBDA_HANDLER_FUNCTION_NAME"))
            .myReceiptsLambdaUrlPath(System.getenv("MY_RECEIPTS_LAMBDA_URL_PATH"))
            .myReceiptsLambdaDurationMillis(System.getenv("MY_RECEIPTS_LAMBDA_DURATION"))
            .antonyccClientId(System.getenv("DIY_SUBMIT_ANTONYCC_CLIENT_ID"))
            .antonyccBaseUri(System.getenv("DIY_SUBMIT_ANTONYCC_BASE_URI"))
            .acCogClientId(System.getenv("DIY_SUBMIT_AC_COG_CLIENT_ID"))
            .acCogBaseUri(System.getenv("DIY_SUBMIT_AC_COG_BASE_URI"))
            //.antonyccClientSecretArn(System.getenv("DIY_SUBMIT_ANTONYCC_CLIENT_SECRET_ARN"))
            //.acCogClientSecretArn(System.getenv("DIY_SUBMIT_AC_COG_CLIENT_SECRET_ARN"))
            .build();

    // DevStack outputs
    CfnOutput.Builder.create(devStack, "DevStackEcrRepositoryArn")
        .value(devStack.ecrRepository.getRepositoryArn())
        .build();

    CfnOutput.Builder.create(devStack, "DevStackEcrRepositoryUri")
        .value(devStack.ecrRepository.getRepositoryUri())
        .build();

    CfnOutput.Builder.create(devStack, "DevStackEcrLogGroupArn")
        .value(devStack.ecrLogGroup.getLogGroupArn())
        .build();

    CfnOutput.Builder.create(devStack, "DevStackEcrPublishRoleArn")
        .value(devStack.ecrPublishRole.getRoleArn())
        .build();

    // WebStack outputs

    CfnOutput.Builder.create(webStack, "OriginBucketArn")
        .value(webStack.originBucket.getBucketArn())
        .build();

    CfnOutput.Builder.create(webStack, "OriginAccessLogBucketArn")
        .value(webStack.originAccessLogBucket.getBucketArn())
        .build();

    CfnOutput.Builder.create(webStack, "DistributionAccessLogBucketArn")
        .value(webStack.distributionAccessLogBucket.getBucketArn())
        .build();

    CfnOutput.Builder.create(webStack, "DistributionId")
        .value(webStack.distribution.getDistributionId())
        .build();

    CfnOutput.Builder.create(webStack, "HostedZoneId")
        .value(webStack.hostedZone.getHostedZoneId())
        .build();

    CfnOutput.Builder.create(webStack, "CertificateArn")
        .value(webStack.certificate.getCertificateArn())
        .build();

    CfnOutput.Builder.create(webStack, "HmrcClientSecretsManagerSecretArn")
        .value(webStack.hmrcClientSecretsManagerSecret.getSecretArn())
        .build();

    // Cognito Hosted UI and Google IdP redirect URI for troubleshooting OAuth redirect mismatch
    if (webStack.cognitoBaseUri != null) {
      CfnOutput.Builder.create(webStack, "CognitoBaseUri").value(webStack.cognitoBaseUri).build();
      CfnOutput.Builder.create(webStack, "CognitoGoogleIdpRedirectUri")
          .value(webStack.cognitoBaseUri + "/oauth2/idpresponse")
          .build();
    }

    //CfnOutput.Builder.create(webStack, "GoogleClientSecretsManagerSecretArn")
    //    .value(webStack.googleClientSecretsManagerSecret.getSecretArn())
    //    .build();

    CfnOutput.Builder.create(webStack, "ARecord").value(webStack.aRecord.getDomainName()).build();

    CfnOutput.Builder.create(webStack, "AaaaRecord").value(webStack.aaaaRecord.getDomainName()).build();

    if (observabilityStack.trail != null) {
      CfnOutput.Builder.create(webStack, "TrailBucketArn")
          .value(observabilityStack.trailBucket.getBucketArn())
          .build();

      CfnOutput.Builder.create(webStack, "TrailArn").value(observabilityStack.trail.getTrailArn()).build();
    }

    CfnOutput.Builder.create(webStack, "AuthUrlHmrcLambdaArn")
        .value(webStack.authUrlHmrcLambda.getFunctionArn())
        .build();

    CfnOutput.Builder.create(webStack, "AuthUrlHmrcLambdaUrl")
        .value(webStack.authUrlHmrcLambdaUrl.getUrl())
        .build();

    CfnOutput.Builder.create(webStack, "AuthUrlMockLambdaArn")
        .value(webStack.authUrlMockLambda.getFunctionArn())
        .build();

    CfnOutput.Builder.create(webStack, "AuthUrlMockLambdaUrl")
        .value(webStack.authUrlMockLambdaUrl.getUrl())
        .build();

    CfnOutput.Builder.create(webStack, "AuthUrlGoogleLambdaArn")
        .value(webStack.authUrlGoogleLambda.getFunctionArn())
        .build();

    CfnOutput.Builder.create(webStack, "AuthUrlGoogleLambdaUrl")
        .value(webStack.authUrlGoogleLambdaUrl.getUrl())
        .build();

    CfnOutput.Builder.create(webStack, "ExchangeHmrcTokenLambdaArn")
        .value(webStack.exchangeHmrcTokenLambda.getFunctionArn())
        .build();

    CfnOutput.Builder.create(webStack, "ExchangeHmrcTokenLambdaUrl")
        .value(webStack.exchangeHmrcTokenLambdaUrl.getUrl())
        .build();

    CfnOutput.Builder.create(webStack, "ExchangeGoogleTokenLambdaArn")
        .value(webStack.exchangeGoogleTokenLambda.getFunctionArn())
        .build();

    CfnOutput.Builder.create(webStack, "ExchangeGoogleTokenLambdaUrl")
        .value(webStack.exchangeGoogleTokenLambdaUrl.getUrl())
        .build();

    CfnOutput.Builder.create(webStack, "SubmitVatLambdaArn")
        .value(webStack.submitVatLambda.getFunctionArn())
        .build();

    CfnOutput.Builder.create(webStack, "SubmitVatLambdaUrl")
        .value(webStack.submitVatLambdaUrl.getUrl())
        .build();

    CfnOutput.Builder.create(webStack, "LogReceiptLambdaArn")
        .value(webStack.logReceiptLambda.getFunctionArn())
        .build();

    CfnOutput.Builder.create(webStack, "LogReceiptLambdaUrl")
        .value(webStack.logReceiptLambdaUrl.getUrl())
        .build();

    // Cognito outputs (only if Cognito is configured)
    if (identityStack.userPool != null) {
      CfnOutput.Builder.create(identityStack, "UserPoolId").value(identityStack.userPool.getUserPoolId()).build();

      CfnOutput.Builder.create(identityStack, "UserPoolArn").value(identityStack.userPool.getUserPoolArn()).build();

      CfnOutput.Builder.create(identityStack, "UserPoolClientId")
          .value(identityStack.userPoolClient.getUserPoolClientId())
          .build();

      CfnOutput.Builder.create(identityStack, "UserPoolDomainName")
          .value(identityStack.userPoolDomain.getDomainName())
          .build();

      CfnOutput.Builder.create(identityStack, "UserPoolDomainARecord")
          .value(identityStack.userPoolDomainARecord.getDomainName())
          .build();

      CfnOutput.Builder.create(webStack, "UserPoolDomainAaaaRecord")
          .value(identityStack.userPoolDomainAaaaRecord.getDomainName())
          .build();
      // Conditionally show identity providers
        if (identityStack.googleIdentityProvider != null) {
            CfnOutput.Builder.create(identityStack, "CognitoGoogleIdpId")
                .value(identityStack.googleIdentityProvider.getProviderName())
                .build();
        }
        if (identityStack.acCogIdentityProvider != null) {
            CfnOutput.Builder.create(identityStack, "CognitoAntonyccIdpId")
                .value(identityStack.acCogIdentityProvider.getProviderName())
                .build();
        }
    }

    // Bundle Lambda outputs (only if bundle Lambda is configured)
    if (webStack.bundleLambda != null) {
      CfnOutput.Builder.create(webStack, "BundleLambdaArn")
          .value(webStack.bundleLambda.getFunctionArn())
          .build();

      CfnOutput.Builder.create(webStack, "BundleLambdaUrl")
          .value(webStack.bundleLambdaUrl.getUrl())
          .build();
    }

    // My Receipts Lambda outputs (only if my receipts Lambda is configured)
    if (webStack.myReceiptsLambda != null) {
      CfnOutput.Builder.create(webStack, "MyReceiptsLambdaArn")
          .value(webStack.myReceiptsLambda.getFunctionArn())
          .build();

      CfnOutput.Builder.create(webStack, "MyReceiptsLambdaUrl")
          .value(webStack.myReceiptsLambdaUrl.getUrl())
          .build();
    }

    app.synth();
  }

    public static class Builder {
        public Construct scope;
        public String id;
        public StackProps props;

        public Builder(Construct scope, String id, StackProps props) {
            this.scope = scope;
            this.id = id;
            this.props = props;
        }

        public static WebApp.Builder create(Construct scope, String id) {
            return new WebApp.Builder(scope, id, null);
        }

        public static WebApp.Builder create(Construct scope, String id, StackProps props) {
            return new WebApp.Builder(scope, id, props);
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
    }
}
