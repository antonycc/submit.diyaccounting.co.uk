// app/data/dynamoDbAsyncRequestRepository.js

import { createLogger } from "../lib/logger.js";
import { hashSub } from "../services/subHasher.js";

const logger = createLogger({ source: "app/data/dynamoDbAsyncRequestRepository.js" });

let __dynamoDbModule;
let __dynamoDbDocClient;
let __dynamoEndpointUsed;

async function getDynamoDbDocClient() {
  // Recreate client if endpoint changes after first import (common in tests)
  const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.AWS_ENDPOINT_URL;
  if (!__dynamoDbDocClient || __dynamoEndpointUsed !== (endpoint || "")) {
    __dynamoDbModule = await import("@aws-sdk/lib-dynamodb");
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || "eu-west-2",
      ...(endpoint ? { endpoint } : {}),
    });
    __dynamoDbDocClient = __dynamoDbModule.DynamoDBDocumentClient.from(client);
    __dynamoEndpointUsed = endpoint || "";
  }
  return __dynamoDbDocClient;
}

function getTableName() {
  const tableName = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
  return tableName || "";
}

/**
 * Store an async request state in DynamoDB
 * @param {string} userId - The user ID
 * @param {string} requestId - The request ID
 * @param {string} status - Request status: 'pending', 'processing', 'completed', 'failed'
 * @param {object} data - Optional data (result for completed, error for failed)
 */
export async function putAsyncRequest(userId, requestId, status, data = null) {
  logger.info({
    message: `putAsyncRequest [table: ${getTableName()}]`,
    requestId,
    status,
  });

  try {
    const hashedSub = hashSub(userId);
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const item = {
      hashedSub,
      requestId,
      status,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    if (data) {
      item.data = data;
    }

    // Calculate TTL as 1 hour from now
    const ttlDate = new Date();
    ttlDate.setHours(now.getHours() + 1);
    item.ttl = Math.floor(ttlDate.getTime() / 1000);
    item.ttl_datestamp = ttlDate.toISOString();

    await docClient.send(
      new __dynamoDbModule.PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    logger.info({
      message: "AsyncRequest stored in DynamoDB",
      hashedSub,
      requestId,
      status,
    });
  } catch (error) {
    logger.error({
      message: "Error storing AsyncRequest in DynamoDB",
      error: error.message,
      requestId,
      status,
    });
    throw error;
  }
}

/**
 * Retrieve an async request state from DynamoDB
 * @param {string} userId - The user ID
 * @param {string} requestId - The request ID
 * @returns {object|null} The request state or null if not found
 */
export async function getAsyncRequest(userId, requestId) {
  logger.info({
    message: `getAsyncRequest [table: ${getTableName()}]`,
    requestId,
  });

  try {
    const hashedSub = hashSub(userId);
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const result = await docClient.send(
      new __dynamoDbModule.GetCommand({
        TableName: tableName,
        Key: {
          hashedSub,
          requestId,
        },
      }),
    );

    if (!result.Item) {
      logger.info({
        message: "AsyncRequest not found in DynamoDB",
        hashedSub,
        requestId,
      });
      return null;
    }

    logger.info({
      message: "AsyncRequest retrieved from DynamoDB",
      hashedSub,
      requestId,
      status: result.Item.status,
    });

    return result.Item;
  } catch (error) {
    logger.error({
      message: "Error retrieving AsyncRequest from DynamoDB",
      error: error.message,
      requestId,
    });
    throw error;
  }
}
