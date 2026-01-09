// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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
    __dynamoDbDocClient = __dynamoDbModule.DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
    __dynamoEndpointUsed = endpoint || "";
  }
  return __dynamoDbDocClient;
}

/**
 * Store an async request state in DynamoDB
 * @param {string} userId - The user ID
 * @param {string} requestId - The request ID
 * @param {string} status - Request status: 'pending', 'processing', 'completed', 'failed'
 * @param {object} data - Optional data (result for completed, error for failed)
 * @param {string} tableName - Optional table name (defaults to env var)
 */
export async function putAsyncRequest(userId, requestId, status, data = null, tableName = null) {
  const actualTableName = tableName || process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
  if (!actualTableName) {
    logger.warn({ message: "putAsyncRequest called but no table name provided or in env", requestId });
    return;
  }
  logger.info({
    message: `putAsyncRequest [table: ${actualTableName}]`,
    requestId,
    status,
  });

  try {
    const hashedSub = hashSub(userId);
    const docClient = await getDynamoDbDocClient();

    const now = new Date();
    const isoNow = now.toISOString();

    // Calculate TTL as 1 hour from now
    const ttlDate = new Date();
    ttlDate.setHours(now.getHours() + 1);
    const ttl = Math.floor(ttlDate.getTime() / 1000);
    const ttlDatestamp = ttlDate.toISOString();

    const expressionAttributeNames = {
      "#status": "status",
      "#updatedAt": "updatedAt",
      "#ttl": "ttl",
      "#ttl_datestamp": "ttl_datestamp",
      "#createdAt": "createdAt",
    };

    const expressionAttributeValues = {
      ":status": status,
      ":updatedAt": isoNow,
      ":ttl": ttl,
      ":ttl_datestamp": ttlDatestamp,
      ":createdAt": isoNow,
    };

    let updateExpression =
      "SET #status = :status, #updatedAt = :updatedAt, #ttl = :ttl, #ttl_datestamp = :ttl_datestamp, #createdAt = if_not_exists(#createdAt, :createdAt)";

    if (data) {
      updateExpression += ", #data = :data";
      expressionAttributeNames["#data"] = "data";
      expressionAttributeValues[":data"] = data;
    } else {
      updateExpression += " REMOVE #data";
      expressionAttributeNames["#data"] = "data";
    }

    await docClient.send(
      new __dynamoDbModule.UpdateCommand({
        TableName: actualTableName,
        Key: {
          hashedSub,
          requestId,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }),
    );

    logger.info({
      message: "AsyncRequest stored in DynamoDB",
      hashedSub,
      requestId,
      status,
      tableName: actualTableName,
    });
  } catch (error) {
    logger.error({
      message: "Error storing AsyncRequest in DynamoDB",
      error: error.message,
      requestId,
      status,
      tableName: actualTableName,
    });
    throw error;
  }
}

/**
 * Retrieve an async request state from DynamoDB
 * @param {string} userId - The user ID
 * @param {string} requestId - The request ID
 * @param {string} tableName - Optional table name (defaults to env var)
 * @returns {object|null} The request state or null if not found
 */
export async function getAsyncRequest(userId, requestId, tableName = null) {
  const actualTableName = tableName || process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
  if (!actualTableName) {
    logger.warn({ message: "getAsyncRequest called but no table name provided or in env", requestId });
    return null;
  }
  logger.info({
    message: `getAsyncRequest [table: ${actualTableName}]`,
    requestId,
  });

  try {
    const hashedSub = hashSub(userId);
    const docClient = await getDynamoDbDocClient();

    const result = await docClient.send(
      new __dynamoDbModule.GetCommand({
        TableName: actualTableName,
        Key: {
          hashedSub,
          requestId,
        },
        ConsistentRead: true,
      }),
    );

    if (!result.Item) {
      logger.info({
        message: "AsyncRequest not found in DynamoDB",
        hashedSub,
        requestId,
        tableName: actualTableName,
      });
      return null;
    }

    logger.info({
      message: "AsyncRequest retrieved from DynamoDB",
      hashedSub,
      requestId,
      status: result.Item.status,
      tableName: actualTableName,
    });

    return result.Item;
  } catch (error) {
    logger.error({
      message: "Error retrieving AsyncRequest from DynamoDB",
      error: error.message,
      requestId,
      tableName: actualTableName,
    });
    throw error;
  }
}
