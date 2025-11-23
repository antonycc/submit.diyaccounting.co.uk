#!/usr/bin/env node
// app/bin/dynamodb.js

import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GenericContainer } from "testcontainers";

dotenvConfigIfNotBlank({ path: ".env" });

import logger from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read configuration from cdk.json
const cdkJsonPath = path.join(__dirname, "../../cdk-application/cdk.json");
logger.info(`Reading CDK configuration from ${cdkJsonPath}`);
const cdkConfig = JSON.parse(readFileSync(cdkJsonPath, "utf8"));
const context = cdkConfig.context || {};
logger.info("CDK context:", context);

async function startDynamoDBContainer() {
  return await new GenericContainer("amazon/dynamodb-local:latest")
    .withExposedPorts(8000)
    .withCommand(["-jar", "DynamoDBLocal.jar", "-sharedDb", "-inMemory"])
    .start();
}

export async function startDynamoDB() {
  const container = await startDynamoDBContainer();
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(8000)}`;
  // Return both endpoint and container so callers (e.g., tests) can manage lifecycle
  return { endpoint, container };
}

// Create bundle table if it doesn't exist
export async function ensureBundleTableExists(tableName, endpoint) {
  logger.info(`[dynamodb]: Ensuring bundle table: '${tableName}' exists on endpoint '${endpoint}'`);

  const clientConfig = {
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  };
  const dynamodb = new DynamoDBClient(clientConfig);

  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    logger.info(`[dynamodb]: ✅ Table '${tableName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      logger.info(`[dynamodb]: ℹ️ Table '${tableName}' not found on endpoint '${endpoint}', creating...`);
      await dynamodb.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            { AttributeName: "hashedSub", KeyType: "HASH" },
            { AttributeName: "bundleId", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "hashedSub", AttributeType: "S" },
            { AttributeName: "bundleId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
      logger.info(`[dynamodb]: ✅ Created table '${tableName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(`[dynamodb]: Failed to check/create table: ${err.message} on endpoint '${endpoint}'`);
    }
  }
}

// Create HMRC API requests table if it doesn't exist
export async function ensureHmrcApiRequestsTableExists(tableName, endpoint) {
  logger.info(`[dynamodb]: Ensuring HMRC API requests table: '${tableName}' exists on endpoint '${endpoint}'`);

  const clientConfig = {
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  };
  const dynamodb = new DynamoDBClient(clientConfig);

  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    logger.info(`[dynamodb]: ✅ Table '${tableName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      logger.info(`[dynamodb]: ℹ️ Table '${tableName}' not found on endpoint '${endpoint}', creating...`);
      await dynamodb.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            { AttributeName: "hashedSub", KeyType: "HASH" },
            { AttributeName: "requestId", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "hashedSub", AttributeType: "S" },
            { AttributeName: "requestId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
      logger.info(`[dynamodb]: ✅ Created table '${tableName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(`[dynamodb]: Failed to check/create table: ${err.message} on endpoint '${endpoint}'`);
    }
  }
}

// Only start the server if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const bundleTableName = process.env.BUNDLE_DYNAMODB_TABLE_NAME;
  const hmrcApiRequestsTableName = process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME;

  let container;

  try {
    logger.info("Starting DynamoDB Local server...");
    container = await startDynamoDBContainer();

    const endpoint = `http://${container.getHost()}:${container.getMappedPort(8000)}`;
    console.log(`DynamoDB started url=${endpoint}`);

    // Ensure tables exist
    if (bundleTableName) {
      await ensureBundleTableExists(bundleTableName, endpoint);
    }
    if (hmrcApiRequestsTableName) {
      await ensureHmrcApiRequestsTableExists(hmrcApiRequestsTableName, endpoint);
    }

    logger.info("DynamoDB Local server is running. Press CTRL-C to stop.");

    // Handle graceful shutdown
    let isShuttingDown = false;
    const gracefulShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`\nReceived ${signal}. Shutting down DynamoDB Local server...`);
      if (container) {
        try {
          await container.stop();
          logger.info("DynamoDB Local server stopped successfully.");
        } catch (error) {
          logger.error("Error stopping DynamoDB Local server:", error);
        }
      }
      process.exit(0);
    };

    // Listen for termination signals
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    // Keep the process alive
    const keepAlive = setInterval(() => {
      // This interval keeps the process running
    }, 1000);

    // Clean up interval on exit
    process.on("exit", () => {
      clearInterval(keepAlive);
    });
  } catch (error) {
    logger.error("Failed to start DynamoDB Local server:", error);
    process.exit(1);
  }
}
