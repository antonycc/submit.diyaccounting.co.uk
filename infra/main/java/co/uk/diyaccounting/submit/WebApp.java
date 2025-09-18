package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.ApplicationStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.EdgeStack;
import co.uk.diyaccounting.submit.stacks.EdgeStackProps;
import co.uk.diyaccounting.submit.stacks.IdentityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityStack;
import co.uk.diyaccounting.submit.stacks.PublishStack;
import co.uk.diyaccounting.submit.stacks.PublishStackProps;
import co.uk.diyaccounting.submit.stacks.WebStack;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.App;
import software.amazon.awscdk.StackProps;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

import java.lang.reflect.Field;

public class WebApp {

    private static final Logger logger = LogManager.getLogger(WebApp.class);

    public static void main(final String[] args) {

        App app = new App();

        // Build app-level props from cdk.json context with environment overrides
        WebApp.Builder builder = WebApp.Builder.create(app, "WebApp");
        WebAppProps appProps = loadAppProps(builder, app);

        String envName = envOr("ENV_NAME", appProps.env);
        String deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);

        // Create ObservabilityStack with resources used in monitoring the application
        String observabilityStackId = "%s-ObservabilityStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", observabilityStackId, deploymentName, envName);
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
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", devStackId, deploymentName, envName);
        DevStack devStack = DevStack.Builder.create(app, devStackId)
                .props(co.uk.diyaccounting.submit.stacks.DevStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .subDomainName(appProps.subDomainName)
                        .build())
                .build();

        // Create the identity stack before any user aware services
        String identityStackId = "%s-IdentityStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", identityStackId, deploymentName, envName);
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

        // Create the ApplicationStack
        String applicationStackId = "%s-ApplicationStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", applicationStackId, deploymentName, envName);
        ApplicationStack applicationStack = ApplicationStack.Builder.create(app, applicationStackId)
                .props(co.uk.diyaccounting.submit.stacks.ApplicationStackProps.builder()
                        .env(envName)
                        .hostedZoneName(envOr("HOSTED_ZONE_NAME", appProps.hostedZoneName))
                        .subDomainName(envOr("SUB_DOMAIN_NAME", appProps.subDomainName))
                        .cloudTrailEnabled(envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled))
                        .xRayEnabled(envOr("X_RAY_ENABLED", appProps.xRayEnabled))
                        .baseImageTag(envOr("BASE_IMAGE_TAG", appProps.baseImageTag))
                        .ecrRepositoryArn(devStack.ecrRepository.getRepositoryArn())
                        .ecrRepositoryName(devStack.ecrRepository.getRepositoryName())
                        .build())
                .build();

        // Create WebStack with resources used in running the application
        String webStackId = "%s-WebStack".formatted(deploymentName);
        System.out.printf("Synthesizing stack %s for deployment %s to environment %s\n", webStackId, deploymentName, envName);
        WebStack webStack = WebStack.Builder.create(app, webStackId)
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
                        .logS3ObjectEventHandlerSource(
                                envOr("LOG_S3_OBJECT_EVENT_HANDLER_SOURCE", appProps.logS3ObjectEventHandlerSource))
                        .build())
                // .trail(observabilityStack.trail)
                .build();


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
                .webBehaviorOptions(webStack.behaviorOptions)
                .additionalOriginsBehaviourMappings(
                    applicationStack.additionalOriginsBehaviourMappings)
                .build());
        edgeStack.addDependency(observabilityStack);
        edgeStack.addDependency(applicationStack);
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
                .distributionId(edgeStack.distribution.getDistributionId())
                .webBucket(webStack.originBucket)
                .commitHash(appProps.commitHash)
                .docRootPath(appProps.docRootPath)
                .build());
        //publishStack.addDependency(edgeStack);
        //publishStack.addDependency(applicationStack);
        publishStack.addDependency(webStack);

        app.synth();
    }

    private static WebAppProps loadAppProps(WebApp.Builder builder, Construct scope) {
        WebAppProps props = WebAppProps.Builder.create().build();
        // populate from cdk.json context using exact camelCase keys
        for (Field f : WebAppProps.class.getDeclaredFields()) {
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

        public static WebApp.Builder create(Construct scope, String id) {
            return new WebApp.Builder(scope, id, null);
        }

        public static WebApp.Builder create(Construct scope, String id, StackProps props) {
            return new WebApp.Builder(scope, id, props);
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
