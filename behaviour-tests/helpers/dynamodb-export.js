// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/helpers/dynamodb-export.js

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "@app/lib/logger.js";

const logger = createLogger({ source: "behaviour-tests/helpers/dynamodb-export.js" });

/**
 * Export all items from a DynamoDB table to a JSONLines file
 * @param {string} tableName - Name of the DynamoDB table to export
 * @param {string} endpoint - DynamoDB endpoint URL (e.g., http://127.0.0.1:9000)
 * @param {string} outputPath - Full path to the output .jsonl file
 * @returns {Promise<{itemCount: number, filePath: string}>} Export statistics
 */
export async function exportTableToJsonLines(tableName, endpoint, outputPath) {
  logger.info(`[dynamodb-export]: Exporting table '${tableName}' from endpoint '${endpoint}' to '${outputPath}'`);

  // When an explicit endpoint is provided (local dynalite), use dummy credentials.
  // When no endpoint (real AWS DynamoDB), use the default SDK credential chain
  // (environment variables set by configure-aws-credentials in GitHub Actions).
  const clientConfig = endpoint
    ? {
        endpoint,
        region: "us-east-1",
        credentials: {
          accessKeyId: "dummy",
          secretAccessKey: "dummy",
        },
      }
    : {
        region: process.env.AWS_REGION || "eu-west-2",
      };

  const client = new DynamoDBClient(clientConfig);
  const docClient = DynamoDBDocumentClient.from(client);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  let itemCount = 0;
  let lastEvaluatedKey = undefined;

  // Open file for writing
  const writeStream = fs.createWriteStream(outputPath, { encoding: "utf-8" });

  try {
    // Scan the table in pages
    do {
      const scanCommand = new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const response = await docClient.send(scanCommand);

      // Write each item as a JSON line
      if (response.Items && response.Items.length > 0) {
        for (const item of response.Items) {
          writeStream.write(JSON.stringify(item) + "\n");
          itemCount++;
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Close the write stream
    await new Promise((resolve, reject) => {
      writeStream.end((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    logger.info(`[dynamodb-export]: ✅ Exported ${itemCount} items from table '${tableName}' to '${outputPath}'`);

    // Cat the generated JSONL file to console (one JSON object per line)
    try {
      const raw = fs.readFileSync(outputPath, "utf-8");
      logger.info(`[dynamodb-export]: ── BEGIN ${path.basename(outputPath)} ──`);
      // Print raw content as-is so each item is on its own line
      process.stdout.write(raw);
      if (!raw.endsWith("\n")) process.stdout.write("\n");
      logger.info(`[dynamodb-export]: ── END ${path.basename(outputPath)} ──`);
    } catch (catErr) {
      logger.warn(`[dynamodb-export]: Failed to print ${outputPath}: ${catErr.message}`);
    }

    return {
      itemCount,
      filePath: outputPath,
    };
  } catch (error) {
    // Close stream on error
    writeStream.end();

    // If table doesn't exist, create empty file
    if (error.name === "ResourceNotFoundException") {
      logger.warn(`[dynamodb-export]: ⚠️ Table '${tableName}' not found. Creating empty export file.`);
      fs.writeFileSync(outputPath, "", "utf-8");
      // Print (empty) file to console for consistency
      try {
        logger.info(`[dynamodb-export]: ── BEGIN ${path.basename(outputPath)} (empty) ──`);
        logger.info(`[dynamodb-export]: ── END ${path.basename(outputPath)} ──`);
      } catch (_) {}
      return {
        itemCount: 0,
        filePath: outputPath,
      };
    }

    logger.error(`[dynamodb-export]: ❌ Failed to export table '${tableName}':`, error);
    throw error;
  }
}

/**
 * Export all configured DynamoDB tables to JSONLines format
 * @param {string} outputDir - Directory to write export files to
 * @param {string} endpoint - DynamoDB endpoint URL
 * @param {Object} tableNames - Object containing table names
 * @param {string} tableNames.bundleTableName - Bundle table name
 * @param {string} tableNames.hmrcApiRequestsTableName - HMRC API requests table name
 * @param {string} tableNames.receiptsTableName - Receipts table name
 * @returns {Promise<Array>} Array of export results
 */
export async function exportAllTables(outputDir, endpoint, tableNames) {
  logger.info(`[dynamodb-export]: Starting export of all tables to '${outputDir}'`);

  const results = [];

  // Export bundles table
  if (tableNames.bundleTableName) {
    try {
      const result = await exportTableToJsonLines(tableNames.bundleTableName, endpoint, path.join(outputDir, "bundles.jsonl"));
      results.push({ table: "bundles", ...result });
    } catch (error) {
      logger.error(`[dynamodb-export]: Failed to export bundles table:`, error);
      results.push({ table: "bundles", error: error.message });
    }
  }

  // Export HMRC API requests table
  if (tableNames.hmrcApiRequestsTableName) {
    try {
      const result = await exportTableToJsonLines(
        tableNames.hmrcApiRequestsTableName,
        endpoint,
        path.join(outputDir, "hmrc-api-requests.jsonl"),
      );
      results.push({ table: "hmrc-api-requests", ...result });
    } catch (error) {
      logger.error(`[dynamodb-export]: Failed to export HMRC API requests table:`, error);
      results.push({ table: "hmrc-api-requests", error: error.message });
    }
  }

  // Export receipts table
  if (tableNames.receiptsTableName) {
    try {
      const result = await exportTableToJsonLines(tableNames.receiptsTableName, endpoint, path.join(outputDir, "receipts.jsonl"));
      results.push({ table: "receipts", ...result });
    } catch (error) {
      logger.error(`[dynamodb-export]: Failed to export receipts table:`, error);
      results.push({ table: "receipts", error: error.message });
    }
  }

  logger.info(`[dynamodb-export]: ✅ Completed export of all tables`);
  return results;
}
