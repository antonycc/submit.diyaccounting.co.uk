package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.aspects.SetAutoDeleteJobLogRetentionAspect;
import org.immutables.value.Value;
import software.amazon.awscdk.Aspects;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

public class DataStack extends Stack {

    public ITable receiptsTable;
    public ITable bundlesTable;
    public ITable hmrcApiRequestsTable;

    @Value.Immutable
    public interface DataStackProps extends StackProps, SubmitStackProps {

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

        static ImmutableDataStackProps.Builder builder() {
            return ImmutableDataStackProps.builder();
        }
    }

    public DataStack(Construct scope, String id, DataStackProps props) {
        this(scope, id, null, props);
    }

    public DataStack(Construct scope, String id, StackProps stackProps, DataStackProps props) {
        super(scope, id, stackProps);

        // Create receipts DynamoDB table for storing VAT submission receipts
        this.receiptsTable = Table.Builder.create(this, props.resourceNamePrefix() + "-ReceiptsTable")
                .tableName(props.sharedNames().receiptsTableName)
                .partitionKey(Attribute.builder()
                        .name("hashedSub")
                        .type(AttributeType.STRING)
                        .build())
                .sortKey(Attribute.builder()
                        .name("receiptId")
                        .type(AttributeType.STRING)
                        .build())
                .billingMode(BillingMode.PAY_PER_REQUEST) // Serverless, near-zero cost at rest
                .timeToLiveAttribute("ttl") // Enable TTL for automatic expiry handling (7 years)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        infof(
                "Created receipts DynamoDB table with name %s and id %s",
                this.receiptsTable.getTableName(),
                this.receiptsTable.getNode().getId());

        // Create DynamoDB table for bundle storage
        this.bundlesTable = Table.Builder.create(this, props.resourceNamePrefix() + "-BundlesTable")
                .tableName(props.sharedNames().bundlesTableName)
                .partitionKey(Attribute.builder()
                        .name("hashedSub")
                        .type(AttributeType.STRING)
                        .build())
                .sortKey(Attribute.builder()
                        .name("bundleId")
                        .type(AttributeType.STRING)
                        .build())
                .billingMode(BillingMode.PAY_PER_REQUEST) // Serverless, near-zero cost at rest
                .timeToLiveAttribute("ttl") // Enable TTL for automatic expiry handling
                .removalPolicy(RemovalPolicy.DESTROY) // Safe to destroy in non-prod
                .build();
        infof(
                "Created bundles DynamoDB table with name %s and id %s",
                this.bundlesTable.getTableName(), this.bundlesTable.getNode().getId());

        // Create DynamoDB table for HMRC API requests storage
        this.hmrcApiRequestsTable = Table.Builder.create(this, props.resourceNamePrefix() + "-HmrcApiRequestsTable")
                .tableName(props.sharedNames().hmrcApiRequestsTableName)
                .partitionKey(Attribute.builder()
                        .name("hashedSub")
                        .type(AttributeType.STRING)
                        .build())
                .sortKey(Attribute.builder()
                        .name("requestId")
                        .type(AttributeType.STRING)
                        .build())
                .billingMode(BillingMode.PAY_PER_REQUEST) // Serverless, near-zero cost at rest
                .timeToLiveAttribute("ttl") // Enable TTL for automatic expiry handling
                .removalPolicy(RemovalPolicy.DESTROY) // Safe to destroy in non-prod
                .build();
        infof(
                "Created HMRC API Requests DynamoDB table with name %s and id %s",
                this.hmrcApiRequestsTable.getTableName(),
                this.hmrcApiRequestsTable.getNode().getId());

        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        cfnOutput(this, "ReceiptsTableName", this.receiptsTable.getTableName());
        cfnOutput(this, "ReceiptsTableArn", this.receiptsTable.getTableArn());
        cfnOutput(this, "BundlesTableName", this.bundlesTable.getTableName());
        cfnOutput(this, "BundlesTableArn", this.bundlesTable.getTableArn());
        cfnOutput(this, "HmrcApiRequestsTableName", this.hmrcApiRequestsTable.getTableName());
        cfnOutput(this, "HmrcApiRequestsArn", this.hmrcApiRequestsTable.getTableArn());

        infof(
                "DataStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
