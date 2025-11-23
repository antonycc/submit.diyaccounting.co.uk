// app/lib/dynamoDbHmrcApiRequestStore.js

import logger, { context } from "./logger.js";
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
function isDynamoDbEnabled() {
  return Boolean(
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME &&
      process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME !== "test-hmrc-api-requests-table",
  );
}

/**
 * Get the configured DynamoDB table name
 * @returns {string} Table name
 */
function getTableName() {
  const tableName = process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME;
  // This should always be checked by isDynamoDbEnabled() first, but return empty string as fallback
  return tableName || "";
}

/*
Example data:
  let duration = 0;
  const httpRequest = {
    method: "POST",
    headers: { ...requestHeaders },
    body: requestBody,
  };
  const httpResponse = {
    statusCode: response.status,
    headers: response.headers ?? {},
    body: responseTokens,
  };
 */
export async function putHmrcApiRequest(userSub, { url, httpRequest, httpResponse, duration }) {
  if (!isDynamoDbEnabled()) {
    logger.warn({ message: "DynamoDB not enabled, skipping putHmrcApiRequest" });
    return;
  } else {
    logger.info({ message: "DynamoDB enabled, proceeding with putHmrcApiRequest" });
  }

  const method = httpRequest && httpRequest.method ? httpRequest.method : "UNKNOWN";
  const requestId = context.get("requestId");
  const amznTraceId = context.get("amznTraceId");
  const traceparent = context.get("traceparent");

  try {
    const hashedSub = hashSub(userSub);
    const docClient = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const item = {
      hashedSub,
      requestId,
      amznTraceId,
      traceparent,
      url,
      method,
      httpRequest,
      httpResponse,
      duration,
      createdAt: now.toISOString(),
    };

    // Calculate TTL as 1 month
    const ttlDate = new Date();
    ttlDate.setMonth(now.getMonth() + 1);
    item.ttl = Math.floor(ttlDate.getTime() / 1000);
    item.ttl_datestamp = ttlDate.toISOString();

    await docClient.send(
      new __dynamoDbModule.PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    logger.info({
      message: "HmrcApiRequest stored in DynamoDB",
      hashedSub,
      url,
      method,
    });
  } catch (error) {
    logger.error({
      message: "Error storing HmrcApiRequest in DynamoDB",
      error: error.message,
      url,
      method,
    });
    throw error;
  }
}
