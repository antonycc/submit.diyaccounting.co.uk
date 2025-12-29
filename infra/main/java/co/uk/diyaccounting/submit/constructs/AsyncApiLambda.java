package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
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
import software.amazon.awscdk.services.lambda.eventsources.SqsEventSource;
import software.amazon.awscdk.services.sqs.DeadLetterQueue;
import software.amazon.awscdk.services.sqs.Queue;
import software.constructs.Construct;

import java.util.List;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

public class AsyncApiLambda extends ApiLambda {

    public final Function consumerLambda;
    public final Version workerVersion;
    // public final Version workerVersionReady;
    // public final Version workerVersionHot;
    public final Alias workerAliasZero;
    // public final Alias workerAliasReady;
    public final Alias workerAliasHot;
    public final Queue queue;
    public final Queue dlq;

    public AsyncApiLambda(final Construct scope, AsyncApiLambdaProps props) {
        super(scope, props);

        // 1. Create DLQ
        this.dlq = Queue.Builder.create(scope, props.idPrefix() + "-dlq")
                .queueName(props.functionName() + "-dlq")
                .build();

        // DLQ Alarm: > 1 item
        Alarm.Builder.create(scope, props.idPrefix() + "-DlqAlarm")
                .alarmName(this.dlq.getQueueName() + "-not-empty")
                .metric(this.dlq.metricApproximateNumberOfMessagesVisible())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .alarmDescription("SQS DLQ for " + props.functionName() + " has items")
                .build();

        // 2. Create Main Queue
        this.queue = Queue.Builder.create(scope, props.idPrefix() + "-queue")
                .queueName(props.functionName() + "-queue")
                .visibilityTimeout(props.visibilityTimeout())
                .deadLetterQueue(DeadLetterQueue.builder()
                        .maxReceiveCount(props.maxReceiveCount())
                        .queue(this.dlq)
                        .build())
                .build();

        // 3. Create Consumer Lambda
        var imageCodeProps = EcrImageCodeProps.builder()
                .tagOrDigest(props.baseImageTag())
                .cmd(List.of(props.workerHandler()))
                .build();

        var repositoryAttributes = RepositoryAttributes.builder()
                .repositoryArn(props.ecrRepositoryArn())
                .repositoryName(props.ecrRepositoryName())
                .build();
        IRepository repository = Repository.fromRepositoryAttributes(
                scope, props.idPrefix() + "-EcrRepo-Consumer", repositoryAttributes);

        this.consumerLambda = DockerImageFunction.Builder.create(scope, props.idPrefix() + "-consumer-fn")
                .code(DockerImageCode.fromEcr(repository, imageCodeProps))
                .environment(props.environment())
                .functionName(props.functionName() + "-consumer")
                .reservedConcurrentExecutions(props.workerReservedConcurrency())
                .timeout(props.workerTimeout())
                .tracing(Tracing.ACTIVE)
                .build();

        this.workerVersion =
            Version.Builder.create(scope, props.idPrefix() + "-worker-version")
                .lambda(this.consumerLambda)
                .description("No provisioned concurrency")
                .removalPolicy(RemovalPolicy.RETAIN)
                .build();
        this.workerAliasZero = Alias.Builder.create(scope, props.idPrefix() + "-worker-zero-alias")
            .aliasName("zero")
            .version(this.workerVersion)
            //.provisionedConcurrentExecutions(props.workerProvisionedConcurrencyZero())
            .build();
        infof("Created worker Lambda alias %s for version %s", this.workerAliasZero.getAliasName(), this.workerVersion.getVersion());

//        this.workerVersionReady =
//            Version.Builder.create(scope, props.idPrefix() + "-worker-version-ready")
//                .lambda(this.consumerLambda)
//                .description("Ready provisioned concurrency")
//                .removalPolicy(RemovalPolicy.RETAIN)
//                .build();
//        this.workerAliasReady = Alias.Builder.create(scope, props.idPrefix() + "-worker-ready-alias")
//            .aliasName("ready")
//            .version(this.workerVersionReady)
//            .provisionedConcurrentExecutions(props.workerProvisionedConcurrencyReady())
//            .build();
//        infof("Created worker Lambda alias %s for version %s", this.workerAliasReady.getAliasName(), this.workerVersionReady.getVersion());

//        this.workerVersionHot =
//            Version.Builder.create(scope, props.idPrefix() + "-worker-version-hot")
//                .lambda(this.consumerLambda)
//                .description("Hot provisioned concurrency")
//                .removalPolicy(RemovalPolicy.RETAIN)
//                .build();
        this.workerAliasHot = Alias.Builder.create(scope, props.idPrefix() + "-worker-hot-alias")
            .aliasName("hot")
            .version(this.workerVersion)
            .provisionedConcurrentExecutions(props.workerProvisionedConcurrencyHot())
            .build();
        infof("Created worker Lambda alias %s for version %s", this.workerAliasHot.getAliasName(), this.workerVersion.getVersion());

        // 4. Set up SQS trigger
        //this.consumerLambda.addEventSource(
        this.workerAliasZero.addEventSource(
                SqsEventSource.Builder.create(this.queue).batchSize(1).build());

        // Alarms for consumer lambda
        Alarm.Builder.create(scope, props.idPrefix() + "-ConsumerErrorsAlarm")
                .alarmName(this.consumerLambda.getFunctionName() + "-errors")
                .metric(this.consumerLambda.metricErrors())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .alarmDescription("Consumer Lambda errors for " + this.consumerLambda.getFunctionName())
                .build();

        // Grant API Lambda permission to send messages to the queue
        this.queue.grantSendMessages(this.lambda);

        // Pass queue URL to both lambdas
        this.lambda.addEnvironment("SQS_QUEUE_URL", this.queue.getQueueUrl());
        this.consumerLambda.addEnvironment("SQS_QUEUE_URL", this.queue.getQueueUrl());
    }
}
