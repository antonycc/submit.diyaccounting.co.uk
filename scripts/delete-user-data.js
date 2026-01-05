#!/usr/bin/env node

/**
 * Delete user data (GDPR Right to Erasure / "Right to be Forgotten")
 *
 * This script deletes all personal data for a user identified by their sub (user ID).
 * HMRC receipts are NOT deleted due to 7-year legal retention requirement, but can be anonymized.
 *
 * Usage:
 *   node scripts/delete-user-data.js <deployment-name> <user-sub> [--confirm]
 *
 * Example:
 *   node scripts/delete-user-data.js prod abc-123-def-456 --confirm
 *
 * Environment variables:
 *   AWS_REGION - AWS region (default: eu-west-2)
 *   ANONYMIZE_RECEIPTS - Set to 'true' to anonymize receipts instead of keeping them (default: false)
 *
 * ⚠️  WARNING: This is a destructive operation. Always run export-user-data.js first as backup!
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { hashSub } from "../app/services/subHasher.js";
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
 * Scan a DynamoDB table and filter by hashed sub
 */
async function scanTableForUser(docClient, tableName, hashedSub) {
  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const response = await docClient.send(new ScanCommand(params));
    const filtered = response.Items.filter((item) => item.sub === hashedSub);
    items.push(...filtered);
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Delete items from a DynamoDB table
 */
async function deleteItems(docClient, tableName, items, keyAttribute = "id") {
  let deleted = 0;
  for (const item of items) {
    const params = {
      TableName: tableName,
      Key: { [keyAttribute]: item[keyAttribute] },
    };
    await docClient.send(new DeleteCommand(params));
    deleted++;
  }
  return deleted;
}

/**
 * Delete user data from all tables
 */
async function deleteUserData(deploymentName, userSub, confirm = false) {
  const region = process.env.AWS_REGION || "eu-west-2";
  const docClient = makeDocClient(region);
  const hashedSub = hashSub(userSub);
  const anonymizeReceipts = process.env.ANONYMIZE_RECEIPTS === "true";

  console.log(`🔍 Preparing to delete data for user: ${userSub}`);
  console.log(`   Hashed sub: ${hashedSub}`);
  console.log(`   Deployment: ${deploymentName}`);
  console.log(`   Region: ${region}`);
  console.log("");

  const tableNames = {
    bundles: `${deploymentName}-bundles`,
    receipts: `${deploymentName}-receipts`,
    hmrcApiRequests: `${deploymentName}-hmrc-api-requests`,
  };

  // Scan tables to find user data
  console.log("📊 Scanning tables for user data...");
  console.log("");

  const bundles = await scanTableForUser(docClient, tableNames.bundles, hashedSub);
  console.log(`   Bundles: ${bundles.length} item(s)`);

  const receipts = await scanTableForUser(docClient, tableNames.receipts, hashedSub);
  console.log(`   Receipts: ${receipts.length} item(s) ${anonymizeReceipts ? "(will be anonymized)" : "(will be RETAINED for 7 years - legal requirement)"}`);

  const hmrcApiRequests = await scanTableForUser(docClient, tableNames.hmrcApiRequests, hashedSub);
  console.log(`   HMRC API Requests: ${hmrcApiRequests.length} item(s)`);

  console.log("");
  console.log(`📝 Total items to delete: ${bundles.length + hmrcApiRequests.length}`);
  console.log(`📝 Total items to retain: ${receipts.length} (HMRC receipts - legal requirement)`);
  console.log("");

  if (!confirm) {
    console.error("⚠️  DRY RUN MODE - No data will be deleted");
    console.error("⚠️  To actually delete data, add --confirm flag");
    console.error("");
    console.error("⚠️  WARNING: This is irreversible! Run export-user-data.js first as backup!");
    console.error("");
    console.error(`Command to confirm: node scripts/delete-user-data.js ${deploymentName} ${userSub} --confirm`);
    return { dryRun: true, bundles: bundles.length, receipts: receipts.length, hmrcApiRequests: hmrcApiRequests.length };
  }

  console.log("⚠️  CONFIRMED - Starting deletion...");
  console.log("");

  // Delete bundles
  if (bundles.length > 0) {
    console.log(`🗑️  Deleting ${bundles.length} bundle(s)...`);
    const deleted = await deleteItems(docClient, tableNames.bundles, bundles, "bundleId");
    console.log(`   ✅ Deleted ${deleted} bundle(s)`);
  }

  // Delete HMRC API requests
  if (hmrcApiRequests.length > 0) {
    console.log(`🗑️  Deleting ${hmrcApiRequests.length} HMRC API request(s)...`);
    const deleted = await deleteItems(docClient, tableNames.hmrcApiRequests, hmrcApiRequests, "requestId");
    console.log(`   ✅ Deleted ${deleted} request(s)`);
  }

  // Handle receipts - retain for legal compliance
  if (receipts.length > 0) {
    if (anonymizeReceipts) {
      console.log(`🔒 Anonymizing ${receipts.length} receipt(s) (keeping for legal compliance)...`);
      console.log("   ⚠️  Anonymization not yet implemented - receipts will be retained as-is");
      console.log("   TODO: Implement anonymization (remove PII, keep transaction metadata)");
    } else {
      console.log(`📋 Retaining ${receipts.length} receipt(s) for 7-year legal requirement`);
      console.log("   These receipts contain HMRC submission metadata required by UK tax law");
    }
  }

  console.log("");
  console.log("✅ Deletion complete!");
  console.log("");
  console.log("📋 Summary:");
  console.log(`   Bundles deleted: ${bundles.length}`);
  console.log(`   HMRC API requests deleted: ${hmrcApiRequests.length}`);
  console.log(`   Receipts retained: ${receipts.length} (legal requirement)`);
  console.log("");
  console.log("🔔 Next steps:");
  console.log("   1. If using Cognito, delete user from Cognito user pool manually");
  console.log("   2. Revoke any OAuth tokens via HMRC Developer Hub if applicable");
  console.log("   3. Confirm deletion to the user via email");
  console.log("   4. Keep a record of this data subject request and action date");
  console.log("   5. Receipts will be automatically deleted after 7 years retention period");

  return {
    dryRun: false,
    deleted: {
      bundles: bundles.length,
      hmrcApiRequests: hmrcApiRequests.length,
    },
    retained: {
      receipts: receipts.length,
    },
  };
}

// Main
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node scripts/delete-user-data.js <deployment-name> <user-sub> [--confirm]");
  console.error("");
  console.error("Example:");
  console.error("  node scripts/delete-user-data.js prod abc-123-def-456 --confirm");
  console.error("");
  console.error("⚠️  WARNING: This is a destructive operation!");
  console.error("⚠️  Always run export-user-data.js first as backup!");
  process.exit(1);
}

const deploymentName = args[0];
const userSub = args[1];
const confirm = args.includes("--confirm");

deleteUserData(deploymentName, userSub, confirm)
  .then((result) => {
    if (result.dryRun) {
      process.exit(0);
    }
    console.log("");
    console.log("✅ User data deletion successful");
  })
  .catch((error) => {
    console.error("");
    console.error("❌ Deletion failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  });
