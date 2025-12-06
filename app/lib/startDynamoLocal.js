// app/lib/startDynamoLocal.js
// Utility for starting and managing DynamoDB Local in monolith mode

import { spawn } from "child_process";
import { createLogger } from "./logger.js";
import {
  ensureBundleTableExists,
  ensureHmrcApiRequestsTableExists,
  ensureReceiptsTableExists,
  ensureProxyStateTableExists,
} from "../bin/dynamodb.js";

const logger = createLogger({ source: "app/lib/startDynamoLocal.js" });

/**
 * Starts DynamoDB Local using the official JAR file.
 * This is used in monolith mode for persistent storage.
 *
 * @param {Object} options - Options for starting DynamoDB Local
 * @param {string} options.jarPath - Path to DynamoDBLocal.jar
 * @param {string} options.dbPath - Path for database persistence
 * @param {number} options.port - Port to run DynamoDB Local on
 * @param {boolean} options.sharedDb - Use shared database
 * @returns {Promise<Object>} Object with endpoint and stop function
 */
export async function startDynamoDBLocal(options = {}) {
  const { jarPath = "/opt/dynamodb-local/DynamoDBLocal.jar", dbPath = "/data/dynamodb", port = 8000, sharedDb = true } = options;

  const host = "127.0.0.1";
  const endpoint = `http://${host}:${port}`;

  logger.info(`Starting DynamoDB Local on port ${port}...`);
  logger.info(`JAR path: ${jarPath}`);
  logger.info(`Database path: ${dbPath}`);

  const args = [`-Djava.library.path=/opt/dynamodb-local/DynamoDBLocal_lib`, "-jar", jarPath, "-port", String(port), "-dbPath", dbPath];

  if (sharedDb) {
    args.push("-sharedDb");
  }

  // Start the Java process
  const process = spawn("java", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Wait for DynamoDB Local to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("DynamoDB Local failed to start within timeout"));
    }, 30000); // 30 second timeout

    process.stdout.on("data", (data) => {
      const output = data.toString();
      logger.debug(`DynamoDB Local stdout: ${output.trim()}`);
      if (output.includes("Initializing DynamoDB Local") || output.includes("Started")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    process.stderr.on("data", (data) => {
      const output = data.toString();
      logger.debug(`DynamoDB Local stderr: ${output.trim()}`);
      // DynamoDB Local sometimes logs to stderr but still starts successfully
      if (output.includes("Initializing DynamoDB Local") || output.includes("Started")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    process.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start DynamoDB Local: ${error.message}`));
    });

    process.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`DynamoDB Local exited with code ${code}`));
      }
    });

    // Give it a moment to start, then consider it ready
    setTimeout(() => {
      clearTimeout(timeout);
      resolve();
    }, 3000);
  });

  logger.info(`DynamoDB Local started successfully at ${endpoint}`);

  // Return control object
  return {
    endpoint,
    process,
    stop: async () => {
      logger.info("Stopping DynamoDB Local...");
      process.kill("SIGTERM");
      return new Promise((resolve) => {
        process.on("exit", () => {
          logger.info("DynamoDB Local stopped");
          resolve();
        });
        setTimeout(() => {
          process.kill("SIGKILL");
          resolve();
        }, 5000);
      });
    },
  };
}

/**
 * Bootstraps DynamoDB Local for monolith mode.
 * Starts the DynamoDB Local process and creates required tables.
 *
 * @param {Object} options - Options for bootstrapping
 * @returns {Promise<Object>} Object with endpoint and stop function
 */
export async function bootstrapDynamoLocal(options = {}) {
  // Check if DYNAMODB_ENDPOINT is already set (e.g., pointing to external DynamoDB)
  if (process.env.DYNAMODB_ENDPOINT) {
    logger.info(`Using existing DynamoDB endpoint: ${process.env.DYNAMODB_ENDPOINT}`);
    return {
      endpoint: process.env.DYNAMODB_ENDPOINT,
      external: true,
      stop: async () => {
        logger.info("DynamoDB endpoint is external, no process to stop");
      },
    };
  }

  // Start DynamoDB Local
  const dynamoLocal = await startDynamoDBLocal(options);
  const { endpoint } = dynamoLocal;

  // Set environment variable for the application
  process.env.DYNAMODB_ENDPOINT = endpoint;

  // Create required tables
  const bundleTableName = process.env.BUNDLE_DYNAMODB_TABLE_NAME;
  const receiptsTableName = process.env.RECEIPTS_DYNAMODB_TABLE_NAME;
  const hmrcApiRequestsTableName = process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME;
  const proxyStateTableName = process.env.STATE_TABLE_NAME || process.env.PROXY_STATE_DYNAMODB_TABLE_NAME;

  logger.info("Creating DynamoDB tables...");

  if (bundleTableName) {
    await ensureBundleTableExists(bundleTableName, endpoint);
  }
  if (hmrcApiRequestsTableName) {
    await ensureHmrcApiRequestsTableExists(hmrcApiRequestsTableName, endpoint);
  }
  if (receiptsTableName) {
    await ensureReceiptsTableExists(receiptsTableName, endpoint);
  }
  if (proxyStateTableName) {
    await ensureProxyStateTableExists(proxyStateTableName, endpoint);
  }

  logger.info("DynamoDB Local bootstrap complete");

  return dynamoLocal;
}
