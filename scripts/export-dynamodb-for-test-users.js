#!/usr/bin/env node

/**
 * Export DynamoDB data for specific test users
 *
 * This script exports data from all DynamoDB tables (bundles, hmrc-api-requests, receipts)
 * for the test users identified by their sub values. The output is in JSON Lines format.
 *
 * Usage:
 *   node scripts/export-dynamodb-for-test-users.js <deployment-name> <user-sub> [user-sub2 ...]
 *
 * Example:
 *   node scripts/export-dynamodb-for-test-users.js ci-abc123 test-user-1 test-user-2
 *
 * Environment variables:
 *   AWS_REGION - AWS region (default: eu-west-2)
 *   OUTPUT_DIR - Output directory for export files (default: target/behaviour-test-results)
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { hashSub } from "app/services/subHasher.js";
import fs from "fs";
import path from "path";

// Create DynamoDB Document Client
function makeDocClient(region) {
  try {
    const client = new DynamoDBClient({
      region: region || "eu-west-2",
    });
    return DynamoDBDocumentClient.from(client);
  } catch (error) {
    console.error("Failed to create DynamoDB client:", error.message);
    throw new Error("AWS credentials not configured or invalid");
  }
}

/**
 * Scan a DynamoDB table and filter by hashed subs
 * @param {DynamoDBDocumentClient} docClient
 * @param {string} tableName
 * @param {string[]} hashedSubs
 * @returns {Promise<Array>}
 */
async function scanTableForHashedSubs(docClient, tableName, hashedSubs) {
  const allItems = [];
  let lastEvaluatedKey = undefined;

  console.log(`Scanning table: ${tableName}`);

  try {
    do {
      const params = {
        TableName: tableName,
        ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
      };

      const response = await docClient.send(new ScanCommand(params));
      const items = response.Items || [];

      // Filter items by hashedSub
      const filteredItems = items.filter((item) => item.hashedSub && hashedSubs.includes(item.hashedSub));
      allItems.push(...filteredItems);

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`  Found ${allItems.length} items for specified users in ${tableName}`);
    return allItems;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      console.warn(`  Table ${tableName} not found (may not be deployed yet)`);
      return [];
    }
    throw error;
  }
}

/**
 * Export all DynamoDB tables for given users
 */
async function exportDynamoDBData(deploymentName, userSubs, outputDir, region) {
  console.log(`\n=== Exporting DynamoDB data ===`);
  console.log(`Deployment: ${deploymentName}`);
  console.log(`User subs: ${userSubs.length} user(s)`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Region: ${region}\n`);

  // Hash all user subs
  const hashedSubs = userSubs.map((sub) => hashSub(sub));

  // Create DynamoDB client
  const docClient = makeDocClient(region);

  // Define table names based on deployment name
  // Pattern: {deployment-name}-{table-type}
  const tableNames = {
    bundles: `${deploymentName}-bundles`,
    receipts: `${deploymentName}-receipts`,
    hmrcApiRequests: `${deploymentName}-hmrc-api-requests`,
  };

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Export each table
  const allData = [];

  for (const [tableType, tableName] of Object.entries(tableNames)) {
    try {
      const items = await scanTableForHashedSubs(docClient, tableName, hashedSubs);

      // Add table name to each item for context (matches existing pattern in app/test-helpers/dynamodbExporter.js)
      for (const item of items) {
        allData.push({
          tableName,
          ...item,
        });
      }
    } catch (error) {
      console.error(`Failed to export ${tableType} table (${tableName}):`, error.message);
    }
  }

  // Write to JSON Lines file
  if (allData.length > 0) {
    // Format timestamp for filenames: replace colons with dashes, remove milliseconds
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const outputFileName = `dynamodb-export-${timestamp}.jsonl`;
    const outputFilePath = path.join(outputDir, outputFileName);

    const jsonLines = allData.map((item) => JSON.stringify(item)).join("\n");
    fs.writeFileSync(outputFilePath, jsonLines, "utf8");

    console.log(`\n✅ Export completed successfully`);
    console.log(`   Exported ${allData.length} items from ${Object.keys(tableNames).length} tables`);
    console.log(`   Output file: ${outputFilePath}\n`);

    // Write a summary file (without sensitive user subs)
    const summaryFileName = `dynamodb-export-summary-${timestamp}.json`;
    const summaryFilePath = path.join(outputDir, summaryFileName);
    const summary = {
      timestamp: new Date().toISOString(),
      deploymentName,
      userCount: userSubs.length,
      tables: tableNames,
      itemCount: allData.length,
      outputFile: outputFileName,
    };
    fs.writeFileSync(summaryFilePath, JSON.stringify(summary, null, 2), "utf8");
    console.log(`   Summary file: ${summaryFilePath}\n`);
  } else {
    console.log(`\n⚠️  No data found for specified users in any table\n`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: node scripts/export-dynamodb-for-test-users.js <deployment-name> <user-sub> [user-sub2 ...]");
    console.error("\nExample:");
    console.error("  node scripts/export-dynamodb-for-test-users.js ci-abc123 test-user-1 test-user-2");
    process.exit(1);
  }

  const deploymentName = args[0];
  const userSubs = args.slice(1);
  const outputDir = process.env.OUTPUT_DIR || "target/behaviour-test-results";
  const region = process.env.AWS_REGION || "eu-west-2";

  try {
    await exportDynamoDBData(deploymentName, userSubs, outputDir, region);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Export failed:", error);
    process.exit(1);
  }
}

main();
