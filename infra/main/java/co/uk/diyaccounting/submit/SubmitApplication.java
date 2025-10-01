package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.ApplicationStack;
import co.uk.diyaccounting.submit.stacks.AuthStack;
import co.uk.diyaccounting.submit.stacks.DevStack;
import co.uk.diyaccounting.submit.stacks.IdentityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityStack;
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
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateResourceNamePrefix;

public class SubmitApplication {

    public final ObservabilityStack observabilityStack;
    public final DevStack devStack;
    public final IdentityStack identityStack;
    public final AuthStack authStack;
    public final ApplicationStack applicationStack;
    public final OpsStack opsStack;
    public final SelfDestructStack selfDestructStack;

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
        public String cloudTrailLogGroupPrefix;
        public String cloudTrailLogGroupRetentionPeriodDays;
        public String accessLogGroupRetentionPeriodDays;
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
        SubmitApplicationProps appProps = loadAppProps(app);
        var submitApplication = new SubmitApplication(app, appProps);
        app.synth();
        infof("CDK synth complete");

        infof("Created stack:", submitApplication.observabilityStack.getStackName());
        infof("Created stack:", submitApplication.devStack.getStackName());
        infof("Created stack:", submitApplication.identityStack.getStackName());
        infof("Created stack:", submitApplication.authStack.getStackName());
        infof("Created stack:", submitApplication.applicationStack.getStackName());
        infof("Created stack:", submitApplication.opsStack.getStackName());
        if (submitApplication.selfDestructStack != null) {
            infof("Created stack:", submitApplication.selfDestructStack.getStackName());
        } else {
            infof("No SelfDestruct stack created for prod deployment");
        }
    }

    public SubmitApplication(App app, SubmitApplicationProps appProps) {

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
        var domainName = buildDomainName(deploymentName, subDomainName, hostedZoneName);
        var cognitoDomainName =
                buildCognitoDomainName(deploymentName, appProps.cognitoDomainPrefix, subDomainName, hostedZoneName);

        // Generate predictable resource names
        var baseUrl = "https://%s/".formatted(domainName);
        var dashedDomainName = buildDashedDomainName(domainName);
        var resourceNamePrefix = "app-%s".formatted(generateResourceNamePrefix(domainName));
        var compressedResourceNamePrefix = "a-%s".formatted(generateCompressedResourceNamePrefix(domainName));
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
                        .build());

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
                        .hostedZoneName(hostedZoneName)
                        .hostedZoneId(hostedZoneId)
                        .cognitoDomainName(cognitoDomainName)
                        .authCertificateArn(authCertificateArn)
                        .googleClientId(googleClientId)
                        .googleClientSecretArn(googleClientSecretArn)
                        .antonyccClientId(antonyccClientId)
                        .antonyccBaseUri(antonyccBaseUri)
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
                        .ecrRepositoryArn(
                                this.devStack.ecrRepository.getRepositoryArn()) // TODO: Internally compute from name
                        .ecrRepositoryName(
                                this.devStack.ecrRepository.getRepositoryName()) // TODO: Get by predictable name
                        .lambdaEntry(lambdaEntry)
                        .lambdaUrlAuthType(lambdaUrlAuthType)
                        .cognitoClientId(this.identityStack.userPoolClient
                                .getUserPoolClientId()) // TODO: Research a way around needing this.
                        .cognitoBaseUri("https://"
                                + this.identityStack.userPoolDomain.getDomainName()) // TODO: Get calculated value
                        .build());
        this.authStack.addDependency(devStack);
        this.authStack.addDependency(identityStack);

        // Create the ApplicationStack
        String applicationStackId = "%s-ApplicationStack".formatted(deploymentName);
        infof("Synthesizing stack %s for deployment %s to environment %s", applicationStackId, deploymentName, envName);
        this.applicationStack = new ApplicationStack(
                app,
                applicationStackId,
                ApplicationStack.ApplicationStackProps.builder()
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
                        .ecrRepositoryArn(
                                this.devStack.ecrRepository.getRepositoryArn()) // TODO: Internally compute from name
                        .ecrRepositoryName(
                                this.devStack.ecrRepository.getRepositoryName()) // TODO: Get by predictable name
                        .hmrcBaseUri(hmrcBaseUri)
                        .hmrcClientId(hmrcClientId)
                        .cognitoUserPoolId(
                                this.identityStack.userPool
                                        .getUserPoolId()) // TODO: Research a way around needing this.
                        .lambdaUrlAuthType(lambdaUrlAuthType)
                        .lambdaEntry(lambdaEntry)
                        .hmrcClientSecretArn(hmrcClientSecretArn)
                        .receiptsBucketPostfix(receiptsBucketPostfix)
                        .s3RetainReceiptsBucket(s3RetainReceiptsBucket)
                        .build());
        this.applicationStack.addDependency(devStack);
        this.applicationStack.addDependency(identityStack);
        var requestBundlesLambdaGrantPrincipal = this.applicationStack.requestBundlesLambda.getGrantPrincipal();
        identityStack.userPool.grant(
                requestBundlesLambdaGrantPrincipal,
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminUpdateUserAttributes",
                "cognito-idp:ListUsers");
        var myBundlesLambdaGrantPrincipal = this.applicationStack.myBundlesLambda.getGrantPrincipal();
        identityStack.userPool.grant(
                myBundlesLambdaGrantPrincipal,
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminUpdateUserAttributes",
                "cognito-idp:ListUsers");

        // Create the Ops stack (Alarms, etc.)
        // Build list of Lambda function ARNs for OpsStack
        // TODO: Compute ARNs internally in OpsStack from predictable names
        java.util.List<String> lambdaArns = new java.util.ArrayList<>();
        if (this.applicationStack.authUrlHmrcLambda != null)
            lambdaArns.add(this.applicationStack.authUrlHmrcLambda.getFunctionArn());
        if (this.applicationStack.exchangeHmrcTokenLambda != null)
            lambdaArns.add(this.applicationStack.exchangeHmrcTokenLambda.getFunctionArn());
        if (this.applicationStack.submitVatLambda != null)
            lambdaArns.add(this.applicationStack.submitVatLambda.getFunctionArn());
        if (this.applicationStack.logReceiptLambda != null)
            lambdaArns.add(this.applicationStack.logReceiptLambda.getFunctionArn());
        if (this.applicationStack.catalogLambda != null)
            lambdaArns.add(this.applicationStack.catalogLambda.getFunctionArn());
        if (this.applicationStack.requestBundlesLambda != null)
            lambdaArns.add(this.applicationStack.requestBundlesLambda.getFunctionArn());
        if (this.applicationStack.myBundlesLambda != null)
            lambdaArns.add(this.applicationStack.myBundlesLambda.getFunctionArn());
        if (this.applicationStack.myReceiptsLambda != null)
            lambdaArns.add(this.applicationStack.myReceiptsLambda.getFunctionArn());
        String receiptsBucketArn = this.applicationStack.receiptsBucket != null
                ? this.applicationStack.receiptsBucket.getBucketArn()
                : null;

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
                        .receiptsBucketArn(receiptsBucketArn)
                        .build());
        this.opsStack.addDependency(applicationStack);

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
                            .observabilityStackName(observabilityStack.getStackName())
                            .devStackName(devStack.getStackName())
                            .identityStackName(identityStack.getStackName())
                            .authStackName(applicationStack.getStackName())
                            .applicationStackName(applicationStack.getStackName())
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
        if (props.env == null || props.env.isBlank()) props.env = "dev";
        return props;
    }
}
