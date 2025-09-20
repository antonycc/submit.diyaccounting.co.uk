package co.uk.diyaccounting.submit.stacks;

import org.immutables.value.Value;

@Value.Immutable
public interface ApplicationStackProps {
    String env();
    String subDomainName();
    String hostedZoneName();
    String cloudTrailEnabled();
    String xRayEnabled();
    String verboseLogging();
    String baseImageTag();
    String ecrRepositoryArn();
    String ecrRepositoryName();
    String lambdaUrlAuthType();
    String lambdaEntry();
    String homeUrl();
    String hmrcBaseUri();
    String hmrcClientId();
    String hmrcClientSecretArn();
    String optionalTestAccessToken();
    String optionalTestS3Endpoint();
    String optionalTestS3AccessKey();
    String optionalTestS3SecretKey();
    String receiptsBucketPostfix();
    String s3RetainReceiptsBucket();

    static ImmutableApplicationStackProps.Builder builder() {
        return ImmutableApplicationStackProps.builder();
    }
}
