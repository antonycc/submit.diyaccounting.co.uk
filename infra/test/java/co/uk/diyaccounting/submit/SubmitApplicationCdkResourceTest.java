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
    @SetEnvironmentVariable(key = "", value = "test"),
    @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "test"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
    @SetEnvironmentVariable(
            key = "DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN",
            value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:test-google-secret"),
    @SetEnvironmentVariable(key = "DIY_SUBMIT_HMRC_BASE_URI", value = "https://test-api.service.hmrc.gov.uk"),
    @SetEnvironmentVariable(key = "DIY_SUBMIT_HMRC_CLIENT_ID", value = "test-hmrc-client-id"),
    @SetEnvironmentVariable(
            key = "DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN",
            value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:test-hmrc-secret"),
    @SetEnvironmentVariable(
            key = "SELF_DESTRUCT_HANDLER_SOURCE",
            value = "./infra/test/resources/fake-self-destruct-lambda.jar"),
})
class SubmitApplicationCdkResourceTest {

    @Test
    void shouldCreateSubmitApplicationWithResources() throws IOException {

        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());

        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        var submitApplication = new SubmitApplication(app, appProps);
        app.synth();
        infof("CDK synth complete");

        infof("Created stack:", submitApplication.observabilityStack.getStackName());
        Template.fromStack(submitApplication.observabilityStack).resourceCountIs("AWS::CloudTrail::Trail", 1);

        infof("Created stack:", submitApplication.devStack.getStackName());
        Template.fromStack(submitApplication.devStack).resourceCountIs("AWS::ECR::Repository", 1);

        infof("Created stack:", submitApplication.identityStack.getStackName());
        Template.fromStack(submitApplication.identityStack).resourceCountIs("AWS::Cognito::UserPool", 1);
        Template.fromStack(submitApplication.identityStack).resourceCountIs("AWS::Cognito::UserPoolClient", 1);

        infof("Created stack:", submitApplication.authStack.getStackName());
        Template.fromStack(submitApplication.authStack).resourceCountIs("AWS::Lambda::Function", 3);

        infof("Created stack:", submitApplication.hmrcStack.getStackName());
        Template.fromStack(submitApplication.hmrcStack).resourceCountIs("AWS::Lambda::Function", 9);

        infof("Created stack:", submitApplication.opsStack.getStackName());
        Template.fromStack(submitApplication.opsStack).resourceCountIs("AWS::CloudWatch::Dashboard", 1);

        infof("Created stack:", submitApplication.selfDestructStack.getStackName());
        Template.fromStack(submitApplication.selfDestructStack).resourceCountIs("AWS::Lambda::Function", 1);
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
