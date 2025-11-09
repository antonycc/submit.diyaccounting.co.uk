package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.events.CronOptions;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.RuleTargetInput;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.time.ZonedDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.putIfNotNull;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.generateIamCompatibleName;

public class SelfDestructStack extends Stack {

    public final Role functionRole;
    public final Function selfDestructFunction;
    public final Rule selfDestructSchedule;

    @Value.Immutable
    public interface SelfDestructStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return false;
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

        String selfDestructLogGroupName();

        int selfDestructDelayHours();

        ZonedDateTime selfDestructStartDatetime();

        @Value.Default
        default Boolean isDeliveryStack() {
            return false;
        }

        @Value.Default
        default Boolean isApplicationStack() {
            return false;
        }

        static ImmutableSelfDestructStackProps.Builder builder() {
            return ImmutableSelfDestructStackProps.builder();
        }
    }

    public SelfDestructStack(final Construct scope, final String id, final SelfDestructStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "SelfDestructStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        var functionName = props.isDeliveryStack() ?
            props.sharedNames().delSelfDestructLambdaFunctionName :
            props.isApplicationStack() ?
                props.sharedNames().appSelfDestructLambdaFunctionName :
                null;
        var handler = props.isDeliveryStack() ?
            props.sharedNames().delSelfDestructLambdaHandler :
            props.isApplicationStack() ?
                props.sharedNames().appSelfDestructLambdaHandler :
                null;
        var lambdaArn = props.isDeliveryStack() ?
            props.sharedNames().delSelfDestructLambdaArn :
            props.isApplicationStack() ?
                props.sharedNames().appSelfDestructLambdaArn :
                null;

        // Log group for self-destruct function
        ILogGroup logGroup = LogGroup.fromLogGroupArn(
                this,
                props.resourceNamePrefix() + "-ISelfDestructLogGroup",
                "arn:aws:logs:%s:%s:log-group:%s:*"
                        .formatted(
                                Objects.requireNonNull(props.getEnv()).getRegion(),
                                props.getEnv().getAccount(),
                                props.selfDestructLogGroupName()));

        // IAM role for the self-destruct Lambda function
        String roleName = generateIamCompatibleName(props.resourceNamePrefix(), "-self-destruct-role");
        this.functionRole = Role.Builder.create(this, props.resourceNamePrefix() + "-SelfDestructRole")
                .roleName(roleName)
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
                        ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess")))
                .inlinePolicies(Map.of(
                        "SelfDestructPolicy",
                        software.amazon.awscdk.services.iam.PolicyDocument.Builder.create()
                                .statements(List.of(
                                        // CloudFormation permissions to delete stacks
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "cloudformation:DeleteStack",
                                                        "cloudformation:DescribeStacks",
                                                        "cloudformation:DescribeStackEvents",
                                                        "cloudformation:ListStacks"))
                                                .resources(List.of("*"))
                                                .build(),
                                        // Allow deletion of all resources that might be in the stacks
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "lambda:*",
                                                        "dynamodb:*",
                                                        "s3:*",
                                                        "cloudfront:*",
                                                        "route53:*",
                                                        "logs:*",
                                                        "iam:*",
                                                        "ecr:*",
                                                        "cloudwatch:*",
                                                        "acm:*",
                                                        "events:*"))
                                                .resources(List.of("*"))
                                                .build()))
                                .build()))
                .build();

        // Environment variables for the function
        Map<String, String> selfDestructLambdaEnv = new HashMap<>();
        putIfNotNull(selfDestructLambdaEnv, "AWS_XRAY_TRACING_NAME", functionName);
        putIfNotNull(selfDestructLambdaEnv, "DEV_STACK_NAME", props.sharedNames().devStackId);
        putIfNotNull(selfDestructLambdaEnv, "AUTH_STACK_NAME", props.sharedNames().authStackId);
        putIfNotNull(selfDestructLambdaEnv, "HMRC_STACK_NAME", props.sharedNames().hmrcStackId);
        putIfNotNull(selfDestructLambdaEnv, "ACCOUNT_STACK_NAME", props.sharedNames().accountStackId);
        putIfNotNull(selfDestructLambdaEnv, "API_STACK_NAME", props.sharedNames().apiStackId);
        putIfNotNull(selfDestructLambdaEnv, "EDGE_STACK_NAME", props.sharedNames().edgeStackId);
        putIfNotNull(selfDestructLambdaEnv, "PUBLISH_STACK_NAME", props.sharedNames().publishStackId);
        putIfNotNull(selfDestructLambdaEnv, "OPS_STACK_NAME", props.sharedNames().opsStackId);
        putIfNotNull(selfDestructLambdaEnv, "SELF_DESTRUCT_STACK_NAME", this.getStackName());

        // Lambda function for self-destruction
        var bundleDeleteLambda = new Lambda(
            this,
            LambdaProps.builder()
                .idPrefix(props.sharedNames().bundleDeleteLambdaFunctionName)
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                .functionName(functionName)
                .handler(handler)
                .lambdaArn(lambdaArn)
                .environment(selfDestructLambdaEnv)
                .logGroup(logGroup)
                .role(this.functionRole)
                .timeout(Duration.millis(Long.parseLong("900000"))) // 15 minutes
                .build());
        this.selfDestructFunction = bundleDeleteLambda.lambda;

