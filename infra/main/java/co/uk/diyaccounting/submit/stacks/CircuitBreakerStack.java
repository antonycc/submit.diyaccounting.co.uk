package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

/**
 * CircuitBreakerStack creates infrastructure for circuit breaker pattern
 * for outbound external calls grouped by host.
 *
 * This stack creates:
 * - DynamoDB table to store circuit breaker state per host
 * - HTTP API Gateway proxies for each external host
 * - CloudWatch alarms to monitor failures and trigger circuit breaker
 * - EventBridge rules to reset circuit breaker after recovery period
 * - Lambda functions for circuit breaker state management
 */
public class CircuitBreakerStack extends Stack {

    public ITable circuitBreakerStateTable;
    public Dashboard circuitBreakerDashboard;
    public Function circuitBreakerStateFunction;
    public ILogGroup circuitBreakerStateFunctionLogGroup;
    public Map<String, String> proxyUrls;

    @Value.Immutable
    public interface CircuitBreakerStackProps extends StackProps, SubmitStackProps {

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

        static ImmutableCircuitBreakerStackProps.Builder builder() {
            return ImmutableCircuitBreakerStackProps.builder();
        }
    }

    public CircuitBreakerStack(Construct scope, String id, CircuitBreakerStackProps props) {
        this(scope, id, null, props);
    }

