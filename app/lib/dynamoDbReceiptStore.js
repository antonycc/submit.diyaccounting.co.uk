// app/lib/dynamoDbReceiptStore.js

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
  return Boolean(process.env.RECEIPTS_DYNAMODB_TABLE_NAME);
}

function getTableName() {
  const tableName = process.env.RECEIPTS_DYNAMODB_TABLE_NAME;
  // This should always be checked by isDynamoDbEnabled() first, but return empty string as fallback
  return tableName || "";
}

/**
 * Store a receipt in DynamoDB with 7-year retention (2555 days)
 * @param {string} userSub - The user's subject identifier
 * @param {string} receiptId - Unique receipt identifier (timestamp-formBundleNumber)
 * @param {object} receipt - The receipt data to store
 */
export async function putReceipt(userSub, receiptId, receipt) {
  if (!isDynamoDbEnabled()) {
    logger.warn({ message: `DynamoDB not enabled, skipping putReceipt [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]` });
    return;
  } else {
    logger.info({ message: `DynamoDB enabled, proceeding with putReceipt [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]` });
  }

  try {
    const hashedSub = hashSub(userSub);
    logger.info({ message: "Storing receipt", hashedSub, userSub, receiptId });

    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const item = {
      hashedSub,
      receiptId,
      receipt,
      createdAt: now.toISOString(),
    };

    // Calculate TTL as 7 years (2555 days) after creation for HMRC tax record requirements
    const ttlDate = new Date(now.getTime());
    ttlDate.setDate(ttlDate.getDate() + 2555);
    item.ttl = Math.floor(ttlDate.getTime() / 1000);
    item.ttl_datestamp = ttlDate.toISOString();

    logger.info({
      message: "Storing receipt in DynamoDB as item",
      hashedSub,
      receiptId,
      ttl_datestamp: item.ttl_datestamp,
    });
    await docClient.send(
      new __dynamoDbModule.PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    logger.info({
      message: "Receipt stored in DynamoDB as item",
      hashedSub,
      receiptId,
    });
  } catch (error) {
    logger.error({
      message: "Error storing receipt in DynamoDB",
      error: error.message,
      userSub,
      receiptId,
    });
    throw error;
  }
}

/**
 * Get a receipt from DynamoDB by receiptId
 * @param {string} userSub - The user's subject identifier
 * @param {string} receiptId - The receipt identifier to retrieve
 * @returns {object} The receipt data
 */
export async function getReceipt(userSub, receiptId) {
  if (!isDynamoDbEnabled()) {
    logger.warn({ message: `DynamoDB not enabled, returning null [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]` });
    return null;
  } else {
    logger.info({
      message: `DynamoDB enabled, proceeding with getReceipt [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]`,
      userSub,
      receiptId,
    });
  }

  try {
    const hashedSub = hashSub(userSub);
    logger.info({ message: "Retrieving receipt from DynamoDB", userSub, hashedSub, receiptId });
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const response = await docClient.send(
      new __dynamoDbModule.GetCommand({
        TableName: tableName,
        Key: {
          hashedSub,
          receiptId,
        },
      }),
    );

    if (!response.Item) {
      logger.info({ message: "Receipt not found in DynamoDB", hashedSub, receiptId });
      return null;
    }

    logger.info({
      message: "Retrieved receipt from DynamoDB",
      hashedSub,
      receiptId,
    });

    return response.Item.receipt;
  } catch (error) {
    logger.error({
      message: "Error retrieving receipt from DynamoDB",
      error: error.message,
      userSub,
      receiptId,
    });
    throw error;
  }
}

/**
 * List all receipts for a user
 * @param {string} userSub - The user's subject identifier
 * @returns {Array} Array of receipt metadata objects
 */
export async function listUserReceipts(userSub) {
  if (!isDynamoDbEnabled()) {
    logger.warn({ message: `DynamoDB not enabled, returning empty receipts array [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]` });
    return [];
  } else {
    logger.info({
      message: `DynamoDB enabled, proceeding with listUserReceipts [table: ${process.env.RECEIPTS_DYNAMODB_TABLE_NAME}]`,
      userSub,
    });
  }

  try {
    const hashedSub = hashSub(userSub);
    logger.info({ message: "Retrieving receipts from DynamoDB", userSub, hashedSub });
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
    logger.info({ message: "Queried DynamoDB for user receipts", hashedSub, itemCount: response.Count });

    // Convert DynamoDB items to receipt metadata
    const receipts = (response.Items || []).map((item) => {
      // Extract timestamp and formBundleNumber from receiptId
      // Format: {ISO8601-timestamp}-{formBundleNumber}
      // ISO timestamps end with 'Z', so find the hyphen after 'Z'
      const zIndex = item.receiptId.indexOf("Z-");
      let timestamp = item.receiptId;
      let formBundleNumber = item.receiptId;

      if (zIndex > 0) {
        // Found 'Z-', so split there
        timestamp = item.receiptId.substring(0, zIndex + 1); // Include the 'Z'
        formBundleNumber = item.receiptId.substring(zIndex + 2); // Skip 'Z-'
      } else {
        // Fallback: no timestamp format found, treat whole string as formBundleNumber
        timestamp = item.receiptId;
        formBundleNumber = item.receiptId;
      }

      return {
        receiptId: item.receiptId,
        key: `receipts/${userSub}/${item.receiptId}.json`, // Legacy S3-style key for compatibility
        name: `${item.receiptId}.json`,
        timestamp: timestamp,
        formBundleNumber: formBundleNumber,
        createdAt: item.createdAt,
        lastModified: item.createdAt, // Use createdAt as lastModified for compatibility
      };
    });

    // Sort by timestamp descending (most recent first)
    receipts.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    logger.info({
      message: "Retrieved receipts from DynamoDB",
      hashedSub,
      count: receipts.length,
    });

    return receipts;
  } catch (error) {
    logger.error({
      message: "Error retrieving receipts from DynamoDB",
      error: error.message,
      userSub,
    });
    return [];
  }
}
