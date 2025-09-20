package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.ApplicationStack;
import co.uk.diyaccounting.submit.stacks.AuthStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.EdgeStack;
import co.uk.diyaccounting.submit.stacks.EdgeStackProps;
import co.uk.diyaccounting.submit.stacks.IdentityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityStack;
import co.uk.diyaccounting.submit.stacks.OpsStack;
import co.uk.diyaccounting.submit.stacks.OpsStackProps;
import co.uk.diyaccounting.submit.stacks.PublishStack;
import co.uk.diyaccounting.submit.stacks.PublishStackProps;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStackProps;
import co.uk.diyaccounting.submit.stacks.WebStack;
import java.lang.reflect.Field;
import java.util.Map;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class SubmitApplication {

    private static final Logger logger = LogManager.getLogger(SubmitApplication.class);

    public static void main(final String[] args) {

        App app = new App();

        // Build app-level props from cdk.json context with environment overrides
        SubmitApplication.Builder builder = SubmitApplication.Builder.create(app, "SubmitApplication");
        SubmitApplicationProps appProps = loadAppProps(builder, app);

        String envName = envOr("ENV_NAME", appProps.env);
        String deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);

        // Create ObservabilityStack with resources used in monitoring the application
        String observabilityStackId = "%s-ObservabilityStack".formatted(deploymentName);
        System.out.printf(
                "Synthesizing stack %s for deployment %s to environment %s\n",
                observabilityStackId, deploymentName, envName);

        ObservabilityStack observabilityStack = ObservabilityStack.Builder.create(app, observabilityStackId)
                .props(co.uk.diyaccounting.submit.stacks.ObservabilityStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .subDomainName(appProps.subDomainName)
                        .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
                        .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
                        .cloudTrailLogGroupPrefix(appProps.cloudTrailLogGroupPrefix)
                        .cloudTrailLogGroupRetentionPeriodDays(appProps.cloudTrailLogGroupRetentionPeriodDays)
                        .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                        .build())
                .build();

        // Create DevStack with resources only used during development or deployment (e.g. ECR)
        String devStackId = "%s-DevStack".formatted(deploymentName);
        System.out.printf(
                "Synthesizing stack %s for deployment %s to environment %s\n", devStackId, deploymentName, envName);
        DevStack devStack = new DevStack(app, devStackId,
                co.uk.diyaccounting.submit.stacks.DevStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .subDomainName(appProps.subDomainName)
                        .build());

        // Create the identity stack before any user aware services
        String identityStackId = "%s-IdentityStack".formatted(deploymentName);
        System.out.printf(
                "Synthesizing stack %s for deployment %s to environment %s\n",
                identityStackId, deploymentName, envName);
        IdentityStack identityStack = IdentityStack.Builder.create(app, identityStackId)
                .props(co.uk.diyaccounting.submit.stacks.IdentityStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .hostedZoneId(envOr("HOSTED_ZONE_ID", appProps.hostedZoneId))
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
        System.out.printf(
                "Synthesizing stack %s for deployment %s to environment %s\n", webStackId, deploymentName, envName);
        // Determine primary environment (account/region) from CDK env
        String cdkDefaultAccount = System.getenv("CDK_DEFAULT_ACCOUNT");
        String cdkDefaultRegion = System.getenv("CDK_DEFAULT_REGION");
        software.amazon.awscdk.Environment primaryEnv = null;
        if (cdkDefaultAccount != null
                && !cdkDefaultAccount.isBlank()
                && cdkDefaultRegion != null
                && !cdkDefaultRegion.isBlank()) {
            primaryEnv = software.amazon.awscdk.Environment.builder()
                    .account(cdkDefaultAccount)
                    .region(cdkDefaultRegion)
                    .build();
        }

        WebStack webStack = (primaryEnv != null)
                ? WebStack.Builder.create(
                                app,
                                webStackId,
                                StackProps.builder()
                                        .env(primaryEnv)
                                        .crossRegionReferences(true)
                                        .build())
                        .props(co.uk.diyaccounting.submit.stacks.WebStackProps.builder()
                                .env(envName)
                                .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                                .hostedZoneId(envOr("HOSTED_ZONE_ID", appProps.hostedZoneId))
                                .subDomainName(appProps.subDomainName)
                                .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
                                .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
                                .verboseLogging(envOr("VERBOSE_LOGGING", appProps.verboseLogging))
                                .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                                .s3UseExistingBucket(appProps.s3UseExistingBucket)
                                .s3RetainOriginBucket(appProps.s3RetainOriginBucket)
                                .build())
                        // .trail(observabilityStack.trail)
                        .build()
                : WebStack.Builder.create(app, webStackId)
                        .props(co.uk.diyaccounting.submit.stacks.WebStackProps.builder()
                                .env(envName)
                                .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                                .hostedZoneId(envOr("HOSTED_ZONE_ID", appProps.hostedZoneId))
                                .subDomainName(appProps.subDomainName)
                                .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
                                .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
                                .verboseLogging(envOr("VERBOSE_LOGGING", appProps.verboseLogging))
                                .accessLogGroupRetentionPeriodDays(appProps.accessLogGroupRetentionPeriodDays)
                                .s3UseExistingBucket(appProps.s3UseExistingBucket)
                                .s3RetainOriginBucket(appProps.s3RetainOriginBucket)
                                .build())
                        // .trail(observabilityStack.trail)
                        .build();

        // Create the AuthStack with resources used in authentication and authorisation
        String authStackId = "%s-AuthStack".formatted(deploymentName);
        System.out.printf(
                "Synthesizing stack %s for deployment %s to environment %s\n", authStackId, deploymentName, envName);
        AuthStack authStack = AuthStack.Builder.create(app, authStackId)
                .props(co.uk.diyaccounting.submit.stacks.AuthStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        // .hostedZoneId(envOr("HOSTED_ZONE_ID", appProps.hostedZoneId))
                        .subDomainName(appProps.subDomainName)
                        .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
                        .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
                        .baseImageTag(envOr("BASE_IMAGE_TAG", appProps.baseImageTag))
                        .ecrRepositoryArn(devStack.ecrRepository.getRepositoryArn())
                        .ecrRepositoryName(devStack.ecrRepository.getRepositoryName())
                        .homeUrl(envOr("HOME_URL", webStack.baseUrl))
                        .cognitoClientId(identityStack.userPoolClient.getUserPoolClientId())
                        .cognitoBaseUri(identityStack.userPoolDomain.getDomainName())
                        .optionalTestAccessToken(envOr("OPTIONAL_TEST_ACCESS_TOKEN", appProps.optionalTestAccessToken))
                        // .userPool(identityStack.userPool)
                        // .userPoolClient(identityStack.userPoolClient)
                        // .userPoolDomain(identityStack.userPoolDomain)
                        // .identityPool(identityStack.identityPool)
                        // .googleClientId(envOr("DIY_SUBMIT_GOOGLE_CLIENT_ID", appProps.googleClientId))
                        // .antonyccClientId(envOr("DIY_SUBMIT_ANTONYCC_CLIENT_ID", appProps.antonyccClientId))
                        .build())
                .build();
        authStack.addDependency(devStack);
        authStack.addDependency(webStack);
        authStack.addDependency(identityStack);

        // Create the ApplicationStack
        String applicationStackId = "%s-ApplicationStack".formatted(deploymentName);
        System.out.printf(
                "Synthesizing stack %s for deployment %s to environment %s\n",
                applicationStackId, deploymentName, envName);
        ApplicationStack applicationStack = new ApplicationStack(app, applicationStackId,
                co.uk.diyaccounting.submit.stacks.ApplicationStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .subDomainName(envOr("SUB_DOMAIN_NAME", appProps.subDomainName))
                        .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
                        .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
                        .verboseLogging(envOr("VERBOSE_LOGGING", appProps.verboseLogging))
                        .baseImageTag(envOr("BASE_IMAGE_TAG", appProps.baseImageTag))
                        .ecrRepositoryArn(devStack.ecrRepository.getRepositoryArn())
                        .ecrRepositoryName(devStack.ecrRepository.getRepositoryName())
                        .homeUrl(envOr("DIY_SUBMIT_HOME_URL", webStack.baseUrl))
                        .hmrcBaseUri(envOr("DIY_SUBMIT_HMRC_BASE_URI", appProps.hmrcBaseUri))
                        .hmrcClientId(envOr("DIY_SUBMIT_HMRC_CLIENT_ID", appProps.hmrcClientId))
                        .lambdaUrlAuthType(envOr("LAMBDA_URL_AUTH_TYPE", appProps.lambdaUrlAuthType))
                        .lambdaEntry(envOr("LAMBDA_ENTRY", appProps.lambdaEntry))
                        .hmrcClientSecretArn(envOr("DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN", appProps.hmrcClientSecretArn))
                        .receiptsBucketPostfix(envOr("RECEIPTS_BUCKET_POSTFIX", appProps.receiptsBucketPostfix))
                        .optionalTestS3Endpoint(envOr("OPTIONAL_TEST_S3_ENDPOINT", appProps.optionalTestS3Endpoint))
                        .optionalTestS3AccessKey(envOr("OPTIONAL_TEST_S3_ACCESS_KEY", appProps.optionalTestS3AccessKey))
                        .optionalTestS3SecretKey(envOr("OPTIONAL_TEST_S3_SECRET_KEY", appProps.optionalTestS3SecretKey))
                        .s3RetainReceiptsBucket(appProps.s3RetainReceiptsBucket)
                        // .hmrcClientSecretArn(
                        // .cognitoClientId(identityStack.userPoolClient.getUserPoolClientId())
                        // .cognitoBaseUri(identityStack.userPoolDomain.getDomainName())
                        .optionalTestAccessToken(envOr("OPTIONAL_TEST_ACCESS_TOKEN", appProps.optionalTestAccessToken))
                        .build());
        applicationStack.addDependency(devStack);
        applicationStack.addDependency(webStack);
        applicationStack.addDependency(identityStack);

        Map<String, String> additionalBehaviourMappings = new java.util.HashMap<>();
        additionalBehaviourMappings.put(
                "/api/mock/auth-url" + "*",
                envOr("DIY_SUBMIT_AUTH_URL_MOCK_LAMBDA_ARN", authStack.authUrlMockLambda.getFunctionArn()));
        additionalBehaviourMappings.put(
                "/api/cognito/auth-url" + "*",
                envOr("DIY_SUBMIT_AUTH_URL_COGNITO_LAMBDA_ARN", authStack.authUrlCognitoLambda.getFunctionArn()));
        additionalBehaviourMappings.put(
                "/api/cognito/exchange-token" + "*",
                envOr(
                        "DIY_SUBMIT_COGNITO_EXCHANGE_TOKEN_LAMBDA_ARN",
                        authStack.exchangeCognitoTokenLambda.getFunctionArn()));
        additionalBehaviourMappings.put(
                "/api/hmrc/auth-url" + "*",
                envOr("DIY_SUBMIT_AUTH_URL_HMRC_LAMBDA_ARN", applicationStack.authUrlHmrcLambda.getFunctionArn()));
        additionalBehaviourMappings.put(
                "/api/hmrc/exchange-token" + "*",
                envOr(
                        "DIY_SUBMIT_EXCHANGE_HMRC_TOKEN_LAMBDA_ARN",
                        applicationStack.exchangeHmrcTokenLambda.getFunctionArn()));
        additionalBehaviourMappings.put(
                "/api/submit-vat" + "*",
                envOr("DIY_SUBMIT_SUBMIT_VAT_LAMBDA_ARN", applicationStack.submitVatLambda.getFunctionArn()));
        additionalBehaviourMappings.put(
                "/api/log-receipt" + "*",
                envOr("DIY_SUBMIT_LOG_RECEIPT_LAMBDA_ARN", applicationStack.logReceiptLambda.getFunctionArn()));
        additionalBehaviourMappings.put(
                "/api/catalog" + "*",
                envOr("DIY_SUBMIT_CATALOG_LAMBDA_ARN", applicationStack.catalogLambda.getFunctionArn()));
        additionalBehaviourMappings.put(
                "/api/my-bundles" + "*",
                envOr("DIY_SUBMIT_MY_BUNDLES_LAMBDA_ARN", applicationStack.myBundlesLambda.getFunctionArn()));
        additionalBehaviourMappings.put(
                "/api/my-receipts" + "*",
                envOr("DIY_SUBMIT_MY_RECEIPTS_LAMBDA_ARN", applicationStack.myReceiptsLambda.getFunctionArn()));

        // Create the Edge stack (CloudFront, Route53)
        String edgeStackId = "%s-EdgeStack".formatted(deploymentName);
        EdgeStack edgeStack = new EdgeStack(
                app,
                edgeStackId,
                EdgeStackProps.builder()
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .hostedZoneId(envOr("HOSTED_ZONE_ID", appProps.hostedZoneId))
                        .domainName(webStack.domainName)
                        .baseUrl(webStack.baseUrl)
                        .resourceNamePrefix(webStack.resourceNamePrefix)
                        .compressedResourceNamePrefix(webStack.compressedResourceNamePrefix)
                        .certificateArn(envOr("CERTIFICATE_ARN", appProps.certificateArn))
                        .logsBucketArn(webStack.originAccessLogBucket.getBucketArn())
                        .webBucketArn(webStack.originBucket.getBucketArn())
                        // .webBehaviorOptions(webStack.behaviorOptions)
                        .additionalOriginsBehaviourMappings(additionalBehaviourMappings)
                        .crossRegionReferences(true)
                        // Force this stack (and thus WAF) into us-east-1 as required by CloudFront
                        .env(Environment.builder().region("us-east-1").build())
                        .build());
        edgeStack.addDependency(observabilityStack);
        edgeStack.addDependency(applicationStack);
        edgeStack.addDependency(authStack);
        edgeStack.addDependency(webStack);

        // Create the Publish stack (Bucket Deployments to CloudFront)
        String publishStackId = "%s-PublishStack".formatted(deploymentName);
        PublishStack publishStack = new PublishStack(
                app,
                publishStackId,
                PublishStackProps.builder()
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .domainName(webStack.domainName)
                        .baseUrl(webStack.baseUrl)
                        .webBucket(webStack.originBucket)
                        .resourceNamePrefix(webStack.resourceNamePrefix)
                        .distributionArn(edgeStack.distribution.getDistributionArn())
                        .webBucket(webStack.originBucket)
                        .commitHash(appProps.commitHash)
                        .docRootPath(appProps.docRootPath)
                        .crossRegionReferences(true)
                        .env(primaryEnv)
                        .build());
        // publishStack.addDependency(edgeStack);
        // publishStack.addDependency(applicationStack);
        publishStack.addDependency(webStack);

        // Create the Ops stack (Alarms, etc.)
        // Build list of Lambda function ARNs for OpsStack
        java.util.List<String> lambdaArns = new java.util.ArrayList<>();
        if (applicationStack.authUrlHmrcLambda != null)
            lambdaArns.add(applicationStack.authUrlHmrcLambda.getFunctionArn());
        if (applicationStack.exchangeHmrcTokenLambda != null)
            lambdaArns.add(applicationStack.exchangeHmrcTokenLambda.getFunctionArn());
        if (applicationStack.submitVatLambda != null) lambdaArns.add(applicationStack.submitVatLambda.getFunctionArn());
        if (applicationStack.logReceiptLambda != null)
            lambdaArns.add(applicationStack.logReceiptLambda.getFunctionArn());
        if (applicationStack.catalogLambda != null) lambdaArns.add(applicationStack.catalogLambda.getFunctionArn());
        if (applicationStack.myBundlesLambda != null) lambdaArns.add(applicationStack.myBundlesLambda.getFunctionArn());
        if (applicationStack.myReceiptsLambda != null)
            lambdaArns.add(applicationStack.myReceiptsLambda.getFunctionArn());
        String receiptsBucketArn =
                applicationStack.receiptsBucket != null ? applicationStack.receiptsBucket.getBucketArn() : null;

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
                        .distributionId(edgeStack.distribution.getDistributionId())
                        .originBucketArn(webStack.originBucket.getBucketArn())
                        .receiptsBucketArn(receiptsBucketArn)
                        .crossRegionReferences(true)
                        // .tokenEndpointFunctionArn(this.application.appStack.tokenEndpoint.function.getFunctionArn())
                        // .userinfoEndpointFunctionArn(
                        //    this.application.appStack.userinfoEndpoint.function.getFunctionArn())
                        // .usersTableArn(this.application.appStack.usersTable.getTableArn())
                        // .authCodesTableArn(this.application.appStack.authCodesTable.getTableArn())
                        // .refreshTokensTableArn(this.application.appStack.refreshTokensTable.getTableArn())
                        .build());
        opsStack.addDependency(applicationStack);
        opsStack.addDependency(webStack);

        // Create the SelfDestruct stack only for non-prod deployments and when JAR exists
        if (!"prod".equals(deploymentName)) {
            String handlerSource = envOr("SELF_DESTRUCT_HANDLER_SOURCE", "target/self-destruct-lambda.jar");
            java.nio.file.Path handlerPath = java.nio.file.Paths.get(handlerSource);
            if (java.nio.file.Files.exists(handlerPath)) {
                String selfDestructStackId = "%s-SelfDestructStack".formatted(deploymentName);
                SelfDestructStack selfDestructStack = new SelfDestructStack(
                        app,
                        selfDestructStackId,
                        SelfDestructStackProps.builder()
                                // .env(env)
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
                                .edgeStackName(edgeStack.getStackName())
                                .publishStackName(publishStack.getStackName())
                                .opsStackName(opsStack.getStackName())
                                .selfDestructDelayHours(envOr("SELF_DESTRUCT_DELAY_HOURS", "1"))
                                .selfDestructHandlerSource(handlerSource)
                                .build());
                // SelfDestructStack has no dependencies - it should be able to delete everything
            } else {
                System.out.println("Skipping SelfDestructStack creation - handler JAR not found at: " + handlerSource);
            }
        }

        app.synth();
    }

    // private static Map<String, BehaviorOptions> concat(Map<String, BehaviorOptions> a, Map<String, BehaviorOptions>
    // b) {
    //    return new java.util.HashMap<>() {{
    //        putAll(a);
    //        putAll(b);
    //    }};
    // }

    private static SubmitApplicationProps loadAppProps(SubmitApplication.Builder builder, Construct scope) {
        SubmitApplicationProps props = SubmitApplicationProps.Builder.create().build();
        // populate from cdk.json context using exact camelCase keys
        for (Field f : SubmitApplicationProps.class.getDeclaredFields()) {
            if (f.getType() != String.class) continue;
            try {
                f.setAccessible(true);
                String current = (String) f.get(props);
                String fieldName = f.getName();
                String ctx = builder.getContextValueString(scope, fieldName, current);
                if (ctx != null) f.set(props, ctx);
            } catch (Exception e) {
                logger.warn("Failed to read context for {}: {}", f.getName(), e.getMessage());
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
            if (contextValue != null && StringUtils.isNotBlank(contextValue.toString())) {
                defaultedValue = contextValue.toString();
                source = "CDK context";
            } else {
                defaultedValue = defaultValue;
                source = "default value";
            }

            if (logger.isDebugEnabled()) {
                logger.debug("Context {} resolved from {} with value: {}", contextKey, source, defaultedValue);
            }

            return defaultedValue;
        }
    }
}
