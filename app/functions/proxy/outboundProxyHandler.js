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

  logger.info({ requestId, proxyHost, rateLimit, stateKey, msg: "Checking rate limit" });

  try {
    // Get current count for this second
    logger.info({ requestId, tableName: config.STATE_TABLE, stateKey, msg: "Querying DynamoDB for rate limit state" });
    const resp = await dynamo.send(
      new GetItemCommand({
        TableName: config.STATE_TABLE,
        Key: { stateKey: { S: stateKey } },
      }),
    );

    const currentCount = resp.Item ? parseInt(unmarshall(resp.Item).count || "0", 10) : 0;
    const newCount = currentCount + 1;

    logger.info({ requestId, proxyHost, currentCount, newCount, rateLimit, msg: "Rate limit state retrieved" });

    // Update count in DynamoDB
    logger.info({ requestId, tableName: config.STATE_TABLE, stateKey, newCount, msg: "Updating rate limit count in DynamoDB" });
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

    const isAllowed = newCount <= rateLimit;
    logger.info({ requestId, proxyHost, currentCount, newCount, rateLimit, isAllowed, msg: "Rate limit check completed" });
    return isAllowed;
  } catch (error) {
    logger.error({ requestId, proxyHost, error: error.message, stack: error.stack, msg: "Error checking rate limit" });
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

  logger.info({ requestId, proxyHost, breakerConfig, stateKey, msg: "Checking circuit breaker state" });

  try {
    logger.info({ requestId, tableName: config.STATE_TABLE, stateKey, msg: "Querying DynamoDB for circuit breaker state" });
    const resp = await dynamo.send(
      new GetItemCommand({
        TableName: config.STATE_TABLE,
        Key: { stateKey: { S: stateKey } },
      }),
    );

    if (!resp.Item) {
      // No state yet, circuit is closed
      logger.info({ requestId, proxyHost, msg: "No circuit breaker state found, circuit is closed" });
      return { isOpen: false, state: { errors: 0, openSince: 0 } };
    }

    const item = unmarshall(resp.Item);
    const openSince = parseInt(item.openSince || "0", 10);
    const errors = parseInt(item.errors || "0", 10);

    logger.info({ requestId, proxyHost, errors, openSince, msg: "Circuit breaker state retrieved" });

    if (openSince > 0) {
      const cooldownMs = (breakerConfig.cooldownSeconds || 60) * 1000;
      const elapsedMs = Date.now() - openSince;
      if (elapsedMs < cooldownMs) {
        // Circuit is still open
        logger.warn({ 
          requestId, 
          proxyHost, 
          openSince, 
          elapsedMs, 
          cooldownMs, 
          remainingMs: cooldownMs - elapsedMs,
          msg: "Circuit breaker is OPEN - rejecting request" 
        });
        return { isOpen: true, state: { errors, openSince } };
      } else {
        // Cooldown expired, reset to half-open
        logger.info({ 
          requestId, 
          proxyHost, 
          elapsedMs, 
          cooldownMs, 
          msg: "Circuit breaker cooldown expired, attempting half-open state" 
        });
        return { isOpen: false, state: { errors: 0, openSince: 0 } };
      }
    }

    logger.info({ requestId, proxyHost, errors, msg: "Circuit breaker is closed" });
    return { isOpen: false, state: { errors, openSince } };
  } catch (error) {
    logger.error({ requestId, proxyHost, error: error.message, stack: error.stack, msg: "Error checking circuit breaker" });
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

  logger.info({ 
    requestId, 
    proxyHost, 
    statusCode, 
    latencyMs, 
    currentErrors: breakerState.errors,
    errorThreshold,
    latencyThreshold,
    msg: "Evaluating circuit breaker conditions" 
  });

  // Check if response indicates failure
  if (statusCode >= 500) {
    newErrors += 1;
    logger.warn({ requestId, proxyHost, statusCode, errors: newErrors, errorThreshold, msg: "Server error detected, incrementing error count" });
    if (newErrors >= errorThreshold) {
      newOpenSince = Date.now();
      logger.error({ 
        requestId, 
        proxyHost, 
        errors: newErrors, 
        errorThreshold,
        msg: "ERROR THRESHOLD REACHED - Circuit breaker OPENING" 
      });
    }
  } else if (latencyMs > latencyThreshold) {
    newErrors += 1;
    logger.warn({ 
      requestId, 
      proxyHost, 
      latencyMs, 
      latencyThreshold, 
      errors: newErrors, 
      errorThreshold,
      msg: "High latency detected, incrementing error count" 
    });
    if (newErrors >= errorThreshold) {
      newOpenSince = Date.now();
      logger.error({ 
        requestId, 
        proxyHost, 
        latencyMs, 
        latencyThreshold,
        errors: newErrors,
        msg: "LATENCY THRESHOLD REACHED - Circuit breaker OPENING" 
      });
    }
  } else {
    // Success - gradually reduce error count
    const previousErrors = newErrors;
    newErrors = Math.max(0, newErrors - 1);
    if (previousErrors > 0) {
      logger.info({ 
        requestId, 
        proxyHost, 
        previousErrors, 
        newErrors, 
        statusCode,
        msg: "Successful response, reducing error count" 
      });
    }
  }

  try {
    logger.info({ 
      requestId, 
      tableName: config.STATE_TABLE, 
      stateKey, 
      newErrors, 
      newOpenSince: newOpenSince > 0 ? new Date(newOpenSince).toISOString() : "closed",
      msg: "Updating circuit breaker state in DynamoDB" 
    });
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
    logger.info({ requestId, proxyHost, newErrors, isOpen: newOpenSince > 0, msg: "Circuit breaker state updated successfully" });
  } catch (error) {
    logger.error({ requestId, proxyHost, error: error.message, stack: error.stack, msg: "Error updating circuit breaker state" });
  }
}

/**
 * Perform the proxied HTTP request
 */
function performProxyRequest(url, requestOptions, body, requestId) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = url.protocol === "https:" ? https : http;

    logger.info({
      requestId,
      url: url.href,
      method: requestOptions.method,
      protocol: url.protocol,
      hasBody: !!body,
      bodyLength: body ? body.length : 0,
      msg: "Initiating proxied HTTP request to upstream",
    });

    const req = client.request(url, requestOptions, (res) => {
      logger.info({
        requestId,
        url: url.href,
        statusCode: res.statusCode,
        msg: "Received response from upstream, reading body",
      });

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
          bodyLength: responseBody.length,
          msg: "Proxied request completed successfully",
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
        stack: err.stack,
        latencyMs,
        msg: "Proxied request FAILED with error",
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
      logger.error({ requestId, url: url.href, timeoutMs: 30000, msg: "Proxied request TIMED OUT" });
    });

    if (body) {
      logger.info({ requestId, bodyLength: body.length, msg: "Writing request body to upstream" });
      req.write(body);
    }
    req.end();
    logger.info({ requestId, msg: "Request sent to upstream, waiting for response" });
  });
}

