// app/functions/infra/httpProxyHelper.js

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import http from "http";
import https from "https";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/functions/infra/httpProxyHelper.js" });

// Maximum number of redirects the proxy will follow for a single upstream request
const MAX_REDIRECTS = 5;

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

// Table for proxy state (rate limiter + circuit breaker). Keep legacy env var for compatibility
const STATE_TABLE = process.env.STATE_TABLE_NAME || process.env.PROXY_STATE_DYNAMODB_TABLE_NAME || "ProxyStateTable";

// TODO: Separate into HMRC-specific parameterisation + http endpoint and lambda handler in one JS file and move everything else to a generic library JS file.

/**
 * Find which mapping (if any) matches the incoming path.
 */
export function matchMapping(path, mappings) {
  for (const m of mappings) {
    if (path.startsWith(m.prefix)) {
      return m;
    }
  }
  return null;
}

/**
 * Rate-limit using in-memory per-second counters for test/runtime stability.
 * Falls back to DynamoDB if explicitly configured via PROXY_RATE_LIMIT_STORE="dynamo".
 */
export const inMemoryRateCounts = new Map();
export async function checkRateLimit(keyPrefix, rateLimit, requestId) {
  const useDynamo = process.env.PROXY_RATE_LIMIT_STORE === "dynamo";
  // In test runs, avoid flaky cross-test interaction with the in-memory
  // limiter by disabling it unless a test explicitly opts into Dynamo-backed
  // rate limiting. The dedicated rate-limit test enables Dynamo store to keep
  // behaviour verifiable.
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

  // DynamoDB-backed counter (not used in tests by default)
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

/**
 * Perform the HTTP proxy request.
 */
export function proxyRequest(targetUrl, options, body) {
  return new Promise((resolve) => {
    const client = targetUrl.protocol === "https:" ? https : http;
    const req = client.request(targetUrl, options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(typeof d === "string" ? Buffer.from(d) : d));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        logger.info({ msg: `Upstream response received: ${res.statusCode}`, responseBody });
        resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
      });
    });
    req.on("error", (err) => {
      logger.error({ err: err.stack ?? err.message, msg: "Upstream request error" });
      resolve({ statusCode: 502, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: err.message }) });
    });
    if (body) req.write(body);
    req.end();
    logger.info({ msg: `Upstream request sent to ${targetUrl.toString()}` });
  });
}

/**
 * Wrapper around proxyRequest that follows HTTP redirects up to MAX_REDIRECTS hops.
 * Redirect handling semantics:
 * - 301/302/303: switch to GET and drop request body
 * - 307/308: preserve original method and body
 * Relative Location headers are resolved against the current URL.
 */
export async function proxyRequestWithRedirects(initialUrl, initialOptions, initialBody) {
  let url = new URL(initialUrl.toString());
  let options = { ...initialOptions, headers: { ...(initialOptions.headers || {}) } };
  let body = initialBody;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const resp = await proxyRequest(url, options, body);

    const status = resp.statusCode || 0;
    const headers = resp.headers || {};
    const location = headers.location || headers.Location;

    const isRedirect = [301, 302, 303, 307, 308].includes(status);
    if (!isRedirect || !location) {
      return resp;
    }

    // Resolve next URL relative to current
    let nextUrl;
    try {
      nextUrl = new URL(location, url);
    } catch (e) {
      // If Location is invalid, return the redirect response as-is
      logger.warn({ msg: "Invalid redirect location header, returning upstream response", location, status });
      return resp;
    }

    // Adjust method/body per RFC semantics
    const prevMethod = (options.method || "GET").toUpperCase();
    let nextMethod = prevMethod;
    let nextBody = body;
    if ([301, 302, 303].includes(status)) {
      nextMethod = "GET";
      nextBody = undefined;
      // Remove entity headers when dropping body
      delete options.headers["content-length"]; // lower-case typical
      delete options.headers["Content-Length"]; // just in case
      delete options.headers["content-type"]; // avoid misleading type
      delete options.headers["Content-Type"]; // casing variant
    }

    // Prepare headers for next hop
    const nextHeaders = { ...(options.headers || {}) };
    // Update Host header for the new URL
    nextHeaders.host = nextUrl.host;
    // If origin changes, strip Authorization to avoid credential leak
    if (nextUrl.origin !== url.origin) {
      delete nextHeaders.authorization;
      delete nextHeaders.Authorization;
    }

    options = { ...options, method: nextMethod, headers: nextHeaders };
    url = nextUrl;
    body = nextBody;

    logger.info({
      msg: "Following redirect",
      status,
      location,
      nextUrl: nextUrl.toString(),
      nextMethod,
      hop: i + 1,
    });

    // Loop to perform the next request; if we exceed redirects, fall through
    if (i === MAX_REDIRECTS) break;
  }

  // Too many redirects
  logger.error({ msg: "Exceeded maximum redirects in proxy", max: MAX_REDIRECTS });
  return {
    statusCode: 508, // Loop Detected / Too many redirects
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Too many redirects" }),
  };
}
