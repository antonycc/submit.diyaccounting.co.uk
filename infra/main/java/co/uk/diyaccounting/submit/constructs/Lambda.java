package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.lambda.Alias;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.lambda.Version;
import software.amazon.awscdk.services.logs.FilterPattern;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupProps;
import software.amazon.awscdk.services.logs.MetricFilter;
import software.constructs.Construct;

import java.util.List;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

public class Lambda {

    public final DockerImageCode dockerImage;
    public final Function lambda;
    public final Version ingestVersion;
    // public final Version ingestVersionReady;
    // public final Version ingestVersionHot;
    public final Alias ingestAliasZero;
    // public final Alias ingestAliasReady;
    public final Alias ingestAliasHot;
    public final ILogGroup logGroup;
    public final AbstractLambdaProps props;

    public Lambda(final Construct scope, AbstractLambdaProps props) {
        this.props = props;

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

        // Create log group for the lambda
        if (props.logGroup().isPresent()) {
            this.logGroup = props.logGroup().get();
            infof(
                    "Using custom log group name %s for Lambda %s",
                    this.logGroup.getNode().getId(), props.functionName());
        } else {
            this.logGroup = new LogGroup(
                    scope,
                    props.idPrefix() + "LogGroup",
                    LogGroupProps.builder()
                            .logGroupName("/aws/lambda/" + props.functionName())
                            .retention(props.logGroupRetention())
                            .removalPolicy(props.logGroupRemovalPolicy())
                            .build());
            infof(
                    "Created log group %s with retention %s for Lambda %s",
                    this.logGroup.getNode().getId(), props.logGroupRetention(), props.functionName());
        }

        // Add X-Ray environment variables if enabled
        var environment = new java.util.HashMap<>(props.environment());
        environment.put("AWS_XRAY_TRACING_NAME", props.functionName());
        var dockerFunctionBuilder = DockerImageFunction.Builder.create(scope, props.idPrefix() + "-fn")
                .code(this.dockerImage)
                .environment(environment)
                .functionName(props.functionName())
                .reservedConcurrentExecutions(props.ingestReservedConcurrency())
                .timeout(props.timeout())
                .logGroup(this.logGroup)
                .tracing(Tracing.ACTIVE);
        // dockerFunctionBuilder.tracing(Tracing.ACTIVE);
        if (props.role().isPresent()) {
            dockerFunctionBuilder.role(props.role().get());
        }
        this.lambda = dockerFunctionBuilder.build();
        infof("Created Lambda %s with function %s", this.lambda.getNode().getId(), this.lambda.toString());

        this.ingestVersion =
            Version.Builder.create(scope, props.idPrefix() + "-ingest-version")
                .lambda(this.lambda)
                .description("No provisioned concurrency")
                .removalPolicy(RemovalPolicy.RETAIN)
                .build();
        // Lambda Version resources with: RemovalPolicy.RETAIN
        //   Versions are immutable and cheap
        //   Leaving an orphaned version is safe
        //   Prevents stack delete deadlocks
        //   AWS themselves recommend this for PC-heavy setups (quietly)
        this.ingestAliasZero = Alias.Builder.create(scope, props.idPrefix() + "-ingest-zero-alias")
            .aliasName("zero")
            .version(this.ingestVersion)
            //.provisionedConcurrentExecutions(props.ingestProvisionedConcurrencyZero())
            .build();
        infof("Created ingest Lambda alias %s for version %s", this.ingestAliasZero.getAliasName(), this.ingestVersion.getVersion());

//        this.ingestVersionReady =
//            Version.Builder.create(scope, props.idPrefix() + "-ingest-ready-version")
//                .lambda(this.lambda)
//                .description("Ready provisioned concurrency")
//                .removalPolicy(RemovalPolicy.RETAIN)
//                .build();
//        this.ingestAliasReady = Alias.Builder.create(scope, props.idPrefix() + "-ingest-ready-alias")
//            .aliasName("ready")
//            .version(this.ingestVersionReady)
//            .provisionedConcurrentExecutions(props.ingestProvisionedConcurrencyReady())
//            .build();
//        infof("Created ingest Lambda alias %s for version %s", this.ingestAliasReady.getAliasName(), this.ingestVersionReady.getVersion());

//        this.ingestVersionHot =
//            Version.Builder.create(scope, props.idPrefix() + "-ingest-hot-version")
//                .lambda(this.lambda)
//                .description("Hot provisioned concurrency")
//                .removalPolicy(RemovalPolicy.RETAIN)
//                .build();
        this.ingestAliasHot = Alias.Builder.create(scope, props.idPrefix() + "-ingest-hot-alias")
            .aliasName("hot")
            .version(this.ingestVersion)
            .provisionedConcurrentExecutions(props.ingestProvisionedConcurrencyHot())
            .build();
        infof("Created ingest Lambda alias %s for version %s", this.ingestAliasHot.getAliasName(), this.ingestVersion.getVersion());

        // Alarms: a small set of useful, actionable Lambda alarms
        // 1) Errors >= 1 in a 5-minute period
        Alarm.Builder.create(scope, props.idPrefix() + "-ErrorsAlarm")
                .alarmName(props.functionName() + "-errors")
                .metric(this.lambda
                        .metricErrors()
                        .with(MetricOptions.builder()
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
                .metric(this.lambda
                        .metricThrottles()
                        .with(MetricOptions.builder()
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
                .metric(this.lambda
                        .metricDuration()
                        .with(MetricOptions.builder()
                                .statistic("p95")
                                .period(Duration.minutes(5))
                                .build()))
                .threshold(highDurationThresholdMs)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Lambda p95 duration >= 80% of timeout for function " + this.lambda.getFunctionName())
                .build();

        // 4) Log-based error detection using a CloudWatch Logs Metric Filter
        // This avoids external scanners: we scan for common error terms in logs and emit a custom metric.
        String logErrorMetricNamespace = "Submit/LambdaLogs";
        String logErrorMetricName = this.lambda.getFunctionName() + "-log-errors";
        MetricFilter.Builder.create(scope, props.idPrefix() + "-LogErrorsMetricFilter")
                .logGroup(this.logGroup)
                .filterPattern(FilterPattern.anyTerm(
                        "ERROR", "Error", "Exception", "Unhandled", "Task timed out", "SEVERE", "FATAL"))
                .metricNamespace(logErrorMetricNamespace)
                .metricName(logErrorMetricName)
                .metricValue("1")
                .defaultValue(0)
                .build();

        Metric logErrorMetric = Metric.Builder.create()
                .namespace(logErrorMetricNamespace)
                .metricName(logErrorMetricName)
                .statistic("Sum")
                .period(Duration.minutes(5))
                .build();

        Alarm.Builder.create(scope, props.idPrefix() + "-LogErrorsAlarm")
                .alarmName(this.lambda.getFunctionName() + "-log-errors")
                .metric(logErrorMetric)
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Detected >= 1 error-like log line in the last 5 minutes for function "
                        + this.lambda.getFunctionName())
                .build();
    }
}
