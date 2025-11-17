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
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.constructs.Construct;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.S3.createLifecycleRules;

public class DataStack extends Stack {

    public IBucket receiptsBucket;
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

        String s3RetainReceiptsBucket();

        static ImmutableDataStackProps.Builder builder() {
            return ImmutableDataStackProps.builder();
        }
    }

    public DataStack(Construct scope, String id, DataStackProps props) {
        this(scope, id, null, props);
    }

    public DataStack(Construct scope, String id, StackProps stackProps, DataStackProps props) {
        super(scope, id, stackProps);

        // Create receipts bucket for storing VAT submission receipts
        boolean s3RetainReceiptsBucket =
                props.s3RetainReceiptsBucket() != null && Boolean.parseBoolean(props.s3RetainReceiptsBucket());
        this.receiptsBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-ReceiptsBucket")
                .bucketName(props.sharedNames().receiptsBucketName)
                .versioned(false)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(s3RetainReceiptsBucket ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(createLifecycleRules(2555)) // 7 years for tax records as per HMRC requirements
                .objectOwnership(ObjectOwnership.OBJECT_WRITER)
                .build();
        infof(
                "Created receipts bucket with name %s and id %s",
                this.receiptsBucket.getBucketName(),
                this.receiptsBucket.getNode().getId());

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
            this.bundlesTable.getTableName(), this.hmrcApiRequestsTable.getNode().getId());


        Aspects.of(this).add(new SetAutoDeleteJobLogRetentionAspect(props.deploymentName(), RetentionDays.THREE_DAYS));

        cfnOutput(this, "ReceiptsBucketName", this.receiptsBucket.getBucketName());
        cfnOutput(this, "ReceiptsBucketArn", this.receiptsBucket.getBucketArn());
        cfnOutput(this, "BundlesTableName", this.bundlesTable.getTableName());
        cfnOutput(this, "BundlesTableArn", this.bundlesTable.getTableArn());
        cfnOutput(this, "HmrcApiRequestsTableName", this.hmrcApiRequestsTable.getTableName());
        cfnOutput(this, "HmrcApiRequestsArn", this.hmrcApiRequestsTable.getTableArn());

        infof(
                "DataStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
