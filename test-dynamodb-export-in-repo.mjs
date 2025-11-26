import { startDynamoDB, ensureBundleTableExists } from "./app/bin/dynamodb.js";
import { exportTableToJsonLines } from "./behaviour-tests/helpers/dynamodb-export.js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import fs from "node:fs";

console.log("Starting DynamoDB test...");

// Start local DynamoDB
const { endpoint, stop } = await startDynamoDB();
console.log(`DynamoDB started at ${endpoint}`);

// Create table
const tableName = "test-export-table";
await ensureBundleTableExists(tableName, endpoint);
console.log(`Table ${tableName} created`);

// Add some test data
const client = new DynamoDBClient({
  endpoint,
  region: "us-east-1",
  credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" }
});
const docClient = DynamoDBDocumentClient.from(client);

console.log("Adding test data...");
for (let i = 1; i <= 3; i++) {
  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: {
      hashedSub: `user-${i}`,
      bundleId: `bundle-${i}`,
      bundleName: `Test Bundle ${i}`,
      timestamp: new Date().toISOString()
    }
  }));
}
console.log("Test data added");

// Export the table
const outputPath = "/tmp/dynamodb-export-test/export.jsonl";
console.log(`Exporting table to ${outputPath}...`);
const result = await exportTableToJsonLines(tableName, endpoint, outputPath);
console.log(`Export result:`, result);

// Verify the export
const content = fs.readFileSync(outputPath, "utf-8");
const lines = content.trim().split("\n");
console.log(`\nExported ${lines.length} lines:`);
lines.forEach((line, idx) => {
  console.log(`Line ${idx + 1}:`, JSON.parse(line));
});

// Cleanup
await stop();
console.log("\nTest completed successfully!");
