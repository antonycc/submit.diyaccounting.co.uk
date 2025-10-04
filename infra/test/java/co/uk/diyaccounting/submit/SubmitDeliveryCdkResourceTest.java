package co.uk.diyaccounting.submit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jetbrains.annotations.NotNull;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Template;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

@SetEnvironmentVariable.SetEnvironmentVariables({
    @SetEnvironmentVariable(key = "", value = "test"),
    @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "test"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
    @SetEnvironmentVariable(key = "DIY_SUBMIT_DOMAIN_NAME", value = "test.submit.diyaccounting.co.uk"),
    @SetEnvironmentVariable(key = "DIY_SUBMIT_HOME_URL", value = "https://test.submit.diyaccounting.co.uk"),
    @SetEnvironmentVariable(key = "DOC_ROOT_PATH", value = "./web/public"),
    @SetEnvironmentVariable(
            key = "ORIGIN_ACCESS_LOG_BUCKET_ARN",
            value = "arn:aws:s3:::my-log-bucket"),
    @SetEnvironmentVariable(
        key = "DISTRIBUTION_ACCESS_LOG_BUCKET_ARN",
        value = "arn:aws:s3:::my-log-bucket"),
    @SetEnvironmentVariable(
        key = "WEB_DEPLOYMENT_LOG_GROUP_ARN",
        value = "arn:aws:logs:eu-west-2:111111111111:log-group:/aws/lambda/my-log-group"),
    @SetEnvironmentVariable(
        key = "SELF_DESTRUCT_HANDLER_SOURCE",
        value = "./infra/test/resources/fake-self-destruct-lambda.jar"),
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
