package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.ApplicationStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.IdentityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityStack;
import co.uk.diyaccounting.submit.stacks.WebStack;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.App;
import software.amazon.awscdk.StackProps;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.lang.reflect.Field;

public class WebApp {

    private static final Logger logger = LogManager.getLogger(WebApp.class);

    public static void main(final String[] args) {

        App app = new App();

        // Build app-level props from cdk.json context with environment overrides
        WebApp.Builder builder = WebApp.Builder.create(app, "WebApp");
        WebAppProps appProps = loadAppProps(builder, app);

        String envName = envOr("ENV_NAME", appProps.deploymentName);
        String deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);

        String observabilityStackId = "%s-SubmitObservabilityStack".formatted(deploymentName);
        ObservabilityStack observabilityStack = ObservabilityStack.Builder.create(app, observabilityStackId)
                .props(co.uk.diyaccounting.submit.stacks.ObservabilityStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .subDomainName(appProps.subDomainName)
                        .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
                        .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
                        .cloudTrailLogGroupPrefix(appProps.cloudTrailLogGroupPrefix)
                        .cloudTrailLogGroupRetentionPeriodDays(appProps.cloudTrailLogGroupRetentionPeriodDays)
                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                        .build())
                .build();

        // Create DevStack with resources only used during development or deployment (e.g. ECR)
        String devStackId = "%s-SubmitDevStack".formatted(deploymentName);
        DevStack devStack = DevStack.Builder.create(app, devStackId)
                .props(co.uk.diyaccounting.submit.stacks.DevStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .subDomainName(appProps.subDomainName)
                        .build())
                .build();

        // Create the identity stack before any user aware services
        String identityStackId = "%s-IdentityStack".formatted(deploymentName);
        IdentityStack identityStack = IdentityStack.Builder.create(app, identityStackId)
                .props(co.uk.diyaccounting.submit.stacks.IdentityStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .hostedZoneId(envOr("HOSTED_ZONE_ID", appProps.hostedZoneId))
                        .cognitoDomainPrefix(appProps.cognitoDomainPrefix)
                        .subDomainName(appProps.subDomainName)
                        .authCertificateArn(envOr("AUTH_CERTIFICATE_ARN", appProps.authCertificateArn))
                        .googleClientId(envOr("DIY_SUBMIT_GOOGLE_CLIENT_ID", appProps.googleClientId))
                        .googleClientSecretArn(
                                envOr("DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN", appProps.googleClientSecretArn))
                        .antonyccClientId(envOr("DIY_SUBMIT_ANTONYCC_CLIENT_ID", appProps.antonyccClientId))
                        .antonyccBaseUri(envOr("DIY_SUBMIT_ANTONYCC_BASE_URI", appProps.antonyccBaseUri))
                        .antonyccClientSecretArn(
                                envOr("DIY_SUBMIT_ANTONYCC_CLIENT_SECRET_ARN", appProps.antonyccClientSecretArn))
                        .build())
                .build();

        // Create the ApplicationStack
        String applicationStackId = "%s-SubmitApplicationStack".formatted(deploymentName);
        ApplicationStack applicationStack = ApplicationStack.Builder.create(app, applicationStackId)
                .props(co.uk.diyaccounting.submit.stacks.ApplicationStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .subDomainName(envOr("SUB_DOMAIN_NAME", appProps.subDomainName))
                        .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
                        .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
                        .baseImageTag(envOr("BASE_IMAGE_TAG", appProps.baseImageTag))
                        .ecrRepositoryArn(devStack.ecrRepository.getRepositoryArn())
                        .ecrRepositoryName(devStack.ecrRepository.getRepositoryName())
                        .build())
                .build();

