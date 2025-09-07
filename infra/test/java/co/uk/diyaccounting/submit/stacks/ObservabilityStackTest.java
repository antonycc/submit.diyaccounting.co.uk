package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;

class ObservabilityStackTest {

  @Test
  void shouldCreateObservabilityResourcesWhenEnabled() {
    App app = new App();

    ObservabilityStack stack =
        ObservabilityStack.Builder.create(app, "TestObservabilityStack")
            .env("test")
            .hostedZoneName("diyaccounting.co.uk")
            .subDomainName("submit")
            .cloudTrailEnabled("true")
            .cloudTrailLogGroupPrefix("/aws/cloudtrail/")
            .cloudTrailLogGroupRetentionPeriodDays("7")
            .accessLogGroupRetentionPeriodDays("7")
            .xRayEnabled("false")
            .build();

    // Basic sanity checks
    assertNotNull(stack, "ObservabilityStack should be created");
    assertNotNull(stack.cloudTrailLogGroup, "CloudTrail Log Group should be created when enabled");
    assertNotNull(stack.trailBucket, "CloudTrail S3 Bucket should be created when enabled");
    assertNotNull(stack.trail, "CloudTrail Trail should be created when enabled");

    // ARNs/names should be available (CDK tokens during unit tests)
    assertNotNull(stack.cloudTrailLogGroup.getLogGroupArn());
    assertNotNull(stack.trailBucket.getBucketArn());
    assertNotNull(stack.trail.getTrailArn());
  }

  @Test
  void shouldNotCreateCloudTrailWhenDisabled() {
    App app = new App();

    ObservabilityStack stack =
        ObservabilityStack.Builder.create(app, "TestObservabilityStackDisabled")
            .env("test")
            .hostedZoneName("diyaccounting.co.uk")
            .subDomainName("submit")
            .cloudTrailEnabled("false")
            .cloudTrailLogGroupPrefix("/aws/cloudtrail/")
            .cloudTrailLogGroupRetentionPeriodDays("7")
            .accessLogGroupRetentionPeriodDays("7")
            .xRayEnabled("false")
            .build();

    // When disabled, optional resources remain null
    assertNull(
        stack.cloudTrailLogGroup, "CloudTrail Log Group should not be created when disabled");
    assertNull(stack.trailBucket, "CloudTrail S3 Bucket should not be created when disabled");
    assertNull(stack.trail, "CloudTrail Trail should not be created when disabled");
  }

  @Test
  void shouldBuildCorrectNamingPatterns() {
    // Domain name building like DevStack
    String prodDomain =
        ObservabilityStack.Builder.buildDomainName("prod", "submit", "diyaccounting.co.uk");
    assertEquals("submit.diyaccounting.co.uk", prodDomain);

    String devDomain =
        ObservabilityStack.Builder.buildDomainName("dev", "submit", "diyaccounting.co.uk");
    assertEquals("dev.submit.diyaccounting.co.uk", devDomain);

    String dashed =
        ObservabilityStack.Builder.buildDashedDomainName("dev", "submit", "diyaccounting.co.uk");
    assertEquals("dev-submit-diyaccounting-co-uk", dashed);
  }
}
