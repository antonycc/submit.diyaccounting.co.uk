package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;

@Value.Immutable
public interface ApiLambdaProps extends AbstractApiLambdaProps {

    static ImmutableApiLambdaProps.Builder builder() {
        return ImmutableApiLambdaProps.builder();
    }
}
