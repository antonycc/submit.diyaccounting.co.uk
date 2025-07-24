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
                .cloudTrailLogGroupPrefix(System.getenv("CLOUD_TRAIL_LOG_GROUP_PREFIX"))
                .cloudTrailLogGroupRetentionPeriodDays(System.getenv("CLOUD_TRAIL_LOG_GROUP_RETENTION_PERIOD_DAYS"))
                .accessLogGroupRetentionPeriodDays(System.getenv("ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS"))
                .s3UseExistingBucket(System.getenv("USE_EXISTING_BUCKET"))
                .s3RetainBucket(System.getenv("RETAIN_BUCKET"))
                .cloudTrailEventSelectorPrefix(System.getenv("OBJECT_PREFIX"))
                .logS3ObjectEventHandlerSource(System.getenv("LOG_S3_OBJECT_EVENT_HANDLER_SOURCE"))
                .logGzippedS3ObjectEventHandlerSource(System.getenv("LOG_GZIPPED_S3_OBJECT_EVENT_HANDLER_SOURCE"))
                .docRootPath(System.getenv("DOC_ROOT_PATH"))
                .defaultDocumentAtOrigin(System.getenv("DEFAULT_HTML_DOCUMENT"))
                .error404NotFoundAtDistribution(System.getenv("ERROR_HTML_DOCUMENT"))
                .hmrcClientId(System.getenv("DIY_SUBMIT_HMRC_CLIENT_ID"))
                .homeUrl(System.getenv("DIY_SUBMIT_HOME_URL"))
                .hmrcBaseUri(System.getenv("DIY_SUBMIT_HMRC_BASE_URI"))
                .optionalTestAccessToken(System.getenv("DIY_SUBMIT_TEST_ACCESS_TOKEN"))
                .optionalTestS3Endpoint(System.getenv("DIY_SUBMIT_TEST_S3_ENDPOINT"))
                .optionalTestS3AccessKey(System.getenv("DIY_SUBMIT_TEST_S3_ACCESS_KEY"))
                .optionalTestS3SecretKey(System.getenv("DIY_SUBMIT_TEST_S3_SECRET_KEY"))
                .receiptsBucketPostfix(System.getenv("DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX"))
                .lambdaEntry(System.getenv("LAMBDA_ENTRY"))
                .authUrlLambdaHandlerFunctionName(System.getenv("AUTH_URL_LAMBDA_HANDLER_FUNCTION_NAME"))
                .authUrlLambdaDurationMillis(System.getenv("AUTH_URL_LAMBDA_DURATION"))
                .exchangeTokenLambdaHandlerFunctionName(System.getenv("EXCHANGE_TOKEN_LAMBDA_HANDLER_FUNCTION_NAME"))
                .exchangeTokenLambdaDurationMillis(System.getenv("EXCHANGE_TOKEN_LAMBDA_DURATION"))
                .submitVatLambdaHandlerFunctionName(System.getenv("SUBMIT_VAT_LAMBDA_HANDLER_FUNCTION_NAME"))
                .submitVatLambdaDurationMillis(System.getenv("SUBMIT_VAT_LAMBDA_DURATION"))
                .logReceiptLambdaHandlerFunctionName(System.getenv("LOG_RECEIPT_LAMBDA_HANDLER_FUNCTION_NAME"))
                .logReceiptLambdaDurationMillis(System.getenv("LOG_RECEIPT_LAMBDA_DURATION"))
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

        app.synth();
    }
}
