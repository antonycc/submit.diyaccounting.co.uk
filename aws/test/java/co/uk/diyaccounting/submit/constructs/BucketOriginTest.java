package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.awssdk.SimpleStackProps;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.assertions.Template;
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables;
import uk.org.webcompere.systemstubs.jupiter.SystemStub;
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension;

@ExtendWith(SystemStubsExtension.class)
public class BucketOriginTest {

    private static final String testAccount = "111111111111";

    @SystemStub
    private EnvironmentVariables environmentVariables =
            new EnvironmentVariables(
                    "TARGET_ENV", "test",
                    "AWS_REGION", "eu-west-2",
                    "CDK_DEFAULT_ACCOUNT", testAccount,
                    "CDK_DEFAULT_REGION", "eu-west-2"
            );

    @Test
    public void testBucketOriginWithNewBucket() {
        var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
        App app = new App();
        Stack stack = new Stack(app, stackProps.getStackName(), stackProps);
        
        BucketOrigin bucketOrigin = BucketOrigin.Builder
                .create(stack, "TestBucketOrigin")
                .bucketName("test-origin-bucket")
                .originAccessLogBucketName("test-origin-access-log-bucket")
                .functionNamePrefix("test-origin-access-")
                .logS3ObjectEventHandlerSource("none")
                .accessLogGroupRetentionPeriodDays(7)
                .retainBucket(false)
                .useExistingBucket(false)
                .dashedDomainName("test-domain")
                .logGzippedS3ObjectEventHandlerSource("none")
                .build();

        Template template = Template.fromStack(stack);
        Assertions.assertNotNull(template);
        Assertions.assertNotNull(bucketOrigin.originBucket);
        Assertions.assertNotNull(bucketOrigin.originAccessLogBucket);
        Assertions.assertNotNull(bucketOrigin.originIdentity);
        Assertions.assertNotNull(bucketOrigin.origin);
        
        // Should have 2 buckets: origin bucket and access log bucket
        template.resourceCountIs("AWS::S3::Bucket", 3);
        // Should have 1 origin access identity
        template.resourceCountIs("AWS::CloudFront::CloudFrontOriginAccessIdentity", 1);
    }

    @Test
    public void testBucketOriginWithExistingBucket() {
        var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
        App app = new App();
        Stack stack = new Stack(app, stackProps.getStackName(), stackProps);
        
        BucketOrigin bucketOrigin = BucketOrigin.Builder
                .create(stack, "TestBucketOrigin")
                .bucketName("existing-origin-bucket")
                .useExistingBucket(true)
                .dashedDomainName("existing-domain")
                .build();

        Template template = Template.fromStack(stack);
        Assertions.assertNotNull(template);
        Assertions.assertNotNull(bucketOrigin.originBucket);
        Assertions.assertNull(bucketOrigin.originAccessLogBucket);
        Assertions.assertNotNull(bucketOrigin.originIdentity);
        Assertions.assertNotNull(bucketOrigin.origin);
        
        // Should have no buckets created (using existing)
        template.resourceCountIs("AWS::S3::Bucket", 1);
        // Should have 1 origin access identity
        template.resourceCountIs("AWS::CloudFront::CloudFrontOriginAccessIdentity", 1);
    }

    @Test
    public void testBucketOriginBuilderValidation() {
        var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
        App app = new App();
        Stack stack = new Stack(app, stackProps.getStackName(), stackProps);
        
        // Test missing bucket name
        Assertions.assertThrows(IllegalArgumentException.class, () -> {
            BucketOrigin.Builder
                    .create(stack, "TestBucketOrigin")
                    .dashedDomainName("test-domain")
                    .build();
        });
        
        // Test missing required fields for new bucket
        Assertions.assertThrows(IllegalArgumentException.class, () -> {
            BucketOrigin.Builder
                    .create(stack, "TestBucketOrigin")
                    .bucketName("test-bucket")
                    .useExistingBucket(false)
                    .build();
        });
        
        // Test valid existing bucket configuration
        Assertions.assertDoesNotThrow(() -> {
            BucketOrigin.Builder
                    .create(stack, "TestBucketOrigin")
                    .bucketName("existing-bucket")
                    .useExistingBucket(true)
                    .dashedDomainName("existing-domain")
                    .build();
        });
    }

    @Test
    public void testBucketOriginBuilderFluentInterface() {
        var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
        App app = new App();
        Stack stack = new Stack(app, stackProps.getStackName(), stackProps);
        
        // Test that builder methods return builder instances for chaining
        BucketOrigin.Builder builder = BucketOrigin.Builder
                .create(stack, "TestBucketOrigin")
                .bucketName("test-bucket")
                .originAccessLogBucketName("test-log-bucket")
                .functionNamePrefix("test-prefix-")
                .logS3ObjectEventHandlerSource("none")
                .accessLogGroupRetentionPeriodDays(14)
                .retainBucket(true)
                .dashedDomainName("test-domain")
                .logGzippedS3ObjectEventHandlerSource("none")
                .useExistingBucket(false);
        
        Assertions.assertNotNull(builder);
        
        BucketOrigin bucketOrigin = builder.build();
        Assertions.assertNotNull(bucketOrigin);
        Assertions.assertNotNull(bucketOrigin.originBucket);
        Assertions.assertNotNull(bucketOrigin.originAccessLogBucket);
    }
}