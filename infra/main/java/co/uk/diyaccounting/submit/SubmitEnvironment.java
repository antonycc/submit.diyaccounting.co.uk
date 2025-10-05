package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildCognitoDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

import co.uk.diyaccounting.submit.stacks.ApexStack;
import co.uk.diyaccounting.submit.stacks.DataStack;
import co.uk.diyaccounting.submit.stacks.IdentityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityStack;
import java.lang.reflect.Field;
import java.nio.file.Paths;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

public class SubmitEnvironment {

    public final ObservabilityStack observabilityStack;
    public final DataStack dataStack;
    public final IdentityStack identityStack;
    public final ApexStack apexStack;

    public static class SubmitEnvironmentProps {

        public String envName;
        public String hostedZoneName;
        public String hostedZoneId;
        public String certificateArn;
        public String domainName;
        public String baseUrl;
        public String accessLogGroupRetentionPeriodDays;
        public String cloudTrailEnabled;
        public String cloudTrailLogGroupPrefix;
        public String cloudTrailLogGroupRetentionPeriodDays;
        public String authCertificateArn;
        public String googleClientId;
        public String googleClientSecretArn;
        public String antonyccClientId;
        public String antonyccBaseUri;
        public String cognitoDomainPrefix;
        public String s3RetainReceiptsBucket;

        public static class Builder {
            private final SubmitEnvironmentProps p = new SubmitEnvironmentProps();

            public static Builder create() {
                return new Builder();
            }

            public SubmitEnvironmentProps build() {
                return p;
            }

            public Builder set(String key, String value) {
                try {
                    var f = SubmitEnvironmentProps.class.getDeclaredField(key);
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
        SubmitEnvironmentProps appProps = loadAppProps(app);
        var submitEnvironment = new SubmitEnvironment(app, appProps);
        app.synth();
        infof("CDK synth complete. Created stack: %s", submitEnvironment.apexStack.getStackName());
        infof("Created stack:", submitEnvironment.observabilityStack.getStackName());
        infof("Created stack:", submitEnvironment.identityStack.getStackName());
        infof("Created stack:", submitEnvironment.apexStack.getStackName());
    }

    public SubmitEnvironment(App app, SubmitEnvironmentProps appProps) {

        // Determine environment and deployment name from env or appProps
        var envName = envOr("ENV_NAME", appProps.envName);
        var deploymentName = envOr("DEPLOYMENT_NAME", envName);

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

        // Load configuration from environment variables not defaulted in the cdk.json
        var domainName = envOr("DIY_SUBMIT_DOMAIN_NAME", appProps.domainName);
        var baseUrl = envOr("DIY_SUBMIT_BASE_URL", appProps.baseUrl);
        var googleClientSecretArn = envOr(
                "GOOGLE_CLIENT_SECRET_ARN", appProps.googleClientSecretArn, "(from googleClientSecretArn in cdk.json)");

        // Support environment specific overrides of some cdk.json values
        var cloudTrailEnabled =
                envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled, "(from cloudTrailEnabled in cdk.json)");
        var accessLogGroupRetentionPeriodDays = Integer.parseInt(
                envOr("ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS", appProps.accessLogGroupRetentionPeriodDays, "30"));
        var s3RetainReceiptsBucket = envOr(
                "S3_RETAIN_RECEIPTS_BUCKET",
                appProps.s3RetainReceiptsBucket,
                "(from s3RetainReceiptsBucket in cdk.json)");

        // Generate predictable resource name prefix based on domain and environment
        var cognitoDomainName = buildCognitoDomainName(deploymentName, appProps.cognitoDomainPrefix, domainName);

        // Generate predictable resource names
        String resourceNamePrefix = "env-%s".formatted(generateResourceNamePrefix(domainName));
        String compressedResourceNamePrefix = "e-%s".formatted(generateCompressedResourceNamePrefix(domainName));
        String dashedDomainName = buildDashedDomainName(domainName);
        var selfDestructLogGroupName = "/aws/lambda/%s-self-destruct".formatted(resourceNamePrefix);

        // Create ObservabilityStack with resources used in monitoring the application
        String observabilityStackId = "%s-ObservabilityStack".formatted(deploymentName);
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                observabilityStackId, deploymentName, envName);
        this.observabilityStack = new ObservabilityStack(
                app,
                observabilityStackId,
                ObservabilityStack.ObservabilityStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .domainName(domainName)
                        .dashedDomainName(dashedDomainName)
                        .baseUrl(baseUrl)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .selfDestructLogGroupName(selfDestructLogGroupName)
                        .cloudTrailLogGroupPrefix(appProps.cloudTrailLogGroupPrefix)
                        .cloudTrailLogGroupRetentionPeriodDays(appProps.cloudTrailLogGroupRetentionPeriodDays)
                        .accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                        .build());

