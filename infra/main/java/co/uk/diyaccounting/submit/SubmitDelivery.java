package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.putIfNotNull;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.KindCdk.getContextValueString;

import co.uk.diyaccounting.submit.stacks.EdgeStack;
import co.uk.diyaccounting.submit.stacks.PublishStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Fn;
import software.constructs.Construct;

import java.lang.reflect.Field;
import java.nio.file.Paths;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

public class SubmitDelivery {

    public final EdgeStack edgeStack;
    public final PublishStack publishStack;
    public final SelfDestructStack selfDestructStack;

    // Fields match cdk.json context keys (camelCase). Environment overrides are applied in SubmitDelivery
    public static class SubmitDeliveryProps {
        public String envName;
        public String deploymentName;
        public String hostedZoneName;
        public String hostedZoneId;
        public String subDomainName;
        public String cognitoDomainPrefix;
        public String certificateArn;
        public String docRootPath;
        public String domainName;
        public String cloudTrailEnabled;
        public String baseUrl;
        public String accessLogGroupRetentionPeriodDays;
        public String httpApiUrl;
        public String authUrlCognitoLambdaFunctionUrl;
        public String exchangeCognitoTokenLambdaFunctionUrl;
        public String authUrlHmrcLambdaFunctionUrl;
        public String exchangeHmrcTokenLambdaFunctionUrl;
        public String submitVatLambdaFunctionUrl;
        public String logReceiptLambdaFunctionUrl;
        public String catalogLambdaFunctionUrl;
        public String requestBundlesLambdaFunctionUrl;
        public String bundleDeleteLambdaFunctionUrl;
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
        SubmitDeliveryProps appProps = loadAppProps(app);
        var submitDelivery = new SubmitDelivery(app, appProps);
        app.synth();
        infof("CDK synth complete");

        infof("Created stack: %s", submitDelivery.edgeStack.getStackName());
        infof("Created stack: %s", submitDelivery.publishStack.getStackName());
        if (submitDelivery.selfDestructStack != null) {
            infof("Created stack: %s", submitDelivery.selfDestructStack.getStackName());
        } else {
            infof("No SelfDestruct stack created for prod deployment");
        }
    }

    public SubmitDelivery(App app, SubmitDeliveryProps appProps) {

        // Environment e.g. ci, prod, and deployment name e.g. ci-branchname, prod
        var envName = envOr("ENVIRONMENT_NAME", appProps.envName);
        var deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);
        var commitHash = envOr("COMMIT_HASH", "local");
        var websiteHash = envOr("WEBSITE_HASH", "local");
        var buildNumber = envOr("BUILD_NUMBER", "local");

        // Determine primary environment (account/region) from CDK env
        Environment primaryEnv = KindCdk.buildPrimaryEnvironment();
        Environment usEast1Env = Environment.builder()
                .region("us-east-1")
                .account(primaryEnv.getAccount())
                .build();

        var nameProps = new SubmitSharedNames.SubmitSharedNamesProps();
        nameProps.envName = envName;
        nameProps.deploymentName = deploymentName;
        nameProps.hostedZoneName = appProps.hostedZoneName;
        nameProps.subDomainName = appProps.subDomainName;
        nameProps.cognitoDomainPrefix = appProps.cognitoDomainPrefix;
        nameProps.regionName = primaryEnv.getRegion();
        nameProps.awsAccount = primaryEnv.getAccount();
        var sharedNames = new SubmitSharedNames(nameProps);

