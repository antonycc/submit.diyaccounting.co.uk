package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.awssdk.KindCdk;
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
import software.constructs.Construct;

import java.lang.reflect.Field;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class SubmitApplication {

    public static void main(final String[] args) {

        App app = new App();

        // Build app-level props from cdk.json context with environment overrides
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
        var selfDestructHandlerSource = envOr("SELF_DESTRUCT_HANDLER_SOURCE", "../target/self-destruct-lambda.jar");
        var cloudTrailEnabled = envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled);
        var xRayEnabled = envOr("X_RAY_ENABLED", appProps.xRayEnabled);
        var verboseLogging = envOr("VERBOSE_LOGGING", appProps.verboseLogging);
        var s3UseExistingBucket = envOr("S3_USE_EXISTING_BUCKET", appProps.s3UseExistingBucket);
        var s3RetainOriginBucket = envOr("S3_RETAIN_ORIGIN_BUCKET", appProps.s3RetainOriginBucket);
        var s3RetainReceiptsBucket = envOr("S3_RETAIN_RECEIPTS_BUCKET", appProps.s3RetainReceiptsBucket);
        var authCertificateArn = envOr("AUTH_CERTIFICATE_ARN", appProps.authCertificateArn);
        var googleClientId = envOr("DIY_SUBMIT_GOOGLE_CLIENT_ID", appProps.googleClientId);
        var googleClientSecretArn = envOr("DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN", appProps.googleClientSecretArn);
        var antonyccClientId = envOr("DIY_SUBMIT_ANTONYCC_CLIENT_ID", appProps.antonyccClientId);
        var antonyccBaseUri = envOr("DIY_SUBMIT_ANTONYCC_BASE_URI", appProps.antonyccBaseUri);
        var antonyccClientSecretArn = envOr("DIY_SUBMIT_ANTONYCC_CLIENT_SECRET_ARN", appProps.antonyccClientSecretArn);

        // Generate predictable resource name prefix based on domain and environment
        String domainName = WebStack.Builder.buildDomainName(envName, subDomainName, hostedZoneName);
        String baseUrl = "https://" + domainName;
        String resourceNamePrefix = generateResourceNamePrefix(domainName, envName);
        String compressedResourceNamePrefix = generateCompressedResourceNamePrefix(domainName, envName);

        // Create ObservabilityStack with resources used in monitoring the application
        String observabilityStackId = "%s-ObservabilityStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", observabilityStackId, deploymentName, envName);

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
        infof("Synthesizing stack %s for deployment %s to environment %s", devStackId, deploymentName, envName);
        DevStack devStack = DevStack.Builder.create(app, devStackId)
                .props(co.uk.diyaccounting.submit.stacks.DevStackProps.builder()
                        .env(envName)
                        .hostedZoneName(hostedZoneName)
                        .subDomainName(subDomainName)
                        .build())
                .build();

        // Create the identity stack before any user aware services
        String identityStackId = "%s-IdentityStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", identityStackId, deploymentName, envName);
        IdentityStack identityStack = IdentityStack.Builder.create(app, identityStackId)
                .props(co.uk.diyaccounting.submit.stacks.IdentityStackProps.builder()
                        .env(envName)
                        .hostedZoneName(hostedZoneName)
                        .hostedZoneId(hostedZoneId)
                        .cognitoDomainPrefix(appProps.cognitoDomainPrefix)
                        .subDomainName(appProps.subDomainName)
                        .authCertificateArn(authCertificateArn)
                        .googleClientId(googleClientId)
                        .googleClientSecretArn(googleClientSecretArn)
                        .antonyccClientId(antonyccClientId)
                        .antonyccBaseUri(antonyccBaseUri)
                        .antonyccClientSecretArn(antonyccClientSecretArn)
                        .build())
                .build();

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

        // Create WebStack with resources used in running the application
