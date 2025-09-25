package co.uk.diyaccounting.submit.constructs;

import org.junit.jupiter.api.extension.ExtendWith;
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
}
