// app/functions/proxy/outboundProxyHandler.js

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import http from "http";
import https from "https";
import logger, { context } from "../../lib/logger.js";
import { extractRequest, http400BadRequestResponse, http500ServerErrorResponse } from "../../lib/responses.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

const dynamo = new DynamoDBClient({});

// Lazy-load configuration from environment variables
function getConfig() {
  const STATE_TABLE = process.env.STATE_TABLE_NAME || "ProxyStateTable";
  const HMRC_API_HOST = process.env.HMRC_API_HOST || "";
  const HMRC_SANDBOX_API_HOST = process.env.HMRC_SANDBOX_API_HOST || "";
  const HMRC_API_PROXY_HOST = process.env.HMRC_API_PROXY_HOST || "";
  const HMRC_SANDBOX_API_PROXY_HOST = process.env.HMRC_SANDBOX_API_PROXY_HOST || "";
  const RATE_LIMIT_PER_SECOND = parseInt(process.env.RATE_LIMIT_PER_SECOND || "10", 10);
  const BREAKER_ERROR_THRESHOLD = parseInt(process.env.BREAKER_ERROR_THRESHOLD || "10", 10);
  const BREAKER_LATENCY_MS = parseInt(process.env.BREAKER_LATENCY_MS || "5000", 10);
  const BREAKER_COOLDOWN_SECONDS = parseInt(process.env.BREAKER_COOLDOWN_SECONDS || "60", 10);

  // Build proxy mappings from explicit environment variables
  const proxyMappings = {};
  if (HMRC_API_PROXY_HOST && HMRC_API_HOST) {
    proxyMappings[HMRC_API_PROXY_HOST] = `https://${HMRC_API_HOST}`;
  }
  if (HMRC_SANDBOX_API_PROXY_HOST && HMRC_SANDBOX_API_HOST) {
    proxyMappings[HMRC_SANDBOX_API_PROXY_HOST] = `https://${HMRC_SANDBOX_API_HOST}`;
  }

  return {
    STATE_TABLE,
    proxyMappings,
    RATE_LIMIT_PER_SECOND,
    BREAKER_ERROR_THRESHOLD,
    BREAKER_LATENCY_MS,
    BREAKER_COOLDOWN_SECONDS,
  };
}

/**
 * Helper function to create HTTP responses with proper headers
 */
