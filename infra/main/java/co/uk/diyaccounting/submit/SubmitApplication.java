package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;

import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.stacks.AccountStack;
import co.uk.diyaccounting.submit.stacks.ApiStack;
import co.uk.diyaccounting.submit.stacks.AuthStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.HmrcStack;
import co.uk.diyaccounting.submit.stacks.OpsStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import java.lang.reflect.Field;
import java.nio.file.Paths;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

public class SubmitApplication {

    public final DevStack devStack;
    public final AuthStack authStack;
    public final HmrcStack hmrcStack;
    public final AccountStack accountStack;
    public final ApiStack apiStack;
    public final OpsStack opsStack;
    public final SelfDestructStack selfDestructStack;

    public static class SubmitApplicationProps {
        // Fields match cdk.json context keys (camelCase). Environment overrides are applied in SubmitApplication
        public String envName;
        public String deploymentName;
        public String hostedZoneName;
        public String subDomainName;
        public String cloudTrailEnabled;
        public String hmrcClientId;
        public String hmrcClientSecretArn;
        public String hmrcBaseUri;
        public String baseImageTag;
        public String selfDestructDelayHours;
        public String userPoolArn;
        public String userPoolClientId;

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
        SubmitApplicationProps appProps = loadAppProps(app);
        var submitApplication = new SubmitApplication(app, appProps);
        app.synth();
        infof("CDK synth complete");
        if (submitApplication.selfDestructStack != null) {
            infof("Created stack: %s", submitApplication.selfDestructStack.getStackName());
        } else {
            infof("No SelfDestruct stack created for prod deployment");
        }
    }

    public SubmitApplication(App app, SubmitApplicationProps appProps) {

        // Determine environment and deployment name from env or appProps
        String envName = envOr("ENVIRONMENT_NAME", appProps.envName);
        String deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);

        // Determine primary environment (account/region) from CDK env
        Environment primaryEnv = KindCdk.buildPrimaryEnvironment();

        var nameProps = new SubmitSharedNames.SubmitSharedNamesProps();
        nameProps.envName = envName;
        nameProps.deploymentName = deploymentName;
        nameProps.hostedZoneName = appProps.hostedZoneName;
        nameProps.subDomainName = appProps.subDomainName;
        nameProps.regionName = primaryEnv.getRegion();
        nameProps.awsAccount = primaryEnv.getAccount();
        var sharedNames = new SubmitSharedNames(nameProps);

