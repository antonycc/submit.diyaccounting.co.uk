package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.stacks.ContainerStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.EdgeStack;
import co.uk.diyaccounting.submit.stacks.OpsStack;
import co.uk.diyaccounting.submit.stacks.PublishStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import java.lang.reflect.Field;
import java.nio.file.Paths;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

/**
 * SubmitContainer is the CDK entry point for containerized monolith deployment.
 * It creates an App Runner service instead of Lambda functions and API Gateway.
 */
public class SubmitContainer {

    public final DevStack devStack;
    public final DevStack ue1DevStack;
    public final ContainerStack containerStack;
    public final OpsStack opsStack;
    public final EdgeStack edgeStack;
    public final PublishStack publishStack;
    public final SelfDestructStack selfDestructStack;

    public static class SubmitContainerProps {
        // Fields match cdk.json context keys
        public String envName;
        public String deploymentName;
        public String hostedZoneName;
        public String subDomainName;
        public String cloudTrailEnabled;
        public String googleClientId;
        public String googleClientSecretParam;
        public String hmrcClientId;
        public String hmrcClientSecretArn;
        public String hmrcBaseUri;
        public String hmrcSandboxClientId;
        public String hmrcSandboxClientSecretArn;
        public String hmrcSandboxBaseUri;
        public String baseImageTag;
        public String selfDestructDelayHours;
        public String bundlesTableArn;
        public String receiptsTableArn;
        public String hmrcApiRequestsTableArn;
        public String sessionsTableArn;
        public String hostedZoneId;
        public String certificateArn;
        public String docRootPath;

        public static class Builder {
            private final SubmitContainerProps p = new SubmitContainerProps();

            public static Builder create() {
                return new Builder();
            }

            public SubmitContainerProps build() {
                return p;
            }

