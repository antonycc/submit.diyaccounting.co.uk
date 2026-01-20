/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureTable;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.ITable;
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

        // Tables use ensureTable() for idempotent creation - deployments succeed whether table exists or not.
        // Note: PITR/TTL must be enabled manually on pre-existing tables if not already configured.
        // Data protection comes from PITR backups, not CloudFormation RETAIN.

        // Receipts table for storing VAT submission receipts
        // CRITICAL: 7-year HMRC retention requirement - enable PITR manually if table pre-exists
        this.receiptsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-ReceiptsTable",
                props.sharedNames().receiptsTableName,
                "hashedSub",
                "receiptId");
        infof("Ensured receipts DynamoDB table with name %s", props.sharedNames().receiptsTableName);

        // Bundles table for bundle storage
        // HIGH priority - contains user subscription data - enable PITR manually if table pre-exists
        this.bundlesTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundlesTable",
                props.sharedNames().bundlesTableName,
                "hashedSub",
                "bundleId");
        infof("Ensured bundles DynamoDB table with name %s", props.sharedNames().bundlesTableName);

        // Async request tables use ensureTable() for idempotent creation - deployments succeed whether table exists or not.
        // Note: TTL must be enabled manually on pre-existing tables if not already configured.

        // Bundle POST async request storage
        this.bundlePostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundlePostAsyncRequestsTable",
                props.sharedNames().bundlePostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        infof("Ensured bundle POST async requests DynamoDB table with name %s",
                props.sharedNames().bundlePostAsyncRequestsTableName);

        // Bundle DELETE async request storage
        this.bundleDeleteAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundleDeleteAsyncRequestsTable",
                props.sharedNames().bundleDeleteAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        infof("Ensured bundle DELETE async requests DynamoDB table with name %s",
                props.sharedNames().bundleDeleteAsyncRequestsTableName);

        // HMRC VAT Return POST async request storage
        this.hmrcVatReturnPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnPostAsyncRequestsTable",
                props.sharedNames().hmrcVatReturnPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        infof("Ensured HMRC VAT Return POST async requests DynamoDB table with name %s",
                props.sharedNames().hmrcVatReturnPostAsyncRequestsTableName);

        // HMRC VAT Return GET async request storage
        this.hmrcVatReturnGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnGetAsyncRequestsTable",
                props.sharedNames().hmrcVatReturnGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        infof("Ensured HMRC VAT Return GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcVatReturnGetAsyncRequestsTableName);

        // HMRC VAT Obligation GET async request storage
        this.hmrcVatObligationGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatObligationGetAsyncRequestsTable",
                props.sharedNames().hmrcVatObligationGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        infof("Ensured HMRC VAT Obligation GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcVatObligationGetAsyncRequestsTableName);

        // HMRC API requests storage - audit trail for HMRC interactions
        // MEDIUM priority - 90-day retention. PITR/TTL must be enabled manually if table pre-exists.
        this.hmrcApiRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcApiRequestsTable",
                props.sharedNames().hmrcApiRequestsTableName,
                "hashedSub",
                "id");
        infof("Ensured HMRC API Requests DynamoDB table with name %s",
                props.sharedNames().hmrcApiRequestsTableName);

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
}
