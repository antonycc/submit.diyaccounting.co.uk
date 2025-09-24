package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.awssdk.KindCdk;
import co.uk.diyaccounting.submit.stacks.ApplicationStack;
import co.uk.diyaccounting.submit.stacks.AuthStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.IdentityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityStack;
import co.uk.diyaccounting.submit.stacks.OpsStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

import java.io.File;
import java.lang.reflect.Field;
import java.nio.file.Paths;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class SubmitApplication {

    public static class SubmitApplicationProps {
        // Fields match cdk.json context keys (camelCase). Environment overrides are applied in SubmitApplication
        // selectively.
        // common
        public String env;
        public String deploymentName;
        public String hostedZoneName;
        public String hostedZoneId;
        public String subDomainName;
        public String cloudTrailEnabled;
        public String xRayEnabled;
        public String verboseLogging;
        public String cloudTrailLogGroupPrefix;
        public String cloudTrailLogGroupRetentionPeriodDays;
        public String accessLogGroupRetentionPeriodDays;
        public String s3UseExistingBucket;
        public String s3RetainOriginBucket;
        public String s3RetainReceiptsBucket;
        public String hmrcClientId;
        public String hmrcClientSecretArn;
        public String googleClientId;
        public String googleClientSecretArn;
        public String antonyccClientId;
        public String antonyccBaseUri;
        public String cognitoDomainPrefix;
        public String hmrcBaseUri;
        public String baseImageTag;
        public String selfDestructHandlerSource;
        public String selfDestructDelayHours;
        public String authCertificateArn;
        public String optionalTestAccessToken;
        public String optionalTestS3Endpoint;
        public String optionalTestS3AccessKey;
        public String optionalTestS3SecretKey;
        public String receiptsBucketPostfix;
        public String lambdaEntry;
        public String lambdaUrlAuthType;

        public static class Builder {
            private final SubmitApplicationProps p = new SubmitApplicationProps();

            public static Builder create() {
                return new Builder();
            }

            public SubmitApplicationProps build() {
                return p;
            }

            public Builder set(String key, String value) {
                try {
                    var f = SubmitApplicationProps.class.getDeclaredField(key);
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
        SubmitApplicationProps appProps = loadAppProps(app);

        // Determine environment and deployment name from env or appProps
        String envName = envOr("ENV_NAME", appProps.env);
        String deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);

        // Determine primary environment (account/region) from CDK env
        String cdkDefaultAccount = System.getenv("CDK_DEFAULT_ACCOUNT");
        String cdkDefaultRegion = System.getenv("CDK_DEFAULT_REGION");
        software.amazon.awscdk.Environment primaryEnv = null;
        if (cdkDefaultAccount != null
                && !cdkDefaultAccount.isBlank()
                && cdkDefaultRegion != null
                && !cdkDefaultRegion.isBlank()) {
            primaryEnv = Environment.builder()
                    .account(cdkDefaultAccount)
                    .region(cdkDefaultRegion)
                    .build();
            infof("Using primary environment account %s region %s", cdkDefaultAccount, cdkDefaultRegion);
        } else {
            primaryEnv = Environment.builder().build();
            warnf(
                    "CDK_DEFAULT_ACCOUNT or CDK_DEFAULT_REGION environment variables are not set, using environment agnostic stacks");
        }

        // Allow environment variables to override any appProps values
        var hostedZoneId = envOr("HOSTED_ZONE_ID", appProps.hostedZoneId, "(from hostedZoneId in cdk.json)");
        var hostedZoneName = envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName, "(from hostedZoneName in cdk.json)");
        var subDomainName = envOr("SUB_DOMAIN_NAME", appProps.subDomainName, "(from subDomainName in cdk.json)");
        var hmrcBaseUri = envOr("DIY_SUBMIT_HMRC_BASE_URI", appProps.hmrcBaseUri, "(from hmrcBaseUri in cdk.json)");
        var hmrcClientId = envOr("DIY_SUBMIT_HMRC_CLIENT_ID", appProps.hmrcClientId, "(from hmrcClientId in cdk.json)");
        var hmrcClientSecretArn = envOr(
                "DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN",
                appProps.hmrcClientSecretArn,
                "(from hmrcClientSecretArn in cdk.json)");
        var optionalTestAccessToken = envOr(
                "OPTIONAL_TEST_ACCESS_TOKEN",
                appProps.optionalTestAccessToken,
                "(from optionalTestAccessToken in cdk.json)");
        var optionalTestS3Endpoint = envOr(
                "OPTIONAL_TEST_S3_ENDPOINT",
                appProps.optionalTestS3Endpoint,
                "(from optionalTestS3Endpoint in cdk.json)");
        var optionalTestS3AccessKey = envOr(
                "OPTIONAL_TEST_S3_ACCESS_KEY",
                appProps.optionalTestS3AccessKey,
                "(from optionalTestS3AccessKey in cdk.json)");
        var optionalTestS3SecretKey = envOr(
                "OPTIONAL_TEST_S3_SECRET_KEY",
                appProps.optionalTestS3SecretKey,
                "(from optionalTestS3SecretKey in cdk.json)");
        var lambdaEntry = envOr("LAMBDA_ENTRY", appProps.lambdaEntry, "(from lambdaEntry in cdk.json)");
        var lambdaUrlAuthType =
                envOr("LAMBDA_URL_AUTH_TYPE", appProps.lambdaUrlAuthType, "(from lambdaUrlAuthType in cdk.json)");
        var receiptsBucketPostfix = envOr(
                "RECEIPTS_BUCKET_POSTFIX", appProps.receiptsBucketPostfix, "(from receiptsBucketPostfix in cdk.json)");
        var baseImageTag = envOr("BASE_IMAGE_TAG", appProps.baseImageTag, "(from baseImageTag in cdk.json)");
        var selfDestructDelayHours = envOr(
                "SELF_DESTRUCT_DELAY_HOURS",
                appProps.selfDestructDelayHours,
                "(from selfDestructDelayHours in cdk.json)");
        var selfDestructHandlerSource = envOr(
                "SELF_DESTRUCT_HANDLER_SOURCE",
                appProps.selfDestructHandlerSource,
                "(from selfDestructHandlerSource in cdk.json)");
        var cloudTrailEnabled =
                envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled, "(from cloudTrailEnabled in cdk.json)");
        var xRayEnabled = envOr("X_RAY_ENABLED", appProps.xRayEnabled, "(from xRayEnabled in cdk.json)");
        var verboseLogging = envOr("VERBOSE_LOGGING", appProps.verboseLogging, "(from verboseLogging in cdk.json)");
        var s3UseExistingBucket =
                envOr("S3_USE_EXISTING_BUCKET", appProps.s3UseExistingBucket, "(from s3UseExistingBucket in cdk.json)");
        var s3RetainOriginBucket = envOr(
                "S3_RETAIN_ORIGIN_BUCKET", appProps.s3RetainOriginBucket, "(from s3RetainOriginBucket in cdk.json)");
        var s3RetainReceiptsBucket = envOr(
                "S3_RETAIN_RECEIPTS_BUCKET",
                appProps.s3RetainReceiptsBucket,
                "(from s3RetainReceiptsBucket in cdk.json)");
        var authCertificateArn =
                envOr("AUTH_CERTIFICATE_ARN", appProps.authCertificateArn, "(from authCertificateArn in cdk.json)");
        var googleClientId =
                envOr("DIY_SUBMIT_GOOGLE_CLIENT_ID", appProps.googleClientId, "(from googleClientId in cdk.json)");
        var googleClientSecretArn = envOr(
                "DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN",
                appProps.googleClientSecretArn,
                "(from googleClientSecretArn in cdk.json)");
        var antonyccClientId = envOr(
                "DIY_SUBMIT_ANTONYCC_CLIENT_ID", appProps.antonyccClientId, "(from antonyccClientId in cdk.json)");
        var antonyccBaseUri =
                envOr("DIY_SUBMIT_ANTONYCC_BASE_URI", appProps.antonyccBaseUri, "(from antonyccBaseUri in cdk.json)");

        // Generate predictable resource name prefix based on domain and environment
        String domainName = buildDomainName(envName, subDomainName, hostedZoneName);
        String baseUrl = "https://%s/".formatted(domainName);
        String resourceNamePrefix = generateResourceNamePrefix(domainName, envName);
        String compressedResourceNamePrefix = generateCompressedResourceNamePrefix(domainName, envName);

        // Create ObservabilityStack with resources used in monitoring the application
        String observabilityStackId = "%s-ObservabilityStack".formatted(deploymentName);
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                observabilityStackId, deploymentName, envName);

        ObservabilityStack observabilityStack = new ObservabilityStack(
                app,
                observabilityStackId,
                ObservabilityStack.ObservabilityStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .hostedZoneName(hostedZoneName)
                        .subDomainName(subDomainName)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .xRayEnabled(xRayEnabled)
                        .cloudTrailLogGroupPrefix(appProps.cloudTrailLogGroupPrefix)
                        .cloudTrailLogGroupRetentionPeriodDays(appProps.cloudTrailLogGroupRetentionPeriodDays)
                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                        .build());

        // Create DevStack with resources only used during development or deployment (e.g. ECR)
        String devStackId = "%s-DevStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", devStackId, deploymentName, envName);
        DevStack devStack = new DevStack(
                app,
                devStackId,
                DevStack.DevStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .hostedZoneName(hostedZoneName)
                        .subDomainName(subDomainName)
                        .retainEcrRepository("false")
                        .build());

        // Create the identity stack before any user aware services
        String identityStackId = "%s-IdentityStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", identityStackId, deploymentName, envName);
        IdentityStack identityStack = new IdentityStack(
                app,
                identityStackId,
                IdentityStack.IdentityStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .hostedZoneName(hostedZoneName)
                        .hostedZoneId(hostedZoneId)
                        .cognitoDomainPrefix(appProps.cognitoDomainPrefix)
                        .subDomainName(appProps.subDomainName)
                        .authCertificateArn(authCertificateArn)
                        .googleClientId(googleClientId)
                        .googleClientSecretArn(googleClientSecretArn)
                        .antonyccClientId(antonyccClientId)
                        .antonyccBaseUri(antonyccBaseUri)
                        .useExistingAuthCertificate("true")
                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .xRayEnabled(xRayEnabled)
                        .verboseLogging(verboseLogging)
                        .homeUrl(baseUrl)
                        .cognitoFeaturePlan("ESSENTIALS")
                        .cognitoEnableLogDelivery("false")
                        .build());

        // Create the AuthStack with resources used in authentication and authorisation
        String authStackId = "%s-AuthStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", authStackId, deploymentName, envName);
        AuthStack authStack = new AuthStack(
                app,
                authStackId,
                AuthStack.AuthStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .hostedZoneName(hostedZoneName)
                        .subDomainName(subDomainName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .xRayEnabled(xRayEnabled)
                        .baseImageTag(baseImageTag)
                        .ecrRepositoryArn(
                                devStack.ecrRepository.getRepositoryArn()) // TODO: Internally compute from name
                        .ecrRepositoryName(devStack.ecrRepository.getRepositoryName()) // TODO: Get by predictable name
                        .homeUrl(baseUrl)
                        .lambdaEntry(lambdaEntry)
                        .lambdaUrlAuthType(lambdaUrlAuthType)
                        .cognitoClientId(
                                identityStack.userPoolClient
                                        .getUserPoolClientId()) // TODO: Research a way around needing this.
                        .cognitoBaseUri(
                                "https://" + identityStack.userPoolDomain.getDomainName()) // TODO: Get calculated value
                        // .optionalTestAccessToken(optionalTestAccessToken)
                        // .userPool(identityStack.userPool)
                        // .userPoolClient(identityStack.userPoolClient)
                        // .userPoolDomain(identityStack.userPoolDomain)
                        // .identityPool(identityStack.identityPool)
                        // .googleClientId(envOr("DIY_SUBMIT_GOOGLE_CLIENT_ID", appProps.googleClientId))
                        // .antonyccClientId(envOr("DIY_SUBMIT_ANTONYCC_CLIENT_ID", appProps.antonyccClientId))
                        .build());
        authStack.addDependency(devStack);
        // authStack.addDependency(webStack);
        authStack.addDependency(identityStack);

        // Create the ApplicationStack
        String applicationStackId = "%s-ApplicationStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", applicationStackId, deploymentName, envName);
        ApplicationStack applicationStack = new ApplicationStack(
                app,
                applicationStackId,
                ApplicationStack.ApplicationStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .hostedZoneName(hostedZoneName)
                        .subDomainName(subDomainName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .xRayEnabled(xRayEnabled)
                        .verboseLogging(verboseLogging)
                        .baseImageTag(baseImageTag)
                        .ecrRepositoryArn(
                                devStack.ecrRepository.getRepositoryArn()) // TODO: Internally compute from name
                        .ecrRepositoryName(devStack.ecrRepository.getRepositoryName()) // TODO: Get by predictable name
                        .homeUrl(baseUrl)
                        .hmrcBaseUri(hmrcBaseUri)
                        .hmrcClientId(hmrcClientId)
                        .cognitoUserPoolId(
                                identityStack.userPool.getUserPoolId()) // TODO: Research a way around needing this.
                        .lambdaUrlAuthType(lambdaUrlAuthType)
                        .lambdaEntry(lambdaEntry)
                        .hmrcClientSecretArn(hmrcClientSecretArn)
                        .receiptsBucketPostfix(receiptsBucketPostfix)
                        // .optionalTestS3Endpoint(optionalTestS3Endpoint)
                        // .optionalTestS3AccessKey(optionalTestS3AccessKey)
                        // .optionalTestS3SecretKey(optionalTestS3SecretKey)
                        .s3RetainReceiptsBucket(s3RetainReceiptsBucket)
                        // .optionalTestAccessToken(optionalTestAccessToken)
                        .build());
        applicationStack.addDependency(devStack);
        applicationStack.addDependency(identityStack);
S

        // Create the Ops stack (Alarms, etc.)
        // Build list of Lambda function ARNs for OpsStack
        // TODO: Compute ARNs internally in OpsStack from predictable names
        java.util.List<String> lambdaArns = new java.util.ArrayList<>();
        if (applicationStack.authUrlHmrcLambda != null)
            lambdaArns.add(applicationStack.authUrlHmrcLambda.getFunctionArn());
        if (applicationStack.exchangeHmrcTokenLambda != null)
            lambdaArns.add(applicationStack.exchangeHmrcTokenLambda.getFunctionArn());
        if (applicationStack.submitVatLambda != null) lambdaArns.add(applicationStack.submitVatLambda.getFunctionArn());
        if (applicationStack.logReceiptLambda != null)
            lambdaArns.add(applicationStack.logReceiptLambda.getFunctionArn());
        if (applicationStack.catalogLambda != null) lambdaArns.add(applicationStack.catalogLambda.getFunctionArn());
        if (applicationStack.requestBundlesLambda != null)
            lambdaArns.add(applicationStack.requestBundlesLambda.getFunctionArn());
        if (applicationStack.myBundlesLambda != null) lambdaArns.add(applicationStack.myBundlesLambda.getFunctionArn());
        if (applicationStack.myReceiptsLambda != null)
            lambdaArns.add(applicationStack.myReceiptsLambda.getFunctionArn());
        String receiptsBucketArn =
                applicationStack.receiptsBucket != null ? applicationStack.receiptsBucket.getBucketArn() : null;

        String opsStackId = "%s-OpsStack".formatted(deploymentName);
        OpsStack opsStack = new OpsStack(
                app,
                opsStackId,
                OpsStack.OpsStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .domainName(domainName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .lambdaFunctionArns(lambdaArns)
                        // .originBucketArn(webStack.originBucket.getBucketArn())
                        .receiptsBucketArn(receiptsBucketArn)
                        .build());
        opsStack.addDependency(applicationStack);
        // opsStack.addDependency(webStack);

        // Create the SelfDestruct stack only for non-prod deployments and when JAR exists
        if (!"prod".equals(deploymentName)) {
            String selfDestructStackId = "%s-SelfDestructStack".formatted(deploymentName);
            SelfDestructStack selfDestructStack = new SelfDestructStack(
                    app,
                    selfDestructStackId,
                    SelfDestructStack.SelfDestructStackProps.builder()
                            .env(primaryEnv)
                            .crossRegionReferences(false)
                            .envName(envName)
                            .deploymentName(deploymentName)
                            .resourceNamePrefix(resourceNamePrefix)
                            .compressedResourceNamePrefix(compressedResourceNamePrefix)
                            .observabilityStackName(observabilityStack.getStackName())
                            .devStackName(devStack.getStackName())
                            .identityStackName(identityStack.getStackName())
                            .authStackName(applicationStack.getStackName())
                            .applicationStackName(applicationStack.getStackName())
                            // .webStackName(webStack.getStackName())
                            .opsStackName(opsStack.getStackName())
                            .selfDestructDelayHours(selfDestructDelayHours)
                            .selfDestructHandlerSource(selfDestructHandlerSource)
                            .build());
        }

        app.synth();
    }

    // populate from cdk.json context using exact camelCase keys
    private static SubmitApplicationProps loadAppProps(Construct scope) {
        SubmitApplicationProps props = SubmitApplicationProps.Builder.create().build();
        var cdkPath = Paths.get("cdk.json").toAbsolutePath();
        if (!new File("cdk.json").exists()) {
            warnf("Cannot find application properties (cdk.json) at %s", cdkPath);
        } else {
            infof("Loading application properties from cdk.json %s", cdkPath);
            for (Field f : SubmitApplicationProps.class.getDeclaredFields()) {
                if (f.getType() != String.class) continue;
                try {
                    f.setAccessible(true);
                    String current = (String) f.get(props);
                    String fieldName = f.getName();
                    String ctx = KindCdk.getContextValueString(scope, fieldName, current);
                    if (ctx != null) f.set(props, ctx);
                    infof("Load context %s=%s", fieldName, ctx);
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
