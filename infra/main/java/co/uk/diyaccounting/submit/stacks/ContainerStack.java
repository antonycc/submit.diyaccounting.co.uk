package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.apprunner.CfnService;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

/**
 * ContainerStack provisions an AWS App Runner service for the monolith deployment mode.
 * This stack runs the entire application as a single container that connects to AWS DynamoDB
 * (from SubmitEnvironment), uses Google OAuth via passport.js, and loads secrets from Parameter Store.
 */
public class ContainerStack extends Stack {

    public final CfnService appRunnerService;
    public final String serviceUrl;

    @Value.Immutable
    public interface ContainerStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String baseImageTag();

        String googleClientId();

        String googleClientSecretParam();

        String hmrcClientId();

        String hmrcClientSecretArn();

        String hmrcSandboxClientId();

        String hmrcSandboxClientSecretArn();

        String hmrcBaseUri();

        String hmrcSandboxBaseUri();

        String bundlesTableArn();

        String receiptsTableArn();

        String hmrcApiRequestsTableArn();

        static ImmutableContainerStackProps.Builder builder() {
            return ImmutableContainerStackProps.builder();
        }
    }

    public ContainerStack(final Construct scope, final String id, final ContainerStackProps props) {
        this(scope, id, null, props);
    }

    public ContainerStack(
            final Construct scope, final String id, final StackProps stackProps, final ContainerStackProps props) {
        super(
                scope,
                id,
                StackProps.builder()
                        .env(props.getEnv())
                        .description(stackProps != null ? stackProps.getDescription() : null)
                        .stackName(stackProps != null ? stackProps.getStackName() : null)
                        .terminationProtection(stackProps != null ? stackProps.getTerminationProtection() : null)
                        .analyticsReporting(stackProps != null ? stackProps.getAnalyticsReporting() : null)
                        .synthesizer(stackProps != null ? stackProps.getSynthesizer() : null)
                        .crossRegionReferences(stackProps != null ? stackProps.getCrossRegionReferences() : null)
                        .build());

        // Apply cost allocation tags
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@antonycc/submit.diyaccounting.co.uk/cdk.json");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "ContainerStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");
        Tags.of(this).add("DeploymentMode", "monolith");

        // Get ECR repository reference
        String ecrRepositoryName = props.sharedNames().ecrRepositoryName;
        IRepository ecrRepository = Repository.fromRepositoryName(this, "EcrRepo", ecrRepositoryName);

        // Create IAM role for App Runner instance (runtime)
        Role instanceRole = Role.Builder.create(this, props.resourceNamePrefix() + "-InstanceRole")
                .assumedBy(new ServicePrincipal("tasks.apprunner.amazonaws.com"))
                .build();

        // Add granular DynamoDB permissions for specific tables only
        instanceRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "dynamodb:GetItem",
                        "dynamodb:PutItem",
                        "dynamodb:UpdateItem",
                        "dynamodb:DeleteItem",
                        "dynamodb:Query",
                        "dynamodb:Scan",
                        "dynamodb:BatchGetItem",
                        "dynamodb:BatchWriteItem"))
                .resources(List.of(
                        props.bundlesTableArn(),
                        props.receiptsTableArn(),
                        props.hmrcApiRequestsTableArn(),
                        // Allow access to indexes as well
                        props.bundlesTableArn() + "/index/*",
                        props.receiptsTableArn() + "/index/*",
                        props.hmrcApiRequestsTableArn() + "/index/*"))
                .build());

        // Add Secrets Manager read permissions
        instanceRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"))
                .resources(List.of(
                        props.hmrcClientSecretArn(), props.hmrcSandboxClientSecretArn(), "*" // Allow Google secret
                        ))
                .build());

        // Add inline policy for specific resources
        instanceRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("ssm:GetParameter", "ssm:GetParameters"))
                .resources(List.of(
                        String.format(
                                "arn:aws:ssm:%s:%s:parameter/%s/*",
                                props.getEnv().getRegion(), props.getEnv().getAccount(), props.envName()),
                        String.format(
                                "arn:aws:ssm:%s:%s:parameter/prod/submit/*",
                                props.getEnv().getRegion(), props.getEnv().getAccount())))
                .build());

        // Create IAM role for App Runner access (for pulling ECR images)
        Role accessRole = Role.Builder.create(this, props.resourceNamePrefix() + "-AccessRole")
                .assumedBy(new ServicePrincipal("build.apprunner.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSAppRunnerServicePolicyForECRAccess")))
                .build();

        // Build environment variables for the container
        Map<String, String> environmentVariables = new HashMap<>();
        environmentVariables.put("APP_MODE", "monolith");
        environmentVariables.put("NODE_ENV", "production");
        environmentVariables.put("ENVIRONMENT_NAME", props.envName());
        environmentVariables.put("DEPLOYMENT_NAME", props.deploymentName());
        environmentVariables.put("AWS_REGION", props.getEnv().getRegion());

        // DynamoDB configuration - uses AWS DynamoDB from SubmitEnvironment
        environmentVariables.put("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName);
        environmentVariables.put("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName);
        environmentVariables.put("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", props.sharedNames().hmrcApiRequestsTableName);

        // Google OAuth configuration
        environmentVariables.put("GOOGLE_CLIENT_ID", props.googleClientId());
        environmentVariables.put("GOOGLE_CLIENT_SECRET_PARAM", props.googleClientSecretParam());

        // HMRC configuration
        environmentVariables.put("HMRC_CLIENT_ID", props.hmrcClientId());
        environmentVariables.put("HMRC_CLIENT_SECRET_ARN", props.hmrcClientSecretArn());
        environmentVariables.put("HMRC_SANDBOX_CLIENT_ID", props.hmrcSandboxClientId());
        environmentVariables.put("HMRC_SANDBOX_CLIENT_SECRET_ARN", props.hmrcSandboxClientSecretArn());
        environmentVariables.put("HMRC_BASE_URI", props.hmrcBaseUri());
        environmentVariables.put("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri());

        // Application base URL (will be updated after service is created)
        String baseUrl = props.sharedNames().baseUrl;
        environmentVariables.put("APP_BASE_URL", baseUrl);
        environmentVariables.put("DIY_SUBMIT_BASE_URL", baseUrl);

        // Cookie secret parameter
        environmentVariables.put("COOKIE_SECRET_PARAM", String.format("/%s/submit/cookie_secret", props.envName()));

        // Convert environment variables to App Runner format
        List<CfnService.KeyValuePairProperty> environmentList = environmentVariables.entrySet().stream()
                .map(entry -> CfnService.KeyValuePairProperty.builder()
                        .name(entry.getKey())
                        .value(entry.getValue())
                        .build())
                .toList();

        // Create App Runner service
        String imageUri = String.format(
                "%s.dkr.ecr.%s.amazonaws.com/%s:%s",
                props.getEnv().getAccount(), props.getEnv().getRegion(), ecrRepositoryName, props.baseImageTag());

        this.appRunnerService = CfnService.Builder.create(this, props.resourceNamePrefix() + "-AppRunnerService")
                .serviceName(props.resourceNamePrefix() + "-monolith")
                .sourceConfiguration(CfnService.SourceConfigurationProperty.builder()
                        .authenticationConfiguration(CfnService.AuthenticationConfigurationProperty.builder()
                                .accessRoleArn(accessRole.getRoleArn())
                                .build())
                        .autoDeploymentsEnabled(false)
                        .imageRepository(CfnService.ImageRepositoryProperty.builder()
                                .imageIdentifier(imageUri)
                                .imageRepositoryType("ECR")
                                .imageConfiguration(CfnService.ImageConfigurationProperty.builder()
                                        .port("3000")
                                        .runtimeEnvironmentVariables(environmentList)
                                        .build())
                                .build())
                        .build())
                .instanceConfiguration(CfnService.InstanceConfigurationProperty.builder()
                        .cpu("1 vCPU")
                        .memory("2 GB")
                        .instanceRoleArn(instanceRole.getRoleArn())
                        .build())
                .healthCheckConfiguration(CfnService.HealthCheckConfigurationProperty.builder()
                        .protocol("HTTP")
                        .path("/health")
                        .interval(10)
                        .timeout(5)
                        .healthyThreshold(1)
                        .unhealthyThreshold(5)
                        .build())
                .build();

        // Extract service URL
        this.serviceUrl = String.format("https://%s", this.appRunnerService.getAttrServiceUrl());

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs
        cfnOutput(this, "ServiceUrl", this.serviceUrl);
        cfnOutput(this, "ServiceArn", this.appRunnerService.getAttrServiceArn());
        cfnOutput(this, "ServiceId", this.appRunnerService.getAttrServiceId());

        infof(
                "ContainerStack %s created successfully with App Runner service at %s",
                this.getNode().getId(), this.serviceUrl);
    }
}
