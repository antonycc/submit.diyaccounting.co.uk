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
  return Boolean(process.env.BUNDLE_DYNAMODB_TABLE_NAME);
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
 * Parse bundle string to extract bundleId and expiry
 * @param {string} bundleStr - Bundle string in format "BUNDLE_ID" or "BUNDLE_ID|EXPIRY=2025-12-31"
 * @returns {Object} Object with bundleId and expiry (ISO date string or null)
 */
function parseBundleString(bundleStr) {
  if (!bundleStr || typeof bundleStr !== "string") {
    return { bundleId: "", expiry: null };
  }

  const parts = bundleStr.split("|");
  const bundleId = parts[0] || "";
  let expiry = null;

  if (parts.length > 1) {
    const expiryMatch = parts[1].match(/EXPIRY=(.+)/);
    if (expiryMatch && expiryMatch[1]) {
      expiry = expiryMatch[1]; // ISO date string like "2025-12-31"
    }
  }

  return { bundleId, expiry };
}

/**
 * Store a bundle for a user in DynamoDB
 * @param {string} userId - User's sub claim (will be hashed)
 * @param {string} bundleStr - Bundle string in format "BUNDLE_ID|EXPIRY=2025-12-31"
 * @param {Object} [subscriptionInfo] - Optional subscription information
 * @param {string} [subscriptionInfo.customerId] - Stripe customer ID
 * @param {string} [subscriptionInfo.subscriptionId] - Stripe subscription ID
 * @param {string} [subscriptionInfo.subscriptionStatus] - Subscription status (active, canceled, etc.)
 */
export async function putBundle(userId, bundleStr, subscriptionInfo = null) {
  if (!isDynamoDbEnabled()) {
    logger.debug({ message: "DynamoDB not enabled, skipping putBundle" });
    return;
  }

  try {
    const hashedSub = hashSub(userId);
    const { bundleId, expiry } = parseBundleString(bundleStr);

    if (!bundleId) {
      logger.warn({ message: "Invalid bundle string, skipping putBundle", bundleStr });
      return;
    }

    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const item = {
      hashedSub,
      bundleId,
      bundleStr,
      createdAt: new Date().toISOString(),
    };

    // Add subscription information if provided
    if (subscriptionInfo) {
      if (subscriptionInfo.customerId) {
        item.stripeCustomerId = subscriptionInfo.customerId;
      }
      if (subscriptionInfo.subscriptionId) {
        item.stripeSubscriptionId = subscriptionInfo.subscriptionId;
      }
      if (subscriptionInfo.subscriptionStatus) {
        item.subscriptionStatus = subscriptionInfo.subscriptionStatus;
      }
      item.lastSubscriptionCheck = new Date().toISOString();
    }

    // Add TTL if expiry is present (convert date to Unix timestamp)
    if (expiry) {
      item.expiry = expiry;
      const expiryDate = new Date(expiry);
      // Validate the date is valid before calculating TTL
      if (!isNaN(expiryDate.getTime())) {
        item.ttl = Math.floor(expiryDate.getTime() / 1000);
      } else {
        logger.warn({ message: "Invalid expiry date format, skipping TTL", expiry });
      }
    }

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
      expiry,
    });
  } catch (error) {
    logger.error({
      message: "Error storing bundle in DynamoDB",
      error: error.message,
      userId,
      bundleStr,
    });
    // Don't throw - this is shadow write, should not fail the main operation
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
    // Don't throw - this is shadow write, should not fail the main operation
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
      bundles.map(async (bundleStr) => {
        const { bundleId } = parseBundleString(bundleStr);
        if (bundleId) {
          await deleteBundle(userId, bundleId);
        }
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
    // Don't throw - this is shadow write, should not fail the main operation
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

    const bundles = (response.Items || []).map((item) => item.bundleStr || "").filter((b) => b.length > 0);

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

/**
 * Get all subscription bundles that need status checking
 * @returns {Promise<Array<{hashedSub: string, bundleId: string, stripeCustomerId: string, stripeSubscriptionId: string, subscriptionStatus: string, lastSubscriptionCheck: string}>>}
 */
export async function getSubscriptionBundlesForCheck() {
  if (!isDynamoDbEnabled()) {
    logger.debug({ message: "DynamoDB not enabled, returning empty array" });
    return [];
  }

  try {
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    // Scan for bundles with subscription information
    const response = await docClient.send(
      new __dynamoDbModule.ScanCommand({
        TableName: tableName,
        FilterExpression: "attribute_exists(stripeSubscriptionId)",
      }),
    );

    const subscriptionBundles = (response.Items || [])
      .filter((item) => item.stripeSubscriptionId && item.stripeCustomerId)
      .map((item) => ({
        hashedSub: item.hashedSub,
        bundleId: item.bundleId,
        stripeCustomerId: item.stripeCustomerId,
        stripeSubscriptionId: item.stripeSubscriptionId,
        subscriptionStatus: item.subscriptionStatus || "unknown",
        lastSubscriptionCheck: item.lastSubscriptionCheck || null,
      }));

    logger.info({
      message: "Retrieved subscription bundles for checking",
      count: subscriptionBundles.length,
    });

    return subscriptionBundles;
  } catch (error) {
    logger.error({
      message: "Error retrieving subscription bundles",
      error: error.message,
    });
    return [];
  }
}

/**
 * Update subscription status for a bundle
 * @param {string} hashedSub - Hashed user sub
 * @param {string} bundleId - Bundle ID
 * @param {string} subscriptionStatus - New subscription status
 * @param {string} [currentPeriodEnd] - Subscription period end date
 */
export async function updateSubscriptionStatus(hashedSub, bundleId, subscriptionStatus, currentPeriodEnd = null) {
  if (!isDynamoDbEnabled()) {
    logger.debug({ message: "DynamoDB not enabled, skipping updateSubscriptionStatus" });
    return;
  }

  try {
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const updateExpression = currentPeriodEnd
      ? "SET subscriptionStatus = :status, lastSubscriptionCheck = :checkTime, expiry = :expiry"
      : "SET subscriptionStatus = :status, lastSubscriptionCheck = :checkTime";

    const expressionAttributeValues = {
      ":status": subscriptionStatus,
      ":checkTime": new Date().toISOString(),
    };

    if (currentPeriodEnd) {
      expressionAttributeValues[":expiry"] = currentPeriodEnd;
    }

    await docClient.send(
      new __dynamoDbModule.UpdateCommand({
        TableName: tableName,
        Key: {
          hashedSub,
          bundleId,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      }),
    );

    logger.info({
      message: "Updated subscription status in DynamoDB",
      hashedSub,
      bundleId,
      subscriptionStatus,
      currentPeriodEnd,
    });
  } catch (error) {
    logger.error({
      message: "Error updating subscription status",
      error: error.message,
      hashedSub,
      bundleId,
    });
    // Don't throw - this is a background update
  }
}
