package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Template;

@SetEnvironmentVariable.SetEnvironmentVariables({
    @SetEnvironmentVariable(key = "ENV_NAME", value = "test"),
    @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "test"),
    @SetEnvironmentVariable(key = "COMMIT_HASH", value = "local"),
    @SetEnvironmentVariable(key = "WEBSITE_HASH", value = "local"),
    @SetEnvironmentVariable(key = "BUILD_NUMBER", value = "local"),
    @SetEnvironmentVariable(key = "DIY_SUBMIT_DOMAIN_NAME", value = "test.submit.diyaccounting.co.uk"),
    @SetEnvironmentVariable(key = "DIY_SUBMIT_BASE_URL", value = "https://test.submit.diyaccounting.co.uk"),
    @SetEnvironmentVariable(key = "AUTH_URL_MOCK_LAMBDA_URL", value = "https://lambda.mock/auth"),
    @SetEnvironmentVariable(key = "AUTH_URL_COGNITO_LAMBDA_URL", value = "https://lambda.cognito/auth"),
    @SetEnvironmentVariable(key = "COGNITO_EXCHANGE_TOKEN_LAMBDA_URL", value = "https://lambda.cognito/exchange"),
    @SetEnvironmentVariable(key = "AUTH_URL_HMRC_LAMBDA_URL", value = "https://lambda.hmrc/auth"),
    @SetEnvironmentVariable(key = "EXCHANGE_HMRC_TOKEN_LAMBDA_URL", value = "https://lambda.hmrc/exchange"),
    @SetEnvironmentVariable(key = "SUBMIT_VAT_LAMBDA_URL", value = "https://lambda.hmrc/submit"),
    @SetEnvironmentVariable(key = "LOG_RECEIPT_LAMBDA_URL", value = "https://lambda.hmrc/log"),
    @SetEnvironmentVariable(key = "CATALOG_LAMBDA_URL", value = "https://lambda.catalogue/get"),
    @SetEnvironmentVariable(key = "REQUEST_BUNDLES_LAMBDA_URL", value = "https://lambda.bundles/request"),
    @SetEnvironmentVariable(key = "MY_BUNDLES_LAMBDA_URL", value = "https://lambda.bundles/my"),
    @SetEnvironmentVariable(key = "MY_RECEIPTS_LAMBDA_URL", value = "https://lambda.receipts/my"),
    @SetEnvironmentVariable(key = "ORIGIN_ACCESS_LOG_BUCKET_ARN", value = "arn:aws:s3:::my-log-bucket"),
    @SetEnvironmentVariable(key = "DISTRIBUTION_ACCESS_LOG_BUCKET_ARN", value = "arn:aws:s3:::my-log-bucket"),
    @SetEnvironmentVariable(
            key = "WEB_DEPLOYMENT_LOG_GROUP_ARN",
            value = "arn:aws:logs:eu-west-2:111111111111:log-group:/aws/lambda/my-log-group"),
    @SetEnvironmentVariable(key = "CLOUD_TRAIL_ENABLED", value = "true"),
    @SetEnvironmentVariable(key = "SELF_DESTRUCT_DELAY_HOURS", value = "1"),
    @SetEnvironmentVariable(
            key = "SELF_DESTRUCT_HANDLER_SOURCE",
            value = "./infra/test/resources/fake-self-destruct-lambda.jar"),
    @SetEnvironmentVariable(key = "DOC_ROOT_PATH", value = "./web/public"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
})
class SubmitDeliveryCdkResourceTest {

    @Test
    void shouldCreateSubmitDeliveryWithResources() throws IOException {

        Path cdkJsonPath = Path.of("cdk-delivery/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());

        SubmitDelivery.SubmitDeliveryProps appProps = SubmitDelivery.loadAppProps(app, "cdk-delivery/");
        var submitDelivery = new SubmitDelivery(app, appProps);
        app.synth();
        infof("CDK synth complete");

        infof("Created stack:", submitDelivery.edgeStack.getStackName());
        Template.fromStack(submitDelivery.edgeStack).resourceCountIs("AWS::CloudFront::Distribution", 1);

        infof("Created stack:", submitDelivery.publishStack.getStackName());
        Template.fromStack(submitDelivery.publishStack).resourceCountIs("Custom::CDKBucketDeployment", 1);

        infof("Created stack:", submitDelivery.selfDestructStack.getStackName());
        Template.fromStack(submitDelivery.selfDestructStack).resourceCountIs("AWS::Lambda::Function", 1);
    }

    private static @NotNull Map<String, Object> buildContextPropertyMapFromCdkJsonPath(Path cdkJsonPath)
            throws IOException {
        String json = Files.readString(cdkJsonPath);

        // 2) Extract the "context" object
        ObjectMapper om = new ObjectMapper();
        JsonNode root = om.readTree(json);
        JsonNode ctxNode = root.path("context");

        Map<String, Object> ctx = new HashMap<>();
        for (Iterator<Map.Entry<String, JsonNode>> it = ctxNode.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            // CDK context values are Objects; in your case they’re strings
            ctx.put(e.getKey(), e.getValue().asText());
        }
        return ctx;
    }
}
