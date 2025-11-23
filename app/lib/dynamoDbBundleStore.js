// app/lib/dynamoDbBundleStore.js

import logger from "./logger.js";
import { hashSub } from "./subHasher.js";

let __dynamoDbModule;
let __dynamoDbDocClient;

async function getDynamoDbDocClient() {
  if (!__dynamoDbDocClient) {
    __dynamoDbModule = await import("@aws-sdk/lib-dynamodb");
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || "eu-west-2" });
    __dynamoDbDocClient = __dynamoDbModule.DynamoDBDocumentClient.from(client);
  }
  return __dynamoDbDocClient;
}

export function isDynamoDbEnabled() {
  return Boolean(process.env.BUNDLE_DYNAMODB_TABLE_NAME && process.env.BUNDLE_DYNAMODB_TABLE_NAME !== "test-bundle-table");
}

function getTableName() {
  const tableName = process.env.BUNDLE_DYNAMODB_TABLE_NAME;
  // This should always be checked by isDynamoDbEnabled() first, but return empty string as fallback
  return tableName || "";
}

export async function putBundle(userId, bundle) {
  if (!isDynamoDbEnabled()) {
    logger.warn({ message: "DynamoDB not enabled, skipping putBundle" });
    return;
  } else {
    logger.info({ message: "DynamoDB enabled, proceeding with putBundle" });
  }

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Storing bundle", hashedSub, userId, bundle });

    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const item = {
      ...bundle,
      hashedSub,
      createdAt: now.toISOString(),
    };

    // Add expiry with millisecond precision timestamp (ISO format)
    const expiryDate = new Date(bundle.expiry);
    item.expiry = expiryDate.toISOString();

    // Calculate TTL as 1 month after expiry
    const ttlDate = new Date(expiryDate.getTime());
    ttlDate.setMonth(ttlDate.getMonth() + 1);
    item.ttl = Math.floor(ttlDate.getTime() / 1000);
    item.ttl_datestamp = ttlDate.toISOString();

    logger.info({
      message: "Storing bundle in DynamoDB as item",
      hashedSub,
      item,
    });
    await docClient.send(
      new __dynamoDbModule.PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    logger.info({
      message: "Bundle stored in DynamoDB as item",
      hashedSub,
      item,
    });
  } catch (error) {
    logger.error({
      message: "Error storing bundle in DynamoDB",
      error: error.message,
      userId,
      bundle,
    });
    throw error;
  }
}

export async function deleteBundle(userId, bundleId) {
  if (!isDynamoDbEnabled()) {
    logger.warn({ message: "DynamoDB not enabled, skipping deleteBundle" });
    return;
  } else {
    logger.info({ message: "DynamoDB enabled, proceeding with deleteBundle" });
  }

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Deleting bundle", hashedSub, userId, bundleId });
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    logger.info({
      message: "Deleting bundle from DynamoDB",
      hashedSub,
      bundleId,
    });
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

export async function deleteAllBundles(userId) {
  if (!isDynamoDbEnabled()) {
    logger.warn({ message: "DynamoDB not enabled, skipping deleteAllBundles" });
    return;
  } else {
    logger.info({ message: "DynamoDB enabled, proceeding with deleteAllBundles" });
  }

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Deleting all bundles for user", userId, hashedSub });
    const bundles = await getUserBundles(userId);

    // Delete bundles concurrently for better performance
    logger.info({
      message: "Deleting all bundles from DynamoDB",
      hashedSub,
      count: bundles.length,
    });
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

export async function getUserBundles(userId) {
  if (!isDynamoDbEnabled()) {
    logger.warn({ message: "DynamoDB not enabled, returning empty bundles array" });
    return [];
  } else {
    logger.info({ message: "DynamoDB enabled, proceeding with getUserBundles", userId });
  }

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Retrieving bundles from DynamoDB", userId, hashedSub });
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
    logger.info({ message: "Queried DynamoDB for user bundles", hashedSub, itemCount: response.Count });

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
