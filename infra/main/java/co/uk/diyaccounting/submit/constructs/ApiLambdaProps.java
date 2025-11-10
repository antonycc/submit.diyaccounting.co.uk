package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

@Value.Immutable
public interface ApiLambdaProps extends LambdaProps {

    HttpMethod httpMethod();

    String urlPath();

    boolean jwtAuthorizer();

    boolean customAuthorizer();

    String baseImageTag();

    String ecrRepositoryArn();

    String ecrRepositoryName();

    static ImmutableApiLambdaProps.Builder builder() {
        return ImmutableApiLambdaProps.builder();
    }
}
