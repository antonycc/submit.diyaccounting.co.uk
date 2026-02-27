// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/account/bundleCapacityReconcile.js
//
// Scheduled Lambda (EventBridge, every hour) that scans the bundles table
// for each capped bundleId, counts active (non-expired) allocations, and writes
// the correct count to the capacity counter table.

import { createLogger } from "../../lib/logger.js";
import { validateEnv } from "../../lib/env.js";
import { getDynamoDbDocClient } from "../../lib/dynamoDbClient.js";
import { loadCatalogFromRoot, getCappedBundleIds } from "../../services/productCatalog.js";
import { putCounter } from "../../data/dynamoDbCapacityRepository.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/bundleCapacityReconcile.js" });

export async function handler(_event) {
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME", "BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME"]);

  const bundlesTableName = process.env.BUNDLE_DYNAMODB_TABLE_NAME;

  logger.info({ message: "Starting bundle capacity reconciliation" });

  let catalog;
  try {
    catalog = loadCatalogFromRoot();
  } catch (error) {
    logger.error({ message: "Failed to load catalogue", error: error.message });
    return;
  }

  const cappedBundleIds = getCappedBundleIds(catalog);
  if (cappedBundleIds.length === 0) {
    logger.info({ message: "No capped bundles in catalogue, nothing to reconcile" });
    return;
  }

  const now = new Date().toISOString();
  const { docClient, module } = await getDynamoDbDocClient();

  for (const bundleId of cappedBundleIds) {
    try {
      let activeCount = 0;
      let lastEvaluatedKey = undefined;

      // Scan the bundles table filtering for this bundleId with future expiry
      do {
        const result = await docClient.send(
          new module.ScanCommand({
            TableName: bundlesTableName,
            FilterExpression: "bundleId = :bid AND expiry > :now",
            ExpressionAttributeValues: {
              ":bid": bundleId,
              ":now": now,
            },
            Select: "COUNT",
            ExclusiveStartKey: lastEvaluatedKey,
          }),
        );

        activeCount += result.Count || 0;
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      await putCounter(bundleId, activeCount);

      // Emit EMF metric for dashboard
      emitActiveAllocationsMetric(bundleId, activeCount);

      logger.info({ message: "Reconciled bundle capacity", bundleId, activeCount });
    } catch (error) {
      logger.error({ message: "Error reconciling bundle capacity", bundleId, error: error.message });
    }
  }

  logger.info({ message: "Bundle capacity reconciliation complete", bundleCount: cappedBundleIds.length });
  await publishActivityEvent({
    event: "capacity-reconciled",
    summary: "Capacity reconciled",
    flow: "operational",
  });
}

function emitActiveAllocationsMetric(bundleId, activeCount) {
  try {
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: "Submit/BundleCapacity",
              Dimensions: [["bundleId"]],
              Metrics: [{ Name: "BundleActiveAllocations", Unit: "Count" }],
            },
          ],
        },
        bundleId,
        BundleActiveAllocations: activeCount,
      }),
    );
  } catch {
    // EMF emission is best-effort
  }
}