        // Create WebStack with resources used in running the application
        String webStackId = "%s-WebStack".formatted(deploymentName);
        WebStack webStack = WebStack.Builder.create(app, webStackId)
                .props(co.uk.diyaccounting.submit.stacks.WebStackProps.builder()
                        .env(envName)
                        .baseImageTag(envOr("BASE_IMAGE_TAG", appProps.baseImageTag))
                        .ecrRepositoryArn(devStack.ecrRepository.getRepositoryArn())
                        .ecrRepositoryName(devStack.ecrRepository.getRepositoryName())
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .hostedZoneId(envOr("HOSTED_ZONE_ID", appProps.hostedZoneId))
                        .subDomainName(appProps.subDomainName)
                        .certificateArn(envOr("CERTIFICATE_ARN", appProps.certificateArn))
                        .userPoolArn(identityStack.userPool != null ? identityStack.userPool.getUserPoolArn() : null)
                        .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
                        .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
                        .verboseLogging(envOr("VERBOSE_LOGGING", appProps.verboseLogging))
                        .cloudTrailLogGroupRetentionPeriodDays(appProps.cloudTrailLogGroupRetentionPeriodDays)
                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                        .s3UseExistingBucket(appProps.s3UseExistingBucket)
                        .s3RetainOriginBucket(appProps.s3RetainOriginBucket)
                        .s3RetainReceiptsBucket(appProps.s3RetainReceiptsBucket)
                        .cloudTrailEventSelectorPrefix(appProps.cloudTrailEventSelectorPrefix)
                        .logS3ObjectEventHandlerSource(
                                envOr("LOG_S3_OBJECT_EVENT_HANDLER_SOURCE", appProps.logS3ObjectEventHandlerSource))
                        .logGzippedS3ObjectEventHandlerSource(envOr(
                                "LOG_GZIPPED_S3_OBJECT_EVENT_HANDLER_SOURCE",
                                appProps.logGzippedS3ObjectEventHandlerSource))
                        .docRootPath(appProps.docRootPath)
                        .defaultDocumentAtOrigin(appProps.defaultDocumentAtOrigin)
                        .error404NotFoundAtDistribution(appProps.error404NotFoundAtDistribution)
                        .skipLambdaUrlOrigins(appProps.skipLambdaUrlOrigins)
                        .hmrcClientId(envOr("DIY_SUBMIT_HMRC_CLIENT_ID", appProps.hmrcClientId))
                        .hmrcClientSecretArn(envOr("DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", appProps.hmrcClientSecretArn))
                        .homeUrl(envOr("DIY_SUBMIT_HOME_URL", appProps.homeUrl))
                        .hmrcBaseUri(envOr("DIY_SUBMIT_HMRC_BASE_URI", appProps.hmrcBaseUri))
                        .optionalTestAccessToken(
                                envOr("DIY_SUBMIT_TEST_ACCESS_TOKEN", appProps.optionalTestAccessToken))
                        .optionalTestS3Endpoint(envOr("DIY_SUBMIT_TEST_S3_ENDPOINT", appProps.optionalTestS3Endpoint))
                        .optionalTestS3AccessKey(
                                envOr("DIY_SUBMIT_TEST_S3_ACCESS_KEY", appProps.optionalTestS3AccessKey))
                        .optionalTestS3SecretKey(
                                envOr("DIY_SUBMIT_TEST_S3_SECRET_KEY", appProps.optionalTestS3SecretKey))
                        .receiptsBucketPostfix(
                                envOr("DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX", appProps.receiptsBucketPostfix))
                        .lambdaEntry(appProps.lambdaEntry)
                        .authUrlHmrcLambdaHandlerFunctionName(appProps.authUrlHmrcLambdaHandlerFunctionName)
                        .authUrlHmrcLambdaUrlPath(appProps.authUrlLambdaUrlPath)
                        .authUrlHmrcLambdaDurationMillis(appProps.authUrlHmrcLambdaDuration)
                        .authUrlMockLambdaHandlerFunctionName(appProps.authUrlMockLambdaHandlerFunctionName)
                        .authUrlMockLambdaUrlPath(appProps.authUrlMockLambdaUrlPath)
                        .authUrlMockLambdaDurationMillis(appProps.authUrlMockLambdaDuration)
                        .authUrlCognitoLambdaHandlerFunctionName(appProps.authUrlCognitoLambdaHandlerFunctionName)
                        .authUrlCognitoLambdaUrlPath(appProps.authUrlCognitoLambdaUrlPath)
                        .authUrlCognitoLambdaDurationMillis(appProps.authUrlCognitoLambdaDuration)
                        .exchangeHmrcTokenLambdaHandlerFunctionName(appProps.exchangeHmrcTokenLambdaHandlerFunctionName)
                        .exchangeHmrcTokenLambdaUrlPath(appProps.exchangeHmrcTokenLambdaUrlPath)
                        .exchangeHmrcTokenLambdaDurationMillis(appProps.exchangeHmrcTokenLambdaDuration)
                        .exchangeCognitoTokenLambdaHandlerFunctionName(
                                appProps.exchangeCognitoTokenLambdaHandlerFunctionName)
                        .exchangeCognitoTokenLambdaUrlPath(appProps.exchangeCognitoTokenLambdaUrlPath)
                        .exchangeCognitoTokenLambdaDurationMillis(appProps.exchangeCognitoTokenLambdaDuration)
                        .submitVatLambdaHandlerFunctionName(appProps.submitVatLambdaHandlerFunctionName)
                        .submitVatLambdaUrlPath(appProps.submitVatLambdaUrlPath)
                        .submitVatLambdaDurationMillis(appProps.submitVatLambdaDuration)
                        .logReceiptLambdaHandlerFunctionName(appProps.logReceiptLambdaHandlerFunctionName)
                        .logReceiptLambdaUrlPath(appProps.logReceiptLambdaUrlPath)
                        .logReceiptLambdaDurationMillis(appProps.logReceiptLambdaDuration)
                        .lambdaUrlAuthType(appProps.lambdaUrlAuthType)
                        .commitHash(envOr("COMMIT_HASH", appProps.commitHash))
                        .googleClientId(envOr("DIY_SUBMIT_GOOGLE_CLIENT_ID", appProps.googleClientId))
                        .googleBaseUri(envOr("DIY_SUBMIT_GOOGLE_BASE_URI", appProps.googleBaseUri))
                        .googleClientSecretArn(
                                envOr("DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN", appProps.googleClientSecretArn))
                        .cognitoDomainPrefix(envOr("DIY_SUBMIT_COGNITO_DOMAIN_PREFIX", appProps.cognitoDomainPrefix))
                        .bundleExpiryDate(appProps.bundleExpiryDate)
                        .bundleUserLimit(appProps.bundleUserLimit)
                        .bundleLambdaHandlerFunctionName(appProps.bundleLambdaHandlerFunctionName)
                        .bundleLambdaUrlPath(appProps.bundleLambdaUrlPath)
                        .bundleLambdaDurationMillis(appProps.bundleLambdaDuration)
                        .catalogueLambdaHandlerFunctionName(appProps.catalogueLambdaHandlerFunctionName)
                        .catalogueLambdaUrlPath(appProps.catalogueLambdaUrlPath)
                        .catalogueLambdaDurationMillis(appProps.catalogueLambdaDuration)
                        .myBundlesLambdaHandlerFunctionName(appProps.myBundlesLambdaHandlerFunctionName)
                        .myBundlesLambdaUrlPath(appProps.myBundlesLambdaUrlPath)
                        .myBundlesLambdaDurationMillis(appProps.myBundlesLambdaDuration)
                        .cognitoFeaturePlan(appProps.cognitoFeaturePlan)
                        .cognitoEnableLogDelivery(appProps.cognitoEnableLogDelivery)
                        .logCognitoEventHandlerSource(appProps.logCognitoEventHandlerSource)
                        .myReceiptsLambdaHandlerFunctionName(appProps.myReceiptsLambdaHandlerFunctionName)
                        .myReceiptsLambdaUrlPath(appProps.myReceiptsLambdaUrlPath)
                        .myReceiptsLambdaDurationMillis(appProps.myReceiptsLambdaDuration)
                        .antonyccClientId(envOr("DIY_SUBMIT_ANTONYCC_CLIENT_ID", appProps.antonyccClientId))
                        .antonyccBaseUri(envOr("DIY_SUBMIT_ANTONYCC_BASE_URI", appProps.antonyccBaseUri))
                        .cognitoClientId(identityStack.userPoolClient.getUserPoolClientId())
                        .cognitoBaseUri(identityStack.cognitoBaseUri)
                        .build())
                // .trail(observabilityStack.trail)
                .build();

        app.synth();
    }

    private static WebAppProps loadAppProps(WebApp.Builder builder, Construct scope) {
        WebAppProps props = WebAppProps.Builder.create().build();
        // populate from cdk.json context using exact camelCase keys
        for (Field f : WebAppProps.class.getDeclaredFields()) {
            if (f.getType() != String.class) continue;
            try {
                f.setAccessible(true);
                String current = (String) f.get(props);
                String fieldName = f.getName();
                String ctx = builder.getContextValueString(scope, fieldName, current);
                if (ctx != null) f.set(props, ctx);
            } catch (Exception e) {
                logger.warn("Failed to read context for {}: {}", f.getName(), e.getMessage());
            }
        }
        // default env to dev if not set
        if (props.env == null || props.env.isBlank()) props.env = "dev";
        return props;
    }

    private static String envOr(String key, String fallback) {
        String v = System.getenv(key);
        return (v != null && !v.isBlank()) ? v : fallback;
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

            if (logger.isDebugEnabled()) {
                logger.debug("Context {} resolved from {} with value: {}", contextKey, source, defaultedValue);
            }

            return defaultedValue;
        }
    }
}
