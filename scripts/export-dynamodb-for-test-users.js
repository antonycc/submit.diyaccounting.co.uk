#!/usr/bin/env node

/**
 * Export DynamoDB data for specific test users
 *
 * This script exports data from all DynamoDB tables (bundles, hmrc-api-requests, receipts)
 * for the test users identified by their sub values. The output is in JSON Lines format.
 *
 * Output files (no timestamps):
 *   - bundles.jsonl
 *   - receipts.jsonl
 *   - hmrc-api-requests.jsonl
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
import { hashSub, initializeSalt } from "../app/services/subHasher.js";
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
  const filterByHash = hashedSubs && hashedSubs.length > 0;

  console.log(`Scanning table: ${tableName}${filterByHash ? ` (filtering by ${hashedSubs.length} hashed subs)` : " (no filter - salt not available)"}`);

  try {
    do {
      const params = {
        TableName: tableName,
        ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
      };

      const response = await docClient.send(new ScanCommand(params));
      const items = response.Items || [];

      if (filterByHash) {
        // Filter items by hashedSub
        const filteredItems = items.filter((item) => item.hashedSub && hashedSubs.includes(item.hashedSub));
        allItems.push(...filteredItems);
      } else {
        // No filtering - include all items (for diagnostic purposes)
        allItems.push(...items);
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`  Found ${allItems.length} items${filterByHash ? " for specified users" : " (all items)"} in ${tableName}`);
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

  // Initialize salt before hashing (required for hashSub)
  let saltAvailable = false;
  try {
    await initializeSalt();
    saltAvailable = true;
    console.log("Salt initialized successfully");
  } catch (error) {
    console.warn(`Salt initialization failed: ${error.message}`);
    console.warn("Will skip user-specific filtering - exporting all data from tables");
  }

  // Hash all user subs (only if salt is available)
  let hashedSubs = [];
  if (saltAvailable) {
    hashedSubs = userSubs.map((sub) => hashSub(sub));
    console.log(`Hashed ${hashedSubs.length} user sub(s) for filtering`);
  }

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

  // Export each table to its own JSONL file (no timestamps in filenames)
  const fileNames = {
    bundles: "bundles.jsonl",
    receipts: "receipts.jsonl",
    hmrcApiRequests: "hmrc-api-requests.jsonl",
  };

  let totalItems = 0;

  for (const [tableType, tableName] of Object.entries(tableNames)) {
    const outputFilePath = path.join(outputDir, fileNames[tableType]);
    try {
      const items = await scanTableForHashedSubs(docClient, tableName, hashedSubs);
      totalItems += items.length;

      if (items.length > 0) {
        const jsonLines = items.map((item) => JSON.stringify(item)).join("\n");
        fs.writeFileSync(outputFilePath, jsonLines, "utf8");
      } else {
        // Ensure an empty file exists if there are no items or table is missing
        fs.writeFileSync(outputFilePath, "", "utf8");
      }

      console.log(`Written ${items.length} item(s) to ${outputFilePath}`);

      // Cat the generated JSONL file to console (each item is one line)
      try {
        const raw = fs.readFileSync(outputFilePath, "utf-8");
        console.log(`── BEGIN ${path.basename(outputFilePath)} ──`);
        process.stdout.write(raw);
        if (!raw.endsWith("\n")) process.stdout.write("\n");
        console.log(`── END ${path.basename(outputFilePath)} ──`);
      } catch (catErr) {
        console.warn(`Failed to print ${outputFilePath}: ${catErr.message}`);
      }
    } catch (error) {
      console.error(`Failed to export ${tableType} table (${tableName}):`, error.message);
      // Still create an empty file to maintain expected outputs
      try {
        fs.writeFileSync(outputFilePath, "", "utf8");
        console.log(`Created empty export file: ${outputFilePath}`);
        // Print empty file markers for consistency
        console.log(`── BEGIN ${path.basename(outputFilePath)} (empty) ──`);
        console.log(`── END ${path.basename(outputFilePath)} ──`);
      } catch (e) {
        console.error(`Failed to create empty export file for ${tableType}:`, e.message);
      }
    }
  }

  console.log(`\n✅ Export completed. Wrote ${Object.keys(tableNames).length} file(s) with a total of ${totalItems} item(s).\n`);
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