//        this.selfDestructFunction = Function.Builder.create(this, props.resourceNamePrefix() + "-SelfDestructFunction")
//                .functionName(functionName)
//                .runtime(Runtime.NODEJS_20_X)
//                .handler("app/functions/infra/selfDestruct.handler")
//                .code(Code.fromAsset(
//                        "./",
//                        AssetOptions.builder()
//                                .assetHashType(AssetHashType.SOURCE)
//                                .ignoreMode(IgnoreMode.GLOB)
//                                .exclude(List.of(
//                                        ".git/**",
//                                        "cdk.out/**",
//                                        "cdk-submit-application.out/**",
//                                        "cdk-submit-environment.out/**",
//                                        "cdk-submit-delivery.out/**",
//                                        "target/**",
//                                        ".idea/**"
//                                ))
//                                .build()
//                ))
//                .timeout(Duration.minutes(15)) // Allow time for stack deletions
//                .memorySize(256) // Reduced memory for Node.js runtime
//                .role(this.functionRole)
//                .environment(environment)
//                .tracing(Tracing.ACTIVE)
//                .logGroup(logGroup)
//                .build();

        // Create EventBridge rule to trigger self-destruct every delayHours starting at a specific instant.
        // Suggested type for selfDestructStartDatetime: java.time.ZonedDateTime (ensure it is defined earlier).

        String ruleName = generateIamCompatibleName(props.resourceNamePrefix(), "sd-schedule");

        // Hour field using anchored start hour with /delayHours if it divides 24; otherwise single fixed hour (no true
        // interval possible)
        String hourExpression = (24 % props.selfDestructDelayHours() == 0)
                ? props.selfDestructStartDatetime().getHour() + "/" + props.selfDestructDelayHours()
                : String.valueOf(props.selfDestructStartDatetime().getHour());
        Schedule cron = Schedule.cron(CronOptions.builder()
                .minute(String.valueOf(props.selfDestructStartDatetime().getMinute()))
                .hour(hourExpression)
                .day("*")
                .month("*")
                .year("*")
                .build());

        LambdaFunction destructFunctionTarget = LambdaFunction.Builder.create(this.selfDestructFunction)
                .event(RuleTargetInput.fromObject(Map.of(
                        "source", "eventbridge-schedule",
                        "deploymentName", props.deploymentName(),
                        "delayHours", props.selfDestructDelayHours(),
                        "startAt", props.selfDestructStartDatetime().toString())))
                .build();

        this.selfDestructSchedule = Rule.Builder.create(this, props.resourceNamePrefix() + "-SelfDestructSchedule")
                .ruleName(ruleName)
                .description("Automatically triggers self-destruct every " + props.selfDestructDelayHours()
                        + " hours starting at " + props.selfDestructStartDatetime())
                .schedule(cron)
                .targets(List.of(destructFunctionTarget))
                .build();

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Output the function ARN for manual invocation
        cfnOutput(this, "SelfDestructFunctionArn", this.selfDestructFunction.getFunctionArn());
        cfnOutput(this, "SelfDestructScheduleArn", this.selfDestructSchedule.getRuleArn());
        cfnOutput(
                this,
                "SelfDestructScheduleInfo",
                "Self-destruct will trigger automatically at " + props.selfDestructStartDatetime()
                        + " and then again every " + props.selfDestructDelayHours() + " hours");
        cfnOutput(
                this,
                "SelfDestructInstructions",
                "aws lambda invoke --function-name " + functionName + " /tmp/response.json");

        infof("SelfDestructStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
