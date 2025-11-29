// app/functions/proxy/outboundProxyHandler.js

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import http from "http";
import https from "https";
import logger, { context } from "../../lib/logger.js";
import { extractRequest, http400BadRequestResponse, http500ServerErrorResponse } from "../../lib/responses.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

const dynamo = new DynamoDBClient({});
const CONFIG_TABLE = process.env.CONFIG_TABLE_NAME || "ProxyConfigTable";

// In-memory state per Lambda container
const state = {
  rateBuckets: new Map(), // proxyHost → { ts: timestamp, count: number }
  breakerState: new Map(), // proxyHost → { openSince: timestamp | null, errors: number }
  configCache: new Map(), // proxyHost → { config, timestamp }
};

const CONFIG_CACHE_TTL_MS = 60000; // 1 minute cache for config

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
 * Fetch proxy configuration from DynamoDB with caching
 */
async function getProxyConfig(proxyHost, requestId) {
  const now = Date.now();
  const cached = state.configCache.get(proxyHost);

  // Return cached config if still valid
  if (cached && now - cached.timestamp < CONFIG_CACHE_TTL_MS) {
    logger.debug({ requestId, proxyHost, msg: "Using cached proxy configuration" });
    return cached.config;
  }

  // Fetch from DynamoDB
  try {
    const resp = await dynamo.send(
      new GetItemCommand({
        TableName: CONFIG_TABLE,
        Key: { proxyHost: { S: proxyHost } },
      }),
    );

    if (!resp.Item) {
      return null;
    }

    const item = unmarshall(resp.Item);
    const config = {
      upstreamHost: item.upstreamHost,
      rateLimitPerSecond: item.rateLimitPerSecond || 10,
      breakerConfig: item.breakerConfig || {},
    };

    // Cache the config
    state.configCache.set(proxyHost, { config, timestamp: now });
    logger.info({ requestId, proxyHost, config, msg: "Fetched and cached proxy configuration" });

    return config;
  } catch (error) {
    logger.error({ requestId, proxyHost, error: error.message, msg: "Error fetching proxy configuration" });
    return null;
  }
}

/**
 * Check rate limit using token bucket algorithm
 */
function checkRateLimit(proxyHost, rateLimit) {
  const now = Date.now() / 1000;
  const bucket = state.rateBuckets.get(proxyHost) || { ts: now, count: 0 };

  // Reset bucket if more than 1 second has passed
  if (now - bucket.ts >= 1) {
    bucket.ts = now;
    bucket.count = 0;
  }

  bucket.count += 1;
  state.rateBuckets.set(proxyHost, bucket);

  return bucket.count <= rateLimit;
}

/**
 * Check circuit breaker state
 */
function checkCircuitBreaker(proxyHost, breakerConfig) {
  const breaker = state.breakerState.get(proxyHost) || { openSince: null, errors: 0 };

  if (breaker.openSince) {
    const cooldownMs = (breakerConfig.cooldownSeconds || 60) * 1000;
    if (Date.now() - breaker.openSince < cooldownMs) {
      // Circuit is still open
      return { isOpen: true, breaker };
    } else {
      // Try half-open: reset state
      breaker.openSince = null;
      breaker.errors = 0;
      state.breakerState.set(proxyHost, breaker);
    }
  }

  return { isOpen: false, breaker };
}

/**
 * Update circuit breaker state based on response
 */
function updateCircuitBreaker(proxyHost, breaker, breakerConfig, statusCode, latencyMs) {
  const errorThreshold = breakerConfig.errorThreshold || 10;
  const latencyThreshold = breakerConfig.latencyMs || 5000;

  // Check if response indicates failure
  if (statusCode >= 500) {
    breaker.errors += 1;
    if (breaker.errors >= errorThreshold) {
      breaker.openSince = Date.now();
      logger.warn({ proxyHost, errors: breaker.errors, msg: "Circuit breaker opened due to error threshold" });
    }
  } else if (latencyMs > latencyThreshold) {
    breaker.errors += 1;
    if (breaker.errors >= errorThreshold) {
      breaker.openSince = Date.now();
      logger.warn({ proxyHost, latency: latencyMs, msg: "Circuit breaker opened due to latency threshold" });
    }
  } else {
    // Success - gradually reduce error count
    breaker.errors = Math.max(0, breaker.errors - 1);
  }

  state.breakerState.set(proxyHost, breaker);
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

  // Fetch proxy configuration
  const config = await getProxyConfig(host, requestId);
  if (!config) {
    logger.warn({ requestId, host, msg: "Unknown proxy host" });
    return httpResponse(404, { message: "Unknown proxy host" });
  }

  const { upstreamHost, rateLimitPerSecond, breakerConfig } = config;

  // Check rate limit
  if (!checkRateLimit(host, rateLimitPerSecond)) {
    logger.warn({ requestId, host, msg: "Rate limit exceeded" });
    return httpResponse(429, { message: "Rate limit exceeded" });
  }

  // Check circuit breaker
  const { isOpen, breaker } = checkCircuitBreaker(host, breakerConfig);
  if (isOpen) {
    logger.warn({ requestId, host, msg: "Circuit breaker is open" });
    return httpResponse(503, { message: "Upstream service unavailable (circuit breaker open)" });
  }

  // Build upstream URL
  const upstreamUrl = upstreamHost.startsWith("http://") || upstreamHost.startsWith("https://") ? upstreamHost : `https://${upstreamHost}`;

  const targetPath = event.rawPath || event.requestContext?.http?.path || "/";
  const queryString = event.rawQueryString || "";
  const fullUrl = `${upstreamUrl}${targetPath}${queryString ? `?${queryString}` : ""}`;

  const url = new URL(fullUrl);

  // Prepare request options
  const requestOptions = {
    method: event.requestContext?.http?.method || "GET",
    headers: {
      ...event.headers,
      host: url.host, // Replace host header with upstream host
    },
  };

  // Remove proxy-specific headers
  delete requestOptions.headers["x-forwarded-for"];
  delete requestOptions.headers["x-forwarded-proto"];
  delete requestOptions.headers["x-forwarded-port"];

  // Perform the proxied request
  const proxyResponse = await performProxyRequest(url, requestOptions, event.body, requestId);

  // Update circuit breaker state
  updateCircuitBreaker(host, breaker, breakerConfig, proxyResponse.statusCode, proxyResponse.latencyMs);

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
