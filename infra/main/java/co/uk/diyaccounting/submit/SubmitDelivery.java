package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.EdgeStack;
import co.uk.diyaccounting.submit.stacks.PublishStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

import java.io.File;
import java.lang.reflect.Field;
import java.nio.file.Paths;
import java.util.Map;

import static co.uk.diyaccounting.submit.awssdk.KindCdk.getContextValueString;
import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.putIfNotNull;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class SubmitDelivery {

    // Fields match cdk.json context keys (camelCase). Environment overrides are applied in SubmitDelivery
    public static class SubmitDeliveryProps {
        public String env;
        public String deploymentName;
        public String hostedZoneName;
        public String hostedZoneId;
        public String certificateArn;
        public String accessLogGroupRetentionPeriodDays;
        public String docRootPath;
        public String domainName;
        public String baseUrl;
        public String authUrlMockLambdaFunctionArn;
        public String authUrlCognitoLambdaFunctionArn;
        public String exchangeCognitoTokenLambdaFunctionArn;
        public String authUrlHmrcLambdaFunctionArn;
        public String exchangeHmrcTokenLambdaFunctionArn;
        public String submitVatLambdaFunctionArn;
        public String logReceiptLambdaFunctionArn;
        public String catalogLambdaFunctionArn;
        public String requestBundlesLambdaFunctionArn;
        public String myBundlesLambdaFunctionArn;
        public String myReceiptsLambdaFunctionArn;
        // Function URLs for cross-region EdgeStack deployment
        public String authUrlMockLambdaFunctionUrl;
        public String authUrlCognitoLambdaFunctionUrl;
        public String exchangeCognitoTokenLambdaFunctionUrl;
        public String authUrlHmrcLambdaFunctionUrl;
        public String exchangeHmrcTokenLambdaFunctionUrl;
        public String submitVatLambdaFunctionUrl;
        public String logReceiptLambdaFunctionUrl;
        public String catalogLambdaFunctionUrl;
        public String requestBundlesLambdaFunctionUrl;
        public String myBundlesLambdaFunctionUrl;
        public String myReceiptsLambdaFunctionUrl;
        public String selfDestructHandlerSource;
        public String selfDestructDelayHours;

        public static class Builder {
            private final SubmitDeliveryProps p = new SubmitDeliveryProps();

            public static Builder create() {
                return new Builder();
            }

            public SubmitDeliveryProps build() {
                return p;
            }

            public Builder set(String key, String value) {
                try {
                    var f = SubmitDeliveryProps.class.getDeclaredField(key);
                    f.setAccessible(true);
                    f.set(p, value);
                } catch (Exception ignored) {
                }
                return this;
            }
        }
    }

    public static void main(final String[] args) {

        App app = new App();

        // Build app-level props from cdk.json context with environment overrides
        SubmitDeliveryProps appProps = loadAppProps(app);

        // Environment e.g. ci, prod, and deployment name e.g. ci-branchname, prod
        var envName = envOr("ENV_NAME", appProps.env);
        var deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);
        var commitHash = envOr("COMMIT_HASH", "local");

        // Determine primary environment (account/region) from CDK env
        //        String cdkDefaultAccount = System.getenv("CDK_DEFAULT_ACCOUNT");
        //        String cdkDefaultRegion = System.getenv("CDK_DEFAULT_REGION");
        //        Environment primaryEnv = null;
        //        if (cdkDefaultAccount != null
        //                && !cdkDefaultAccount.isBlank()
        //                && cdkDefaultRegion != null
        //                && !cdkDefaultRegion.isBlank()) {
        //            primaryEnv = Environment.builder()
        //                    .account(cdkDefaultAccount)
        //                    .region(cdkDefaultRegion)
        //                    .build();
        //        } else {
        //            primaryEnv = Environment.builder()
        //                .build();
        //        }

        // Resource name prefixes
        var hostedZoneName = envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName, "(from hostedZoneName in cdk.json)");
        var hostedZoneId = envOr("HOSTED_ZONE_ID", appProps.hostedZoneId, "(from hostedZoneId in cdk.json)");
        var certificateArn = envOr("CERTIFICATE_ARN", appProps.certificateArn, "(from certificateArn in cdk.json)");
        var domainName = envOr("DOMAIN_NAME", appProps.domainName, "(from domainName in cdk.json)");
        var baseUrl = envOr("DIY_SUBMIT_HOME_URL", appProps.baseUrl, "(from baseUrl in cdk.json)");
        var docRootPath = envOr("DOC_ROOT_PATH", appProps.docRootPath, "(from docRootPath in cdk.json)");
        var authUrlMockLambdaFunctionArn = envOr(
                "DIY_SUBMIT_AUTH_URL_MOCK_LAMBDA_ARN",
                appProps.authUrlMockLambdaFunctionArn,
                "(from authUrlMockLambdaFunctionArn in cdk.json)");
        var authUrlCognitoLambdaFunctionArn = envOr(
                "DIY_SUBMIT_AUTH_URL_COGNITO_LAMBDA_ARN",
                appProps.authUrlCognitoLambdaFunctionArn,
                "(from authUrlCognitoLambdaFunctionArn in cdk.json)");
        var exchangeCognitoTokenLambdaFunctionArn = envOr(
                "DIY_SUBMIT_COGNITO_EXCHANGE_TOKEN_LAMBDA_ARN",
                appProps.exchangeCognitoTokenLambdaFunctionArn,
                "(from exchangeCognitoTokenLambdaFunctionArn in cdk.json)");
        var authUrlHmrcLambdaFunctionArn = envOr(
                "DIY_SUBMIT_AUTH_URL_HMRC_LAMBDA_ARN",
                appProps.authUrlHmrcLambdaFunctionArn,
                "(from authUrlHmrcLambdaFunctionArn in cdk.json)");
        var exchangeHmrcTokenLambdaFunctionArn = envOr(
                "DIY_SUBMIT_EXCHANGE_HMRC_TOKEN_LAMBDA_ARN",
                appProps.exchangeHmrcTokenLambdaFunctionArn,
                "(from exchangeHmrcTokenLambdaFunctionArn in cdk.json)");
        var submitVatLambdaFunctionArn = envOr(
                "DIY_SUBMIT_SUBMIT_VAT_LAMBDA_ARN",
                appProps.submitVatLambdaFunctionArn,
                "(from submitVatLambdaFunctionArn in cdk.json)");
        var logReceiptLambdaFunctionArn = envOr(
                "DIY_SUBMIT_LOG_RECEIPT_LAMBDA_ARN",
                appProps.logReceiptLambdaFunctionArn,
                "(from logReceiptLambdaFunctionArn in cdk.json)");
        var catalogLambdaFunctionArn = envOr(
                "DIY_SUBMIT_CATALOG_LAMBDA_ARN",
                appProps.catalogLambdaFunctionArn,
                "(from catalogLambdaFunctionArn in cdk.json)");
        var requestBundlesLambdaFunctionArn = envOr(
                "DIY_SUBMIT_REQUEST_BUNDLES_LAMBDA_ARN",
                appProps.requestBundlesLambdaFunctionArn,
                "(from requestBundlesLambdaFunctionArn in cdk.json)");
        var myBundlesLambdaFunctionArn = envOr(
                "DIY_SUBMIT_MY_BUNDLES_LAMBDA_ARN",
                appProps.myBundlesLambdaFunctionArn,
                "(from myBundlesLambdaFunctionArn in cdk.json)");
        var myReceiptsLambdaFunctionArn = envOr(
                "DIY_SUBMIT_MY_RECEIPTS_LAMBDA_ARN",
                appProps.myReceiptsLambdaFunctionArn,
                "(from myReceiptsLambdaFunctionArn in cdk.json)");

        // Function URL environment variables for EdgeStack
        var authUrlMockLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_AUTH_URL_MOCK_LAMBDA_URL",
                appProps.authUrlMockLambdaFunctionUrl,
                "(from authUrlMockLambdaFunctionUrl in cdk.json)");
        var authUrlCognitoLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_AUTH_URL_COGNITO_LAMBDA_URL",
                appProps.authUrlCognitoLambdaFunctionUrl,
                "(from authUrlCognitoLambdaFunctionUrl in cdk.json)");
        var exchangeCognitoTokenLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_COGNITO_EXCHANGE_TOKEN_LAMBDA_URL",
                appProps.exchangeCognitoTokenLambdaFunctionUrl,
                "(from exchangeCognitoTokenLambdaFunctionUrl in cdk.json)");
        var authUrlHmrcLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_AUTH_URL_HMRC_LAMBDA_URL",
                appProps.authUrlHmrcLambdaFunctionUrl,
                "(from authUrlHmrcLambdaFunctionUrl in cdk.json)");
        var exchangeHmrcTokenLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_EXCHANGE_HMRC_TOKEN_LAMBDA_URL",
                appProps.exchangeHmrcTokenLambdaFunctionUrl,
                "(from exchangeHmrcTokenLambdaFunctionUrl in cdk.json)");
        var submitVatLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_SUBMIT_VAT_LAMBDA_URL",
                appProps.submitVatLambdaFunctionUrl,
                "(from submitVatLambdaFunctionUrl in cdk.json)");
        var logReceiptLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_LOG_RECEIPT_LAMBDA_URL",
                appProps.logReceiptLambdaFunctionUrl,
                "(from logReceiptLambdaFunctionUrl in cdk.json)");
        var catalogLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_CATALOG_LAMBDA_URL",
                appProps.catalogLambdaFunctionUrl,
                "(from catalogLambdaFunctionUrl in cdk.json)");
        var requestBundlesLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_REQUEST_BUNDLES_LAMBDA_URL",
                appProps.requestBundlesLambdaFunctionUrl,
                "(from requestBundlesLambdaFunctionUrl in cdk.json)");
        var myBundlesLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_MY_BUNDLES_LAMBDA_URL",
                appProps.myBundlesLambdaFunctionUrl,
                "(from myBundlesLambdaFunctionUrl in cdk.json)");
        var myReceiptsLambdaFunctionUrl = envOr(
                "DIY_SUBMIT_MY_RECEIPTS_LAMBDA_URL",
                appProps.myReceiptsLambdaFunctionUrl,
                "(from myReceiptsLambdaFunctionUrl in cdk.json)");
        var selfDestructHandlerSource = envOr(
                "SELF_DESTRUCT_HANDLER_SOURCE",
                appProps.selfDestructHandlerSource,
                "(from selfDestructHandlerSource in cdk.json)");
        var selfDestructDelayHours = envOr(
                "SELF_DESTRUCT_DELAY_HOURS",
                appProps.selfDestructDelayHours,
                "(from selfDestructDelayHours in cdk.json)");
        var accessLogGroupRetentionPeriodDays = envOr(
                "ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS",
                appProps.accessLogGroupRetentionPeriodDays,
                "(from accessLogGroupRetentionPeriodDays in cdk.json)");

        // Derived values from domain and deployment name
        var resourceNamePrefix = generateResourceNamePrefix(domainName, deploymentName);
        var compressedResourceNamePrefix = generateCompressedResourceNamePrefix(domainName, deploymentName);

        // Create Function URLs map for EdgeStack (cross-region compatible)
        Map<String, String> pathsToOriginLambdaFunctionUrls = new java.util.HashMap<>();
        putIfNotNull(pathsToOriginLambdaFunctionUrls, "/api/mock/auth-url" + "*", authUrlMockLambdaFunctionUrl);
        putIfNotNull(pathsToOriginLambdaFunctionUrls, "/api/cognito/auth-url" + "*", authUrlCognitoLambdaFunctionUrl);
        putIfNotNull(
                pathsToOriginLambdaFunctionUrls,
                "/api/cognito/exchange-token" + "*",
                exchangeCognitoTokenLambdaFunctionUrl);
        putIfNotNull(pathsToOriginLambdaFunctionUrls, "/api/hmrc/auth-url" + "*", authUrlHmrcLambdaFunctionUrl);
        putIfNotNull(
                pathsToOriginLambdaFunctionUrls, "/api/hmrc/exchange-token" + "*", exchangeHmrcTokenLambdaFunctionUrl);
        putIfNotNull(pathsToOriginLambdaFunctionUrls, "/api/submit-vat" + "*", submitVatLambdaFunctionUrl);
        putIfNotNull(pathsToOriginLambdaFunctionUrls, "/api/log-receipt" + "*", logReceiptLambdaFunctionUrl);
        putIfNotNull(pathsToOriginLambdaFunctionUrls, "/api/catalog" + "*", catalogLambdaFunctionUrl);
        putIfNotNull(pathsToOriginLambdaFunctionUrls, "/api/request-bundles" + "*", requestBundlesLambdaFunctionUrl);
        putIfNotNull(pathsToOriginLambdaFunctionUrls, "/api/my-bundles" + "*", myBundlesLambdaFunctionUrl);
        putIfNotNull(pathsToOriginLambdaFunctionUrls, "/api/my-receipts" + "*", myReceiptsLambdaFunctionUrl);

        // Create the Edge stack (CloudFront, Route53)
        String edgeStackId = "%s-EdgeStack".formatted(deploymentName);
        EdgeStack edgeStack = new EdgeStack(
                app,
                edgeStackId,
                EdgeStack.EdgeStackProps.builder()
                        .env(Environment.builder().region("us-east-1").build())
                        .crossRegionReferences(true)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .hostedZoneName(hostedZoneName)
                        .hostedZoneId(hostedZoneId)
                        .domainName(domainName)
                        .baseUrl(baseUrl)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .certificateArn(certificateArn)
                        .pathsToOriginLambdaFunctionUrls(pathsToOriginLambdaFunctionUrls)
                        .accessLogGroupRetentionPeriodDays(Integer.parseInt(accessLogGroupRetentionPeriodDays))
                        .build());

        // Create the Publish stack (Bucket Deployments to CloudFront)
        String publishStackId = "%s-PublishStack".formatted(deploymentName);
        PublishStack publishStack = new PublishStack(
                app,
                publishStackId,
                PublishStack.PublishStackProps.builder()
                        .env(Environment.builder().region("us-east-1").build())
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .domainName(domainName)
                        .baseUrl(baseUrl)
                        .webBucketArn(edgeStack.originBucket.getBucketArn()) // TODO: Get bucker by predicted name
                        .resourceNamePrefix(resourceNamePrefix)
                        .distributionArn(edgeStack.distribution.getDistributionArn()) // TODO: Get distribution by domain name
                        .commitHash(commitHash)
                        .docRootPath(docRootPath)
                        .build());
        publishStack.addDependency(edgeStack);

        // Create the SelfDestruct stack only for non-prod deployments
        if (!"prod".equals(deploymentName)) {
            String selfDestructStackId = "%s-SelfDestructStack".formatted(deploymentName);
            SelfDestructStack selfDestructStack = new SelfDestructStack(
                    app,
                    selfDestructStackId,
                    SelfDestructStack.SelfDestructStackProps.builder()
                            .env(Environment.builder().region("us-east-1").build())
                            .crossRegionReferences(false)
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

    // populate props from cdk.json context using exact camelCase keys
    private static SubmitDeliveryProps loadAppProps(Construct scope) {
        SubmitDeliveryProps props = SubmitDeliveryProps.Builder.create().build();
        var cdkPath = Paths.get("cdk.json").toAbsolutePath();
        if(!new File("cdk.json").exists()){
            warnf("Cannot find application properties (cdk.json) at %s", cdkPath);
        } else {
            infof("Loading application properties from cdk.json %s", cdkPath);
            for (Field f : SubmitDeliveryProps.class.getDeclaredFields()) {
                if (f.getType() != String.class) continue;
                try {
                    f.setAccessible(true);
                    String current = (String) f.get(props);
                    String fieldName = f.getName();
                    String ctx = getContextValueString(scope, fieldName, current);
                    if (ctx != null) f.set(props, ctx);
                    infof("Loaded context %s=%s", fieldName, ctx);
                } catch (Exception e) {
                    warnf("Failed to read context for %s: %s", f.getName(), e.getMessage());
                }
            }
        }
        // default env to dev if not set
        if (props.env == null || props.env.isBlank()) props.env = "dev";
        return props;
    }
}
