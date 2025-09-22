package co.uk.diyaccounting.submit.stacks;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import software.amazon.awscdk.App;
import software.amazon.awscdk.assertions.Template;
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables;
import uk.org.webcompere.systemstubs.jupiter.SystemStub;
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

@ExtendWith(SystemStubsExtension.class)
public class IdentityStackTest {

    private static final String testAccount = "111111111111";

    @SystemStub
    private EnvironmentVariables environmentVariables = new EnvironmentVariables(
            // "JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION", "true",
            // "JSII_SILENCE_WARNING_DEPRECATED_NODE_VERSION", "true",
            "TARGET_ENV", "test",
            "AWS_REGION", "eu-west-2",
            "CDK_DEFAULT_ACCOUNT", testAccount,
            "CDK_DEFAULT_REGION", "eu-west-2");

    @Test
    public void testIdentityStackResources() {
        infof("Starting IdentityStack test - this should be visible in console output");
        App app = new App();

        IdentityStack stack = createTestIdentityStack(app);

        Template template = Template.fromStack(stack);
        // Minimal assertions to verify key Cognito resources are created
        template.resourceCountIs("AWS::Cognito::UserPool", 1);
        template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
        infof("IdentityStack test completed successfully - logging is working!");
    }

    private IdentityStack createTestIdentityStack(App app) {
        return new IdentityStack(
                app,
                "TestIdentityStack",
                IdentityStack.IdentityStackProps.builder()
                        .env("test")
                        .hostedZoneName("submit.diyaccounting.co.uk")
                        .hostedZoneId("ZTEST123456789")
                        .subDomainName("submit")
                        .authCertificateArn("arn:aws:acm:eu-west-2:000000000000:certificate/test")
                        .accessLogGroupRetentionPeriodDays("30")
                        .cloudTrailEnabled("false")
                        .xRayEnabled("false")
                        .verboseLogging("false")
                        .homeUrl("https://test.submit.diyaccounting.co.uk/")
                        // Provide Google configuration to avoid lookups/nulls in tests
                        .googleClientId("test-google-client-id")
                        .googleClientSecretArn(
                                "arn:aws:secretsmanager:eu-west-2:000000000000:secret:diy/test/submit/google/client_secret")
                        // Provide Cognito values used by builder
                        .antonyccClientId("test-client-id")
                        .antonyccBaseUri("https://test")
                        // Optional/feature flags for Cognito
                        .cognitoDomainPrefix("auth")
                        .useExistingAuthCertificate("true")
                        .cognitoFeaturePlan("ESSENTIALS")
                        .cognitoEnableLogDelivery("false")
                        .build());
    }
}
