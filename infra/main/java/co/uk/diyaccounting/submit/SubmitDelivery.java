package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.EdgeStack;
import co.uk.diyaccounting.submit.stacks.EdgeStackProps;
import co.uk.diyaccounting.submit.stacks.PublishStack;
import co.uk.diyaccounting.submit.stacks.PublishStackProps;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStackProps;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.constructs.Construct;

import java.lang.reflect.Field;
import java.util.Map;

import static co.uk.diyaccounting.submit.awssdk.KindCdk.getContextValueString;
import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.putIfNotNull;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class SubmitDelivery {

    public static void main(final String[] args) {

        App app = new App();

        // Build app-level props from cdk.json context with environment overrides
        SubmitDelivery.Builder builder = SubmitDelivery.Builder.create(app, "SubmitApplication");
        SubmitDeliveryProps appProps = loadAppProps(builder, app);

        // Environment e.g. ci, prod, and deployment name e.g. ci-branchname, prod
        var envName = envOr("ENV_NAME", appProps.env);
        var deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);
        var commitHash = envOr("COMMIT_HASH", "local");

        // Determine primary environment (account/region) from CDK env
        String cdkDefaultAccount = System.getenv("CDK_DEFAULT_ACCOUNT");
        String cdkDefaultRegion = System.getenv("CDK_DEFAULT_REGION");
        Environment primaryEnv = null;
        if (cdkDefaultAccount != null && !cdkDefaultAccount.isBlank() && cdkDefaultRegion != null && !cdkDefaultRegion.isBlank()) {
            primaryEnv = Environment.builder()
                    .account(cdkDefaultAccount)
                    .region(cdkDefaultRegion)
                    .build();
        }

        // Resource name prefixes
        var hostedZoneName = envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName);
        var hostedZoneId = envOr("HOSTED_ZONE_ID", appProps.hostedZoneId);
        var certificateArn = envOr("CERTIFICATE_ARN", appProps.certificateArn);
        var domainName = envOr("DOMAIN_NAME", appProps.domainName);
        var baseUrl = envOr("DIY_SUBMIT_HOME_URL", appProps.baseUrl);
        var docRootPath = envOr("DOC_ROOT_PATH", appProps.docRootPath);
        var authUrlMockLambdaFunctionArn = envOr("DIY_SUBMIT_AUTH_URL_MOCK_LAMBDA_ARN", appProps.authUrlMockLambdaFunctionArn);
        var authUrlCognitoLambdaFunctionArn = envOr("DIY_SUBMIT_AUTH_URL_COGNITO_LAMBDA_ARN", appProps.authUrlCognitoLambdaFunctionArn);
        var exchangeCognitoTokenLambdaFunctionArn = envOr("DIY_SUBMIT_COGNITO_EXCHANGE_TOKEN_LAMBDA_ARN", appProps.exchangeCognitoTokenLambdaFunctionArn);
        var authUrlHmrcLambdaFunctionArn = envOr("DIY_SUBMIT_AUTH_URL_HMRC_LAMBDA_ARN", appProps.authUrlHmrcLambdaFunctionArn);
        var exchangeHmrcTokenLambdaFunctionArn = envOr("DIY_SUBMIT_EXCHANGE_HMRC_TOKEN_LAMBDA_ARN", appProps.exchangeHmrcTokenLambdaFunctionArn);
        var submitVatLambdaFunctionArn = envOr("DIY_SUBMIT_SUBMIT_VAT_LAMBDA_ARN", appProps.submitVatLambdaFunctionArn);
        var logReceiptLambdaFunctionArn = envOr("DIY_SUBMIT_LOG_RECEIPT_LAMBDA_ARN", appProps.logReceiptLambdaFunctionArn);
        var catalogLambdaFunctionArn = envOr("DIY_SUBMIT_CATALOG_LAMBDA_ARN", appProps.catalogLambdaFunctionArn);
        var myBundlesLambdaFunctionArn = envOr("DIY_SUBMIT_MY_BUNDLES_LAMBDA_ARN", appProps.myBundlesLambdaFunctionArn);
        var myReceiptsLambdaFunctionArn = envOr("DIY_SUBMIT_MY_RECEIPTS_LAMBDA_ARN", appProps.myReceiptsLambdaFunctionArn);
        var selfDestructHandlerSource = envOr("SELF_DESTRUCT_HANDLER_SOURCE", appProps.selfDestructHandlerSource);
        var selfDestructDelayHours = envOr("SELF_DESTRUCT_DELAY_HOURS", appProps.selfDestructDelayHours);

            // Derived values from domain and deployment name
        var resourceNamePrefix = generateResourceNamePrefix(domainName, deploymentName);
        var compressedResourceNamePrefix = generateCompressedResourceNamePrefix(domainName, deploymentName);

        Map<String, String> pathsToOriginLambdaFunctionArns = new java.util.HashMap<>();
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/mock/auth-url" + "*", authUrlMockLambdaFunctionArn);
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/cognito/auth-url" + "*", authUrlCognitoLambdaFunctionArn);
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/cognito/exchange-token" + "*", exchangeCognitoTokenLambdaFunctionArn);
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/hmrc/auth-url" + "*", authUrlHmrcLambdaFunctionArn);
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/hmrc/exchange-token" + "*", exchangeHmrcTokenLambdaFunctionArn);
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/submit-vat" + "*", submitVatLambdaFunctionArn);
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/log-receipt" + "*", logReceiptLambdaFunctionArn);
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/catalog" + "*", catalogLambdaFunctionArn);
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/my-bundles" + "*", myBundlesLambdaFunctionArn);
        putIfNotNull(pathsToOriginLambdaFunctionArns, "/api/my-receipts" + "*", myReceiptsLambdaFunctionArn);

        // Create the Edge stack (CloudFront, Route53)
        String edgeStackId = "%s-EdgeStack".formatted(deploymentName);
        EdgeStack edgeStack = new EdgeStack(
            app,
            edgeStackId,
            EdgeStackProps.builder()
                .envName(envName)
                .deploymentName(deploymentName)
                .hostedZoneName(hostedZoneName)
                .hostedZoneId(hostedZoneId)
                .domainName(domainName)
                .baseUrl(baseUrl)
                .resourceNamePrefix(resourceNamePrefix)
                .compressedResourceNamePrefix(compressedResourceNamePrefix)
                .certificateArn(certificateArn)
                .pathsToOriginLambdaFunctionArns(pathsToOriginLambdaFunctionArns)
                // Force this stack (and thus WAF) into us-east-1 as required by CloudFront
                .env(Environment.builder().region("us-east-1").build())
                .build());
        String distributionArn = edgeStack.distribution.getDistributionArn();
        String webBucketArn = edgeStack.originBucket.getBucketArn();

        // Create the Publish stack (Bucket Deployments to CloudFront)
        String publishStackId = "%s-PublishStack".formatted(deploymentName);
        PublishStack publishStack = new PublishStack(
            app,
            publishStackId,
            PublishStackProps.builder()
                .envName(envName)
                .deploymentName(deploymentName)
                .domainName(domainName)
                .baseUrl(baseUrl)
                .webBucketArn(webBucketArn)
                .resourceNamePrefix(resourceNamePrefix)
                .distributionArn(distributionArn)
                .commitHash(commitHash)
                .docRootPath(docRootPath)
                .crossRegionReferences(true)
                .env(Environment.builder().region("us-east-1").build())
                .build());
        publishStack.addDependency(edgeStack);

        // Create the SelfDestruct stack only for non-prod deployments
        if (!"prod".equals(deploymentName)) {
            String selfDestructStackId = "%s-SelfDestructStack".formatted(deploymentName);
            SelfDestructStack selfDestructStack = new SelfDestructStack(
                app,
                selfDestructStackId,
                SelfDestructStackProps.builder()
                    .envName(envName)
                    .deploymentName(deploymentName)
                    .resourceNamePrefix(resourceNamePrefix)
                    .compressedResourceNamePrefix(compressedResourceNamePrefix)
                    .edgeStackName(edgeStack.getStackName())
                    .publishStackName(publishStack.getStackName())
                    .selfDestructDelayHours(selfDestructDelayHours)
                    .selfDestructHandlerSource(selfDestructHandlerSource)
                    .build());
        }

        app.synth();
    }

    private static SubmitDeliveryProps loadAppProps(SubmitDelivery.Builder builder, Construct scope) {
        SubmitDeliveryProps props = SubmitDeliveryProps.Builder.create().build();
        // populate from cdk.json context using exact camelCase keys
        for (Field f : SubmitDeliveryProps.class.getDeclaredFields()) {
            if (f.getType() != String.class) continue;
            try {
                f.setAccessible(true);
                String current = (String) f.get(props);
                String fieldName = f.getName();
                String ctx = getContextValueString(scope, fieldName, current);
                if (ctx != null) f.set(props, ctx);
            } catch (Exception e) {
                warnf("Failed to read context for %s: %s", f.getName(), e.getMessage());
            }
        }
        // default env to dev if not set
        if (props.env == null || props.env.isBlank()) props.env = "dev";
        return props;
    }

    public static class Builder {
        public Construct scope;
        public String id;
        public StackProps props;

        public Builder(Construct scope, String id, StackProps props) {
            this.scope = scope;
            this.id = id;
            this.props = props;
        }

        public static SubmitDelivery.Builder create(Construct scope, String id) {
            return new SubmitDelivery.Builder(scope, id, null);
        }

        public static SubmitDelivery.Builder create(Construct scope, String id, StackProps props) {
            return new SubmitDelivery.Builder(scope, id, props);
        }
    }
}
