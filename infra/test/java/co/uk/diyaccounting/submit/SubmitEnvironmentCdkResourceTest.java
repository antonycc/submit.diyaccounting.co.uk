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

class SubmitEnvironmentCdkResourceTest {

    @Test
    @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111")
    @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "us-east-1")
    @SetEnvironmentVariable(key = "DIY_SUBMIT_GOOGLE_CLIENT_ID", value = "test-google-client-id")
    @SetEnvironmentVariable(key = "DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN", value = "arn:aws:secretsmanager:us-east-1:111111111111:secret:test-google-secret")
    @SetEnvironmentVariable(key = "DIY_SUBMIT_ANTONYCC_CLIENT_ID", value = "test-antonycc-client-id")
    @SetEnvironmentVariable(key = "DIY_SUBMIT_ANTONYCC_BASE_URI", value = "https://api.antonycc.gov.uk")
    void shouldCreateApexStackWithResources() throws IOException {
        // 1) Load the CDK context from cdk-environment/cdk.json
        Path cdkJsonPath = Path.of("cdk-environment/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);

        // Normalize to keys expected by SubmitEnvironmentProps if provided via cdk-environment
        if (ctx.containsKey("apexActiveLabel")) {
            ctx.put("activeLabel", ctx.get("apexActiveLabel"));
        }
        if (ctx.containsKey("apexDeploymentOrigins")) {
            ctx.put("deploymentOriginsCsv", ctx.get("apexDeploymentOrigins"));
        }
        // Use a syntactically valid fake ACM certificate ARN so CDK doesn't reject the ARN format
        ctx.put(
                "certificateArn",
                "arn:aws:acm:us-east-1:111111111111:certificate/12345678-1234-1234-1234-123456789012");

        App app = new App(AppProps.builder().context(ctx).build());

        // 2) Load props using the application loader to mimic real execution
        SubmitEnvironment.SubmitEnvironmentProps appProps = SubmitEnvironment.loadAppProps(app, "cdk-environment/");

        // 3) Build the environment and synth
        var env = new SubmitEnvironment(app, appProps);
        app.synth();

        // 4) Make sure core resources exist on the Apex stack
        Template.fromStack(env.apexStack).resourceCountIs("AWS::CloudFront::Distribution", 1);
        Template.fromStack(env.apexStack).resourceCountIs("AWS::Route53::RecordSet", 1);
    }

    private static @NotNull Map<String, Object> buildContextPropertyMapFromCdkJsonPath(Path cdkJsonPath)
            throws IOException {
        String json = Files.readString(cdkJsonPath);
        ObjectMapper om = new ObjectMapper();
        JsonNode root = om.readTree(json);
        JsonNode ctxNode = root.path("context");

        Map<String, Object> ctx = new HashMap<>();
        for (Iterator<Map.Entry<String, JsonNode>> it = ctxNode.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            ctx.put(e.getKey(), e.getValue().asText());
        }
        return ctx;
    }
}
