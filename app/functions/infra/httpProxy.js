// app/functions/infra/httpProxy.js

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import http from "http";
import https from "https";
import { createLogger, context } from "../../lib/logger.js";
import { http400BadRequestResponse } from "../../lib/responses.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

const logger = createLogger({ source: "app/functions/infra/httpProxy.js" });
const dynamo = new DynamoDBClient({});
const STATE_TABLE = process.env.STATE_TABLE_NAME || "ProxyStateTable";

// Build mappings from environment variables at call time so tests that
// set env vars after import still work. Expect *_MAPPED_PREFIX (incoming
// path prefix) and *_EGRESS_URL (the upstream base URL).
function getProxyMappings() {
  const mappings = [];
  logger.info({ msg: "Building proxy mappings from environment variables" });
  logger.info({ msg: `HMRC_API_PROXY_MAPPED_URL=${process.env.HMRC_API_PROXY_MAPPED_URL}` });
  logger.info({ msg: `HMRC_API_PROXY_EGRESS_URL=${process.env.HMRC_API_PROXY_EGRESS_URL}` });
  logger.info({ msg: `HMRC_SANDBOX_API_PROXY_MAPPED_URL=${process.env.HMRC_SANDBOX_API_PROXY_MAPPED_URL}` });
  logger.info({ msg: `HMRC_SANDBOX_API_PROXY_EGRESS_URL=${process.env.HMRC_SANDBOX_API_PROXY_EGRESS_URL}` });
  if (process.env.HMRC_API_PROXY_MAPPED_URL && process.env.HMRC_API_PROXY_EGRESS_URL) {
    mappings.push({ prefix: process.env.HMRC_API_PROXY_MAPPED_URL, target: process.env.HMRC_API_PROXY_EGRESS_URL });
  }
  if (process.env.HMRC_SANDBOX_API_PROXY_MAPPED_URL && process.env.HMRC_SANDBOX_API_PROXY_EGRESS_URL) {
    mappings.push({ prefix: process.env.HMRC_SANDBOX_API_PROXY_MAPPED_URL, target: process.env.HMRC_SANDBOX_API_PROXY_EGRESS_URL });
  }
  return mappings;
}

function getRateLimitPerSecond() {
  return Number(process.env.RATE_LIMIT_PER_SECOND || "10");
}
function getBreakerErrorThreshold() {
  return Number(process.env.BREAKER_ERROR_THRESHOLD || "10");
}
function getBreakerLatencyMs() {
  return Number(process.env.BREAKER_LATENCY_MS || "5000");
}
function getBreakerCooldownSeconds() {
  return Number(process.env.BREAKER_COOLDOWN_SECONDS || "60");
}

