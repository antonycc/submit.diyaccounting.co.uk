package co.uk.diyaccounting.submit.stacks;

import org.immutables.value.Value;

@Value.Immutable
public interface DevStackProps {
    String env();

    String subDomainName();

    String hostedZoneName();

    String retainEcrRepository();

    static ImmutableDevStackProps.Builder builder() {
        return ImmutableDevStackProps.builder();
    }
}
