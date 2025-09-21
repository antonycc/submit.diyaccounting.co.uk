package co.uk.diyaccounting.submit.stacks;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.IFunction;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

public class OpsStack extends Stack {
    public final Dashboard operationalDashboard;

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
        java.util.List<IFunction> lambdaFunctions = new java.util.ArrayList<>();
        java.util.List<Metric> lambdaInvocations = new java.util.ArrayList<>();
        java.util.List<Metric> lambdaErrors = new java.util.ArrayList<>();
        java.util.List<Metric> lambdaDurationsP95 = new java.util.ArrayList<>();
        java.util.List<Metric> lambdaThrottles = new java.util.ArrayList<>();
        if (props.lambdaFunctionArns() != null) {
            for (int i = 0; i < props.lambdaFunctionArns().size(); i++) {
                String arn = props.lambdaFunctionArns().get(i);
                // String fnName = arn.substring(arn.lastIndexOf(":") + 1);
                IFunction fn = Function.fromFunctionAttributes(
                        this,
                        props.resourceNamePrefix() + "-Fn-" + i,
                        FunctionAttributes.builder()
                                .functionArn(arn)
                                .sameEnvironment(true)
                                .build());
                lambdaFunctions.add(fn);
                lambdaInvocations.add(fn.metricInvocations());
                lambdaErrors.add(fn.metricErrors());
                lambdaDurationsP95.add(fn.metricDuration()
                        .with(MetricOptions.builder().statistic("p95").build()));
                lambdaThrottles.add(fn.metricThrottles());
                // Per-function error alarm (>=1 error in 5 minutes)
                Alarm.Builder.create(this, props.resourceNamePrefix() + "-LambdaErrors-" + i)
                        .alarmName(props.compressedResourceNamePrefix() + "-" + fn.getFunctionName() + "-errors")
                        .metric(fn.metricErrors())
                        .threshold(1.0)
                        .evaluationPeriods(1)
                        .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                        .treatMissingData(TreatMissingData.NOT_BREACHING)
                        .alarmDescription("Lambda errors >= 1 for function " + fn.getFunctionName())
                        .build();
            }
        }

        // S3 buckets
        IBucket originBucket =
                Bucket.fromBucketArn(this, props.resourceNamePrefix() + "-OriginBucket", props.originBucketArn());
        IBucket receiptsBucket = null;
        if (props.receiptsBucketArn() != null && !props.receiptsBucketArn().isBlank()) {
            receiptsBucket =
                    Bucket.fromBucketArn(this, props.resourceNamePrefix() + "-ReceiptsBucket", props.receiptsBucketArn());
        }

        // CloudFront metrics (Global)
        java.util.Map<String, String> cfDims =
                java.util.Map.of("DistributionId", props.distributionId(), "Region", "Global");
        Metric cfRequests = Metric.Builder.create()
                .namespace("AWS/CloudFront")
                .metricName("Requests")
                .dimensionsMap(cfDims)
                .statistic("Sum")
                .period(Duration.minutes(5))
                .build();
        Metric cf4xx = Metric.Builder.create()
                .namespace("AWS/CloudFront")
                .metricName("4xxErrorRate")
                .dimensionsMap(cfDims)
                .statistic("Average")
                .period(Duration.minutes(5))
                .build();
        Metric cf5xx = Metric.Builder.create()
                .namespace("AWS/CloudFront")
                .metricName("5xxErrorRate")
                .dimensionsMap(cfDims)
                .statistic("Average")
                .period(Duration.minutes(5))
                .build();

        // Alarms: CloudFront error rates
        Alarm cloudFront5xxAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-CloudFront5xxAlarm")
                .alarmName(props.compressedResourceNamePrefix() + "-cf-5xx-rate")
                .metric(cf5xx)
                .threshold(1.0) // >1% 5xx error rate
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("CloudFront 5xx error rate > 1%")
                .build();
        Alarm cloudFront4xxAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-CloudFront4xxAlarm")
                .alarmName(props.compressedResourceNamePrefix() + "-cf-4xx-rate")
                .metric(cf4xx)
                .threshold(5.0) // >5% 4xx error rate
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("CloudFront 4xx error rate > 5%")
                .build();

