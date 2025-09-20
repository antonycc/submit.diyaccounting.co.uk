package co.uk.diyaccounting.submit.stacks;

import org.immutables.value.Value;

@Value.Immutable
public interface ObservabilityStackProps {
    String env();

    String subDomainName();

    String hostedZoneName();

    String cloudTrailEnabled();

    String cloudTrailLogGroupPrefix();

    String cloudTrailLogGroupRetentionPeriodDays();

    String accessLogGroupRetentionPeriodDays();

    String xRayEnabled();

    static ImmutableObservabilityStackProps.Builder builder() {
        return ImmutableObservabilityStackProps.builder();
    }
}
