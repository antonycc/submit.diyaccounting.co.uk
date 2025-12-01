// app/lib/dynamoDbBreakerStore.js

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/dynamoDbBreakerStore.js" });

// Lazily construct a DynamoDB client that honours local dynalite endpoints used in tests
let __dynamoClient;
async function getDynamoClient() {
  if (!__dynamoClient) {
    const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.AWS_ENDPOINT_URL;
    __dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || "eu-west-2",
      ...(endpoint ? { endpoint } : {}),
    });
  }
  return __dynamoClient;
}

// Table for proxy state (circuit breaker). Keep legacy env var for compatibility
const STATE_TABLE = process.env.STATE_TABLE_NAME || process.env.PROXY_STATE_DYNAMODB_TABLE_NAME || "ProxyStateTable";

/**
 * Load circuit-breaker state for this prefix.
 */
export async function loadBreakerState(keyPrefix) {
  const stateKey = `breaker:${keyPrefix}`;
  try {
    const dynamo = await getDynamoClient();
    const resp = await dynamo.send(
      new GetItemCommand({
        TableName: STATE_TABLE,
        Key: { stateKey: { S: stateKey } },
      }),
    );
    if (!resp.Item) return { errors: 0, openSince: 0 };
    const rec = unmarshall(resp.Item);
    return { errors: Number(rec.errors || 0), openSince: Number(rec.openSince || 0) };
  } catch (err) {
    logger.error({ keyPrefix, err: err.stack ?? err.message, msg: "Failed to read breaker state, default closed" });
    return { errors: 0, openSince: 0 };
  }
}

/**
 * Persist circuit-breaker state.
 */
export async function saveBreakerState(keyPrefix, errors, openSince) {
  const stateKey = `breaker:${keyPrefix}`;
  const dynamo = await getDynamoClient();
  await dynamo.send(
    new PutItemCommand({
      TableName: STATE_TABLE,
      Item: marshall({
        stateKey,
        errors,
        openSince,
        ttl: Math.floor(Date.now() / 1000) + 3600,
      }),
    }),
  );
}
