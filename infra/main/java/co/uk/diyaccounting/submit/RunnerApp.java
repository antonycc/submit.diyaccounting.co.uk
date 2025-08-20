package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.stacks.SelfHostedRunnerStack;
import software.amazon.awscdk.App;
import software.amazon.awscdk.CfnOutput;

public class RunnerApp {
  public static void main(final String[] args) {
    App app = new App();

    String envName = System.getenv("ENV_NAME");
    String stackId =
        "SelfHostedRunnerStack-%s".formatted(envName != null && !envName.isBlank() ? envName : "dev");
    SelfHostedRunnerStack stack =
        SelfHostedRunnerStack.Builder.create(app, stackId)
            .env(System.getenv("ENV_NAME"))
            .githubOrg(System.getenv("GITHUB_ORG"))
            .githubRepo(System.getenv("GITHUB_REPO"))
            .githubRunnerLabel(System.getenv("GITHUB_RUNNER_LABEL"))
            .githubRunnerTokenArn(System.getenv("GITHUB_RUNNER_TOKEN_ARN"))
            .vpcId(System.getenv("VPC_ID"))
            .subnetIds(System.getenv("SUBNET_IDS"))
            .instanceType(System.getenv("INSTANCE_TYPE"))
            .amiId(System.getenv("AMI_ID"))
            .runnerCount(System.getenv("RUNNER_COUNT"))
            .runnerStartupScriptPath(System.getenv("RUNNER_STARTUP_SCRIPT_PATH"))
            .securityGroupIds(System.getenv("SECURITY_GROUP_IDS"))
            .keyName(System.getenv("KEY_NAME"))
            .iamRoleArn(System.getenv("IAM_ROLE_ARN"))
            .build();

    // Example outputs for SelfHostedRunnerStack resources
    CfnOutput.Builder.create(stack, "RunnerInstanceIds")
        .value(stack.getRunnerInstanceIds())
        .build();

    CfnOutput.Builder.create(stack, "RunnerSecurityGroupId")
        .value(stack.getRunnerSecurityGroupId())
        .build();

    CfnOutput.Builder.create(stack, "RunnerIamRoleArn")
        .value(stack.getRunnerIamRoleArn())
        .build();

    CfnOutput.Builder.create(stack, "VpcId")
        .value(stack.getVpcId())
        .build();

    CfnOutput.Builder.create(stack, "SubnetIds")
        .value(stack.getSubnetIds())
        .build();

    app.synth();
  }
}
