package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.IFunction;
import software.constructs.Construct;

import java.util.List;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

public class OpsStack extends Stack {

    public final Dashboard operationalDashboard;

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

        // Outputs
        cfnOutput(
                this,
                "OperationalDashboard",
                "https://" + this.getRegion() + ".console.aws.amazon.com/cloudwatch/home?region=" + this.getRegion()
                        + "#dashboards:name=" + this.operationalDashboard.getDashboardName());

        infof("OpsStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
