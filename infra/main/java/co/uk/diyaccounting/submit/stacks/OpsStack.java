package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.events.CronOptions;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.RuleTargetInput;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.IFunction;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

public class OpsStack extends Stack {

    public final Dashboard operationalDashboard;
    public Function checkSubscriptionsLambda;
    public ILogGroup checkSubscriptionsLambdaLogGroup;
    public Rule checkSubscriptionsSchedule;

    @Value.Immutable
    public interface OpsStackProps extends StackProps, SubmitStackProps {

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

        List<String> lambdaFunctionArns();

        String baseImageTag();

        String stripeSecretKeyArn();

        String stripePublishableKey();

        String stripeWebhookSecret();

        String stripeBusinessPriceId();

        static ImmutableOpsStackProps.Builder builder() {
            return ImmutableOpsStackProps.builder();
        }
    }

    public OpsStack(final Construct scope, final String id, final OpsStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@antonycc/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "OpsStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Import resources from props
        // Lambda functions
        // java.util.List<IFunction> lambdaFunctions = new java.util.ArrayList<>();
        java.util.List<Metric> lambdaInvocations = new java.util.ArrayList<>();
        java.util.List<Metric> lambdaErrors = new java.util.ArrayList<>();
        java.util.List<Metric> lambdaDurationsP95 = new java.util.ArrayList<>();
        java.util.List<Metric> lambdaThrottles = new java.util.ArrayList<>();
        if (props.lambdaFunctionArns() != null) {
            for (int i = 0; i < props.lambdaFunctionArns().size(); i++) {
                String arn = props.lambdaFunctionArns().get(i);
                IFunction fn = Function.fromFunctionAttributes(
                        this,
                        props.resourceNamePrefix() + "-Fn-" + i,
                        FunctionAttributes.builder()
                                .functionArn(arn)
                                .sameEnvironment(true)
                                .build());
                // lambdaFunctions.add(fn);
                lambdaInvocations.add(fn.metricInvocations());
                lambdaErrors.add(fn.metricErrors());
                lambdaDurationsP95.add(fn.metricDuration()
                        .with(MetricOptions.builder().statistic("p95").build()));
                lambdaThrottles.add(fn.metricThrottles());
            }
        }

        // Dashboard
        java.util.List<java.util.List<software.amazon.awscdk.services.cloudwatch.IWidget>> rows =
                new java.util.ArrayList<>();
        // Row 1: CloudFront requests and error rates
        // Moved to DeliveryStack
        // Row 2: Lambda invocations and errors
        if (!lambdaInvocations.isEmpty()) {
            rows.add(java.util.List.of(
                    GraphWidget.Builder.create()
                            .title("Lambda Invocations by Function")
                            .left(lambdaInvocations)
                            .width(12)
                            .height(6)
                            .build(),
                    GraphWidget.Builder.create()
                            .title("Lambda Errors by Function")
                            .left(lambdaErrors)
                            .width(12)
                            .height(6)
                            .build()));
            rows.add(java.util.List.of(
                    GraphWidget.Builder.create()
                            .title("Lambda p95 Duration by Function")
                            .left(lambdaDurationsP95)
                            .width(12)
                            .height(6)
                            .build(),
                    GraphWidget.Builder.create()
                            .title("Lambda Throttles by Function")
                            .left(lambdaThrottles)
                            .width(12)
                            .height(6)
                            .build()));
        }
        this.operationalDashboard = Dashboard.Builder.create(
                        this, props.resourceNamePrefix() + "-LambdaFunctionsDashboard")
                .dashboardName(props.resourceNamePrefix() + "-lambdas")
                .widgets(rows)
                .build();

        // Create Lambda function for nightly subscription checks
        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        var checkSubscriptionsLambdaEnv = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("STRIPE_SECRET_KEY_ARN", props.stripeSecretKeyArn())
                .with("STRIPE_PUBLISHABLE_KEY", props.stripePublishableKey())
                .with("STRIPE_WEBHOOK_SECRET", props.stripeWebhookSecret())
                .with("STRIPE_BUSINESS_PRICE_ID", props.stripeBusinessPriceId());

        var checkSubscriptionsLambda = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(props.resourceNamePrefix() + "-CheckSubscriptions")
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .functionName(props.resourceNamePrefix() + "-check-subscriptions")
                        .handler("app/functions/ops/checkSubscriptions.handler")
                        .lambdaArn(props.resourceNamePrefix() + "-check-subscriptions-arn")
                        .environment(checkSubscriptionsLambdaEnv)
                        .timeout(Duration.millis(Long.parseLong("300000"))) // 5 minutes
                        .build());
        this.checkSubscriptionsLambda = checkSubscriptionsLambda.lambda;
        this.checkSubscriptionsLambdaLogGroup = checkSubscriptionsLambda.logGroup;

        // Grant DynamoDB permissions to checkSubscriptionsLambda
        bundlesTable.grantReadWriteData(this.checkSubscriptionsLambda);
        infof(
                "Granted DynamoDB permissions to %s for Bundles Table %s",
                this.checkSubscriptionsLambda.getFunctionName(), bundlesTable.getTableName());

        // Grant Secrets Manager permissions to checkSubscriptionsLambda
        this.checkSubscriptionsLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(props.stripeSecretKeyArn()))
                .build());
        infof(
                "Granted Secrets Manager permissions to %s for Stripe secret",
                this.checkSubscriptionsLambda.getFunctionName());

        // Create EventBridge rule for nightly subscription checks (runs at 2 AM UTC daily)
        Schedule cronSchedule = Schedule.cron(CronOptions.builder()
                .minute("0")
                .hour("2")
                .day("*")
                .month("*")
                .year("*")
                .build());

        LambdaFunction checkSubscriptionsTarget = LambdaFunction.Builder.create(this.checkSubscriptionsLambda)
                .event(RuleTargetInput.fromObject(Map.of(
                        "source", "eventbridge-schedule",
                        "deploymentName", props.deploymentName(),
                        "action", "checkSubscriptions")))
                .build();

        this.checkSubscriptionsSchedule = Rule.Builder.create(
                        this, props.resourceNamePrefix() + "-CheckSubscriptionsSchedule")
                .ruleName(props.resourceNamePrefix() + "-check-subscriptions-schedule")
                .description("Triggers nightly subscription status check at 2 AM UTC")
                .schedule(cronSchedule)
                .targets(List.of(checkSubscriptionsTarget))
                .build();

        infof("Created nightly subscription check schedule for %s", this.checkSubscriptionsLambda.getFunctionName());

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        // Outputs
        cfnOutput(
                this,
                "OperationalDashboard",
                "https://" + this.getRegion() + ".console.aws.amazon.com/cloudwatch/home?region=" + this.getRegion()
                        + "#dashboards:name=" + this.operationalDashboard.getDashboardName());
        cfnOutput(this, "CheckSubscriptionsLambdaArn", this.checkSubscriptionsLambda.getFunctionArn());
        cfnOutput(this, "CheckSubscriptionsScheduleArn", this.checkSubscriptionsSchedule.getRuleArn());

        infof("OpsStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
