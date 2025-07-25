package co.uk.diyaccounting.submit.awssdk;

import co.uk.diyaccounting.submit.constructs.WebStack;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import software.amazon.awscdk.App;
import software.amazon.awscdk.assertions.Template;
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables;
import uk.org.webcompere.systemstubs.jupiter.SystemStub;
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension;

@ExtendWith(SystemStubsExtension.class)
public class WebStackTest {

    private static final Logger logger = LogManager.getLogger(WebStackTest.class);
    private static final String testAccount = "111111111111";

    @SystemStub
    private EnvironmentVariables environmentVariables =
            new EnvironmentVariables(
                    //"JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION", "true",
                    //"JSII_SILENCE_WARNING_DEPRECATED_NODE_VERSION", "true",
                    "TARGET_ENV", "test",
                    "AWS_REGION", "eu-west-2",
                    "CDK_DEFAULT_ACCOUNT", testAccount,
                    "CDK_DEFAULT_REGION", "eu-west-2"
            );

    @Test
    public void testStackResources() {
        logger.info("Starting WebStack test - this should be visible in console output");
        App app = new App();

        WebStack stack = WebStack.Builder.create(app, "SubmitWebStack")
                .env("test")
                .hostedZoneName("test.submit.diyaccounting.co.uk")
                .hostedZoneId("test")
                .subDomainName("test")
                .useExistingHostedZone("false")
                .certificateArn("test")
                .useExistingCertificate("false")
                .cloudTrailEnabled("true")
                .cloudTrailLogGroupPrefix("/aws/s3/")
                .cloudTrailLogGroupRetentionPeriodDays("3")
                .accessLogGroupRetentionPeriodDays("30")
                .s3UseExistingBucket("false")
                .s3RetainBucket("false")
                .cloudTrailEventSelectorPrefix("none")
                .logS3ObjectEventHandlerSource("none")
                .logGzippedS3ObjectEventHandlerSource("none")
                .docRootPath("public/")
                .defaultDocumentAtOrigin("404-error-origin.html")
                .error404NotFoundAtDistribution("404-error-distribution.html")
                .skipLambdaUrlOrigins("false")
                .hmrcClientId("test-client-id")
                .homeUrl("https://test.submit.diyaccounting.co.uk/callback")
                .hmrcBaseUri("https://test-api.service.hmrc.gov.uk")
                .optionalTestRedirectUri("https://test.submit.diyaccounting.co.uk/test-callback")
                .optionalTestAccessToken("test access token")
                .optionalTestS3Endpoint("https://s3.amazonaws.com")
                .optionalTestS3AccessKey("test-access-key")
                .optionalTestS3SecretKey("test-secret-key")
                .receiptsBucketPostfix("test-receipts-bucket")
                .lambdaEntry("co.uk.diyaccounting.submit.handlers.")
                .authUrlLambdaHandlerFunctionName("AuthUrlHandler")
                .authUrlLambdaDurationMillis("30000")
                .exchangeTokenLambdaHandlerFunctionName("ExchangeTokenHandler")
                .exchangeTokenLambdaDurationMillis("30000")
                .submitVatLambdaHandlerFunctionName("SubmitVatHandler")
                .submitVatLambdaDurationMillis("60000")
                .logReceiptLambdaHandlerFunctionName("LogReceiptHandler")
                .logReceiptLambdaDurationMillis("30000")
                .build();

        Template template = Template.fromStack(stack);
        template.resourceCountIs("AWS::S3::Bucket", 6);
        logger.info("WebStack test completed successfully - logging is working!");
    }
}
