package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrLogGroupName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrPublishRoleName;

import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
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
    public interface DevStackProps extends StackProps, SubmitStackProps {

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
        String compressedResourceNamePrefix();

        @Override
        String dashedDomainName();

        @Override
        String domainName();

        @Override
        String baseUrl();

        @Override
        String cloudTrailEnabled();

        String ecrRepositoryName();

        static ImmutableDevStackProps.Builder builder() {
            return ImmutableDevStackProps.builder();
        }
    }

    public DevStack(Construct scope, String id, DevStackProps props) {
        this(scope, id, null, props);
    }

    public DevStack(Construct scope, String id, StackProps stackProps, DevStackProps props) {
        super(scope, id, stackProps);

        infof("Creating DevStack for domain: %s (dashed: %s)", props.domainName(), props.dashedDomainName());

        // ECR Repository with lifecycle rules
        this.ecrRepository = Repository.Builder.create(this, props.resourceNamePrefix() + "-EcrRepository")
                .repositoryName(props.ecrRepositoryName())
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
        String ecrLogGroupName = buildEcrLogGroupName(props.dashedDomainName());
        this.ecrLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-EcrLogGroup")
                .logGroupName(ecrLogGroupName)
                .retention(RetentionDays.ONE_WEEK) // 7-day retention as requested
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // IAM Role for ECR publishing with comprehensive permissions
        this.ecrPublishRole = Role.Builder.create(this, props.resourceNamePrefix() + "-EcrPublishRole")
                .roleName(buildEcrPublishRoleName(props.dashedDomainName()))
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

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Output key information
        cfnOutput(this, "EcrRepositoryArn", this.ecrRepository.getRepositoryArn());
        cfnOutput(this, "EcrRepositoryUri", this.ecrRepository.getRepositoryUri());
        cfnOutput(this, "EcrLogGroupArn", this.ecrLogGroup.getLogGroupArn());
        cfnOutput(this, "EcrPublishRoleArn", this.ecrPublishRole.getRoleArn());

        infof("DevStack %s created successfully for %s", this.getNode().getId(), props.dashedDomainName());
    }
}
