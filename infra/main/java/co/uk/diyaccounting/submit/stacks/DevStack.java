package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.util.AbstractMap;
import java.util.List;
import java.util.regex.Pattern;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.LifecycleRule;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.TagStatus;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyDocument;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

/**
 * DevStack for Docker container development and deployment infrastructure.
 * Creates ECR repositories with comprehensive logging and publishing facilities.
 */
public class DevStack extends Stack {

    private static final Logger logger = LogManager.getLogger(DevStack.class);

    // Public properties for stack outputs
    public final IRepository ecrRepository;
    public final LogGroup ecrLogGroup;
    public final Role ecrPublishRole;

    public DevStack(Construct scope, String id, DevStackProps props) {
        this(scope, id, null, props);
    }

    public DevStack(Construct scope, String id, StackProps stackProps, DevStackProps props) {
        super(scope, id, stackProps);

        // Values are provided via SubmitApplication after context/env resolution

        // Build naming using same patterns as WebStack
        String domainName = buildDomainName(props.env(), props.subDomainName(), props.hostedZoneName());
        String dashedDomainName =
                buildDashedDomainName(props.env(), props.subDomainName(), props.hostedZoneName());

        logger.info("Creating DevStack for domain: {} (dashed: {})", domainName, dashedDomainName);

        // ECR Repository with lifecycle rules
        String ecrRepositoryName = buildEcrRepositoryName(dashedDomainName);
        this.ecrRepository = Repository.Builder.create(this, "EcrRepository")
                .repositoryName(ecrRepositoryName)
                .imageScanOnPush(true) // Enable vulnerability scanning
                .imageTagMutability(software.amazon.awscdk.services.ecr.TagMutability.MUTABLE)
                .lifecycleRules(List.of(
                        // Remove untagged images after 1 day
                        LifecycleRule.builder()
                                .description("Remove untagged images after 1 day")
                                .tagStatus(TagStatus.UNTAGGED)
                                .maxImageAge(Duration.days(1))
                                .build()))
                .emptyOnDelete(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // CloudWatch Log Group for ECR operations with 7-day retention
        String ecrLogGroupName = buildEcrLogGroupName(dashedDomainName);
        this.ecrLogGroup = LogGroup.Builder.create(this, "EcrLogGroup")
                .logGroupName(ecrLogGroupName)
                .retention(RetentionDays.ONE_WEEK) // 7-day retention as requested
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // IAM Role for ECR publishing with comprehensive permissions
        this.ecrPublishRole = Role.Builder.create(this, "EcrPublishRole")
                .roleName(buildEcrPublishRoleName(dashedDomainName))
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .inlinePolicies(java.util.Map.of(
                        "EcrPublishPolicy",
                        PolicyDocument.Builder.create()
                                .statements(List.of(
                                        // ECR repository permissions
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "ecr:GetAuthorizationToken",
                                                        "ecr:BatchCheckLayerAvailability",
                                                        "ecr:GetDownloadUrlForLayer",
                                                        "ecr:BatchGetImage",
                                                        "ecr:InitiateLayerUpload",
                                                        "ecr:UploadLayerPart",
                                                        "ecr:CompleteLayerUpload",
                                                        "ecr:PutImage",
                                                        "ecr:ListImages",
                                                        "ecr:DescribeImages",
                                                        "ecr:DescribeRepositories"))
                                                .resources(List.of(this.ecrRepository.getRepositoryArn()))
                                                .build(),
                                        // CloudWatch Logs permissions for verbose logging
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "logs:CreateLogStream",
                                                        "logs:PutLogEvents",
                                                        "logs:DescribeLogGroups",
                                                        "logs:DescribeLogStreams"))
                                                .resources(List.of(this.ecrLogGroup.getLogGroupArn() + "*"))
                                                .build(),
                                        // Additional ECR permissions for scanning and lifecycle
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "ecr:DescribeImageScanFindings",
                                                        "ecr:StartImageScan",
                                                        "ecr:GetLifecyclePolicy",
                                                        "ecr:GetLifecyclePolicyPreview"))
                                                .resources(List.of(this.ecrRepository.getRepositoryArn()))
                                                .build()))
                                .build()))
                .build();

        // Output key information
        CfnOutput.Builder.create(this, "EcrRepositoryArn")
                .value(this.ecrRepository.getRepositoryArn())
                .description("ARN of the ECR repository")
                .build();

        CfnOutput.Builder.create(this, "EcrRepositoryUri")
                .value(this.ecrRepository.getRepositoryUri())
                .description("URI of the ECR repository")
                .build();

        CfnOutput.Builder.create(this, "EcrLogGroupArn")
                .value(this.ecrLogGroup.getLogGroupArn())
                .description("ARN of the ECR CloudWatch Log Group")
                .build();

        CfnOutput.Builder.create(this, "EcrPublishRoleArn")
                .value(this.ecrPublishRole.getRoleArn())
                .description("ARN of the ECR publish role")
                .build();

        logger.info("DevStack created successfully for {}", dashedDomainName);
    }

    // Naming utility methods following WebStack patterns
    public static String buildDomainName(String env, String subDomainName, String hostedZoneName) {
        return env.equals("prod")
                ? buildProdDomainName(subDomainName, hostedZoneName)
                : buildNonProdDomainName(env, subDomainName, hostedZoneName);
    }

    public static String buildProdDomainName(String subDomainName, String hostedZoneName) {
        return "%s.%s".formatted(subDomainName, hostedZoneName);
    }

    public static String buildNonProdDomainName(String env, String subDomainName, String hostedZoneName) {
        return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName);
    }

    public static String buildDashedDomainName(String env, String subDomainName, String hostedZoneName) {
        return ResourceNameUtils.convertDotSeparatedToDashSeparated(
                "%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings);
    }

    public static String buildEcrRepositoryName(String dashedDomainName) {
        return "%s-ecr".formatted(dashedDomainName);
    }

    public static String buildEcrLogGroupName(String dashedDomainName) {
        return "/aws/ecr/%s".formatted(dashedDomainName);
    }

    public static String buildEcrPublishRoleName(String dashedDomainName) {
        return "%s-ecr-publish-role".formatted(dashedDomainName);
    }

    // Use same domain name mappings as WebStack
    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();
}
