package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.ApplicationStack;
import co.uk.diyaccounting.submit.stacks.AuthStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.IdentityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityStack;
import co.uk.diyaccounting.submit.stacks.OpsStack;
import co.uk.diyaccounting.submit.stacks.OpsStackProps;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStackProps;
import co.uk.diyaccounting.submit.stacks.WebStack;
import software.amazon.awscdk.App;
import software.amazon.awscdk.StackProps;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.lang.reflect.Field;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;

public class SubmitApplication {

    public static void main(final String[] args) {

        App app = new App();

        // Build app-level props from cdk-application.json context with environment overrides
        SubmitApplication.Builder builder = SubmitApplication.Builder.create(app, "SubmitApplication");
        SubmitApplicationProps appProps = loadAppProps(builder, app);

        String envName = envOr("ENV_NAME", appProps.env);
        String deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);

        // Allow environment variables to override any appProps values
        var hostedZoneId = envOr("HOSTED_ZONE_ID", appProps.hostedZoneId);
        var hostedZoneName = envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName);
        var subDomainName = envOr("SUB_DOMAIN_NAME", appProps.subDomainName);
        var hmrcBaseUri = envOr("DIY_SUBMIT_HMRC_BASE_URI", appProps.hmrcBaseUri);
        var hmrcClientId = envOr("DIY_SUBMIT_HMRC_CLIENT_ID", appProps.hmrcClientId);
        var hmrcClientSecretArn = envOr("DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", appProps.hmrcClientSecretArn);
        var optionalTestAccessToken = envOr("OPTIONAL_TEST_ACCESS_TOKEN", appProps.optionalTestAccessToken);
        var optionalTestS3Endpoint = envOr("OPTIONAL_TEST_S3_ENDPOINT", appProps.optionalTestS3Endpoint);
        var optionalTestS3AccessKey = envOr("OPTIONAL_TEST_S3_ACCESS_KEY", appProps.optionalTestS3AccessKey);
        var optionalTestS3SecretKey = envOr("OPTIONAL_TEST_S3_SECRET_KEY", appProps.optionalTestS3SecretKey);
        var lambdaEntry = envOr("LAMBDA_ENTRY", appProps.lambdaEntry);
        var lambdaUrlAuthType = envOr("LAMBDA_URL_AUTH_TYPE", appProps.lambdaUrlAuthType);
        var receiptsBucketPostfix = envOr("RECEIPTS_BUCKET_POSTFIX", appProps.receiptsBucketPostfix);
        var baseImageTag = envOr("BASE_IMAGE_TAG", appProps.baseImageTag);
        var selfDestructDelayHours = envOr("SELF_DESTRUCT_DELAY_HOURS", "1");
        var selfDestructHandlerSource = envOr("SELF_DESTRUCT_HANDLER_SOURCE", "target/self-destruct-lambda.jar");
        var cloudTrailEnabled = envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled);
        var xRayEnabled = envOr("X_RAY_ENABLED", appProps.xRayEnabled);
        var verboseLogging = envOr("VERBOSE_LOGGING", appProps.verboseLogging);
        var s3UseExistingBucket = envOr("S3_USE_EXISTING_BUCKET", appProps.s3UseExistingBucket);
        var s3RetainOriginBucket = envOr("S3_RETAIN_ORIGIN_BUCKET", appProps.s3RetainOriginBucket);
        var s3RetainReceiptsBucket = envOr("S3_RETAIN_RECEIPTS_BUCKET", appProps.s3RetainReceiptsBucket);

        // Create ObservabilityStack with resources used in monitoring the application
        String observabilityStackId = "%s-ObservabilityStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", observabilityStackId, deploymentName, envName);

        ObservabilityStack observabilityStack = ObservabilityStack.Builder.create(app, observabilityStackId)
                .props(co.uk.diyaccounting.submit.stacks.ObservabilityStackProps.builder()
                        .env(envName)
                        .hostedZoneName(hostedZoneName)
                        .subDomainName(subDomainName)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .xRayEnabled(xRayEnabled)
                        .cloudTrailLogGroupPrefix(appProps.cloudTrailLogGroupPrefix)
                        .cloudTrailLogGroupRetentionPeriodDays(appProps.cloudTrailLogGroupRetentionPeriodDays)
                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                        .build())
                .build();

        // Create DevStack with resources only used during development or deployment (e.g. ECR)
        String devStackId = "%s-DevStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", devStackId, deploymentName, envName);
        DevStack devStack = DevStack.Builder.create(app, devStackId)
                .props(co.uk.diyaccounting.submit.stacks.DevStackProps.builder()
                        .env(envName)
                        .hostedZoneName(hostedZoneName)
                        .subDomainName(subDomainName)
                        .build())
                .build();

        // Create the identity stack before any user aware services
        String identityStackId = "%s-IdentityStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", identityStackId, deploymentName, envName);
        IdentityStack identityStack = IdentityStack.Builder.create(app, identityStackId)
                .props(co.uk.diyaccounting.submit.stacks.IdentityStackProps.builder()
                        .env(envName)
                        .hostedZoneName(hostedZoneName)
                        .hostedZoneId(hostedZoneId)
                        .cognitoDomainPrefix(appProps.cognitoDomainPrefix)
                        .subDomainName(appProps.subDomainName)
                        .authCertificateArn(envOr("AUTH_CERTIFICATE_ARN", appProps.authCertificateArn))
                        .googleClientId(envOr("DIY_SUBMIT_GOOGLE_CLIENT_ID", appProps.googleClientId))
                        .googleClientSecretArn(
                                envOr("DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN", appProps.googleClientSecretArn))
                        .antonyccClientId(envOr("DIY_SUBMIT_ANTONYCC_CLIENT_ID", appProps.antonyccClientId))
                        .antonyccBaseUri(envOr("DIY_SUBMIT_ANTONYCC_BASE_URI", appProps.antonyccBaseUri))
                        .antonyccClientSecretArn(
                                envOr("DIY_SUBMIT_ANTONYCC_CLIENT_SECRET_ARN", appProps.antonyccClientSecretArn))
                        .build())
                .build();

        // Create WebStack with resources used in running the application
        String webStackId = "%s-WebStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", webStackId, deploymentName, envName);

        // Determine primary environment (account/region) from CDK env
        String cdkDefaultAccount = System.getenv("CDK_DEFAULT_ACCOUNT");
        String cdkDefaultRegion = System.getenv("CDK_DEFAULT_REGION");
        software.amazon.awscdk.Environment primaryEnv = null;
        if (cdkDefaultAccount != null && !cdkDefaultAccount.isBlank() && cdkDefaultRegion != null && !cdkDefaultRegion.isBlank()) {
            primaryEnv = software.amazon.awscdk.Environment.builder()
                    .account(cdkDefaultAccount)
                    .region(cdkDefaultRegion)
                    .build();
        }

        WebStack webStack = (primaryEnv != null)
                ? WebStack.Builder.create(app, webStackId,
                        StackProps.builder()
                                .env(primaryEnv)
                                .crossRegionReferences(true)
                                .build())
                .props(co.uk.diyaccounting.submit.stacks.WebStackProps.builder()
                        .env(envName)
                        .hostedZoneName(hostedZoneName)
                        .hostedZoneId(hostedZoneId)
                        .subDomainName(subDomainName)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .xRayEnabled(xRayEnabled)
                        .verboseLogging(verboseLogging)
                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                        .s3UseExistingBucket(s3UseExistingBucket)
                        .s3RetainOriginBucket(s3RetainOriginBucket)
                        .build())
                // .trail(observabilityStack.trail)
                .build()
                : WebStack.Builder.create(app, webStackId)
                .props(co.uk.diyaccounting.submit.stacks.WebStackProps.builder()
                        .env(envName)
                        .hostedZoneName(hostedZoneName)
                        .hostedZoneId(hostedZoneId)
                        .subDomainName(subDomainName)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .xRayEnabled(xRayEnabled)
                        .verboseLogging(verboseLogging)
                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                        .s3UseExistingBucket(s3UseExistingBucket)
                        .s3RetainOriginBucket(s3RetainOriginBucket)
                        .build())
                // .trail(observabilityStack.trail)
                .build();

        // Create the AuthStack with resources used in authentication and authorisation
        String authStackId = "%s-AuthStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", authStackId, deploymentName, envName);
        AuthStack authStack = AuthStack.Builder.create(app, authStackId)
            .props(co.uk.diyaccounting.submit.stacks.AuthStackProps.builder()
                .env(envName)
                .hostedZoneName(hostedZoneName)
                .subDomainName(subDomainName)
                .cloudTrailEnabled(cloudTrailEnabled)
                .xRayEnabled(xRayEnabled)
                .baseImageTag(baseImageTag)
                .ecrRepositoryArn(devStack.ecrRepository.getRepositoryArn())
                .ecrRepositoryName(devStack.ecrRepository.getRepositoryName())
                .homeUrl(envOr("HOME_URL", webStack.baseUrl))
                .cognitoClientId(identityStack.userPoolClient.getUserPoolClientId())
                .cognitoBaseUri(identityStack.userPoolDomain.getDomainName())
                .optionalTestAccessToken(optionalTestAccessToken)
                //.userPool(identityStack.userPool)
                //.userPoolClient(identityStack.userPoolClient)
                //.userPoolDomain(identityStack.userPoolDomain)
                //.identityPool(identityStack.identityPool)
                //.googleClientId(envOr("DIY_SUBMIT_GOOGLE_CLIENT_ID", appProps.googleClientId))
                //.antonyccClientId(envOr("DIY_SUBMIT_ANTONYCC_CLIENT_ID", appProps.antonyccClientId))
                .build())
            .build();
        authStack.addDependency(devStack);
        authStack.addDependency(webStack);
        authStack.addDependency(identityStack);

        // Create the ApplicationStack
        String applicationStackId = "%s-ApplicationStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", applicationStackId, deploymentName, envName);
        ApplicationStack applicationStack = ApplicationStack.Builder.create(app, applicationStackId)
            .props(co.uk.diyaccounting.submit.stacks.ApplicationStackProps.builder()
                .env(envName)
                .hostedZoneName(hostedZoneName)
                .subDomainName(subDomainName)
                .cloudTrailEnabled(cloudTrailEnabled)
                .xRayEnabled(xRayEnabled)
                .verboseLogging(verboseLogging)
                .baseImageTag(baseImageTag)
                .ecrRepositoryArn(devStack.ecrRepository.getRepositoryArn())
                .ecrRepositoryName(devStack.ecrRepository.getRepositoryName())
                .homeUrl(envOr("DIY_SUBMIT_HOME_URL", webStack.baseUrl))
                .hmrcBaseUri(hmrcBaseUri)
                .hmrcClientId(hmrcClientId)
                .lambdaUrlAuthType(lambdaUrlAuthType)
                .lambdaEntry(lambdaEntry)
                .hmrcClientSecretArn(hmrcClientSecretArn)
                .receiptsBucketPostfix(receiptsBucketPostfix)
                .optionalTestS3Endpoint(optionalTestS3Endpoint)
                .optionalTestS3AccessKey(optionalTestS3AccessKey)
                .optionalTestS3SecretKey(optionalTestS3SecretKey)
                .s3RetainReceiptsBucket(s3RetainReceiptsBucket)
                .optionalTestAccessToken(optionalTestAccessToken)
                .build())
            .build();
        applicationStack.addDependency(devStack);
        applicationStack.addDependency(webStack);
        applicationStack.addDependency(identityStack);

        // Create the Ops stack (Alarms, etc.)
        // Build list of Lambda function ARNs for OpsStack
        java.util.List<String> lambdaArns = new java.util.ArrayList<>();
        if (applicationStack.authUrlHmrcLambda != null) lambdaArns.add(applicationStack.authUrlHmrcLambda.getFunctionArn());
        if (applicationStack.exchangeHmrcTokenLambda != null) lambdaArns.add(applicationStack.exchangeHmrcTokenLambda.getFunctionArn());
        if (applicationStack.submitVatLambda != null) lambdaArns.add(applicationStack.submitVatLambda.getFunctionArn());
        if (applicationStack.logReceiptLambda != null) lambdaArns.add(applicationStack.logReceiptLambda.getFunctionArn());
        if (applicationStack.catalogLambda != null) lambdaArns.add(applicationStack.catalogLambda.getFunctionArn());
        if (applicationStack.myBundlesLambda != null) lambdaArns.add(applicationStack.myBundlesLambda.getFunctionArn());
        if (applicationStack.myReceiptsLambda != null) lambdaArns.add(applicationStack.myReceiptsLambda.getFunctionArn());
        String receiptsBucketArn = applicationStack.receiptsBucket != null ? applicationStack.receiptsBucket.getBucketArn() : null;

        String opsStackId = "%s-OpsStack".formatted(deploymentName);
        OpsStack opsStack = new OpsStack(
            app,
            opsStackId,
            OpsStackProps.builder()
                .env(primaryEnv)
                .envName(envName)
                .deploymentName(deploymentName)
                .domainName(webStack.domainName)
                .resourceNamePrefix(webStack.resourceNamePrefix)
                .compressedResourceNamePrefix(webStack.compressedResourceNamePrefix)
                .lambdaFunctionArns(lambdaArns)
                .originBucketArn(webStack.originBucket.getBucketArn())
                .receiptsBucketArn(receiptsBucketArn)
                .build());
        opsStack.addDependency(applicationStack);
        opsStack.addDependency(webStack);

        // Create the SelfDestruct stack only for non-prod deployments and when JAR exists
        if (!"prod".equals(deploymentName)) {
            String selfDestructStackId = "%s-SelfDestructStack".formatted(deploymentName);
            SelfDestructStack selfDestructStack = new SelfDestructStack(
                app,
                selfDestructStackId,
                SelfDestructStackProps.builder()
                    .envName(envName)
                    .deploymentName(deploymentName)
                    .resourceNamePrefix(webStack.resourceNamePrefix)
                    .compressedResourceNamePrefix(webStack.compressedResourceNamePrefix)
                    .observabilityStackName(observabilityStack.getStackName())
                    .devStackName(devStack.getStackName())
                    .identityStackName(identityStack.getStackName())
                    .authStackName(applicationStack.getStackName())
                    .applicationStackName(applicationStack.getStackName())
                    .webStackName(webStack.getStackName())
                    .opsStackName(opsStack.getStackName())
                    .selfDestructDelayHours(selfDestructDelayHours)
                    .selfDestructHandlerSource(selfDestructHandlerSource)
                    .build());
        }

        app.synth();
    }

    private static SubmitApplicationProps loadAppProps(SubmitApplication.Builder builder, Construct scope) {
        SubmitApplicationProps props = SubmitApplicationProps.Builder.create().build();
        // populate from cdk-application.json context using exact camelCase keys
        for (Field f : SubmitApplicationProps.class.getDeclaredFields()) {
            if (f.getType() != String.class) continue;
            try {
                f.setAccessible(true);
                String current = (String) f.get(props);
                String fieldName = f.getName();
                String ctx = builder.getContextValueString(scope, fieldName, current);
                if (ctx != null) f.set(props, ctx);
            } catch (Exception e) {
                warnf("Failed to read context for %s: %s", f.getName(), e.getMessage());
            }
        }
        // default env to dev if not set
        if (props.env == null || props.env.isBlank()) props.env = "dev";
        return props;
    }

    private static String envOr(String key, String fallback) {
        String v = System.getenv(key);
        return (v != null && !v.isBlank()) ? v : fallback;
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

        public static SubmitApplication.Builder create(Construct scope, String id) {
            return new SubmitApplication.Builder(scope, id, null);
        }

        public static SubmitApplication.Builder create(Construct scope, String id, StackProps props) {
            return new SubmitApplication.Builder(scope, id, props);
        }

        public String getContextValueString(Construct scope, String contextKey, String defaultValue) {
            var contextValue = scope.getNode().tryGetContext(contextKey);
            String defaultedValue;
            String source;
            if (StringUtils.isNotBlank(contextValue.toString())) {
                defaultedValue = contextValue.toString();
                source = "CDK context";
            } else {
                defaultedValue = defaultValue;
                source = "default value";
            }

            infof("Context %s resolved from %s with value: %s", contextKey, source, defaultedValue);

            return defaultedValue;
        }
    }
}