//        String webStackId = "%s-WebStack".formatted(deploymentName);
//        infof("Synthesizing stack %s for deployment %s to environment %s", webStackId, deploymentName, envName);
//
//        WebStack webStack = (primaryEnv != null)
//                ? WebStack.Builder.create(app, webStackId,
//                        StackProps.builder()
//                                .env(primaryEnv)
//                                .crossRegionReferences(true)
//                                .build())
//                .props(co.uk.diyaccounting.submit.stacks.WebStackProps.builder()
//                        .env(envName)
//                        .hostedZoneName(hostedZoneName)
//                        .hostedZoneId(hostedZoneId)
//                        .subDomainName(subDomainName)
//                        .cloudTrailEnabled(cloudTrailEnabled)
//                        .xRayEnabled(xRayEnabled)
//                        .verboseLogging(verboseLogging)
//                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
//                        .s3UseExistingBucket(s3UseExistingBucket)
//                        .s3RetainOriginBucket(s3RetainOriginBucket)
//                        .build())
//                // .trail(observabilityStack.trail)
//                .build()
//                : WebStack.Builder.create(app, webStackId)
//                .props(co.uk.diyaccounting.submit.stacks.WebStackProps.builder()
//                        .env(envName)
//                        .hostedZoneName(hostedZoneName)
//                        .hostedZoneId(hostedZoneId)
//                        .subDomainName(subDomainName)
//                        .cloudTrailEnabled(cloudTrailEnabled)
//                        .xRayEnabled(xRayEnabled)
//                        .verboseLogging(verboseLogging)
//                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
//                        .s3UseExistingBucket(s3UseExistingBucket)
//                        .s3RetainOriginBucket(s3RetainOriginBucket)
//                        .build())
//                // .trail(observabilityStack.trail)
//                .build();

        // Create the AuthStack with resources used in authentication and authorisation
        String authStackId = "%s-AuthStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", authStackId, deploymentName, envName);
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
                .homeUrl(baseUrl)
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
        //authStack.addDependency(webStack);
        authStack.addDependency(identityStack);

        // Create the ApplicationStack
        String applicationStackId = "%s-ApplicationStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", applicationStackId, deploymentName, envName);
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
                .homeUrl(baseUrl)
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
        //applicationStack.addDependency(webStack);
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
                .domainName(domainName)
                .resourceNamePrefix(resourceNamePrefix)
                .compressedResourceNamePrefix(compressedResourceNamePrefix)
                .lambdaFunctionArns(lambdaArns)
                //.originBucketArn(webStack.originBucket.getBucketArn())
                .receiptsBucketArn(receiptsBucketArn)
                .build());
        opsStack.addDependency(applicationStack);
        //opsStack.addDependency(webStack);

        // Create the SelfDestruct stack only for non-prod deployments and when JAR exists
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
                    .observabilityStackName(observabilityStack.getStackName())
                    .devStackName(devStack.getStackName())
                    .identityStackName(identityStack.getStackName())
                    .authStackName(applicationStack.getStackName())
                    .applicationStackName(applicationStack.getStackName())
                    //.webStackName(webStack.getStackName())
                    .opsStackName(opsStack.getStackName())
                    .selfDestructDelayHours(selfDestructDelayHours)
                    .selfDestructHandlerSource(selfDestructHandlerSource)
                    .build());
        }

        app.synth();
    }

    private static SubmitApplicationProps loadAppProps(SubmitApplication.Builder builder, Construct scope) {
        SubmitApplicationProps props = SubmitApplicationProps.Builder.create().build();
        // populate from cdk.json context using exact camelCase keys
        for (Field f : SubmitApplicationProps.class.getDeclaredFields()) {
            if (f.getType() != String.class) continue;
            try {
                f.setAccessible(true);
                String current = (String) f.get(props);
                String fieldName = f.getName();
                String ctx = KindCdk.getContextValueString(scope, fieldName, current);
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

        public static SubmitApplication.Builder create(Construct scope, String id) {
            return new SubmitApplication.Builder(scope, id, null);
        }

        public static SubmitApplication.Builder create(Construct scope, String id, StackProps props) {
            return new SubmitApplication.Builder(scope, id, props);
        }
    }
}
