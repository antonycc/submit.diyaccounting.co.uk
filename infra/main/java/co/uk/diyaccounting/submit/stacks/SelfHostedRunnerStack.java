package co.uk.diyaccounting.submit.stacks;

import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.autoscaling.AutoScalingGroup;
import software.amazon.awscdk.services.ec2.BlockDevice;
import software.amazon.awscdk.services.ec2.BlockDeviceVolume;
import software.amazon.awscdk.services.ec2.EbsDeviceOptions;
import software.amazon.awscdk.services.ec2.EbsDeviceVolumeType;
import software.amazon.awscdk.services.ec2.IVpc;
import software.amazon.awscdk.services.ec2.InstanceType;
import software.amazon.awscdk.services.ec2.LaunchTemplate;
import software.amazon.awscdk.services.ec2.MachineImage;
import software.amazon.awscdk.services.ec2.SecurityGroup;
import software.amazon.awscdk.services.ec2.SubnetSelection;
import software.amazon.awscdk.services.ec2.SubnetType;
import software.amazon.awscdk.services.ec2.UserData;
import software.amazon.awscdk.services.ec2.Vpc;
import software.amazon.awscdk.services.ec2.VpcLookupOptions;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.constructs.Construct;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public class SelfHostedRunnerStack extends Stack {

    public record RunnerProps(
            String githubRepo,
            String githubPatSecretArn,
            String instanceType,      // e.g. "c7i.large"
            String runnerVersion,     // e.g. "2.321.0"
            String labels,            // e.g. "submit,ec2,highcpu"
            IVpc vpc                  // optional; pass null to use default VPC lookup
    ) {}

    public SelfHostedRunnerStack(final Construct scope, final String id, final StackProps props, final RunnerProps rp) {
        super(scope, id, props);

        // IAM role
        var role = Role.Builder.create(this, "RunnerRole")
                .assumedBy(new ServicePrincipal("ec2.amazonaws.com"))
                .managedPolicies(List.of(ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")))
                .build();

        // Read PAT secret
        role.addToPolicy(PolicyStatement.Builder.create()
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(rp.githubPatSecretArn()))
                .build());

        // Logs (optional for user-data)
        role.addToPolicy(PolicyStatement.Builder.create()
                .actions(List.of("logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"))
                .resources(List.of("*"))
                .build());

        // VPC + SG
        var vpc = rp.vpc() != null ? rp.vpc()
                : Vpc.fromLookup(this, "DefaultVpc", VpcLookupOptions.builder().isDefault(true).build());

        var sg = SecurityGroup.Builder.create(this, "RunnerSG")
                .vpc(vpc).allowAllOutbound(true).build();

        // Load user-data script from file and wrap
        String raw;
        try {
            raw = Files.readString(Path.of("infra/bin/runner-user-data.sh"));
        } catch (Exception e) {
            throw new RuntimeException("Failed to read infra/bin/runner-user-data.sh", e);
        }

        // Compose wrapper that writes the file then runs it with env
        String wrapper = "#!/bin/bash -xe\n" +
                "mkdir -p /opt/bootstrap\n" +
                "cat > /opt/bootstrap/runner-user-data.sh <<'EOF'\n" +
                raw + "\nEOF\n" +
                "chmod +x /opt/bootstrap/runner-user-data.sh\n" +
                "export GITHUB_REPO='" + rp.githubRepo() + "'\n" +
                "export GITHUB_PAT_SECRET_ARN='" + rp.githubPatSecretArn() + "'\n" +
                "export RUNNER_LABELS='" + (rp.labels() == null ? "submit,ec2" : rp.labels()) + "'\n" +
                "export RUNNER_VERSION='" + (rp.runnerVersion() == null ? "2.321.0" : rp.runnerVersion()) + "'\n" +
                "/opt/bootstrap/runner-user-data.sh\n";

        var ud = UserData.custom(wrapper);

        var lt = LaunchTemplate.Builder.create(this, "RunnerLT")
                .instanceType(new InstanceType(rp.instanceType() == null ? "c7i.large" : rp.instanceType()))
                .machineImage(MachineImage.latestAmazonLinux2023())
                .role(role)
                .securityGroup(sg)
                .userData(ud)
                .blockDevices(List.of(BlockDevice.builder()
                        .deviceName("/dev/xvda")
                        .volume(BlockDeviceVolume.ebs(100, EbsDeviceOptions.builder()
                                .volumeType(EbsDeviceVolumeType.GP3).build()))
                        .build()))
                .build();

        var asg = AutoScalingGroup.Builder.create(this, "RunnerASG")
                .vpc(vpc)
                .launchTemplate(lt)
                .minCapacity(0)
                .desiredCapacity(0)
                .maxCapacity(3)
                .vpcSubnets(SubnetSelection.builder().subnetType(SubnetType.PUBLIC).build())
                .cooldown(Duration.minutes(5))
                .build();

        asg.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
}
