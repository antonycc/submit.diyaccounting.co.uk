package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.constructs.WebStack;
import software.amazon.awscdk.App;
import software.amazon.awscdk.CfnOutput;

public class WebApp {
    public static void main(final String[] args) {
        App app = new App();

        String envName = System.getenv("ENV_NAME");
        String stackId = "SubmitWebStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
        WebStack stack = WebStack.Builder.create(app, stackId)
                .env(System.getenv("ENV_NAME"))
                .hostedZoneName(System.getenv("HOSTED_ZONE_NAME"))
                .hostedZoneId(System.getenv("HOSTED_ZONE_ID"))
                .subDomainName(System.getenv("SUB_DOMAIN_NAME"))
                .useExistingHostedZone(System.getenv("USE_EXISTING_HOSTED_ZONE"))
                .certificateArn(System.getenv("CERTIFICATE_ARN"))
                .useExistingCertificate(System.getenv("USE_EXISTING_CERTIFICATE"))
                .cloudTrailEnabled(System.getenv("CLOUD_TRAIL_ENABLED"))
                .xRayEnabled(System.getenv("X_RAY_ENABLED"))
                .verboseLogging(System.getenv("VERBOSE_LOGGING"))
                .cloudTrailLogGroupPrefix(System.getenv("CLOUD_TRAIL_LOG_GROUP_PREFIX"))
                .cloudTrailLogGroupRetentionPeriodDays(System.getenv("CLOUD_TRAIL_LOG_GROUP_RETENTION_PERIOD_DAYS"))
                .accessLogGroupRetentionPeriodDays(System.getenv("ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS"))
                .s3UseExistingBucket(System.getenv("USE_EXISTING_BUCKET"))
                .s3RetainOriginBucket(System.getenv("RETAIN_ORIGIN_BUCKET"))
                .s3RetainReceiptsBucket(System.getenv("RETAIN_RECEIPTS_BUCKET"))
                .cloudTrailEventSelectorPrefix(System.getenv("OBJECT_PREFIX"))
                .logS3ObjectEventHandlerSource(System.getenv("LOG_S3_OBJECT_EVENT_HANDLER_SOURCE"))
                .logGzippedS3ObjectEventHandlerSource(System.getenv("LOG_GZIPPED_S3_OBJECT_EVENT_HANDLER_SOURCE"))
                .docRootPath(System.getenv("DOC_ROOT_PATH"))
                .defaultDocumentAtOrigin(System.getenv("DEFAULT_HTML_DOCUMENT"))
                .error404NotFoundAtDistribution(System.getenv("ERROR_HTML_DOCUMENT"))
                .skipLambdaUrlOrigins(System.getenv("SKIP_LAMBDA_URL_ORIGINS"))
                .hmrcClientId(System.getenv("DIY_SUBMIT_HMRC_CLIENT_ID"))
                .hmrcClientSecret(System.getenv("DIY_SUBMIT_HMRC_CLIENT_SECRET"))
                .homeUrl(System.getenv("DIY_SUBMIT_HOME_URL"))
                .hmrcBaseUri(System.getenv("DIY_SUBMIT_HMRC_BASE_URI"))
                .optionalTestAccessToken(System.getenv("DIY_SUBMIT_TEST_ACCESS_TOKEN"))
                .optionalTestS3Endpoint(System.getenv("DIY_SUBMIT_TEST_S3_ENDPOINT"))
                .optionalTestS3AccessKey(System.getenv("DIY_SUBMIT_TEST_S3_ACCESS_KEY"))
                .optionalTestS3SecretKey(System.getenv("DIY_SUBMIT_TEST_S3_SECRET_KEY"))
                .receiptsBucketPostfix(System.getenv("DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX"))
                .lambdaEntry(System.getenv("LAMBDA_ENTRY"))
                .authUrlLambdaHandlerFunctionName(System.getenv("AUTH_URL_LAMBDA_HANDLER_FUNCTION_NAME"))
                .authUrlLambdaUrlPath(System.getenv("AUTH_URL_LAMBDA_URL_PATH"))
                .authUrlLambdaDurationMillis(System.getenv("AUTH_URL_LAMBDA_DURATION"))
                .exchangeTokenLambdaHandlerFunctionName(System.getenv("EXCHANGE_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME"))
                .exchangeTokenLambdaUrlPath(System.getenv("EXCHANGE_TOKEN_LAMBDA_URL_PATH"))
                .exchangeTokenLambdaDurationMillis(System.getenv("EXCHANGE_TOKEN_LAMBDA_DURATION"))
                .submitVatLambdaHandlerFunctionName(System.getenv("SUBMIT_VAT_LAMBDA_HANDLER_FUNCTION_NAME"))
                .submitVatLambdaUrlPath(System.getenv("SUBMIT_VAT_LAMBDA_URL_PATH"))
                .submitVatLambdaDurationMillis(System.getenv("SUBMIT_VAT_LAMBDA_DURATION"))
                .logReceiptLambdaHandlerFunctionName(System.getenv("LOG_RECEIPT_LAMBDA_HANDLER_FUNCTION_NAME"))
                .logReceiptLambdaUrlPath(System.getenv("LOG_RECEIPT_LAMBDA_URL_PATH"))
                .logReceiptLambdaDurationMillis(System.getenv("LOG_RECEIPT_LAMBDA_DURATION"))
                .lambdaUrlAuthType(System.getenv("LAMBDA_URL_AUTH_TYPE"))
                .commitHash(System.getenv("COMMIT_HASH"))
                // Cognito and Bundle Management configuration
                .googleClientId(System.getenv("DIY_SUBMIT_GOOGLE_CLIENT_ID"))
                .googleClientSecret(System.getenv("DIY_SUBMIT_GOOGLE_CLIENT_SECRET"))
                .cognitoDomainPrefix(System.getenv("DIY_SUBMIT_COGNITO_DOMAIN_PREFIX"))
                .bundleExpiryDate(System.getenv("DIY_SUBMIT_BUNDLE_EXPIRY_DATE"))
                .bundleUserLimit(System.getenv("DIY_SUBMIT_BUNDLE_USER_LIMIT"))
                .bundleLambdaHandlerFunctionName(System.getenv("BUNDLE_LAMBDA_HANDLER_FUNCTION_NAME"))
                .bundleLambdaUrlPath(System.getenv("BUNDLE_LAMBDA_URL_PATH"))
                .bundleLambdaDurationMillis(System.getenv("BUNDLE_LAMBDA_DURATION"))
                .build();

        CfnOutput.Builder.create(stack, "OriginBucketArn")
                .value(stack.originBucket.getBucketArn())
                .build();

        CfnOutput.Builder.create(stack, "OriginAccessLogBucketArn")
                .value(stack.originAccessLogBucket.getBucketArn())
                .build();

        CfnOutput.Builder.create(stack, "DistributionAccessLogBucketArn")
                .value(stack.distributionAccessLogBucket.getBucketArn())
                .build();

        CfnOutput.Builder.create(stack, "DistributionId")
                .value(stack.distribution.getDistributionId())
                .build();

        CfnOutput.Builder.create(stack, "HostedZoneId")
                .value(stack.hostedZone.getHostedZoneId())
                .build();

        CfnOutput.Builder.create(stack, "CertificateArn")
                .value(stack.certificate.getCertificateArn())
                .build();

        CfnOutput.Builder.create(stack, "ARecord")
                .value(stack.aRecord.getDomainName())
                .build();

        CfnOutput.Builder.create(stack, "AaaaRecord")
                .value(stack.aaaaRecord.getDomainName())
                .build();

        CfnOutput.Builder.create(stack, "AuthUrlLambdaArn")
                .value(stack.authUrlLambda.getFunctionArn())
                .build();

        CfnOutput.Builder.create(stack, "AuthUrlLambdaUrl")
                .value(stack.authUrlLambdaUrl.getUrl())
                .build();

        CfnOutput.Builder.create(stack, "ExchangeTokenLambdaArn")
                .value(stack.exchangeTokenLambda.getFunctionArn())
                .build();

        CfnOutput.Builder.create(stack, "ExchangeTokenLambdaUrl")
                .value(stack.exchangeTokenLambdaUrl.getUrl())
                .build();

        CfnOutput.Builder.create(stack, "SubmitVatLambdaArn")
                .value(stack.submitVatLambda.getFunctionArn())
                .build();

        CfnOutput.Builder.create(stack, "SubmitVatLambdaUrl")
                .value(stack.submitVatLambdaUrl.getUrl())
                .build();

        CfnOutput.Builder.create(stack, "LogReceiptLambdaArn")
                .value(stack.logReceiptLambda.getFunctionArn())
                .build();

        CfnOutput.Builder.create(stack, "LogReceiptLambdaUrl")
                .value(stack.logReceiptLambdaUrl.getUrl())
                .build();

        // Cognito outputs (only if Cognito is configured)
        if (stack.userPool != null) {
            CfnOutput.Builder.create(stack, "UserPoolId")
                    .value(stack.userPool.getUserPoolId())
                    .build();

            CfnOutput.Builder.create(stack, "UserPoolArn")
                    .value(stack.userPool.getUserPoolArn())
                    .build();
        }

        if (stack.userPoolClient != null) {
            CfnOutput.Builder.create(stack, "UserPoolClientId")
                    .value(stack.userPoolClient.getUserPoolClientId())
                    .build();
        }

        if (stack.userPoolDomain != null) {
            CfnOutput.Builder.create(stack, "UserPoolDomainName")
                    .value(stack.userPoolDomain.getDomainName())
                    .build();
        }

        // Bundle Lambda outputs (only if bundle Lambda is configured)
        if (stack.bundleLambda != null) {
            CfnOutput.Builder.create(stack, "BundleLambdaArn")
                    .value(stack.bundleLambda.getFunctionArn())
                    .build();

            CfnOutput.Builder.create(stack, "BundleLambdaUrl")
                    .value(stack.bundleLambdaUrl.getUrl())
                    .build();
        }

        app.synth();
    }
}
