package co.uk.diyaccounting.submit.constructs;

import java.util.List;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.lambda.eventsources.SqsEventSource;
import software.amazon.awscdk.services.sqs.DeadLetterQueue;
import software.amazon.awscdk.services.sqs.Queue;
import software.constructs.Construct;

public class AsyncApiLambda extends ApiLambda {

    public final Function consumerLambda;
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
                .cmd(List.of(props.consumerHandler()))
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
                .reservedConcurrentExecutions(props.consumerConcurrency())
                .timeout(props.timeout())
                .tracing(Tracing.ACTIVE)
                .build();

        // 4. Set up SQS trigger
        this.consumerLambda.addEventSource(
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
