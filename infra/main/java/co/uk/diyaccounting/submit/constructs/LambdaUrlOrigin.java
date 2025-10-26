package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupProps;
import software.constructs.Construct;

import java.util.List;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

public class LambdaUrlOrigin {

    // private static final Pattern LAMBDA_URL_HOST_PATTERN = Pattern.compile("https://([^/]+)/");

    public final DockerImageCode dockerImage;
    public final Function lambda;
    public final LogGroup logGroup;

    public LambdaUrlOrigin(final Construct scope, LambdaUrlOriginProps props) {

        // Create the lambda function
        var imageCodeProps = EcrImageCodeProps.builder()
                .tagOrDigest(props.baseImageTag()) // e.g. "latest" or specific digest for immutability
                .cmd(List.of(props.handler()))
                .build();
        var repositoryAttributes = RepositoryAttributes.builder()
                .repositoryArn(props.ecrRepositoryArn())
                .repositoryName(props.ecrRepositoryName())
                .build();
        IRepository repository =
                Repository.fromRepositoryAttributes(scope, props.idPrefix() + "-EcrRepo", repositoryAttributes);
        this.dockerImage = DockerImageCode.fromEcr(repository, imageCodeProps);

        // Add X-Ray environment variables if enabled
        var environment = new java.util.HashMap<>(props.environment());
        environment.put("AWS_XRAY_TRACING_NAME", props.functionName());

        var dockerFunctionBuilder = DockerImageFunction.Builder.create(scope, props.idPrefix() + "-fn")
                .code(this.dockerImage)
                .environment(environment)
                .functionName(props.functionName())
                .timeout(props.timeout());
        dockerFunctionBuilder.tracing(Tracing.ACTIVE);

        this.lambda = dockerFunctionBuilder.build();
        infof("Created Lambda %s with function %s", this.lambda.getNode().getId(), this.lambda.toString());

        // Create log group for the lambda
        this.logGroup = new LogGroup(
                scope,
                props.idPrefix() + "LogGroup",
                LogGroupProps.builder()
                        .logGroupName("/aws/lambda/" + this.lambda.getFunctionName())
                        .retention(props.logGroupRetention())
                        .removalPolicy(props.logGroupRemovalPolicy())
                        .build());
        infof("Created log group %s with retention %s", this.logGroup.getNode().getId(), props.logGroupRetention());

        // Alarms: a small set of useful, actionable Lambda alarms
        // 1) Errors >= 1 in a 5-minute period
        Alarm.Builder.create(scope, props.idPrefix() + "-ErrorsAlarm")
                .alarmName(props.functionName() + "-errors")
                .metric(this.lambda.metricErrors().with(MetricOptions.builder()
                        .period(Duration.minutes(5))
                        .build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Lambda errors >= 1 for function " + this.lambda.getFunctionName())
                .build();

        // 2) Throttles >= 1 in a 5-minute period
        Alarm.Builder.create(scope, props.idPrefix() + "-ThrottlesAlarm")
                .alarmName(props.functionName() + "-throttles")
                .metric(this.lambda.metricThrottles().with(MetricOptions.builder()
                        .period(Duration.minutes(5))
                        .build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Lambda throttles >= 1 for function " + this.lambda.getFunctionName())
                .build();

        // 3) High duration (p95) approaching timeout (>= 80% of configured timeout)
        // Lambda Duration metric unit is milliseconds. Convert timeout to ms and apply 80% threshold.
        double timeoutMs = props.timeout().toSeconds().doubleValue() * 1000.0;
        double highDurationThresholdMs = timeoutMs * 0.8;
        Alarm.Builder.create(scope, props.idPrefix() + "-HighDurationP95Alarm")
                .alarmName(props.functionName() + "-high-duration-p95")
                .metric(this.lambda.metricDuration().with(MetricOptions.builder()
                        .statistic("p95")
                        .period(Duration.minutes(5))
                        .build()))
                .threshold(highDurationThresholdMs)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Lambda p95 duration >= 80% of timeout for function " + this.lambda.getFunctionName())
                .build();
    }
}
