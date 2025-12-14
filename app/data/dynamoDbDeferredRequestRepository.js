// app/data/dynamoDbDeferredRequestRepository.js

import { createLogger, context } from "../lib/logger.js";
import { hashSub } from "../services/subHasher.js";

const logger = createLogger({ source: "app/data/dynamoDbDeferredRequestRepository.js" });

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
  const tableName = process.env.DEFERRED_REQUESTS_DYNAMODB_TABLE_NAME;
  return tableName || "";
}

/**
 * Store a deferred request that is being processed
 * @param {string} clientRequestId - Unique identifier for the request
 * @param {string} userSub - User subject/ID
 * @param {object} requestParams - The request parameters (for validation on continuation)
 * @param {object} options - Additional options
 * @returns {Promise<void>}
 */
export async function putDeferredRequest(clientRequestId, userSub, requestParams, options = {}) {
  logger.info({
    message: `Storing deferred request [table: ${getTableName()}]`,
    clientRequestId,
  });

  try {
    const hashedSub = hashSub(userSub);
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const item = {
      clientRequestId, // Primary key
      hashedSub,
      requestParams,
      status: "PROCESSING",
      requestId: context.get("requestId"),
      amznTraceId: context.get("amznTraceId"),
      traceparent: context.get("traceparent"),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ...options,
    };

    // Calculate TTL as 1 hour - use safer date arithmetic
    const ttlDate = new Date(now.getTime() + 3600000); // Add 1 hour in milliseconds
    item.ttl = Math.floor(ttlDate.getTime() / 1000);
    item.ttl_datestamp = ttlDate.toISOString();

    await docClient.send(
      new __dynamoDbModule.PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    logger.info({
      message: "Deferred request stored in DynamoDB",
      clientRequestId,
      hashedSub,
    });
  } catch (error) {
    logger.error({
      message: "Error storing deferred request in DynamoDB",
      error: error.message,
      clientRequestId,
    });
    throw error;
  }
}

/**
 * Get a deferred request by client request ID
 * @param {string} clientRequestId - Unique identifier for the request
 * @returns {Promise<object|null>}
 */
export async function getDeferredRequest(clientRequestId) {
  logger.info({
    message: `Getting deferred request [table: ${getTableName()}]`,
    clientRequestId,
  });

  try {
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const result = await docClient.send(
      new __dynamoDbModule.GetCommand({
        TableName: tableName,
        Key: {
          clientRequestId,
        },
      }),
    );

    if (!result.Item) {
      logger.info({
        message: "Deferred request not found",
        clientRequestId,
      });
      return null;
    }

    logger.info({
      message: "Deferred request retrieved from DynamoDB",
      clientRequestId,
      status: result.Item.status,
    });

    return result.Item;
  } catch (error) {
    logger.error({
      message: "Error getting deferred request from DynamoDB",
      error: error.message,
      clientRequestId,
    });
    throw error;
  }
}

/**
 * Update a deferred request with result or error
 * @param {string} clientRequestId - Unique identifier for the request
 * @param {string} status - New status (COMPLETED, FAILED)
 * @param {object} result - Result data
 * @param {object} error - Error data (if failed)
 * @returns {Promise<void>}
 */
export async function updateDeferredRequest(clientRequestId, status, result = null, error = null) {
  logger.info({
    message: `Updating deferred request [table: ${getTableName()}]`,
    clientRequestId,
    status,
  });

  try {
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const updateExpression = "SET #status = :status, updatedAt = :updatedAt, #result = :result, #error = :error";
    const expressionAttributeNames = {
      "#status": "status",
      "#result": "result",
      "#error": "error",
    };
    const expressionAttributeValues = {
      ":status": status,
      ":updatedAt": now.toISOString(),
      ":result": result,
      ":error": error,
    };

    await docClient.send(
      new __dynamoDbModule.UpdateCommand({
        TableName: tableName,
        Key: {
          clientRequestId,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }),
    );

    logger.info({
      message: "Deferred request updated in DynamoDB",
      clientRequestId,
      status,
    });
  } catch (error) {
    logger.error({
      message: "Error updating deferred request in DynamoDB",
      error: error.message,
      clientRequestId,
    });
    throw error;
  }
}

/**
 * Delete a deferred request (e.g., after successful retrieval)
 * @param {string} clientRequestId - Unique identifier for the request
 * @returns {Promise<void>}
 */
export async function deleteDeferredRequest(clientRequestId) {
  logger.info({
    message: `Deleting deferred request [table: ${getTableName()}]`,
    clientRequestId,
  });

  try {
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    await docClient.send(
      new __dynamoDbModule.DeleteCommand({
        TableName: tableName,
        Key: {
          clientRequestId,
        },
      }),
    );

    logger.info({
      message: "Deferred request deleted from DynamoDB",
      clientRequestId,
    });
  } catch (error) {
    logger.error({
      message: "Error deleting deferred request from DynamoDB",
      error: error.message,
      clientRequestId,
    });
    throw error;
  }
}
