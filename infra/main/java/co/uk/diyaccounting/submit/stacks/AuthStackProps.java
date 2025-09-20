package co.uk.diyaccounting.submit.stacks;

import org.immutables.value.Value;

@Value.Immutable
public interface AuthStackProps {
    String env();
    String subDomainName();
    String hostedZoneName();
    String cloudTrailEnabled();
    String xRayEnabled();
    String baseImageTag();
    String ecrRepositoryArn();
    String ecrRepositoryName();
    String lambdaEntry();
    String homeUrl();
    String cognitoClientId();
    String cognitoBaseUri();
    String optionalTestAccessToken();

    static ImmutableAuthStackProps.Builder builder() {
        return ImmutableAuthStackProps.builder();
    }
}
