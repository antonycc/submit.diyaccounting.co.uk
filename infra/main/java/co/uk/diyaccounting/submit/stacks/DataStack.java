package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.constructs.Construct;

public class DataStack extends Stack {

    public ITable receiptsTable;
    public ITable bundlesTable;
    public ITable bundlePostAsyncRequestsTable;
    public ITable bundleDeleteAsyncRequestsTable;
    public ITable hmrcVatReturnPostAsyncRequestsTable;
    public ITable hmrcVatReturnGetAsyncRequestsTable;
    public ITable hmrcVatObligationGetAsyncRequestsTable;
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
                this.receiptsTable.getTableName(), this.receiptsTable.getNode().getId());

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

        // Create DynamoDB table for bundle POST async request storage
        this.bundlePostAsyncRequestsTable = createAsyncRequestsTable(
                props.resourceNamePrefix() + "-BundlePostAsyncRequestsTable",
                props.sharedNames().bundlePostAsyncRequestsTableName);
        infof(
                "Created bundle POST async requests DynamoDB table with name %s",
                this.bundlePostAsyncRequestsTable.getTableName());

        // Create DynamoDB table for bundle DELETE async request storage
        this.bundleDeleteAsyncRequestsTable = createAsyncRequestsTable(
                props.resourceNamePrefix() + "-BundleDeleteAsyncRequestsTable",
                props.sharedNames().bundleDeleteAsyncRequestsTableName);
        infof(
                "Created bundle DELETE async requests DynamoDB table with name %s",
                this.bundleDeleteAsyncRequestsTable.getTableName());
        // Create DynamoDB table for HMRC VAT Return POST async request storage
        this.hmrcVatReturnPostAsyncRequestsTable = createAsyncRequestsTable(
                props.resourceNamePrefix() + "-HmrcVatReturnPostAsyncRequestsTable",
                props.sharedNames().hmrcVatReturnPostAsyncRequestsTableName);
        infof(
                "Created HMRC VAT Return POST async requests DynamoDB table with name %s",
                this.hmrcVatReturnPostAsyncRequestsTable.getTableName());

        // Create DynamoDB table for HMRC VAT Return GET async request storage
        this.hmrcVatReturnGetAsyncRequestsTable = createAsyncRequestsTable(
                props.resourceNamePrefix() + "-HmrcVatReturnGetAsyncRequestsTable",
                props.sharedNames().hmrcVatReturnGetAsyncRequestsTableName);
        infof(
                "Created HMRC VAT Return GET async requests DynamoDB table with name %s",
                this.hmrcVatReturnGetAsyncRequestsTable.getTableName());

        // Create DynamoDB table for HMRC VAT Obligation GET async request storage
        this.hmrcVatObligationGetAsyncRequestsTable = createAsyncRequestsTable(
                props.resourceNamePrefix() + "-HmrcVatObligationGetAsyncRequestsTable",
                props.sharedNames().hmrcVatObligationGetAsyncRequestsTableName);
        infof(
                "Created HMRC VAT Obligation GET async requests DynamoDB table with name %s",
                this.hmrcVatObligationGetAsyncRequestsTable.getTableName());

        // Create DynamoDB table for HMRC API requests storage
        this.hmrcApiRequestsTable = Table.Builder.create(this, props.resourceNamePrefix() + "-HmrcApiRequestsTable")
                .tableName(props.sharedNames().hmrcApiRequestsTableName)
                .partitionKey(Attribute.builder()
                        .name("hashedSub")
                        .type(AttributeType.STRING)
                        .build())
                .sortKey(Attribute.builder()
                        .name("id")
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

        cfnOutput(this, "ReceiptsTableName", this.receiptsTable.getTableName());
        cfnOutput(this, "ReceiptsTableArn", this.receiptsTable.getTableArn());
        cfnOutput(this, "BundlesTableName", this.bundlesTable.getTableName());
        cfnOutput(this, "BundlesTableArn", this.bundlesTable.getTableArn());
        cfnOutput(this, "BundlePostAsyncRequestsTableName", this.bundlePostAsyncRequestsTable.getTableName());
        cfnOutput(this, "BundlePostAsyncRequestsTableArn", this.bundlePostAsyncRequestsTable.getTableArn());
        cfnOutput(this, "BundleDeleteAsyncRequestsTableName", this.bundleDeleteAsyncRequestsTable.getTableName());
        cfnOutput(this, "BundleDeleteAsyncRequestsTableArn", this.bundleDeleteAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcVatReturnPostAsyncRequestsTableName",
                this.hmrcVatReturnPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this, "HmrcVatReturnPostAsyncRequestsTableArn", this.hmrcVatReturnPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this, "HmrcVatReturnGetAsyncRequestsTableName", this.hmrcVatReturnGetAsyncRequestsTable.getTableName());
        cfnOutput(this, "HmrcVatReturnGetAsyncRequestsTableArn", this.hmrcVatReturnGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcVatObligationGetAsyncRequestsTableName",
                this.hmrcVatObligationGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcVatObligationGetAsyncRequestsTableArn",
                this.hmrcVatObligationGetAsyncRequestsTable.getTableArn());
        cfnOutput(this, "HmrcApiRequestsTableName", this.hmrcApiRequestsTable.getTableName());
        cfnOutput(this, "HmrcApiRequestsArn", this.hmrcApiRequestsTable.getTableArn());

        infof(
                "DataStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }

    private ITable createAsyncRequestsTable(String id, String tableName) {
        return Table.Builder.create(this, id)
                .tableName(tableName)
                .partitionKey(Attribute.builder()
                        .name("hashedSub")
                        .type(AttributeType.STRING)
                        .build())
                .sortKey(Attribute.builder()
                        .name("requestId")
                        .type(AttributeType.STRING)
                        .build())
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .timeToLiveAttribute("ttl")
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
    }
}
