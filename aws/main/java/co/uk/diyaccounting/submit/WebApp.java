package co.uk.diyaccounting.submit;

import software.amazon.awscdk.App;
import software.amazon.awscdk.CfnOutput;

public class WebApp {
    public static void main(final String[] args) {
        App app = new App();

        String envName = System.getenv("ENV_NAME");
        String stackId = "WebStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
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

        app.synth();
    }
}
