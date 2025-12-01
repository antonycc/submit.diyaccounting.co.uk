// app/lib/dynamoDbBreakerRepository.js

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/lib/dynamoDbBreakerRepository.js" });

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
 * Rate-limit using in-memory per-second counters for test/runtime stability.
 * Falls back to DynamoDB if explicitly configured via PROXY_RATE_LIMIT_STORE="dynamo".
 */
export const inMemoryRateCounts = new Map();
export async function checkRateLimit(keyPrefix, rateLimit, requestId) {
  const useDynamo = process.env.PROXY_RATE_LIMIT_STORE === "dynamo";
  if (process.env.NODE_ENV === "test" && !useDynamo) {
    logger.info({ requestId, keyPrefix, msg: "Skipping in-memory rate limit in test mode" });
    return true;
  }
  const nowSec = Math.floor(Date.now() / 1000);

  if (!useDynamo) {
    const key = `${keyPrefix}:${nowSec}`;
    const next = (inMemoryRateCounts.get(key) || 0) + 1;
    inMemoryRateCounts.set(key, next);
    logger.info({ requestId, keyPrefix, second: nowSec, count: next, limit: rateLimit, msg: "In-memory rate check" });
    return next <= rateLimit;
  }

  // DynamoDB-backed counter
  const stateKey = `rate:${keyPrefix}:${nowSec}`;
  try {
    const dynamo = await getDynamoClient();
    const resp = await dynamo.send(
      new GetItemCommand({
        TableName: STATE_TABLE,
        Key: { stateKey: { S: stateKey } },
      }),
    );
    const current = resp.Item ? Number(unmarshall(resp.Item).count) : 0;
    const next = current + 1;
    await dynamo.send(
      new PutItemCommand({
        TableName: STATE_TABLE,
        Item: marshall({
          stateKey,
          count: next,
          ttl: nowSec + 60,
        }),
      }),
    );
    return next <= rateLimit;
  } catch (err) {
    logger.error({ requestId, keyPrefix, err: err.stack ?? err.message, msg: "Rate-limit check failed, allowing" });
    return true;
  }
}

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
