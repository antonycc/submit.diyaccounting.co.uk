package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.awssdk.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrLogGroupName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrPublishRoleName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrRepositoryName;

import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
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

public class DevStack extends Stack {

    public final IRepository ecrRepository;
    public final LogGroup ecrLogGroup;
    public final Role ecrPublishRole;

    @Value.Immutable
    public interface DevStackProps extends StackProps {
        String envName();

        String subDomainName();

        String hostedZoneName();

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        static ImmutableDevStackProps.Builder builder() {
            return ImmutableDevStackProps.builder();
        }
    }

    public DevStack(Construct scope, String id, DevStackProps props) {
        this(scope, id, null, props);
    }

    public DevStack(Construct scope, String id, StackProps stackProps, DevStackProps props) {
        super(scope, id, stackProps);

        // Values are provided via SubmitApplication after context/env resolution

        // Build naming using same patterns as WebStack
        String domainName = buildDomainName(props.envName(), props.subDomainName(), props.hostedZoneName());
        String dashedDomainName = buildDashedDomainName(props.envName(), props.subDomainName(), props.hostedZoneName());

        infof("Creating DevStack for domain: %s (dashed: %s)", domainName, dashedDomainName);

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
        cfnOutput(this, "EcrRepositoryArn", this.ecrRepository.getRepositoryArn());
        cfnOutput(this, "EcrRepositoryUri", this.ecrRepository.getRepositoryUri());
        cfnOutput(this, "EcrLogGroupArn", this.ecrLogGroup.getLogGroupArn());
        cfnOutput(this, "EcrPublishRoleArn", this.ecrPublishRole.getRoleArn());

        infof("DevStack %s created successfully for %s", this.getNode().getId(), dashedDomainName);
    }
}