        // Allow environment variables to override some appProps values
        var cognitoUserPoolArn = envOr("COGNITO_USER_POOL_ARN", appProps.userPoolArn, "(from userPoolArn in cdk.json)");
        var cognitoUserPoolClientId =
                envOr("COGNITO_CLIENT_ID", appProps.userPoolClientId, "(from userPoolClientId in cdk.json)");
        var cognitoUserPoolId = cognitoUserPoolArn != null
                ? cognitoUserPoolArn.split("/")[1]
                : "(unknown cognitoUserPoolId because no cognitoUserPoolArn)";
        var hmrcClientSecretArn =
                envOr("HMRC_CLIENT_SECRET_ARN", appProps.hmrcClientSecretArn, "(from hmrcClientSecretArn in cdk.json)");
        var baseImageTag = envOr("BASE_IMAGE_TAG", appProps.baseImageTag, "(from baseImageTag in cdk.json)");
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
        var cloudTrailEnabled =
                envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled, "(from cloudTrailEnabled in cdk.json)");

        // Create DevStack with resources only used during development or deployment (e.g. ECR)
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
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
                        // .compressedResourceNamePrefix(sharedNames.appCompressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .build());

        // Create the AuthStack with resources used in authentication and authorisation
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.authStackId, deploymentName, envName);
        this.authStack = new AuthStack(
                app,
                sharedNames.authStackId,
                AuthStack.AuthStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        // .compressedResourceNamePrefix(sharedNames.appCompressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .cognitoClientId(cognitoUserPoolClientId)
                        .build());
        this.authStack.addDependency(devStack);

        // Create the HmrcStack
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.hmrcStackId, deploymentName, envName);
        this.hmrcStack = new HmrcStack(
                app,
                sharedNames.hmrcStackId,
                HmrcStack.HmrcStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        // .compressedResourceNamePrefix(sharedNames.appCompressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .hmrcBaseUri(appProps.hmrcBaseUri)
                        .hmrcClientId(appProps.hmrcClientId)
                        .hmrcClientSecretArn(hmrcClientSecretArn)
                        .cognitoUserPoolId(cognitoUserPoolId)
                        .build());
        this.hmrcStack.addDependency(devStack);

        // Create the AccountStack
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.accountStackId, deploymentName, envName);
        this.accountStack = new AccountStack(
                app,
                sharedNames.accountStackId,
                AccountStack.AccountStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        // .compressedResourceNamePrefix(sharedNames.appCompressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .cognitoUserPoolArn(cognitoUserPoolArn)
                        .build());
        this.accountStack.addDependency(devStack);

        // Create the ApiStack with API Gateway v2 for all Lambda endpoints
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.apiStackId, deploymentName, envName);

        // Create a map of Lambda function references from other stacks
        List<ApiLambdaProps> lambdaFunctions = new java.util.ArrayList<>();
        lambdaFunctions.addAll(this.authStack.lambdaFunctionProps);
        lambdaFunctions.addAll(this.hmrcStack.lambdaFunctionProps);
        lambdaFunctions.addAll(this.accountStack.lambdaFunctionProps);

        this.apiStack = new ApiStack(
                app,
                sharedNames.apiStackId,
                ApiStack.ApiStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        // .compressedResourceNamePrefix(sharedNames.appCompressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .lambdaFunctions(lambdaFunctions)
                        .build());
        this.apiStack.addDependency(accountStack);
        this.apiStack.addDependency(hmrcStack);
        this.apiStack.addDependency(authStack);

        // ExtractLambda ARNs from lambdaFunctions
        var lambdaArns = lambdaFunctions.stream().map(ApiLambdaProps::lambdaArn).toList();
        this.opsStack = new OpsStack(
                app,
                sharedNames.opsStackId,
                OpsStack.OpsStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        // .compressedResourceNamePrefix(sharedNames.appCompressedResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .lambdaFunctionArns(lambdaArns)
                        .build());
        this.opsStack.addDependency(hmrcStack);
        this.opsStack.addDependency(apiStack);

        // Create the SelfDestruct stack only for non-prod deployments and when JAR exists
        if (!"prod".equals(deploymentName)) {
            this.selfDestructStack = new SelfDestructStack(
                    app,
                    sharedNames.appSelfDestructStackId,
                    SelfDestructStack.SelfDestructStackProps.builder()
                            .env(primaryEnv)
                            .crossRegionReferences(false)
                            .envName(envName)
                            .deploymentName(deploymentName)
                            .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                            // .compressedResourceNamePrefix(sharedNames.appCompressedResourceNamePrefix)
                            .cloudTrailEnabled(cloudTrailEnabled)
                            .sharedNames(sharedNames)
                            .selfDestructLogGroupName(sharedNames.ew2SelfDestructLogGroupName)
                            .selfDestructStartDatetime(selfDestructStartDatetime)
                            .selfDestructDelayHours(selfDestructDelayHours)
                            .build());
        } else {
            this.selfDestructStack = null;
        }
    }

    // populate from cdk.json context using exact camelCase keys
    public static SubmitApplicationProps loadAppProps(Construct scope) {
        return loadAppProps(scope, null);
    }

    public static SubmitApplicationProps loadAppProps(Construct scope, String pathPrefix) {
        SubmitApplicationProps props = SubmitApplicationProps.Builder.create().build();
        var cdkPath =
                Paths.get((pathPrefix == null ? "" : pathPrefix) + "cdk.json").toAbsolutePath();
        if (!cdkPath.toFile().exists()) {
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
        if (props.envName == null || props.envName.isBlank()) props.envName = "dev";
        return props;
    }
}