/**
 * Main Lambda handler
 */
export async function handler(event) {
  const { request, requestId } = extractRequest(event);
  const host = event.headers?.host || event.headers?.Host;
  const method = event.requestContext?.http?.method || "GET";
  const path = event.rawPath || event.requestContext?.http?.path || "/";

  logger.info({ 
    requestId, 
    host, 
    method,
    path, 
    queryString: event.rawQueryString,
    hasBody: !!event.body,
    msg: "Started processing proxy request" 
  });

  if (!host) {
    logger.error({ requestId, msg: "Missing host header in request" });
    return http400BadRequestResponse({ request, message: "Missing host header" });
  }

  // Fetch proxy configuration from environment
  logger.info({ requestId, host, msg: "Fetching proxy configuration" });
  const config = getProxyConfig(host);
  if (!config) {
    logger.error({ requestId, host, msg: "Unknown proxy host - no configuration found" });
    return httpResponse(404, { message: "Unknown proxy host" });
  }

  const { upstreamHost, rateLimitPerSecond, breakerConfig } = config;
  logger.info({ 
    requestId, 
    host, 
    upstreamHost, 
    rateLimitPerSecond, 
    breakerConfig,
    msg: "Proxy configuration loaded" 
  });

  // Check rate limit
  const allowedByRateLimit = await checkRateLimit(host, rateLimitPerSecond, requestId);
  if (!allowedByRateLimit) {
    logger.error({ requestId, host, rateLimitPerSecond, msg: "REJECTED - Rate limit exceeded" });
    return httpResponse(429, { message: "Rate limit exceeded" });
  }
  logger.info({ requestId, host, msg: "Rate limit check passed" });

  // Check circuit breaker
  const { isOpen, state: breakerState } = await checkCircuitBreaker(host, breakerConfig, requestId);
  if (isOpen) {
    logger.error({ requestId, host, breakerState, msg: "REJECTED - Circuit breaker is open" });
    return httpResponse(503, { message: "Upstream service unavailable (circuit breaker open)" });
  }
  logger.info({ requestId, host, breakerState, msg: "Circuit breaker check passed" });

  // Build upstream URL - normalize and validate
  logger.info({ requestId, upstreamHost, path, msg: "Building upstream URL" });
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
  logger.info({ requestId, fullUrl: url.href, msg: "Upstream URL constructed" });

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

  logger.info({ requestId, method: requestOptions.method, headerCount: Object.keys(normalizedHeaders).length, msg: "Request options prepared" });

  // Perform the proxied request
  const proxyResponse = await performProxyRequest(url, requestOptions, event.body, requestId);

  // Update circuit breaker state
  logger.info({ requestId, statusCode: proxyResponse.statusCode, latencyMs: proxyResponse.latencyMs, msg: "Updating circuit breaker state based on response" });
  await updateCircuitBreaker(host, breakerState, breakerConfig, proxyResponse.statusCode, proxyResponse.latencyMs, requestId);

  // Return response
  if (proxyResponse.isError) {
    logger.error({ requestId, statusCode: 502, msg: "Returning Bad Gateway response" });
    return httpResponse(502, { message: "Bad Gateway" });
  }

  logger.info({ 
    requestId, 
    statusCode: proxyResponse.statusCode, 
    latencyMs: proxyResponse.latencyMs,
    bodyLength: proxyResponse.body?.length || 0,
    msg: "Proxy request completed successfully, returning response" 
  });

  return {
    statusCode: proxyResponse.statusCode,
    headers: {
      ...proxyResponse.headers,
      "x-request-id": requestId,
    },
    body: proxyResponse.body,
  };
}
