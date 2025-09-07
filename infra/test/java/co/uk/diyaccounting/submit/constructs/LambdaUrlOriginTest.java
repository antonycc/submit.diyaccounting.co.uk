package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.awssdk.SimpleStackProps;
import java.util.Map;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables;
import uk.org.webcompere.systemstubs.jupiter.SystemStub;
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension;

@ExtendWith(SystemStubsExtension.class)
public class LambdaUrlOriginTest {

    private static final String testAccount = "111111111111";

    @SystemStub
    private EnvironmentVariables environmentVariables = new EnvironmentVariables(
            "TARGET_ENV", "test",
            "AWS_REGION", "eu-west-2",
            "CDK_DEFAULT_ACCOUNT", testAccount,
            "CDK_DEFAULT_REGION", "eu-west-2");

    @Test
    public void testLambdaUrlOriginBuilderFluentInterface() {
        var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
        App app = new App();
        Stack stack = new Stack(app, stackProps.getStackName(), stackProps);

        // Test that builder methods return builder instances for chaining
        LambdaUrlOrigin.Builder builder = LambdaUrlOrigin.Builder.create(stack, "TestLambdaUrlOrigin")
                .env("test")
                .functionName("test-function")
                .handler("com.example.Handler")
                .timeout(Duration.seconds(45))
                .environment(Map.of("TEST_VAR", "test_value"))
                .allowedMethods(AllowedMethods.ALLOW_ALL);

        Assertions.assertNotNull(builder);

        LambdaUrlOrigin lambdaUrlOrigin = builder.build();
        Assertions.assertNotNull(lambdaUrlOrigin);
        Assertions.assertNotNull(lambdaUrlOrigin.lambda);
        Assertions.assertNotNull(lambdaUrlOrigin.logGroup);
        Assertions.assertNotNull(lambdaUrlOrigin.functionUrl);
        Assertions.assertNotNull(lambdaUrlOrigin.behaviorOptions);
    }
}