function httpResponse(statusCode, body) {
  const headers = {
    "content-type": "application/json",
  };
  if (context.get("requestId")) headers["x-request-id"] = context.get("requestId");
  return {
    statusCode,
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

// Server hook for Express app
export function apiEndpoint(app) {
  app.all("/proxy/*", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

/**
 * Get proxy configuration from environment variables
 */
function getProxyConfig(proxyHost) {
  const config = getConfig();
  const upstreamHost = config.proxyMappings[proxyHost];
  if (!upstreamHost) {
    return null;
  }

  return {
    upstreamHost,
    rateLimitPerSecond: config.RATE_LIMIT_PER_SECOND,
    breakerConfig: {
      errorThreshold: config.BREAKER_ERROR_THRESHOLD,
      latencyMs: config.BREAKER_LATENCY_MS,
      cooldownSeconds: config.BREAKER_COOLDOWN_SECONDS,
    },
  };
}

/**
 * Check rate limit using DynamoDB state
 */
async function checkRateLimit(proxyHost, rateLimit, requestId) {
  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);
  const stateKey = `rate:${proxyHost}:${now}`;

  try {
    // Get current count for this second
    const resp = await dynamo.send(
      new GetItemCommand({
        TableName: config.STATE_TABLE,
        Key: { stateKey: { S: stateKey } },
      }),
    );

    const currentCount = resp.Item ? parseInt(unmarshall(resp.Item).count || "0", 10) : 0;
    const newCount = currentCount + 1;

    // Update count in DynamoDB
    await dynamo.send(
      new PutItemCommand({
        TableName: config.STATE_TABLE,
        Item: marshall({
          stateKey,
          count: newCount,
          ttl: now + 60, // TTL 60 seconds from now
        }),
      }),
    );

    logger.debug({ requestId, proxyHost, currentCount, newCount, rateLimit, msg: "Rate limit check" });
    return newCount <= rateLimit;
  } catch (error) {
    logger.error({ requestId, proxyHost, error: error.message, msg: "Error checking rate limit" });
    // On error, allow the request
    return true;
  }
}

/**
 * Check circuit breaker state from DynamoDB
 */
async function checkCircuitBreaker(proxyHost, breakerConfig, requestId) {
  const config = getConfig();
  const stateKey = `breaker:${proxyHost}`;

  try {
    const resp = await dynamo.send(
      new GetItemCommand({
        TableName: config.STATE_TABLE,
        Key: { stateKey: { S: stateKey } },
      }),
    );

    if (!resp.Item) {
      // No state yet, circuit is closed
      return { isOpen: false, state: { errors: 0, openSince: 0 } };
    }

    const item = unmarshall(resp.Item);
    const openSince = parseInt(item.openSince || "0", 10);
    const errors = parseInt(item.errors || "0", 10);

    if (openSince > 0) {
      const cooldownMs = (breakerConfig.cooldownSeconds || 60) * 1000;
      if (Date.now() - openSince < cooldownMs) {
        // Circuit is still open
        logger.debug({ requestId, proxyHost, openSince, msg: "Circuit breaker is open" });
        return { isOpen: true, state: { errors, openSince } };
      } else {
        // Cooldown expired, reset to half-open
        logger.info({ requestId, proxyHost, msg: "Circuit breaker cooldown expired, trying half-open" });
        return { isOpen: false, state: { errors: 0, openSince: 0 } };
      }
    }

    return { isOpen: false, state: { errors, openSince } };
  } catch (error) {
    logger.error({ requestId, proxyHost, error: error.message, msg: "Error checking circuit breaker" });
    // On error, assume circuit is closed
    return { isOpen: false, state: { errors: 0, openSince: 0 } };
  }
}

/**
 * Update circuit breaker state in DynamoDB based on response
 */
async function updateCircuitBreaker(proxyHost, breakerState, breakerConfig, statusCode, latencyMs, requestId) {
  const config = getConfig();
  const stateKey = `breaker:${proxyHost}`;
  const errorThreshold = breakerConfig.errorThreshold || 10;
  const latencyThreshold = breakerConfig.latencyMs || 5000;

  let newErrors = breakerState.errors;
  let newOpenSince = breakerState.openSince;

  // Check if response indicates failure
  if (statusCode >= 500) {
    newErrors += 1;
    if (newErrors >= errorThreshold) {
      newOpenSince = Date.now();
      logger.warn({ requestId, proxyHost, errors: newErrors, msg: "Circuit breaker opened due to error threshold" });
    }
  } else if (latencyMs > latencyThreshold) {
    newErrors += 1;
    if (newErrors >= errorThreshold) {
      newOpenSince = Date.now();
      logger.warn({ requestId, proxyHost, latency: latencyMs, msg: "Circuit breaker opened due to latency threshold" });
    }
  } else {
    // Success - gradually reduce error count
    newErrors = Math.max(0, newErrors - 1);
  }

  try {
    await dynamo.send(
      new PutItemCommand({
        TableName: config.STATE_TABLE,
        Item: marshall({
          stateKey,
          errors: newErrors,
          openSince: newOpenSince,
          ttl: Math.floor(Date.now() / 1000) + 3600, // TTL 1 hour from now
        }),
      }),
    );
    logger.debug({ requestId, proxyHost, newErrors, newOpenSince, msg: "Updated circuit breaker state" });
  } catch (error) {
    logger.error({ requestId, proxyHost, error: error.message, msg: "Error updating circuit breaker state" });
  }
}

/**
 * Perform the proxied HTTP request
 */
function performProxyRequest(url, requestOptions, body, requestId) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = url.protocol === "https:" ? https : http;

    const req = client.request(url, requestOptions, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => {
        const latencyMs = Date.now() - startTime;
        const statusCode = res.statusCode;

        logger.info({
          requestId,
          url: url.href,
          method: requestOptions.method,
          statusCode,
          latencyMs,
          msg: "Proxied request completed",
        });

        // Build response headers
        const responseHeaders = { ...res.headers };
        responseHeaders["x-proxy-latency-ms"] = String(latencyMs);

        resolve({
          statusCode,
          body: responseBody,
          headers: responseHeaders,
          latencyMs,
        });
      });
    });

    req.on("error", (err) => {
      const latencyMs = Date.now() - startTime;
      logger.error({
        requestId,
        url: url.href,
        error: err.message,
        latencyMs,
        msg: "Proxied request failed",
      });

      resolve({
        statusCode: 502,
        body: JSON.stringify({ message: "Bad Gateway", error: err.message }),
        headers: { "content-type": "application/json" },
        latencyMs,
        isError: true,
      });
    });

    // Set a timeout for the request
    req.setTimeout(30000, () => {
      req.destroy();
      logger.error({ requestId, url: url.href, msg: "Proxied request timed out" });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Main Lambda handler
 */
export async function handler(event) {
  const { request, requestId } = extractRequest(event);
  const host = event.headers?.host || event.headers?.Host;

  logger.info({ requestId, host, path: event.rawPath, msg: "Processing proxy request" });

  if (!host) {
    return http400BadRequestResponse({ request, message: "Missing host header" });
  }

  // Fetch proxy configuration from environment
  const config = getProxyConfig(host);
  if (!config) {
    logger.warn({ requestId, host, msg: "Unknown proxy host" });
    return httpResponse(404, { message: "Unknown proxy host" });
  }

  const { upstreamHost, rateLimitPerSecond, breakerConfig } = config;

  // Check rate limit
  const allowedByRateLimit = await checkRateLimit(host, rateLimitPerSecond, requestId);
  if (!allowedByRateLimit) {
    logger.warn({ requestId, host, msg: "Rate limit exceeded" });
    return httpResponse(429, { message: "Rate limit exceeded" });
  }

  // Check circuit breaker
  const { isOpen, state: breakerState } = await checkCircuitBreaker(host, breakerConfig, requestId);
  if (isOpen) {
    logger.warn({ requestId, host, msg: "Circuit breaker is open" });
    return httpResponse(503, { message: "Upstream service unavailable (circuit breaker open)" });
  }

  // Build upstream URL - normalize and validate
  let baseUrl;
  try {
    baseUrl = new URL(upstreamHost);
  } catch {
    // If upstreamHost is not a complete URL, assume HTTPS
    baseUrl = new URL(`https://${upstreamHost}`);
  }

  const targetPath = event.rawPath || event.requestContext?.http?.path || "/";
  const queryString = event.rawQueryString || "";
  const fullUrl = `${baseUrl.origin}${targetPath}${queryString ? `?${queryString}` : ""}`;

  const url = new URL(fullUrl);

  // Prepare request options - normalize headers to lowercase for case-insensitive removal
  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(event.headers || {})) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  // Replace host header with upstream host
  normalizedHeaders.host = url.host;

  // Remove proxy-specific headers (case-insensitive)
  delete normalizedHeaders["x-forwarded-for"];
  delete normalizedHeaders["x-forwarded-proto"];
  delete normalizedHeaders["x-forwarded-port"];

  const requestOptions = {
    method: event.requestContext?.http?.method || "GET",
    headers: normalizedHeaders,
  };

  // Perform the proxied request
  const proxyResponse = await performProxyRequest(url, requestOptions, event.body, requestId);

  // Update circuit breaker state
  await updateCircuitBreaker(host, breakerState, breakerConfig, proxyResponse.statusCode, proxyResponse.latencyMs, requestId);

  // Return response
  if (proxyResponse.isError) {
    return httpResponse(502, { message: "Bad Gateway" });
  }

  return {
    statusCode: proxyResponse.statusCode,
    headers: {
      ...proxyResponse.headers,
      "x-request-id": requestId,
    },
    body: proxyResponse.body,
  };
}
