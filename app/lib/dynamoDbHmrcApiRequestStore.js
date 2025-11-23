// app/lib/dynamoDbHmrcApiRequestStore.js

import logger, { context } from "./logger.js";
import { hashSub } from "./subHasher.js";

let __dynamoDbModule;
let __dynamoDbDocClient;

async function getDynamoDbDocClient() {
  if (!__dynamoDbDocClient) {
    __dynamoDbModule = await import("@aws-sdk/lib-dynamodb");
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");

    const clientConfig = {
      region: process.env.AWS_REGION || "eu-west-2",
    };

    // Support local DynamoDB for testing/development
    if (process.env.TEST_DYNAMODB_ENDPOINT) {
      clientConfig.endpoint = process.env.TEST_DYNAMODB_ENDPOINT;
      clientConfig.credentials = {
        accessKeyId: process.env.TEST_DYNAMODB_ACCESS_KEY || "dummy",
        secretAccessKey: process.env.TEST_DYNAMODB_SECRET_KEY || "dummy",
      };
    }

    const client = new DynamoDBClient(clientConfig);
    __dynamoDbDocClient = __dynamoDbModule.DynamoDBDocumentClient.from(client);
  }
  return __dynamoDbDocClient;
}

function isDynamoDbEnabled() {
  const tableName = process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME;
  // Enable DynamoDB if table name is set and not the test placeholder
  return Boolean(tableName && tableName !== "test-hmrc-api-requests-table");
}

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
