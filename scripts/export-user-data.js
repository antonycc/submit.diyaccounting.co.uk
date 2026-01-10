#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Export all data for a specific user (GDPR Right of Access / Data Portability)
 *
 * This script exports all personal data for a user identified by their sub (user ID).
 * Output is in JSON format suitable for providing to the user.
 *
 * Usage:
 *   node scripts/export-user-data.js <deployment-name> <user-sub>
 *
 * Example:
 *   node scripts/export-user-data.js prod abc-123-def-456
 *
 * Environment variables:
 *   AWS_REGION - AWS region (default: eu-west-2)
 *   OUTPUT_DIR - Output directory for export file (default: current directory)
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
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
 * Export user data from all tables
 */
async function exportUserData(deploymentName, userSub) {
  const region = process.env.AWS_REGION || "eu-west-2";
  const docClient = makeDocClient(region);
  const hashedSub = hashSub(userSub);

  console.log(`Exporting data for user: ${userSub}`);
  console.log(`Hashed sub: ${hashedSub}`);
  console.log(`Deployment: ${deploymentName}`);
  console.log(`Region: ${region}`);
  console.log("");

  const tableNames = {
    bundles: `${deploymentName}-bundles`,
    receipts: `${deploymentName}-receipts`,
    hmrcApiRequests: `${deploymentName}-hmrc-api-requests`,
  };

  const userData = {
    exportDate: new Date().toISOString(),
    userId: userSub,
    hashedUserId: hashedSub,
    deployment: deploymentName,
    data: {},
  };

  // Export bundles
  console.log(`Scanning ${tableNames.bundles}...`);
  const bundles = await scanTableForUser(docClient, tableNames.bundles, hashedSub);
  userData.data.bundles = bundles;
  console.log(`Found ${bundles.length} bundle(s)`);

  // Export receipts
  console.log(`Scanning ${tableNames.receipts}...`);
  const receipts = await scanTableForUser(docClient, tableNames.receipts, hashedSub);
  userData.data.receipts = receipts;
  console.log(`Found ${receipts.length} receipt(s)`);

  // Export HMRC API requests
  console.log(`Scanning ${tableNames.hmrcApiRequests}...`);
  const hmrcApiRequests = await scanTableForUser(docClient, tableNames.hmrcApiRequests, hashedSub);
  userData.data.hmrcApiRequests = hmrcApiRequests;
  console.log(`Found ${hmrcApiRequests.length} HMRC API request(s)`);

  // Write to file
  const outputDir = process.env.OUTPUT_DIR || ".";
  const outputFile = path.join(outputDir, `user-data-export-${userSub}-${Date.now()}.json`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputFile, JSON.stringify(userData, null, 2));
  console.log("");
  console.log(`Export complete: ${outputFile}`);
  console.log(`Total items: ${bundles.length + receipts.length + hmrcApiRequests.length}`);

  return outputFile;
}

// Main
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node scripts/export-user-data.js <deployment-name> <user-sub>");
  console.error("");
  console.error("Example:");
  console.error("  node scripts/export-user-data.js prod abc-123-def-456");
  process.exit(1);
}

const [deploymentName, userSub] = args;

exportUserData(deploymentName, userSub)
  .then((file) => {
    console.log("");
    console.log("✅ Export successful");
    console.log(`📄 File: ${file}`);
    console.log("");
    console.log("Next steps:");
    console.log("1. Review the exported data to ensure completeness");
    console.log("2. Send the file securely to the user (encrypted email or secure download link)");
    console.log("3. Keep a record of this data subject request and response date");
  })
  .catch((error) => {
    console.error("");
    console.error("❌ Export failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  });