        // Create DataStack with shared persistence for all deployments
        String dataStackId = "%s-DataStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", dataStackId, deploymentName, envName);
        this.dataStack = new DataStack(
                app,
                dataStackId,
                DataStack.DataStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .domainName(domainName)
                        .dashedDomainName(dashedDomainName)
                        .baseUrl(baseUrl)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .s3RetainReceiptsBucket(s3RetainReceiptsBucket)
                        .build());

        // Create the identity stack before any user aware services
        String identityStackId = "%s-IdentityStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", identityStackId, deploymentName, envName);
        this.identityStack = new IdentityStack(
                app,
                identityStackId,
                IdentityStack.IdentityStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .domainName(domainName)
                        .dashedDomainName(dashedDomainName)
                        .baseUrl(baseUrl)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .hostedZoneName(appProps.hostedZoneName)
                        .hostedZoneId(appProps.hostedZoneId)
                        .cognitoDomainName(cognitoDomainName)
                        .authCertificateArn(appProps.authCertificateArn)
                        .googleClientId(appProps.googleClientId)
                        .googleClientSecretArn(googleClientSecretArn)
                        .antonyccClientId(appProps.antonyccClientId)
                        .antonyccBaseUri(appProps.antonyccBaseUri)
                        .build());

        String apexStackId = "%s-ApexStack".formatted(envName);
        this.apexStack = new ApexStack(
                app,
                apexStackId,
                ApexStack.ApexStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(envName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .domainName(domainName)
                        .dashedDomainName(dashedDomainName)
                        .baseUrl(baseUrl)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .hostedZoneName(appProps.hostedZoneName)
                        .hostedZoneId(appProps.hostedZoneId)
                        .certificateArn(appProps.certificateArn)
                        .accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                        .build());
    }

    // load context from cdk.json like existing apps
    public static SubmitEnvironmentProps loadAppProps(Construct scope) {
        return loadAppProps(scope, null);
    }

    public static SubmitEnvironmentProps loadAppProps(Construct scope, String pathPrefix) {
        SubmitEnvironmentProps props = SubmitEnvironmentProps.Builder.create().build();
        var cdkPath =
                Paths.get((pathPrefix == null ? "" : pathPrefix) + "cdk.json").toAbsolutePath();
        if (!cdkPath.toFile().exists()) {
            warnf("Cannot find application properties (cdk.json) at %s", cdkPath);
        } else {
            for (Field f : SubmitEnvironmentProps.class.getDeclaredFields()) {
                if (f.getType() != String.class) continue;
                try {
                    f.setAccessible(true);
                    String current = (String) f.get(props);
                    String fieldName = f.getName();
                    String ctx =
                            co.uk.diyaccounting.submit.utils.KindCdk.getContextValueString(scope, fieldName, current);
                    if (ctx != null) f.set(props, ctx);
                } catch (Exception ignored) {
                }
            }
        }
        if (props.envName == null || props.envName.isBlank()) props.envName = "dev";
        return props;
    }
}
