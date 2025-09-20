package co.uk.diyaccounting.submit.stacks;

import org.immutables.value.Value;

@Value.Immutable
public interface WebStackProps {
    String env();
    String hostedZoneName();
    String hostedZoneId();
    String subDomainName();
    String certificateArn();
    String userPoolArn();
    String cloudTrailEnabled();
    String xRayEnabled();
    String verboseLogging();
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
    String hmrcClientId();
    String hmrcClientSecretArn();
    String homeUrl();
    String hmrcBaseUri();
    String optionalTestAccessToken();
    String optionalTestS3Endpoint();
    String optionalTestS3AccessKey();
    String optionalTestS3SecretKey();
    String receiptsBucketPostfix();
    String lambdaEntry();
    String lambdaUrlAuthType();
    String commitHash();
    String googleClientId();
    String googleBaseUri();
    String googleClientSecretArn();
    String cognitoDomainPrefix();
    String bundleExpiryDate();
    String bundleUserLimit();
    String antonyccClientId();
    String antonyccBaseUri();
    String cognitoClientId();
    String cognitoBaseUri();
    String baseImageTag();
    String ecrRepositoryArn();
    String ecrRepositoryName();

    static ImmutableWebStackProps.Builder builder() {
        return ImmutableWebStackProps.builder();
    }
}