        // Support environment specific overrides of some cdk.json values
        var cloudTrailEnabled =
                envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled, "(from cloudTrailEnabled in cdk.json)");
        var accessLogGroupRetentionPeriodDays = Integer.parseInt(
                envOr("ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS", appProps.accessLogGroupRetentionPeriodDays, "30"));
        var selfDestructHandlerSource = envOr(
                "SELF_DESTRUCT_HANDLER_SOURCE",
                appProps.selfDestructHandlerSource,
                "(from selfDestructHandlerSource in cdk.json)");
        var selfDestructDelayHoursString = envOr(
                "SELF_DESTRUCT_DELAY_HOURS",
                appProps.selfDestructDelayHours,
                "(from selfDestructDelayHours in cdk.json)");
        int selfDestructDelayHours = Integer.parseInt(selfDestructDelayHoursString);
        var selfDestructStartDatetimeIso = envOr(
                "SELF_DESTRUCT_START_DATETIME",
                ZonedDateTime.now().plusHours(selfDestructDelayHours).format(DateTimeFormatter.ISO_DATE_TIME),
                "(from current time plus delay hours)");
        ZonedDateTime selfDestructStartDatetime = ZonedDateTime.parse(selfDestructStartDatetimeIso);
        infof("Self-destruct start datetime: %s", selfDestructStartDatetime);
        var docRootPath = envOr("DOC_ROOT_PATH", appProps.docRootPath, "(from docRootPath in cdk.json)");

        // Function URL environment variables for EdgeStack
        String httpApiUrl = envOr("HTTP_API_URL", appProps.httpApiUrl, "(from httpApiUrl in cdk.json)");
        var authUrlCognitoLambdaFunctionUrl = envOr(
                "AUTH_URL_COGNITO_LAMBDA_URL",
                appProps.authUrlCognitoLambdaFunctionUrl,
                "(from authUrlCognitoLambdaFunctionUrl in cdk.json)");
        var exchangeCognitoTokenLambdaFunctionUrl = envOr(
                "COGNITO_EXCHANGE_TOKEN_LAMBDA_URL",
                appProps.exchangeCognitoTokenLambdaFunctionUrl,
                "(from exchangeCognitoTokenLambdaFunctionUrl in cdk.json)");
        var authUrlHmrcLambdaFunctionUrl = envOr(
                "AUTH_URL_HMRC_LAMBDA_URL",
                appProps.authUrlHmrcLambdaFunctionUrl,
                "(from authUrlHmrcLambdaFunctionUrl in cdk.json)");
        var exchangeHmrcTokenLambdaFunctionUrl = envOr(
                "EXCHANGE_HMRC_TOKEN_LAMBDA_URL",
                appProps.exchangeHmrcTokenLambdaFunctionUrl,
                "(from exchangeHmrcTokenLambdaFunctionUrl in cdk.json)");
        var submitVatLambdaFunctionUrl = envOr(
                "SUBMIT_VAT_LAMBDA_URL",
                appProps.submitVatLambdaFunctionUrl,
                "(from submitVatLambdaFunctionUrl in cdk.json)");
        var logReceiptLambdaFunctionUrl = envOr(
                "LOG_RECEIPT_LAMBDA_URL",
                appProps.logReceiptLambdaFunctionUrl,
                "(from logReceiptLambdaFunctionUrl in cdk.json)");
        var catalogLambdaFunctionUrl = envOr(
                "CATALOG_LAMBDA_URL", appProps.catalogLambdaFunctionUrl, "(from catalogLambdaFunctionUrl in cdk.json)");
        var requestBundlesLambdaFunctionUrl = envOr(
                "REQUEST_BUNDLES_LAMBDA_URL",
                appProps.requestBundlesLambdaFunctionUrl,
                "(from requestBundlesLambdaFunctionUrl in cdk.json)");
        var bundleDeleteLambdaFunctionUrl = envOr(
                "BUNDLE_DELETE_LAMBDA_URL",
                appProps.bundleDeleteLambdaFunctionUrl,
                "(from bundleDeleteLambdaFunctionUrl in cdk.json)");
        var myBundlesLambdaFunctionUrl = envOr(
                "MY_BUNDLES_LAMBDA_URL",
                appProps.myBundlesLambdaFunctionUrl,
                "(from myBundlesLambdaFunctionUrl in cdk.json)");
        var myReceiptsLambdaFunctionUrl = envOr(
                "MY_RECEIPTS_LAMBDA_URL",
                appProps.myReceiptsLambdaFunctionUrl,
                "(from myReceiptsLambdaFunctionUrl in cdk.json)");

        // Create Function URLs map for EdgeStack (cross-region compatible)
        Map<String, String> pathsToFns = new java.util.HashMap<>();
        putIfNotNull(
                pathsToFns, "%s*".formatted(sharedNames.authUrlCognitoLambdaUrlPath), authUrlCognitoLambdaFunctionUrl);
        putIfNotNull(
                pathsToFns,
                "%s*".formatted(sharedNames.exchangeCognitoTokenLambdaUrlPath),
                exchangeCognitoTokenLambdaFunctionUrl);
        putIfNotNull(pathsToFns, "%s*".formatted(sharedNames.authUrlHmrcLambdaUrlPath), authUrlHmrcLambdaFunctionUrl);
        putIfNotNull(
                pathsToFns,
                "%s*".formatted(sharedNames.exchangeHmrcTokenLambdaUrlPath),
                exchangeHmrcTokenLambdaFunctionUrl);
        putIfNotNull(pathsToFns, "%s*".formatted(sharedNames.submitVatLambdaUrlPath), submitVatLambdaFunctionUrl);
        putIfNotNull(pathsToFns, "%s*".formatted(sharedNames.logReceiptLambdaUrlPath), logReceiptLambdaFunctionUrl);
        putIfNotNull(pathsToFns, "%s*".formatted(sharedNames.myReceiptsLambdaUrlPath), myReceiptsLambdaFunctionUrl);
        putIfNotNull(pathsToFns, "%s*".formatted(sharedNames.catalogLambdaUrlPath), catalogLambdaFunctionUrl);
        putIfNotNull(
                pathsToFns, "%s*".formatted(sharedNames.requestBundlesLambdaUrlPath), requestBundlesLambdaFunctionUrl);
        putIfNotNull(pathsToFns, "%s*".formatted(sharedNames.bundleDeleteLambdaUrlPath), bundleDeleteLambdaFunctionUrl);
        putIfNotNull(pathsToFns, "%s*".formatted(sharedNames.myBundlesLambdaUrlPath), myBundlesLambdaFunctionUrl);
        
        // Import API Gateway URL from application stack via CloudFormation export
        String apiGatewayExportName = sharedNames.appResourceNamePrefix + "-HttpApiUrl";
        String apiGatewayUrl = null;
        try {
            apiGatewayUrl = Fn.importValue(apiGatewayExportName);
            infof("Imported API Gateway URL from export %s", apiGatewayExportName);
        } catch (RuntimeException e) {
            warnf("Failed to import API Gateway URL from CloudFormation export %s. This may indicate the ApiStack has not been deployed yet. Exception: %s", apiGatewayExportName, e.getMessage());
        }

        // Create the Edge stack (CloudFront, Route53)
        this.edgeStack = new EdgeStack(
                app,
                sharedNames.edgeStackId,
                EdgeStack.EdgeStackProps.builder()
                        .env(usEast1Env)
                        .crossRegionReferences(true)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.delResourceNamePrefix)
                        .compressedResourceNamePrefix(sharedNames.delCompressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .hostedZoneName(appProps.hostedZoneName)
                        .hostedZoneId(appProps.hostedZoneId)
                        .certificateArn(appProps.certificateArn)
                        .pathsToOriginLambdaFunctionUrls(pathsToFns)
                        .apiGatewayUrl(httpApiUrl)
                        .logGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                        .build());

        // Create the Publish stack (Bucket Deployments to CloudFront)
        String distributionId = this.edgeStack.distribution.getDistributionId();
        this.publishStack = new PublishStack(
                app,
                sharedNames.publishStackId,
                PublishStack.PublishStackProps.builder()
                        .env(usEast1Env)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.delResourceNamePrefix)
                        .compressedResourceNamePrefix(sharedNames.delCompressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .distributionId(distributionId)
                        .commitHash(commitHash)
                        .websiteHash(websiteHash)
                        .buildNumber(buildNumber)
                        .docRootPath(docRootPath)
                        .build());
        this.publishStack.addDependency(this.edgeStack);

        // Create the SelfDestruct stack only for non-prod deployments
        if (!"prod".equals(deploymentName)) {
            this.selfDestructStack = new SelfDestructStack(
                    app,
                    sharedNames.delSelfDestructStackId,
                    SelfDestructStack.SelfDestructStackProps.builder()
                            .env(usEast1Env)
                            .crossRegionReferences(false)
                            .envName(envName)
                            .deploymentName(deploymentName)
                            .resourceNamePrefix(sharedNames.delResourceNamePrefix)
                            .compressedResourceNamePrefix(sharedNames.delCompressedResourceNamePrefix)
                            .cloudTrailEnabled(cloudTrailEnabled)
                            .sharedNames(sharedNames)
                            .selfDestructLogGroupName(sharedNames.ue1SelfDestructLogGroupName)
                            .selfDestructStartDatetime(selfDestructStartDatetime)
                            .selfDestructDelayHours(selfDestructDelayHours)
                            .selfDestructHandlerSource(selfDestructHandlerSource)
                            .build());
        } else {
            this.selfDestructStack = null;
        }
    }

    // populate props from cdk.json context using exact camelCase keys
    public static SubmitDelivery.SubmitDeliveryProps loadAppProps(Construct scope) {
        return loadAppProps(scope, null);
    }

    public static SubmitDeliveryProps loadAppProps(Construct scope, String pathPrefix) {
        SubmitDeliveryProps props = SubmitDeliveryProps.Builder.create().build();
        var cdkPath =
                Paths.get((pathPrefix == null ? "" : pathPrefix) + "cdk.json").toAbsolutePath();
        if (!cdkPath.toFile().exists()) {
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
        if (props.envName == null || props.envName.isBlank()) props.envName = "dev";
        return props;
    }
}
