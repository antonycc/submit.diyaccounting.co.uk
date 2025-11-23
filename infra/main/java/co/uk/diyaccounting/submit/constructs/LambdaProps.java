package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;

@Value.Immutable
public interface LambdaProps extends AbstractLambdaProps {

    static ImmutableLambdaProps.Builder builder() {
        return ImmutableLambdaProps.builder();
    }
}