        // Dashboard
        java.util.List<java.util.List<software.amazon.awscdk.services.cloudwatch.IWidget>> rows =
                new java.util.ArrayList<>();
        // Row 1: CloudFront requests and error rates
        rows.add(java.util.List.of(
                GraphWidget.Builder.create()
                        .title("CloudFront Requests")
                        .left(java.util.List.of(cfRequests))
                        .width(12)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("CloudFront Error Rates (4xx/5xx)")
                        .left(java.util.List.of(cf4xx, cf5xx))
                        .width(12)
                        .height(6)
                        .build()));
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
        // Row 3: S3 origin and receipts bucket errors/requests
        Metric s3OriginAllReq = Metric.Builder.create()
                .namespace("AWS/S3")
                .metricName("AllRequests")
                .dimensionsMap(java.util.Map.of("BucketName", originBucket.getBucketName(), "FilterId", "EntireBucket"))
                .statistic("Sum")
                .period(Duration.minutes(5))
                .build();
        Metric s3Origin4xx = Metric.Builder.create()
                .namespace("AWS/S3")
                .metricName("4xxErrors")
                .dimensionsMap(java.util.Map.of("BucketName", originBucket.getBucketName(), "FilterId", "EntireBucket"))
                .statistic("Sum")
                .period(Duration.minutes(5))
                .build();
        Metric s3Origin5xx = Metric.Builder.create()
                .namespace("AWS/S3")
                .metricName("5xxErrors")
                .dimensionsMap(java.util.Map.of("BucketName", originBucket.getBucketName(), "FilterId", "EntireBucket"))
                .statistic("Sum")
                .period(Duration.minutes(5))
                .build();

        Metric s3ReceiptsAllReq = null;
        Metric s3Receipts4xx = null;
        Metric s3Receipts5xx = null;
        if (receiptsBucket != null) {
            s3ReceiptsAllReq = Metric.Builder.create()
                    .namespace("AWS/S3")
                    .metricName("AllRequests")
                    .dimensionsMap(
                            java.util.Map.of("BucketName", receiptsBucket.getBucketName(), "FilterId", "EntireBucket"))
                    .statistic("Sum")
                    .period(Duration.minutes(5))
                    .build();
            s3Receipts4xx = Metric.Builder.create()
                    .namespace("AWS/S3")
                    .metricName("4xxErrors")
                    .dimensionsMap(
                            java.util.Map.of("BucketName", receiptsBucket.getBucketName(), "FilterId", "EntireBucket"))
                    .statistic("Sum")
                    .period(Duration.minutes(5))
                    .build();
            s3Receipts5xx = Metric.Builder.create()
                    .namespace("AWS/S3")
                    .metricName("5xxErrors")
                    .dimensionsMap(
                            java.util.Map.of("BucketName", receiptsBucket.getBucketName(), "FilterId", "EntireBucket"))
                    .statistic("Sum")
                    .period(Duration.minutes(5))
                    .build();
        }

        rows.add(java.util.List.of(
                GraphWidget.Builder.create()
                        .title("S3 Origin Requests/Errors")
                        .left(java.util.List.of(s3OriginAllReq, s3Origin4xx, s3Origin5xx))
                        .width(12)
                        .height(6)
                        .build(),
                receiptsBucket != null
                        ? GraphWidget.Builder.create()
                                .title("S3 Receipts Requests/Errors")
                                .left(java.util.List.of(s3ReceiptsAllReq, s3Receipts4xx, s3Receipts5xx))
                                .width(12)
                                .height(6)
                                .build()
                        : GraphWidget.Builder.create()
                                .title("S3 Receipts (not configured)")
                                .left(java.util.List.of())
                                .width(12)
                                .height(6)
                                .build()));

        this.operationalDashboard = Dashboard.Builder.create(this, props.resourceNamePrefix() + "-OperationalDashboard")
                .dashboardName(props.compressedResourceNamePrefix() + "-operations")
                .widgets(rows)
                .build();

        // Outputs
        new CfnOutput(
                this,
                "CloudFront5xxAlarmArn",
                CfnOutputProps.builder().value(cloudFront5xxAlarm.getAlarmArn()).build());
        new CfnOutput(
                this,
                "CloudFront4xxAlarmArn",
                CfnOutputProps.builder().value(cloudFront4xxAlarm.getAlarmArn()).build());
        new CfnOutput(
                this,
                "OperationalDashboard",
                CfnOutputProps.builder()
                        .value("https://" + this.getRegion() + ".console.aws.amazon.com/cloudwatch/home?region="
                                + this.getRegion() + "#dashboards:name=" + this.operationalDashboard.getDashboardName())
                        .build());
    }
}
