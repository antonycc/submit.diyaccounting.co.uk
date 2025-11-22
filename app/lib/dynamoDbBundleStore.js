// app/lib/dynamoDbBundleStore.js

import logger from "./logger.js";
import { hashSub } from "./subHasher.js";

let __dynamoDbModule;
let __dynamoDbDocClient;

/**
 * Initialize DynamoDB Document Client lazily
 */
async function getDynamoDbDocClient() {
  if (!__dynamoDbDocClient) {
    __dynamoDbModule = await import("@aws-sdk/lib-dynamodb");
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || "eu-west-2" });
    __dynamoDbDocClient = __dynamoDbModule.DynamoDBDocumentClient.from(client);
  }
  return __dynamoDbDocClient;
}

/**
 * Check if DynamoDB operations are enabled
 * @returns {boolean} True if DynamoDB table name is configured
 */
export function isDynamoDbEnabled() {
  return Boolean(process.env.BUNDLE_DYNAMODB_TABLE_NAME && process.env.BUNDLE_DYNAMODB_TABLE_NAME !== "test-bundle-table");
}

/**
 * Get the configured DynamoDB table name
 * @returns {string} Table name
 */
function getTableName() {
  const tableName = process.env.BUNDLE_DYNAMODB_TABLE_NAME;
  // This should always be checked by isDynamoDbEnabled() first, but return empty string as fallback
  return tableName || "";
}

/**
 * Store a bundle for a user in DynamoDB
 * @param {string} userId - User's sub claim (will be hashed)
 * @param {string} bundleId - Bundle in format "test"
 */
export async function putBundle(userId, bundleId) {
  if (!isDynamoDbEnabled()) {
    logger.debug({ message: "DynamoDB not enabled, skipping putBundle" });
    return;
  }

  try {
    const hashedSub = hashSub(userId);

    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const item = {
      hashedSub,
      bundleId,
      createdAt: now.toISOString(),
    };

    // Add expiry with millisecond precision timestamp (ISO format)
    // TODO: Check we look this up from the catalogue
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1); // Set to end of month
    item.expiry = expiryDate.toISOString();

    // Calculate TTL as 1 month after expiry
    const ttlDate = new Date(expiryDate.getTime());
    ttlDate.setMonth(ttlDate.getMonth() + 1);
    item.ttl = Math.floor(ttlDate.getTime() / 1000);
    item.ttl_datestamp = ttlDate.toISOString();

    await docClient.send(
      new __dynamoDbModule.PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    logger.info({
      message: "Bundle stored in DynamoDB",
      hashedSub,
      bundleId,
      expiry: item.expiry,
      ttl: item.ttl,
      ttl_datestamp: item.ttl_datestamp,
    });
  } catch (error) {
    logger.error({
      message: "Error storing bundle in DynamoDB",
      error: error.message,
      userId,
      bundleStr,
    });
    throw error;
  }
}

/**
 * Delete a bundle for a user from DynamoDB
 * @param {string} userId - User's sub claim (will be hashed)
 * @param {string} bundleId - Bundle ID to delete
 */
export async function deleteBundle(userId, bundleId) {
  if (!isDynamoDbEnabled()) {
    logger.debug({ message: "DynamoDB not enabled, skipping deleteBundle" });
    return;
  }

  try {
    const hashedSub = hashSub(userId);
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    await docClient.send(
      new __dynamoDbModule.DeleteCommand({
        TableName: tableName,
        Key: {
          hashedSub,
          bundleId,
        },
      }),
    );

    logger.info({
      message: "Bundle deleted from DynamoDB",
      hashedSub,
      bundleId,
    });
  } catch (error) {
    logger.error({
      message: "Error deleting bundle from DynamoDB",
      error: error.message,
      userId,
      bundleId,
    });
    throw error;
  }
}

/**
 * Delete all bundles for a user from DynamoDB
 * @param {string} userId - User's sub claim (will be hashed)
 */
export async function deleteAllBundles(userId) {
  if (!isDynamoDbEnabled()) {
    logger.debug({ message: "DynamoDB not enabled, skipping deleteAllBundles" });
    return;
  }

  try {
    const hashedSub = hashSub(userId);
    const bundles = await getUserBundles(userId);

    // Delete bundles concurrently for better performance
    const deleteResults = await Promise.allSettled(
      bundles.map(async (bundleId) => {
        await deleteBundle(userId, bundleId);
      }),
    );

    // Log any failures from individual deletions
    const failures = deleteResults.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.warn({
        message: "Some bundle deletions failed",
        hashedSub,
        failureCount: failures.length,
        totalCount: bundles.length,
      });
    }

    logger.info({
      message: "All bundles deleted from DynamoDB",
      hashedSub,
      count: bundles.length,
      successCount: bundles.length - failures.length,
    });
  } catch (error) {
    logger.error({
      message: "Error deleting all bundles from DynamoDB",
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Get all bundles for a user from DynamoDB
 * @param {string} userId - User's sub claim (will be hashed)
 * @returns {Promise<Array<string>>} Array of bundle strings
 */
export async function getUserBundles(userId) {
  if (!isDynamoDbEnabled()) {
    logger.debug({ message: "DynamoDB not enabled, returning empty bundles array" });
    return [];
  }

  try {
    const hashedSub = hashSub(userId);
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const response = await docClient.send(
      new __dynamoDbModule.QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "hashedSub = :hashedSub",
        ExpressionAttributeValues: {
          ":hashedSub": hashedSub,
        },
      }),
    );

    // Convert DynamoDB items to bundle strings
    const bundles = (response.Items || []).map((item) => item);

    logger.info({
      message: "Retrieved bundles from DynamoDB",
      hashedSub,
      count: bundles.length,
    });

    return bundles;
  } catch (error) {
    logger.error({
      message: "Error retrieving bundles from DynamoDB",
      error: error.message,
      userId,
    });
    return [];
  }
}
