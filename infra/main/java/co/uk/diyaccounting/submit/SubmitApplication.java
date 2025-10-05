package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.AccountStack;
import co.uk.diyaccounting.submit.stacks.AuthStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.HmrcStack;
import co.uk.diyaccounting.submit.stacks.OpsStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

import java.lang.reflect.Field;
import java.nio.file.Paths;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildCognitoDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrRepositoryName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class SubmitApplication {

    public final DevStack devStack;
    public final AuthStack authStack;
    public final HmrcStack hmrcStack;
    public final AccountStack accountStack;
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
        public String cognitoDomainPrefix;
        public String hmrcBaseUri;
        public String baseImageTag;
        public String selfDestructHandlerSource;
        public String selfDestructDelayHours;
        public String lambdaEntry;
        public String lambdaUrlAuthType;
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

        infof("Created stack: %s", submitApplication.devStack.getStackName());
        infof("Created stack: %s", submitApplication.authStack.getStackName());
        infof("Created stack: %s", submitApplication.hmrcStack.getStackName());
        infof("Created stack: %s", submitApplication.accountStack.getStackName());
        infof("Created stack: %s", submitApplication.opsStack.getStackName());
        if (submitApplication.selfDestructStack != null) {
            infof("Created stack: %s", submitApplication.selfDestructStack.getStackName());
        } else {
            infof("No SelfDestruct stack created for prod deployment");
        }
    }

    public SubmitApplication(App app, SubmitApplicationProps appProps) {

        // Determine environment and deployment name from env or appProps
        String envName = envOr("ENV_NAME", appProps.envName);
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
        var regionName = primaryEnv.getRegion() != null ? primaryEnv.getRegion() : null;
        var awsAccount = primaryEnv.getAccount() != null ? primaryEnv.getAccount() : null;

        // Allow environment variables to override some appProps values
        var cognitoUserPoolArn =
                envOr("COGNITO_USER_POOL_ARN", appProps.userPoolArn, "(from cognitoDomainPrefix in cdk.json)");
        var cognitoUserPoolClientId = envOr(
                "COGNITO_CLIENT_ID", appProps.userPoolClientId, "(from cognitoDomainPrefix in cdk.json)");
        var hmrcClientSecretArn =
                envOr("HMRC_CLIENT_SECRET_ARN", appProps.hmrcClientSecretArn, "(from hmrcClientSecretArn in cdk.json)");
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

        // Generate predictable resource name prefix based on domain and environment
        var domainName = buildDomainName(deploymentName, appProps.subDomainName, appProps.hostedZoneName);
        var cognitoDomainName = buildCognitoDomainName(
                deploymentName, appProps.cognitoDomainPrefix, appProps.subDomainName, appProps.hostedZoneName);

        // Generate predictable resource names
        var baseUrl = "https://%s/".formatted(domainName);
        var dashedDomainName = buildDashedDomainName(domainName);
        var resourceNamePrefix = "app-%s".formatted(generateResourceNamePrefix(domainName));
        var compressedResourceNamePrefix = "a-%s".formatted(generateCompressedResourceNamePrefix(domainName));
        var selfDestructLogGroupName = "/aws/lambda/%s-self-destruct".formatted(resourceNamePrefix);
        String receiptsBucketFullName = "%s-receipts".formatted(dashedDomainName);

        var ecrRepositoryArn =
                "arn:aws:ecr:%s:%s:repository/%s-ecr".formatted(regionName, awsAccount, resourceNamePrefix);
        var ecrRepositoryName = buildEcrRepositoryName(resourceNamePrefix);

        // Create DevStack with resources only used during development or deployment (e.g. ECR)
        String devStackId = "%s-DevStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", devStackId, deploymentName, envName);
        this.devStack = new DevStack(
                app,
                devStackId,
                DevStack.DevStackProps.builder()
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
                        .ecrRepositoryName(ecrRepositoryName)
                        .build());

        // Create the AuthStack with resources used in authentication and authorisation
        String authStackId = "%s-AuthStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", authStackId, deploymentName, envName);
        this.authStack = new AuthStack(
                app,
                authStackId,
                AuthStack.AuthStackProps.builder()
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
                        .baseImageTag(baseImageTag)
                        .ecrRepositoryArn(ecrRepositoryArn)
                        .ecrRepositoryName(ecrRepositoryName)
                        .lambdaEntry(appProps.lambdaEntry)
                        .lambdaUrlAuthType(appProps.lambdaUrlAuthType)
                        .cognitoClientId(cognitoUserPoolClientId)
                        .cognitoBaseUri("https://%s".formatted(cognitoDomainName))
                        .build());
        this.authStack.addDependency(devStack);

        // Create the HmrcStack
        String hmrcStackId = "%s-HmrcStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", hmrcStackId, deploymentName, envName);
        this.hmrcStack = new HmrcStack(
                app,
                hmrcStackId,
                HmrcStack.HmrcStackProps.builder()
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
                        .baseImageTag(baseImageTag)
                        .ecrRepositoryArn(ecrRepositoryArn)
                        .ecrRepositoryName(ecrRepositoryName)
                        .hmrcBaseUri(appProps.hmrcBaseUri)
                        .hmrcClientId(appProps.hmrcClientId)
                        .lambdaUrlAuthType(appProps.lambdaUrlAuthType)
                        .lambdaEntry(appProps.lambdaEntry)
                        .hmrcClientSecretArn(hmrcClientSecretArn)
                        .receiptsBucketFullName(receiptsBucketFullName)
                        .build());
        this.hmrcStack.addDependency(devStack);

        // Create the AccountStack
        String accountStackId = "%s-AccountStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", accountStackId, deploymentName, envName);
        this.accountStack = new AccountStack(
                app,
                accountStackId,
                AccountStack.AccountStackProps.builder()
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
                        .baseImageTag(baseImageTag)
                        .ecrRepositoryArn(ecrRepositoryArn)
                        .ecrRepositoryName(ecrRepositoryName)
                        .cognitoUserPoolArn(cognitoUserPoolArn)
                        .lambdaUrlAuthType(appProps.lambdaUrlAuthType)
                        .lambdaEntry(appProps.lambdaEntry)
                        .build());
        this.accountStack.addDependency(devStack);

        // Create the Ops stack (Alarms, etc.)
        // Build list of Lambda function ARNs for OpsStack
        // TODO: Compute ARNs internally in OpsStack from predictable names
        java.util.List<String> lambdaArns = new java.util.ArrayList<>();
        if (this.hmrcStack.authUrlHmrcLambda != null) lambdaArns.add(this.hmrcStack.authUrlHmrcLambda.getFunctionArn());
        if (this.hmrcStack.exchangeHmrcTokenLambda != null)
            lambdaArns.add(this.hmrcStack.exchangeHmrcTokenLambda.getFunctionArn());
        if (this.hmrcStack.submitVatLambda != null) lambdaArns.add(this.hmrcStack.submitVatLambda.getFunctionArn());
        if (this.hmrcStack.logReceiptLambda != null) lambdaArns.add(this.hmrcStack.logReceiptLambda.getFunctionArn());
        if (this.hmrcStack.myReceiptsLambda != null) lambdaArns.add(this.hmrcStack.myReceiptsLambda.getFunctionArn());
        if (this.accountStack.catalogLambda != null) lambdaArns.add(this.accountStack.catalogLambda.getFunctionArn());
        if (this.accountStack.requestBundlesLambda != null)
            lambdaArns.add(this.accountStack.requestBundlesLambda.getFunctionArn());
        if (this.accountStack.myBundlesLambda != null)
            lambdaArns.add(this.accountStack.myBundlesLambda.getFunctionArn());

        String opsStackId = "%s-OpsStack".formatted(deploymentName);
        this.opsStack = new OpsStack(
                app,
                opsStackId,
                OpsStack.OpsStackProps.builder()
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
                        .lambdaFunctionArns(lambdaArns)
                        .build());
        this.opsStack.addDependency(hmrcStack);

        // Create the SelfDestruct stack only for non-prod deployments and when JAR exists
        if (!"prod".equals(deploymentName)) {
            String selfDestructStackId = "%s-SelfDestructStack".formatted(deploymentName);
            this.selfDestructStack = new SelfDestructStack(
                    app,
                    selfDestructStackId,
                    SelfDestructStack.SelfDestructStackProps.builder()
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
                            .devStackName(devStack.getStackName())
                            .authStackName(hmrcStack.getStackName())
                            .hmrcStackName(hmrcStack.getStackName())
                            .accountStackName(accountStack.getStackName())
                            .opsStackName(opsStack.getStackName())
                            .selfDestructDelayHours(selfDestructDelayHours)
                            .selfDestructHandlerSource(selfDestructHandlerSource)
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
