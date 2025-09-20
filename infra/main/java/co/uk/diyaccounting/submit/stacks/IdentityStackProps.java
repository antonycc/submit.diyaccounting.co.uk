package co.uk.diyaccounting.submit.stacks;

import org.immutables.value.Value;

@Value.Immutable
public interface IdentityStackProps {
    String env();

    String subDomainName();

    String hostedZoneName();

    String hostedZoneId();

    String authCertificateArn();

    String useExistingAuthCertificate();

    String accessLogGroupRetentionPeriodDays();

    String cloudTrailEnabled();

    String cloudTrailEventSelectorPrefix();

    String xRayEnabled();

    String verboseLogging();

    String homeUrl();

    String antonyccClientId();

    String antonyccBaseUri();

    String antonyccClientSecretArn();

    String googleClientId();

    String googleClientSecretArn();

    String cognitoDomainPrefix();

    String cognitoFeaturePlan();

    String cognitoEnableLogDelivery();

    static ImmutableIdentityStackProps.Builder builder() {
        return ImmutableIdentityStackProps.builder();
    }
}