// Server hook for Express app
export function apiEndpoint(app) {
  // Mount under a static prefix to avoid path-to-regexp wildcard parsing
  // differences across versions. This catches all methods and subpaths
  // beneath "/proxy" without needing patterns like ":path*".
  const onProxy = async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  };

  app.use("/proxy", onProxy);
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
function matchMapping(path, mappings) {
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
const inMemoryRateCounts = new Map();
async function checkRateLimit(keyPrefix, rateLimit, requestId) {
  const useDynamo = process.env.PROXY_RATE_LIMIT_STORE === "dynamo";
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
      res.on("data", (d) => chunks.push(typeof d === "string" ? Buffer.from(d) : d));
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

  const method = event.requestContext?.http?.method;
  const protocol = event.requestContext?.http?.protocol;
  const host = event.requestContext?.http?.host;
  // const port = event.requestContext?.http?.port;
  const path = event.rawPath || event.requestContext?.http?.path;
  logger.info({ requestId, method, protocol, host, path, msg: "Incoming proxy request" });
  let urlProtocolHostAndPath;
  // if (protocol && host && port && path) {
  //  urlProtocolHostAndPath = `${protocol}://${host}:${port}/${path}`;
  // } else
  if (protocol && host && path) {
    urlProtocolHostAndPath = `${protocol}://${host}/proxy${path}`;
  } else if (host && path) {
    urlProtocolHostAndPath = `${host}/proxy${path}`;
  } else if (path) {
    urlProtocolHostAndPath = `/proxy${path}`;
  } else {
    const message = `Invalid request, missing path: ${JSON.stringify(event)}`;
    logger.error({ requestId, message });
    return http400BadRequestResponse({ message });
  }

  const mappings = getProxyMappings();
  const mapping = matchMapping(urlProtocolHostAndPath, mappings);
  if (!mapping) {
    const message = `No proxy mapping found for path: ${urlProtocolHostAndPath} (available: ${mappings.map((m) => m.prefix).join(", ")})`;
    logger.error({ requestId, urlProtocolHostAndPath, message });
    return http400BadRequestResponse({ message });
  } else {
    const message = `Matched proxy mapping found for path: ${urlProtocolHostAndPath} (available: ${mappings.map((m) => m.prefix).join(", ")})`;
    logger.info({ requestId, urlProtocolHostAndPath, mapping, message });
  }

  let targetBase;
  try {
    const urlProtocolHostAndPathTransformed = urlProtocolHostAndPath.replace(mapping.prefix, mapping.target);
    targetBase = new URL(urlProtocolHostAndPathTransformed);
  } catch (err) {
    const message = `Invalid target URL in mapping for prefix ${mapping.prefix}: ${mapping.target} in mappings ${JSON.stringify(mappings)} (caused by ${err.message})`;
    logger.error({ requestId, mapping, err: err.stack, message });
    return http400BadRequestResponse({ message });
  }
  logger.info({ requestId, mapping, targetBase: targetBase.toString(), msg: "Proxy target determined" });

  // Rate-limit
  const allowed = await checkRateLimit(mapping.prefix, getRateLimitPerSecond(), requestId);
  if (!allowed) {
    logger.warn({ requestId, mapping, msg: `Rate limit ${getRateLimitPerSecond()} exceeded, rejecting request` });
    return { statusCode: 429, headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Rate limit exceeded" }) };
  }

  // Circuit breaker
  const breaker = await loadBreakerState(mapping.prefix);
  if (breaker.openSince && Date.now() - breaker.openSince < getBreakerCooldownSeconds() * 1000) {
    logger.warn({ requestId, mappingPrefix: mapping.prefix, msg: "Circuit breaker open, rejecting request" });
    return {
      statusCode: 503,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Upstream unavailable (circuit open)" }),
    };
  }

  // Build full upstream URL
  const suffix = path.substring(mapping.prefix.length) || "/";
  const targetUrl = new URL(suffix + (event.rawQueryString ? `?${event.rawQueryString}` : ""), targetBase);
  logger.info({ requestId, mappingPrefix: mapping.prefix, targetUrl: targetUrl.toString(), msg: "Proxying request to upstream" });

  // Prepare request options
  const headers = { ...event.headers, host: targetBase.host };
  const options = { method, headers };

  const start = Date.now();
  const resp = await proxyRequest(targetUrl, options, event.body);
  const latency = Date.now() - start;
  logger.info({ requestId, mapping, statusCode: resp.statusCode, latency, msg: "Upstream response received" });

  const isError = resp.statusCode >= 500 || latency > getBreakerLatencyMs();
  let errors = breaker.errors;
  let openSince = breaker.openSince;

  if (isError) {
    errors += 1;
    if (errors >= getBreakerErrorThreshold()) {
      openSince = Date.now();
      logger.error({ requestId, mappingPrefix: mapping.prefix, errors, msg: "Circuit breaker triggered Open" });
    }
  } else {
    errors = Math.max(0, errors - 1);
  }

  logger.info({
    requestId,
    mapping,
    statusCode: resp.statusCode,
    latency,
    errors,
    openSince,
    msg: "Upstream response received, saving breaker state",
  });
  await saveBreakerState(mapping.prefix, errors, openSince);

  logger.info({ requestId, mapping, statusCode: resp.statusCode, msg: "Returning proxy response" });
  return {
    statusCode: resp.statusCode,
    headers: resp.headers,
    body: resp.body,
  };
}