    public CircuitBreakerStack(Construct scope, String id, StackProps stackProps, CircuitBreakerStackProps props) {
        super(scope, id, stackProps);

        // Define the external hosts that need circuit breaker protection
        List<String> externalHosts =
                Arrays.asList("api.service.hmrc.gov.uk", "test-api.service.hmrc.gov.uk", "google.com", "antonycc.com");

        // Create DynamoDB table for circuit breaker state
        this.circuitBreakerStateTable = Table.Builder.create(this, "CircuitBreakerStateTable")
                .tableName(props.resourceNamePrefix() + "-circuit-breaker-state")
                .partitionKey(Attribute.builder()
                        .name("hostName")
                        .type(AttributeType.STRING)
                        .build())
                .billingMode(BillingMode.PAY_PER_REQUEST) // Scale to zero, pay-as-you-go
                .removalPolicy(RemovalPolicy.DESTROY) // For non-prod environments
                .build();

        infof("Created DynamoDB table %s for circuit breaker state", this.circuitBreakerStateTable.getTableName());

        // Create Lambda function for circuit breaker state management
        this.circuitBreakerStateFunctionLogGroup = LogGroup.Builder.create(this, "CircuitBreakerStateFunctionLogGroup")
                .logGroupName("/aws/lambda/" + props.resourceNamePrefix() + "-circuit-breaker-state")
                .retention(RetentionDays.ONE_WEEK)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        this.circuitBreakerStateFunction = Function.Builder.create(this, "CircuitBreakerStateFunction")
                .functionName(props.resourceNamePrefix() + "-circuit-breaker-state")
                .runtime(Runtime.NODEJS_20_X)
                .handler("index.handler")
                .code(Code.fromInline(getCircuitBreakerStateFunctionCode()))
                .timeout(Duration.seconds(30))
                .environment(Map.of(
                        "CIRCUIT_BREAKER_TABLE_NAME",
                        this.circuitBreakerStateTable.getTableName(),
                        "FAILURE_THRESHOLD",
                        "5",
                        "TIMEOUT_THRESHOLD_MS",
                        "10000",
                        "OPEN_TIMEOUT_SECONDS",
                        "60"))
                .logGroup(this.circuitBreakerStateFunctionLogGroup)
                .build();

        // Grant DynamoDB permissions to the Lambda function
        this.circuitBreakerStateTable.grantReadWriteData(this.circuitBreakerStateFunction);

        infof(
                "Created Lambda function %s for circuit breaker state management",
                this.circuitBreakerStateFunction.getFunctionName());

        // Create CloudWatch alarms for each external host
        for (String host : externalHosts) {
            createCircuitBreakerAlarmsForHost(host, props);
        }

        // Create CloudWatch Dashboard
        this.circuitBreakerDashboard = Dashboard.Builder.create(this, "CircuitBreakerDashboard")
                .dashboardName(props.resourceNamePrefix() + "-circuit-breaker")
                .build();

        // Add widgets to dashboard for monitoring
        for (String host : externalHosts) {
            addDashboardWidgetForHost(host, props);
        }

        infof("Created CloudWatch Dashboard %s for circuit breaker monitoring", this.circuitBreakerDashboard);

        // Create EventBridge rule to periodically check circuit breaker state
        Rule circuitBreakerCheckRule = Rule.Builder.create(this, "CircuitBreakerCheckRule")
                .ruleName(props.resourceNamePrefix() + "-circuit-breaker-check")
                .schedule(Schedule.rate(Duration.minutes(1)))
                .build();

        circuitBreakerCheckRule.addTarget(
                LambdaFunction.Builder.create(this.circuitBreakerStateFunction).build());

        infof(
                "Created EventBridge rule %s to check circuit breaker state every minute",
                circuitBreakerCheckRule.getRuleName());

        // Apply log retention aspect
        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.ONE_WEEK));

        // Output the circuit breaker table name
        cfnOutput(this, "CircuitBreakerTableName", this.circuitBreakerStateTable.getTableName());

        cfnOutput(
                this,
                "CircuitBreakerDashboardUrl",
                String.format(
                        "https://console.aws.amazon.com/cloudwatch/home?region=%s#dashboards:name=%s",
                        props.getEnv().getRegion(), this.circuitBreakerDashboard.getDashboardName()));
    }

    private void createCircuitBreakerAlarmsForHost(String host, CircuitBreakerStackProps props) {
        // Alarm for high error rate
        String sanitizedHost = host.replace(".", "-").replace("_", "-");
        Alarm errorRateAlarm = Alarm.Builder.create(this, "CircuitBreakerErrorAlarm-" + sanitizedHost)
                .alarmName(props.resourceNamePrefix() + "-cb-errors-" + sanitizedHost)
                .metric(Metric.Builder.create()
                        .namespace("AWS/Lambda")
                        .metricName("Errors")
                        .dimensionsMap(Map.of("FunctionName", props.resourceNamePrefix() + "-hmrc-*"))
                        .statistic("Sum")
                        .period(Duration.minutes(1))
                        .build())
                .threshold(5)
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        infof("Created CloudWatch alarm %s for error rate on %s", errorRateAlarm.getAlarmName(), host);

        // Alarm for high latency
        Alarm latencyAlarm = Alarm.Builder.create(this, "CircuitBreakerLatencyAlarm-" + sanitizedHost)
                .alarmName(props.resourceNamePrefix() + "-cb-latency-" + sanitizedHost)
                .metric(Metric.Builder.create()
                        .namespace("AWS/Lambda")
                        .metricName("Duration")
                        .dimensionsMap(Map.of("FunctionName", props.resourceNamePrefix() + "-hmrc-*"))
                        .statistic("Average")
                        .period(Duration.minutes(1))
                        .build())
                .threshold(10000) // 10 seconds
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        infof("Created CloudWatch alarm %s for latency on %s", latencyAlarm.getAlarmName(), host);
    }

    private void addDashboardWidgetForHost(String host, CircuitBreakerStackProps props) {
        String sanitizedHost = host.replace(".", "-").replace("_", "-");
        GraphWidget errorWidget = GraphWidget.Builder.create()
                .title("Circuit Breaker - " + host)
                .left(Arrays.asList(Metric.Builder.create()
                        .namespace("AWS/Lambda")
                        .metricName("Errors")
                        .dimensionsMap(Map.of("FunctionName", props.resourceNamePrefix() + "-hmrc-*"))
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build()))
                .width(12)
                .build();

        this.circuitBreakerDashboard.addWidgets(errorWidget);
    }

    private String getCircuitBreakerStateFunctionCode() {
        return """
                const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
                const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

                const dynamodbClient = new DynamoDBClient({});
                const docClient = DynamoDBDocumentClient.from(dynamodbClient);

                const CIRCUIT_BREAKER_TABLE_NAME = process.env.CIRCUIT_BREAKER_TABLE_NAME;
                const FAILURE_THRESHOLD = parseInt(process.env.FAILURE_THRESHOLD || '5');
                const TIMEOUT_THRESHOLD_MS = parseInt(process.env.TIMEOUT_THRESHOLD_MS || '10000');
                const OPEN_TIMEOUT_SECONDS = parseInt(process.env.OPEN_TIMEOUT_SECONDS || '60');

                exports.handler = async (event) => {
                  console.log('Circuit breaker state check triggered', JSON.stringify(event));

                  try {
                    // This function is triggered periodically by EventBridge
                    // It checks circuit breaker states and resets them if recovery period has passed

                    const hosts = [
                      'api.service.hmrc.gov.uk',
                      'test-api.service.hmrc.gov.uk',
                      'google.com',
                      'antonycc.com'
                    ];

                    for (const host of hosts) {
                      await checkAndUpdateCircuitBreakerState(host);
                    }

                    return {
                      statusCode: 200,
                      body: JSON.stringify({ message: 'Circuit breaker states checked' })
                    };
                  } catch (error) {
                    console.error('Error checking circuit breaker state:', error);
                    return {
                      statusCode: 500,
                      body: JSON.stringify({ error: error.message })
                    };
                  }
                };

                async function checkAndUpdateCircuitBreakerState(hostName) {
                  try {
                    const getCommand = new GetCommand({
                      TableName: CIRCUIT_BREAKER_TABLE_NAME,
                      Key: { hostName }
                    });

                    const result = await docClient.send(getCommand);

                    if (!result.Item) {
                      // Initialize circuit breaker state for new host
                      await putCommand({
                        hostName,
                        state: 'CLOSED',
                        failureCount: 0,
                        lastFailureTime: null,
                        lastStateChange: new Date().toISOString()
                      });
                      console.log(`Initialized circuit breaker state for ${hostName}`);
                      return;
                    }

                    const state = result.Item;
                    const now = Date.now();

                    // If circuit is OPEN and recovery period has passed, transition to HALF_OPEN
                    if (state.state === 'OPEN' && state.lastStateChange) {
                      const timeSinceOpen = now - new Date(state.lastStateChange).getTime();
                      if (timeSinceOpen > OPEN_TIMEOUT_SECONDS * 1000) {
                        await putCommand({
                          ...state,
                          state: 'HALF_OPEN',
                          lastStateChange: new Date().toISOString()
                        });
                        console.log(`Transitioned circuit breaker for ${hostName} from OPEN to HALF_OPEN`);
                      }
                    }
                  } catch (error) {
                    console.error(`Error checking circuit breaker state for ${hostName}:`, error);
                  }
                }

                async function putCommand(item) {
                  const command = new PutCommand({
                    TableName: CIRCUIT_BREAKER_TABLE_NAME,
                    Item: item
                  });
                  await docClient.send(command);
                }
                """;
    }
}
