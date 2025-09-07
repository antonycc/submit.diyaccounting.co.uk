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

    // Build app-level props from cdk.json context with environment overrides
    WebApp.Builder builder = WebApp.Builder.create(app, "WebApp");
    WebAppProps appProps = loadAppProps(builder, app);

    String envName = appProps.ENV_NAME;

    String observabilityStackId = "SubmitObservabilityStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    ObservabilityStack observabilityStack =
        ObservabilityStack.Builder.create(app, observabilityStackId)
            .props(co.uk.diyaccounting.submit.stacks.ObservabilityStackProps.builder()
                .env(appProps.ENV_NAME)
                //.hostedZoneName(appProps.HOSTED_ZONE_NAME)
                //.subDomainName(appProps.SUB_DOMAIN_NAME)
                //.cloudTrailEnabled(appProps.CLOUD_TRAIL_ENABLED)
                //.xRayEnabled(appProps.X_RAY_ENABLED)
                //.cloudTrailLogGroupPrefix(appProps.CLOUD_TRAIL_LOG_GROUP_PREFIX)
                //.cloudTrailLogGroupRetentionPeriodDays(appProps.CLOUD_TRAIL_LOG_GROUP_RETENTION_PERIOD_DAYS)
                //.accessLogGroupRetentionPeriodDays(appProps.ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS)
                .build())
            .build();

      // Create DevStack with resources only used during development or deployment (e.g. ECR)
    String devStackId = "SubmitDevStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    DevStack devStack =
        DevStack.Builder.create(app, devStackId)
            .props(co.uk.diyaccounting.submit.stacks.DevStackProps.builder()
                .env(appProps.ENV_NAME)
                //.hostedZoneName(appProps.HOSTED_ZONE_NAME)
                //.subDomainName(appProps.SUB_DOMAIN_NAME)
                //.retainEcrRepository(System.getenv("RETAIN_ECR_REPOSITORY"))
                .build())
            .build();

    // Create the identity stack before any user aware services
    String identityStackId = "SubmitIdentityStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    IdentityStack identityStack =
        IdentityStack.Builder.create(app, identityStackId)
            .props(co.uk.diyaccounting.submit.stacks.IdentityStackProps.builder()
                .env(appProps.ENV_NAME)
                //.hostedZoneName(appProps.HOSTED_ZONE_NAME)
                //.hostedZoneId(appProps.HOSTED_ZONE_ID)
                //.subDomainName(appProps.SUB_DOMAIN_NAME)
                .authCertificateArn(appProps.AUTH_CERTIFICATE_ARN)
                //.cognitoFeaturePlan(appProps.DIY_SUBMIT_COGNITO_FEATURE_PLAN)
                //.cognitoEnableLogDelivery(appProps.DIY_SUBMIT_ENABLE_LOG_DELIVERY)
                //.logCognitoEventHandlerSource(appProps.LOG_COGNITO_EVENT_HANDLER_SOURCE)
                .googleClientId(appProps.DIY_SUBMIT_GOOGLE_CLIENT_ID)
                .googleClientSecretArn(appProps.DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN)
                //.cognitoDomainPrefix(appProps.DIY_SUBMIT_COGNITO_DOMAIN_PREFIX)
                .antonyccClientId(appProps.DIY_SUBMIT_ANTONYCC_CLIENT_ID)
                .antonyccBaseUri(appProps.DIY_SUBMIT_ANTONYCC_BASE_URI)
                .acCogClientId(appProps.DIY_SUBMIT_AC_COG_CLIENT_ID)
                .acCogBaseUri(appProps.DIY_SUBMIT_AC_COG_BASE_URI)
                .build())
            .build();

    // Create the ApplicationStack
    String applicationStackId = "SubmitApplicationStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    ApplicationStack applicationStack = ApplicationStack.Builder.create(app, applicationStackId)
            .props(co.uk.diyaccounting.submit.stacks.ApplicationStackProps.builder()
                .env(appProps.ENV_NAME)
                //.hostedZoneName(appProps.HOSTED_ZONE_NAME)
                .subDomainName(appProps.SUB_DOMAIN_NAME)
                //.cloudTrailEnabled(appProps.CLOUD_TRAIL_ENABLED)
                //.xRayEnabled(appProps.X_RAY_ENABLED)
                .build())
            .build();

    // Create WebStack with resources used in running the application
    String webStackId = "SubmitWebStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    WebStack webStack =
        WebStack.Builder.create(app, webStackId)
            .props(co.uk.diyaccounting.submit.stacks.WebStackProps.builder()
                .env(appProps.ENV_NAME)
                //.hostedZoneName(appProps.HOSTED_ZONE_NAME)
                //.hostedZoneId(appProps.HOSTED_ZONE_ID)
                //.subDomainName(appProps.SUB_DOMAIN_NAME)
                .certificateArn(appProps.CERTIFICATE_ARN)
                .userPoolArn(identityStack.userPool != null ? identityStack.userPool.getUserPoolArn() : null)
                //.cloudTrailEnabled(appProps.CLOUD_TRAIL_ENABLED)
                //.xRayEnabled(appProps.X_RAY_ENABLED)
                //.verboseLogging(appProps.VERBOSE_LOGGING)
                //.cloudTrailLogGroupRetentionPeriodDays(appProps.CLOUD_TRAIL_LOG_GROUP_RETENTION_PERIOD_DAYS)
                //.accessLogGroupRetentionPeriodDays(appProps.ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS)
                //.s3UseExistingBucket(appProps.USE_EXISTING_BUCKET)
                //.s3RetainOriginBucket(appProps.RETAIN_ORIGIN_BUCKET)
                //.s3RetainReceiptsBucket(appProps.RETAIN_RECEIPTS_BUCKET)
                //.cloudTrailEventSelectorPrefix(appProps.OBJECT_PREFIX)
                //.logS3ObjectEventHandlerSource(appProps.LOG_S3_OBJECT_EVENT_HANDLER_SOURCE)
                //.logGzippedS3ObjectEventHandlerSource(appProps.LOG_GZIPPED_S3_OBJECT_EVENT_HANDLER_SOURCE)
                //.docRootPath(appProps.DOC_ROOT_PATH)
                //.defaultDocumentAtOrigin(appProps.DEFAULT_HTML_DOCUMENT)
                //.error404NotFoundAtDistribution(appProps.ERROR_HTML_DOCUMENT)
                //.skipLambdaUrlOrigins(appProps.SKIP_LAMBDA_URL_ORIGINS)
                .hmrcClientId(appProps.DIY_SUBMIT_HMRC_CLIENT_ID)
                .hmrcClientSecretArn(appProps.DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN)
                .homeUrl(appProps.DIY_SUBMIT_HOME_URL)
                .hmrcBaseUri(appProps.DIY_SUBMIT_HMRC_BASE_URI)
                .optionalTestAccessToken(appProps.DIY_SUBMIT_TEST_ACCESS_TOKEN)
                .optionalTestS3Endpoint(appProps.DIY_SUBMIT_TEST_S3_ENDPOINT)
                .optionalTestS3AccessKey(appProps.DIY_SUBMIT_TEST_S3_ACCESS_KEY)
                .optionalTestS3SecretKey(appProps.DIY_SUBMIT_TEST_S3_SECRET_KEY)
                .receiptsBucketPostfix(appProps.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX)
                //.lambdaEntry(appProps.LAMBDA_ENTRY)
                //.authUrlHmrcLambdaHandlerFunctionName(appProps.AUTH_URL_LAMBDA_HANDLER_FUNCTION_NAME)
                //.authUrlHmrcLambdaUrlPath(appProps.AUTH_URL_LAMBDA_URL_PATH)
                //.authUrlHmrcLambdaDurationMillis(appProps.AUTH_URL_LAMBDA_DURATION)
                //.authUrlMockLambdaHandlerFunctionName(appProps.AUTH_URL_MOCK_LAMBDA_HANDLER_FUNCTION_NAME)
                //.authUrlMockLambdaUrlPath(appProps.AUTH_URL_MOCK_LAMBDA_URL_PATH)
                //.authUrlMockLambdaDurationMillis(appProps.AUTH_URL_MOCK_LAMBDA_DURATION)
                //.authUrlGoogleLambdaHandlerFunctionName(appProps.AUTH_URL_GOOGLE_LAMBDA_HANDLER_FUNCTION_NAME)
                //.authUrlGoogleLambdaUrlPath(appProps.AUTH_URL_GOOGLE_LAMBDA_URL_PATH)
                //.authUrlGoogleLambdaDurationMillis(appProps.AUTH_URL_GOOGLE_LAMBDA_DURATION)
                //.authUrlAntonyccLambdaHandlerFunctionName(appProps.AUTH_URL_ANTONYCC_LAMBDA_HANDLER_FUNCTION_NAME)
                //.authUrlAntonyccLambdaUrlPath(appProps.AUTH_URL_ANTONYCC_LAMBDA_URL_PATH)
                //.authUrlAntonyccLambdaDurationMillis(appProps.AUTH_URL_ANTONYCC_LAMBDA_DURATION)
                //.authUrlAcCogLambdaHandlerFunctionName(appProps.AUTH_URL_AC_COG_LAMBDA_HANDLER_FUNCTION_NAME)
                //.authUrlAcCogLambdaUrlPath(appProps.AUTH_URL_AC_COG_LAMBDA_URL_PATH)
                //.authUrlAcCogLambdaDurationMillis(appProps.AUTH_URL_AC_COG_LAMBDA_DURATION)
                //.exchangeHmrcTokenLambdaHandlerFunctionName(appProps.EXCHANGE_HMRC_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME)
                //.exchangeHmrcTokenLambdaUrlPath(appProps.EXCHANGE_HMRC_TOKEN_LAMBDA_URL_PATH)
                //.exchangeHmrcTokenLambdaDurationMillis(appProps.EXCHANGE_HMRC_TOKEN_LAMBDA_DURATION)
                //.exchangeGoogleTokenLambdaHandlerFunctionName(appProps.EXCHANGE_GOOGLE_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME)
                //.exchangeGoogleTokenLambdaUrlPath(appProps.EXCHANGE_GOOGLE_TOKEN_LAMBDA_URL_PATH)
                //.exchangeGoogleTokenLambdaDurationMillis(appProps.EXCHANGE_GOOGLE_TOKEN_LAMBDA_DURATION)
                //.exchangeAntonyccTokenLambdaHandlerFunctionName(appProps.EXCHANGE_ANTONYCC_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME)
                //.exchangeAntonyccTokenLambdaUrlPath(appProps.EXCHANGE_ANTONYCC_TOKEN_LAMBDA_URL_PATH)
                //.exchangeAntonyccTokenLambdaDurationMillis(appProps.EXCHANGE_ANTONYCC_TOKEN_LAMBDA_DURATION)
                //.submitVatLambdaHandlerFunctionName(appProps.SUBMIT_VAT_LAMBDA_HANDLER_FUNCTION_NAME)
                //.submitVatLambdaUrlPath(appProps.SUBMIT_VAT_LAMBDA_URL_PATH)
                //.submitVatLambdaDurationMillis(appProps.SUBMIT_VAT_LAMBDA_DURATION)
                //.logReceiptLambdaHandlerFunctionName(appProps.LOG_RECEIPT_LAMBDA_HANDLER_FUNCTION_NAME)
                //.logReceiptLambdaUrlPath(appProps.LOG_RECEIPT_LAMBDA_URL_PATH)
                //.logReceiptLambdaDurationMillis(appProps.LOG_RECEIPT_LAMBDA_DURATION)
                //.lambdaUrlAuthType(appProps.LAMBDA_URL_AUTH_TYPE)
                .commitHash(appProps.COMMIT_HASH)
                .googleClientId(appProps.DIY_SUBMIT_GOOGLE_CLIENT_ID)
                .googleBaseUri(appProps.DIY_SUBMIT_GOOGLE_BASE_URI)
                .googleClientSecretArn(appProps.DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN)
                .cognitoDomainPrefix(appProps.DIY_SUBMIT_COGNITO_DOMAIN_PREFIX)
                //.bundleExpiryDate(appProps.DIY_SUBMIT_BUNDLE_EXPIRY_DATE)
                //.bundleUserLimit(appProps.DIY_SUBMIT_BUNDLE_USER_LIMIT)
                //.bundleLambdaHandlerFunctionName(appProps.BUNDLE_LAMBDA_HANDLER_FUNCTION_NAME)
                //.bundleLambdaUrlPath(appProps.BUNDLE_LAMBDA_URL_PATH)
                //.bundleLambdaDurationMillis(appProps.BUNDLE_LAMBDA_DURATION)
                .baseImageTag(appProps.BASE_IMAGE_TAG)
                //.cognitoFeaturePlan(appProps.DIY_SUBMIT_COGNITO_FEATURE_PLAN)
                //.cognitoEnableLogDelivery(appProps.DIY_SUBMIT_ENABLE_LOG_DELIVERY)
                //.logCognitoEventHandlerSource(appProps.LOG_COGNITO_EVENT_HANDLER_SOURCE)
                //.myReceiptsLambdaHandlerFunctionName(appProps.MY_RECEIPTS_LAMBDA_HANDLER_FUNCTION_NAME)
                //.myReceiptsLambdaUrlPath(appProps.MY_RECEIPTS_LAMBDA_URL_PATH)
                //.myReceiptsLambdaDurationMillis(appProps.MY_RECEIPTS_LAMBDA_DURATION)
                .antonyccClientId(appProps.DIY_SUBMIT_ANTONYCC_CLIENT_ID)
                .antonyccBaseUri(appProps.DIY_SUBMIT_ANTONYCC_BASE_URI)
                .acCogClientId(appProps.DIY_SUBMIT_AC_COG_CLIENT_ID)
                .acCogBaseUri(appProps.DIY_SUBMIT_AC_COG_BASE_URI)
                .build())
            .trail(observabilityStack.trail)
            .build();

    app.synth();
  }

  private static WebAppProps loadAppProps(WebApp.Builder builder, Construct scope) {
    WebAppProps props = WebAppProps.Builder.create().build();
    // populate from cdk.json context
    for (Field f : WebAppProps.class.getDeclaredFields()) {
      if (f.getType() != String.class) continue;
      try {
        f.setAccessible(true);
        String current = (String) f.get(props);
        String ctx = builder.getContextValueString(scope, f.getName(), current);
        if (ctx != null) f.set(props, ctx);
      } catch (Exception e) {
        logger.warn("Failed to read context for {}: {}", f.getName(), e.getMessage());
      }
    }
    // apply environment overrides
    for (Field f : WebAppProps.class.getDeclaredFields()) {
      if (f.getType() != String.class) continue;
      try {
        f.setAccessible(true);
        String envVal = System.getenv(f.getName());
        if (envVal != null && !envVal.isBlank()) f.set(props, envVal);
      } catch (Exception e) {
        logger.warn("Failed to apply env override for {}: {}", f.getName(), e.getMessage());
      }
    }
    // default ENV_NAME to dev if not set
    if (props.ENV_NAME == null || props.ENV_NAME.isBlank()) props.ENV_NAME = "dev";
    return props;
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

        /*public void loadContextValuesUsingReflection(Construct scope) {
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
        }*/

        //public String getContextValueString(Construct scope, String contextKey) {
        //    return getContextValueString(scope, contextKey, null);
        //}

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
