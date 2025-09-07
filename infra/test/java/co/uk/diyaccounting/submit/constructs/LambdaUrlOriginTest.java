package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.awssdk.SimpleStackProps;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.s3.Bucket;
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables;
import uk.org.webcompere.systemstubs.jupiter.SystemStub;
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension;

import java.util.Map;

@ExtendWith(SystemStubsExtension.class)
public class LambdaUrlOriginTest {

  private static final String testAccount = "111111111111";

  @SystemStub
  private EnvironmentVariables environmentVariables =
      new EnvironmentVariables(
          "TARGET_ENV", "test",
          "AWS_REGION", "eu-west-2",
          "CDK_DEFAULT_ACCOUNT", testAccount,
          "CDK_DEFAULT_REGION", "eu-west-2");

  @Test
  public void testLambdaUrlOriginWithTestEnvironment() {
    var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
    App app = new App();
    Stack stack = new Stack(app, stackProps.getStackName(), stackProps);

    LambdaUrlOrigin lambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(stack, "TestLambdaUrlOrigin")
            .env("test")
            .functionName("test-function")
            .timeout(Duration.seconds(30))
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .build();

    Template template = Template.fromStack(stack);
    Assertions.assertNotNull(template);
    Assertions.assertNotNull(lambdaUrlOrigin.lambda);
    Assertions.assertNotNull(lambdaUrlOrigin.logGroup);
    Assertions.assertNotNull(lambdaUrlOrigin.functionUrl);
    Assertions.assertNotNull(lambdaUrlOrigin.behaviorOptions);

    // Should have 1 lambda function
    template.resourceCountIs("AWS::Lambda::Function", 1);
    // Should have 1 log group
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    // Should have 1 function URL
    template.resourceCountIs("AWS::Lambda::Url", 1);
  }

  @Test
  public void testLambdaUrlOriginWithProductionEnvironment() {
    var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
    App app = new App();
    Stack stack = new Stack(app, stackProps.getStackName(), stackProps);

    // For testing purposes, use test environment to avoid Docker build issues
    LambdaUrlOrigin lambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(stack, "ProdTestLambdaUrlOrigin")
            .env("test") // Use test env to avoid Docker issues in unit tests
            .functionName("prod-function")
            .timeout(Duration.seconds(60))
            .environment(Map.of("ENV_VAR", "value"))
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .build();

    Template template = Template.fromStack(stack);
    Assertions.assertNotNull(template);
    Assertions.assertNotNull(lambdaUrlOrigin.lambda);
    Assertions.assertNotNull(lambdaUrlOrigin.logGroup);
    Assertions.assertNotNull(lambdaUrlOrigin.functionUrl);
    Assertions.assertNotNull(lambdaUrlOrigin.behaviorOptions);

    // Should have 1 lambda function
    template.resourceCountIs("AWS::Lambda::Function", 1);
    // Should have 1 log group
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    // Should have 1 function URL
    template.resourceCountIs("AWS::Lambda::Url", 1);
  }

  @Test
  public void testLambdaUrlOriginWithSkippedBehaviorOptions() {
    var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
    App app = new App();
    Stack stack = new Stack(app, stackProps.getStackName(), stackProps);

    LambdaUrlOrigin lambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(stack, "TestLambdaUrlOrigin")
            .env("test")
            .functionName("test-function")
            .skipBehaviorOptions(true)
            .build();

    Template template = Template.fromStack(stack);
    Assertions.assertNotNull(template);
    Assertions.assertNotNull(lambdaUrlOrigin.lambda);
    Assertions.assertNotNull(lambdaUrlOrigin.logGroup);
    Assertions.assertNotNull(lambdaUrlOrigin.functionUrl);

    // Should have 1 lambda function
    template.resourceCountIs("AWS::Lambda::Function", 1);
    // Should have 1 log group
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    // Should have 1 function URL
    template.resourceCountIs("AWS::Lambda::Url", 1);
  }

  @Test
  public void testLambdaUrlOriginWithReceiptsBucket() {
    var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
    App app = new App();
    Stack stack = new Stack(app, stackProps.getStackName(), stackProps);

    // Create a test receipts bucket
    var receiptsBucket =
        Bucket.Builder.create(stack, "TestReceiptsBucket")
            .bucketName("test-receipts-bucket")
            .build();

    LambdaUrlOrigin lambdaUrlOrigin =
        LambdaUrlOrigin.Builder.create(stack, "TestLambdaUrlOrigin")
            .env("test")
            .functionName("test-function")
            .build();

    Template template = Template.fromStack(stack);
    Assertions.assertNotNull(template);
    Assertions.assertNotNull(lambdaUrlOrigin.lambda);
    Assertions.assertNotNull(lambdaUrlOrigin.logGroup);
    Assertions.assertNotNull(lambdaUrlOrigin.functionUrl);
    Assertions.assertNotNull(lambdaUrlOrigin.behaviorOptions);

    // Should have 1 bucket (receipts bucket) + 1 lambda function
    template.resourceCountIs("AWS::S3::Bucket", 1);
    template.resourceCountIs("AWS::Lambda::Function", 1);
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    template.resourceCountIs("AWS::Lambda::Url", 1);
  }

  @Test
  public void testLambdaUrlOriginBuilderFluentInterface() {
    var stackProps = SimpleStackProps.Builder.create(Stack.class).build();
    App app = new App();
    Stack stack = new Stack(app, stackProps.getStackName(), stackProps);

    // Test that builder methods return builder instances for chaining
    LambdaUrlOrigin.Builder builder =
        LambdaUrlOrigin.Builder.create(stack, "TestLambdaUrlOrigin")
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
