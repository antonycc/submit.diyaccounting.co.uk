// app/functions/infra/httpProxy.js

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import http from "http";
import https from "https";
import { createLogger, context } from "../../lib/logger.js";
import { http400BadRequestResponse } from "../../lib/responses.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "@app/lib/httpHelper.js";

const logger = createLogger({ source: "app/functions/infra/httpProxy.js" });
const dynamo = new DynamoDBClient({});
const STATE_TABLE = process.env.STATE_TABLE_NAME || "ProxyStateTable";

// Load mappings at startup from environment variables:
// Expect *_MAPPED_PREFIX (the incoming path prefix) and *_EGRESS_URL (the upstream base URL)
const proxyMappings = [
  ...(process.env.HMRC_API_PROXY_MAPPED_PREFIX && process.env.HMRC_API_PROXY_EGRESS_URL
    ? [{ prefix: process.env.HMRC_API_PROXY_MAPPED_PREFIX, target: process.env.HMRC_API_PROXY_EGRESS_URL }]
    : []),
  ...(process.env.HMRC_SANDBOX_API_PROXY_MAPPED_PREFIX && process.env.HMRC_SANDBOX_API_PROXY_EGRESS_URL
    ? [{ prefix: process.env.HMRC_SANDBOX_API_PROXY_MAPPED_PREFIX, target: process.env.HMRC_SANDBOX_API_PROXY_EGRESS_URL }]
    : []),
  // add more mappings as needed
];

const RATE_LIMIT_PER_SECOND = Number(process.env.RATE_LIMIT_PER_SECOND || "10");
const BREAKER_ERROR_THRESHOLD = Number(process.env.BREAKER_ERROR_THRESHOLD || "10");
const BREAKER_LATENCY_MS = Number(process.env.BREAKER_LATENCY_MS || "5000");
const BREAKER_COOLDOWN_SECONDS = Number(process.env.BREAKER_COOLDOWN_SECONDS || "60");

// Server hook for Express app
export function apiEndpoint(app) {
  app.all("/proxy/*", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

/**
 * Expose for Express integration (local testing).
 * Mount this under your Express app (e.g. app.use('/proxy', …)).
 */
// export function apiEndpoint(app) {
//   app.all("/*", async (req, res) => {
//     // reconstruct minimal lambda-style event
//     const event = {
//       rawPath: req.path,
//       rawQueryString: req._parsedUrl?.query || "",
//       requestContext: { http: { method: req.method } },
//       headers: req.headers,
//       body: req.body,
//     };
//     const result = await handler(event);
//     res.status(result.statusCode);
//     for (const [k, v] of Object.entries(result.headers || {})) {
//       res.setHeader(k, v);
//     }
//     res.send(result.body);
//   });
// }

/**
 * Find which mapping (if any) matches the incoming path.
 */
function matchMapping(path) {
  for (const m of proxyMappings) {
    if (path.startsWith(m.prefix)) {
      return m;
    }
  }
  return null;
}

/**
 * Rate-limit using DynamoDB per-second counters.
 */
async function checkRateLimit(keyPrefix, rateLimit, requestId) {
  const nowSec = Math.floor(Date.now() / 1000);
  const stateKey = `rate:${keyPrefix}:${nowSec}`;
  try {
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
async function loadBreakerState(keyPrefix) {
  const stateKey = `breaker:${keyPrefix}`;
  try {
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
async function saveBreakerState(keyPrefix, errors, openSince) {
  const stateKey = `breaker:${keyPrefix}`;
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
function proxyRequest(targetUrl, options, body) {
  return new Promise((resolve) => {
    const client = targetUrl.protocol === "https:" ? https : http;
    const req = client.request(targetUrl, options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
      });
    });
    req.on("error", (err) => {
      resolve({ statusCode: 502, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: err.message }) });
    });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Lambda handler (for AWS Lambda + API Gateway).
 */
export async function handler(event) {
  const requestId = context.get("requestId");

  const path = event.rawPath || event.requestContext?.http?.path || "/";
  const method = event.requestContext?.http?.method || "GET";

  logger.info({ requestId, method, path, msg: "Incoming proxy request" });

  const mapping = matchMapping(path);
  if (!mapping) {
    logger.error({ requestId, path, msg: "No proxy mapping found" });
    return http400BadRequestResponse({ message: "No proxy mapping" });
  }

  const suffix = path.substring(mapping.prefix.length) || "/";
  let targetBase;
  try {
    targetBase = new URL(mapping.target);
  } catch (err) {
    logger.error({ requestId, mapping, err: err.stack ?? err.message, msg: "Invalid target URL in mapping" });
    return http400BadRequestResponse({ message: "Invalid upstream mapping" });
  }

  // Rate-limit
  const allowed = await checkRateLimit(mapping.prefix, RATE_LIMIT_PER_SECOND, requestId);
  if (!allowed) {
    logger.warn({ requestId, mapping: mapping.prefix, msg: "Rate limit exceeded" });
    return { statusCode: 429, headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Rate limit exceeded" }) };
  }

  // Circuit breaker
  const breaker = await loadBreakerState(mapping.prefix);
  if (breaker.openSince && Date.now() - breaker.openSince < BREAKER_COOLDOWN_SECONDS * 1000) {
    logger.warn({ requestId, mapping: mapping.prefix, msg: "Circuit breaker open, rejecting request" });
    return {
      statusCode: 503,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Upstream unavailable (circuit open)" }),
    };
  }

  // Build full upstream URL
  const targetUrl = new URL(suffix + (event.rawQueryString ? `?${event.rawQueryString}` : ""), targetBase);

  // Prepare request options
  const headers = { ...event.headers, host: targetBase.host };
  const options = { method, headers };

  const start = Date.now();
  const resp = await proxyRequest(targetUrl, options, event.body);
  const latency = Date.now() - start;

  const isError = resp.statusCode >= 500 || latency > BREAKER_LATENCY_MS;
  let errors = breaker.errors;
  let openSince = breaker.openSince;

  if (isError) {
    errors += 1;
    if (errors >= BREAKER_ERROR_THRESHOLD) {
      openSince = Date.now();
      logger.error({ requestId, mapping: mapping.prefix, errors, msg: "Circuit breaker triggered Open" });
    }
  } else {
    errors = Math.max(0, errors - 1);
  }

  await saveBreakerState(mapping.prefix, errors, openSince);

  return {
    statusCode: resp.statusCode,
    headers: resp.headers,
    body: resp.body,
  };
}
