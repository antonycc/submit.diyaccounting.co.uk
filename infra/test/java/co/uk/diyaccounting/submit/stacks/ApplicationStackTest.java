package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;

class ApplicationStackTest {

    @Test
    void shouldCreateApplicationStack() {
        App app = new App();

        /*
                       .env(envName)
               .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
               .subDomainName(envOr("SUB_DOMAIN_NAME", appProps.subDomainName))
               .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
               .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
               .verboseLogging(envOr("VERBOSE_LOGGING", appProps.verboseLogging))
               .baseImageTag(envOr("BASE_IMAGE_TAG", appProps.baseImageTag))
               .ecrRepositoryArn(devStack.ecrRepository.getRepositoryArn())
               .ecrRepositoryName(devStack.ecrRepository.getRepositoryName())
               .homeUrl(envOr("HOME_URL", webStack.baseUrl))
               .hmrcClientId(envOr("DIY_SUBMIT_HMRC_CLIENT_ID", appProps.hmrcClientId))
               .lambdaUrlAuthType(envOr("LAMBDA_URL_AUTH_TYPE", appProps.lambdaUrlAuthType))
               .lambdaEntry(envOr("LAMBDA_ENTRY", appProps.lambdaEntry))
               .hmrcClientSecretArn(envOr("DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", appProps.hmrcClientSecretArn))
               .receiptsBucketPostfix(envOr("RECEIPTS_BUCKET_POSTFIX", appProps.receiptsBucketPostfix))
               .optionalTestS3Endpoint(envOr("OPTIONAL_TEST_S3_ENDPOINT", appProps.optionalTestS3Endpoint))
               .optionalTestS3AccessKey(envOr("OPTIONAL_TEST_S3_ACCESS_KEY", appProps.optionalTestS3AccessKey))
               .optionalTestS3SecretKey(envOr("OPTIONAL_TEST_S3_SECRET_KEY", appProps.optionalTestS3SecretKey))
               .s3RetainReceiptsBucket(appProps.s3RetainReceiptsBucket)
        */

        ApplicationStack stack = ApplicationStack.Builder.create(app, "TestApplicationStack")
                .env("test")
                .hostedZoneName("diyaccounting.co.uk")
                .subDomainName("submit")
                .cloudTrailEnabled("false")
                .xRayEnabled("false")
                .verboseLogging("true")
                .baseImageTag("latest")
                .ecrRepositoryArn("arn:aws:ecr:us-east-1:123:mine")
                .ecrRepositoryName("test-repo")
                .homeUrl("https://www.diyaccounting.co.uk")
                .hmrcBaseUri("https://test-api.service.hmrc.gov.uk")
                .hmrcClientId("test-hmrc-client-id")
                // .lambdaUrlAuthType("AWS_IAM")
                .lambdaEntry("src/main/java/co/uk/diyaccounting/submit/lambda /SubmitHandler.java")
                .hmrcClientSecretArn("arn:aws:secretsmanager:us-east-1:123:secret:hmrc-secret")
                .receiptsBucketPostfix("test")
                .optionalTestS3Endpoint("http://localhost:4566")
                .optionalTestS3AccessKey("test-access-key")
                .build();

        assertNotNull(stack, "ApplicationStack should be created");
        // Currently ApplicationStack does not expose specific resources; this sanity check ensures
        // builder wiring works.
    }

    @Test
    void shouldBuildCorrectNamingPatterns() {
        String prodDomain = ApplicationStack.Builder.buildDomainName("prod", "submit", "diyaccounting.co.uk");
        assertEquals("submit.diyaccounting.co.uk", prodDomain);

        String devDomain = ApplicationStack.Builder.buildDomainName("dev", "submit", "diyaccounting.co.uk");
        assertEquals("dev.submit.diyaccounting.co.uk", devDomain);

        String dashed = ApplicationStack.Builder.buildDashedDomainName("dev", "submit", "diyaccounting.co.uk");
        assertEquals("dev-submit-diyaccounting-co-uk", dashed);
    }
}
