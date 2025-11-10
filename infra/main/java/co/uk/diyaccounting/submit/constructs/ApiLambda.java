package co.uk.diyaccounting.submit.constructs;

import software.constructs.Construct;

public class ApiLambda extends Lambda {

    public final ApiLambdaProps apiProps;

    public ApiLambda(final Construct scope, ApiLambdaProps apiProps) {
        super(scope, apiProps);
        this.apiProps = apiProps;
    }
}
