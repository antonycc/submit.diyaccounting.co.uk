package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cloudwatch.actions.SnsAction;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.EmailSubscription;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

/**
 * Creates essential CloudWatch alarms for monitoring the submit.diyaccounting.co.uk application.
 * Includes alarms for Lambda errors, S3 costs, and CloudFront performance.
 */
public class MonitoringAlarms {

    public final Topic alertTopic;
    public final List<Alarm> lambdaAlarms;
    public final List<Alarm> s3CostAlarms;
    public final List<Alarm> cloudFrontAlarms;

    private MonitoringAlarms(Builder builder) {
        // Create SNS topic for alerts
        this.alertTopic = Topic.Builder.create(builder.scope, "MonitoringAlerts")
                .topicName(builder.topicName)
                .displayName("Submit DIY Accounting Alerts")
                .build();

        // Add email subscription if provided
        if (builder.alertEmail != null && !builder.alertEmail.isBlank()) {
            this.alertTopic.addSubscription(new EmailSubscription(builder.alertEmail));
        }

        // Create Lambda function alarms
        this.lambdaAlarms = builder.lambdaFunctions.stream().map(lambda -> {
            // Error rate alarm
            Alarm errorAlarm = Alarm.Builder.create(builder.scope, lambda.getFunctionName() + "ErrorAlarm")
                    .alarmName(lambda.getFunctionName() + "-ErrorRate")
                    .alarmDescription("High error rate for Lambda function " + lambda.getFunctionName())
                    .metric(Metric.Builder.create()
                        .namespace("AWS/Lambda")
                        .metricName("Errors")
                        .dimensionsMap(Map.of("FunctionName", lambda.getFunctionName()))
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                    .threshold(5.0) // Alert if more than 5 errors in 5 minutes
                    .evaluationPeriods(2)
                    .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                    .treatMissingData(TreatMissingData.NOT_BREACHING)
                    .build();

            // Duration alarm
            Alarm durationAlarm = Alarm.Builder.create(builder.scope, lambda.getFunctionName() + "DurationAlarm")
                    .alarmName(lambda.getFunctionName() + "-Duration")
                    .alarmDescription("High duration for Lambda function " + lambda.getFunctionName())
                    .metric(Metric.Builder.create()
                        .namespace("AWS/Lambda")
                        .metricName("Duration")
                        .dimensionsMap(Map.of("FunctionName", lambda.getFunctionName()))
                        .statistic("Average")
                        .period(Duration.minutes(5))
                        .build())
                    .threshold(30000.0) // Alert if average duration > 30 seconds
                    .evaluationPeriods(3)
                    .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                    .treatMissingData(TreatMissingData.NOT_BREACHING)
                    .build();

            // Add SNS actions
            errorAlarm.addAlarmAction(new SnsAction(this.alertTopic));
            durationAlarm.addAlarmAction(new SnsAction(this.alertTopic));

            return List.of(errorAlarm, durationAlarm);
        }).flatMap(List::stream).toList();

        // Create S3 cost monitoring alarms
        this.s3CostAlarms = builder.s3Buckets.stream().map(bucket -> {
            // Storage cost alarm - estimates based on standard pricing
            Alarm storageAlarm = Alarm.Builder.create(builder.scope, 
                    bucket.getBucketName().replace("-", "") + "StorageAlarm")
                    .alarmName(bucket.getBucketName() + "-StorageSize")
                    .alarmDescription("High storage usage for S3 bucket " + bucket.getBucketName())
                    .metric(Metric.Builder.create()
                        .namespace("AWS/S3")
                        .metricName("BucketSizeBytes")
                        .dimensionsMap(Map.of(
                            "BucketName", bucket.getBucketName(),
                            "StorageType", "StandardStorage"
                        ))
                        .statistic("Average")
                        .period(Duration.hours(24))
                        .build())
                    .threshold(10737418240.0) // Alert if bucket > 10GB (£0.20/month)
                    .evaluationPeriods(1)
                    .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                    .treatMissingData(TreatMissingData.NOT_BREACHING)
                    .build();

            storageAlarm.addAlarmAction(new SnsAction(this.alertTopic));
            return storageAlarm;
        }).toList();

        // Create CloudFront performance alarms
        this.cloudFrontAlarms = List.of(
            // 4xx error rate alarm
            Alarm.Builder.create(builder.scope, "CloudFront4xxAlarm")
                    .alarmName("CloudFront-4xxErrorRate")
                    .alarmDescription("High 4xx error rate on CloudFront distribution")
                    .metric(Metric.Builder.create()
                        .namespace("AWS/CloudFront")
                        .metricName("4xxErrorRate")
                        .dimensionsMap(Map.of("DistributionId", builder.distributionId))
                        .statistic("Average")
                        .period(Duration.minutes(5))
                        .build())
                    .threshold(10.0) // Alert if 4xx error rate > 10%
                    .evaluationPeriods(2)
                    .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                    .treatMissingData(TreatMissingData.NOT_BREACHING)
                    .build(),

            // Origin latency alarm
            Alarm.Builder.create(builder.scope, "CloudFrontLatencyAlarm")
                    .alarmName("CloudFront-OriginLatency")
                    .alarmDescription("High origin latency for CloudFront distribution")
                    .metric(Metric.Builder.create()
                        .namespace("AWS/CloudFront")
                        .metricName("OriginLatency")
                        .dimensionsMap(Map.of("DistributionId", builder.distributionId))
                        .statistic("Average")
                        .period(Duration.minutes(5))
                        .build())
                    .threshold(5000.0) // Alert if average latency > 5 seconds
                    .evaluationPeriods(3)
                    .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                    .treatMissingData(TreatMissingData.NOT_BREACHING)
                    .build()
        );

        // Add SNS actions to CloudFront alarms
        this.cloudFrontAlarms.forEach(alarm -> alarm.addAlarmAction(new SnsAction(this.alertTopic)));
    }

    public static class Builder {
        private final Construct scope;
        private String topicName = "submit-monitoring-alerts";
        private String alertEmail;
        private List<Function> lambdaFunctions = List.of();
        private List<IBucket> s3Buckets = List.of();
        private String distributionId;

        private Builder(Construct scope) {
            this.scope = scope;
        }

        public static Builder create(Construct scope) {
            return new Builder(scope);
        }

        public Builder topicName(String topicName) {
            this.topicName = topicName;
            return this;
        }

        public Builder alertEmail(String alertEmail) {
            this.alertEmail = alertEmail;
            return this;
        }

        public Builder lambdaFunctions(List<Function> lambdaFunctions) {
            this.lambdaFunctions = lambdaFunctions;
            return this;
        }

        public Builder s3Buckets(List<IBucket> s3Buckets) {
            this.s3Buckets = s3Buckets;
            return this;
        }

        public Builder distributionId(String distributionId) {
            this.distributionId = distributionId;
            return this;
        }

        public MonitoringAlarms build() {
            if (distributionId == null || distributionId.isBlank()) {
                throw new IllegalArgumentException("distributionId is required");
            }
            return new MonitoringAlarms(this);
        }
    }
}