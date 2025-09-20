package co.uk.diyaccounting.submit;

import org.immutables.value.Value;

@Value.Immutable
public interface SubmitApplicationProps {
    // Fields match cdk.json context keys (camelCase). Environment overrides are applied in SubmitApplication
    // selectively.
    // common
    String env();
    String deploymentName();
    String hostedZoneName();
    String hostedZoneId();
    String subDomainName();
    String certificateArn();
    String cloudTrailEnabled();
    String xRayEnabled();
    String verboseLogging();
    String cloudTrailLogGroupPrefix();
    String cloudTrailLogGroupRetentionPeriodDays();
    String accessLogGroupRetentionPeriodDays();
    String s3UseExistingBucket();
    String s3RetainOriginBucket();
    String s3RetainReceiptsBucket();
    String cloudTrailEventSelectorPrefix();
    String docRootPath();
    String defaultDocumentAtOrigin();
    String error404NotFoundAtDistribution();
    String skipLambdaUrlOrigins();
    // OAuth/HMRC and others
    String hmrcClientId();
    String hmrcClientSecretArn();
    String homeUrl();
    String hmrcBaseUri();
    String optionalTestAccessToken();
    String optionalTestS3Endpoint();
    String optionalTestS3AccessKey();
    String optionalTestS3SecretKey();
    String receiptsBucketPostfix();
    // Lambda entry and function config
    String lambdaEntry();
    String lambdaUrlAuthType();
    String commitHash();
    String googleClientId();
    String googleBaseUri();
    String googleClientSecretArn();
    String cognitoDomainPrefix();
    String bundleExpiryDate();
    String bundleUserLimit();
    String baseImageTag();
    String antonyccClientId();
    String antonyccBaseUri();
    String antonyccClientSecretArn();
    String authCertificateArn();

    static ImmutableSubmitApplicationProps.Builder builder() {
        return ImmutableSubmitApplicationProps.builder();
    }
}