            public Builder set(String key, String value) {
                try {
                    var f = SubmitContainerProps.class.getDeclaredField(key);
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
        SubmitContainerProps containerProps = loadContainerProps(app);
        var submitContainer = new SubmitContainer(app, containerProps);
        app.synth();
        infof("CDK synth complete for container deployment");
        if (submitContainer.selfDestructStack != null) {
            infof("Created stack: %s", submitContainer.selfDestructStack.getStackName());
        } else {
            infof("No SelfDestruct stack created for prod deployment");
        }
    }

    public SubmitContainer(App app, SubmitContainerProps containerProps) {

        // Determine environment and deployment name
        String envName = envOr("ENVIRONMENT_NAME", containerProps.envName);
        String deploymentName = envOr("DEPLOYMENT_NAME", containerProps.deploymentName);

        // Determine primary environment (account/region)
        Environment primaryEnv = KindCdk.buildPrimaryEnvironment();
        Environment usEast1Env = Environment.builder()
                .region("us-east-1")
                .account(primaryEnv.getAccount())
                .build();

        var nameProps = new SubmitSharedNames.SubmitSharedNamesProps();
        nameProps.envName = envName;
        nameProps.deploymentName = deploymentName;
        nameProps.hostedZoneName = containerProps.hostedZoneName;
        nameProps.subDomainName = containerProps.subDomainName;
        nameProps.regionName = primaryEnv.getRegion();
        nameProps.awsAccount = primaryEnv.getAccount();
        var sharedNames = new SubmitSharedNames(nameProps);

        // Get configuration from environment or props
        var baseImageTag = envOr("BASE_IMAGE_TAG", containerProps.baseImageTag, "latest");
        var selfDestructDelayHoursString =
                envOr("SELF_DESTRUCT_DELAY_HOURS", containerProps.selfDestructDelayHours, "1");
        int selfDestructDelayHours = Integer.parseInt(selfDestructDelayHoursString);
        var selfDestructStartDatetimeIso = envOr(
                "SELF_DESTRUCT_START_DATETIME",
                ZonedDateTime.now().plusHours(selfDestructDelayHours).format(DateTimeFormatter.ISO_DATE_TIME),
                "(from current time plus delay hours)");
        ZonedDateTime selfDestructStartDatetime = ZonedDateTime.parse(selfDestructStartDatetimeIso);
        var cloudTrailEnabled = envOr("CLOUD_TRAIL_ENABLED", containerProps.cloudTrailEnabled, "true");
        var commitHash = envOr("COMMIT_HASH", "local");
        var websiteHash = envOr("WEBSITE_HASH", "local");
        var buildNumber = envOr("BUILD_NUMBER", "local");
        var docRootPath = envOr("DOC_ROOT_PATH", containerProps.docRootPath, "../web/public");

        var googleClientId = envOr("GOOGLE_CLIENT_ID", containerProps.googleClientId);
        var googleClientSecretParam = envOr(
                "GOOGLE_CLIENT_SECRET_PARAM",
                containerProps.googleClientSecretParam,
                String.format("/%s/submit/google/client_secret", envName));

        var hmrcClientSecretArn = envOr("HMRC_CLIENT_SECRET_ARN", containerProps.hmrcClientSecretArn);
        var hmrcSandboxClientSecretArn =
                envOr("HMRC_SANDBOX_CLIENT_SECRET_ARN", containerProps.hmrcSandboxClientSecretArn);

        // Create DevStack (ECR repository and development resources)
        infof(
                "Synthesizing DevStack %s for deployment %s to environment %s",
                sharedNames.devStackId, deploymentName, envName);
        this.devStack = new DevStack(
                app,
                sharedNames.devStackId,
                DevStack.DevStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .build());

        // Create DevStack for us-east-1 (for CloudFront)
        infof(
                "Synthesizing DevStack (UE1) %s for deployment %s to environment %s",
                sharedNames.ue1DevStackId, deploymentName, envName);
        this.ue1DevStack = new DevStack(
                app,
                sharedNames.ue1DevStackId,
                DevStack.DevStackProps.builder()
                        .env(usEast1Env)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .build());

        // Create ContainerStack (App Runner service)
        infof(
                "Synthesizing ContainerStack %s for deployment %s to environment %s",
                sharedNames.containerStackId, deploymentName, envName);
        this.containerStack = new ContainerStack(
                app,
                sharedNames.containerStackId,
                ContainerStack.ContainerStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .googleClientId(googleClientId)
                        .googleClientSecretParam(googleClientSecretParam)
                        .hmrcClientId(containerProps.hmrcClientId)
                        .hmrcClientSecretArn(hmrcClientSecretArn)
                        .hmrcSandboxClientId(containerProps.hmrcSandboxClientId)
                        .hmrcSandboxClientSecretArn(hmrcSandboxClientSecretArn)
                        .hmrcBaseUri(containerProps.hmrcBaseUri)
                        .hmrcSandboxBaseUri(containerProps.hmrcSandboxBaseUri)
                        .bundlesTableArn(containerProps.bundlesTableArn)
                        .receiptsTableArn(containerProps.receiptsTableArn)
                        .hmrcApiRequestsTableArn(containerProps.hmrcApiRequestsTableArn)
                        .sessionsTableArn(containerProps.sessionsTableArn)
                        .build());
        this.containerStack.addDependency(devStack);

        // Create OpsStack for monitoring
        List<String> lambdaArns = new ArrayList<>(); // Empty for container mode
        this.opsStack = new OpsStack(
                app,
                sharedNames.opsStackId,
                OpsStack.OpsStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .lambdaFunctionArns(lambdaArns)
                        .build());
        this.opsStack.addDependency(containerStack);

        // Create EdgeStack (CloudFront pointing to App Runner)
        infof(
                "Synthesizing EdgeStack %s for deployment %s to environment %s",
                sharedNames.edgeStackId, deploymentName, envName);
        String appRunnerUrl = this.containerStack.serviceUrl;
        this.edgeStack = new EdgeStack(
                app,
                sharedNames.edgeStackId,
                EdgeStack.EdgeStackProps.builder()
                        .env(usEast1Env)
                        .crossRegionReferences(true)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .hostedZoneName(containerProps.hostedZoneName)
                        .hostedZoneId(containerProps.hostedZoneId)
                        .certificateArn(containerProps.certificateArn)
                        .apiGatewayUrl(appRunnerUrl)
                        .build());
        this.edgeStack.addDependency(containerStack);

        // Create PublishStack (deploy static content to S3/CloudFront)
        infof(
                "Synthesizing PublishStack %s for deployment %s to environment %s",
                sharedNames.publishStackId, deploymentName, envName);
        String distributionId = this.edgeStack.distribution.getDistributionId();
        this.publishStack = new PublishStack(
                app,
                sharedNames.publishStackId,
                PublishStack.PublishStackProps.builder()
                        .env(usEast1Env)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .distributionId(distributionId)
                        .commitHash(commitHash)
                        .websiteHash(websiteHash)
                        .buildNumber(buildNumber)
                        .docRootPath(docRootPath)
                        .build());
        this.publishStack.addDependency(this.edgeStack);

        // Create SelfDestruct stack for non-prod deployments
        if (!"prod".equals(deploymentName)) {
            this.selfDestructStack = new SelfDestructStack(
                    app,
                    sharedNames.selfDestructStackId,
                    SelfDestructStack.SelfDestructStackProps.builder()
                            .env(primaryEnv)
                            .crossRegionReferences(false)
                            .envName(envName)
                            .deploymentName(deploymentName)
                            .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                            .cloudTrailEnabled(cloudTrailEnabled)
                            .sharedNames(sharedNames)
                            .baseImageTag(baseImageTag)
                            .selfDestructLogGroupName(sharedNames.ew2SelfDestructLogGroupName)
                            .selfDestructStartDatetime(selfDestructStartDatetime)
                            .selfDestructDelayHours(selfDestructDelayHours)
                            .isApplicationStack(true)
                            .build());
        } else {
            this.selfDestructStack = null;
        }
    }

    public static SubmitContainerProps loadContainerProps(Construct scope) {
        return loadContainerProps(scope, null);
    }

    public static SubmitContainerProps loadContainerProps(Construct scope, String pathPrefix) {
        SubmitContainerProps props = SubmitContainerProps.Builder.create().build();
        var cdkPath =
                Paths.get((pathPrefix == null ? "" : pathPrefix) + "cdk.json").toAbsolutePath();
        if (!cdkPath.toFile().exists()) {
            infof("Cannot find container properties (cdk.json) at %s", cdkPath);
        } else {
            infof("Loading container properties from cdk.json %s", cdkPath);
            for (Field f : SubmitContainerProps.class.getDeclaredFields()) {
                if (f.getType() != String.class) continue;
                try {
                    f.setAccessible(true);
                    String current = (String) f.get(props);
                    String fieldName = f.getName();
                    String ctx = KindCdk.getContextValueString(scope, fieldName, current);
                    if (ctx != null) f.set(props, ctx);
                    infof("Load context %s=%s", fieldName, ctx);
                } catch (Exception e) {
                    infof("Failed to read context for %s: %s", f.getName(), e.getMessage());
                }
            }
        }
        return props;
    }
}
