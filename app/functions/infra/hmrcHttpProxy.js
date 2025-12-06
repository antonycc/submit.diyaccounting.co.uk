// app/functions/infra/hmrcHttpProxy.js

import { createLogger, context } from "../../lib/logger.js";
import { http400BadRequestResponse } from "../../lib/httpResponseHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
// Import via lib shim so tests can vi.doMock("@app/lib/httpProxy.js") reliably
import { proxyRequestWithRedirects } from "../../lib/httpProxy.js";
import { checkRateLimit, loadBreakerState, saveBreakerState } from "../../data/dynamoDbBreakerRepository.js";

const logger = createLogger({ source: "app/functions/infra/hmrcHttpProxy.js" });

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
 * Lambda handler (for AWS Lambda + API Gateway).
 */
export async function handler(event) {
  // Correlation extraction: seed context from inbound headers
  const inboundHeaders = event.headers || {};
  const requestIdHeader = inboundHeaders["x-request-id"] || inboundHeaders["X-Request-Id"] || null;
  const correlationIdHeader = inboundHeaders["x-correlationid"] || inboundHeaders["X-CorrelationId"] || null;
  if (requestIdHeader) context.set("requestId", requestIdHeader);
  if (correlationIdHeader || requestIdHeader) context.set("correlationId", correlationIdHeader || requestIdHeader);
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
    urlProtocolHostAndPath = `${protocol}://${host}${path}`;
  } else if (host && path) {
    urlProtocolHostAndPath = `${host}${path}`;
  } else if (path) {
    urlProtocolHostAndPath = `${path}`;
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
  try {
    const allowed = await checkRateLimit(mapping.prefix, getRateLimitPerSecond(), requestId);
    if (!allowed) {
      logger.warn({ requestId, mapping, msg: `Rate limit ${getRateLimitPerSecond()} exceeded, rejecting request` });
      return { statusCode: 429, headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Rate limit exceeded" }) };
    } else {
      logger.info({ requestId, mapping, msg: "Rate limit check passed, proceeding" });
    }
  } catch (err) {
    logger.error({ requestId, mapping, err: err.stack ?? err.message, msg: "Rate limit check failed, allowing request" });
  }

  // Circuit breaker
  let breaker;
  try {
    breaker = await loadBreakerState(mapping.prefix);
    if (breaker.openSince && Date.now() - breaker.openSince < getBreakerCooldownSeconds() * 1000) {
      logger.warn({ requestId, mappingPrefix: mapping.prefix, msg: "Circuit breaker open, rejecting request" });
      return {
        statusCode: 503,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Upstream unavailable (circuit open)" }),
      };
    } else if (breaker.openSince) {
      logger.info({ requestId, mappingPrefix: mapping.prefix, msg: "Circuit breaker cooldown passed, closing breaker" });
      breaker = { errors: 0, openSince: 0 };
    } else {
      logger.info({ requestId, mapping, breaker, msg: "Circuit breaker closed, proceeding" });
    }
  } catch (err) {
    logger.error({ requestId, mapping, err: err.stack ?? err.message, msg: "Circuit breaker load failed, proceeding closed" });
    breaker = { errors: 0, openSince: 0 };
  }

  // Build full upstream URL
  // const suffix = path.substring(mapping.prefix.length) || "/";
  const targetUrl = new URL(targetBase.toString() + (event.rawQueryString ? `?${event.rawQueryString}` : ""));
  logger.info({ requestId, mappingPrefix: mapping.prefix, targetUrl: targetUrl.toString(), msg: "Proxying request to upstream" });

  // Prepare request options
  const headers = { ...event.headers, host: targetBase.host };
  // Ensure x-correlationid is forwarded upstream
  if (!headers["x-correlationid"] && !headers["X-CorrelationId"]) {
    const cid = context.get("correlationId") || context.get("requestId");
    if (cid) headers["x-correlationid"] = cid;
  }
  const options = { method, headers };

  const start = Date.now();
  const resp = await proxyRequestWithRedirects(targetUrl, options, event.body);
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
  // Ensure proxy reply includes x-correlationid back to caller
  const replyHeaders = { ...(resp.headers || {}) };
  if (!replyHeaders["x-correlationid"] && !replyHeaders["X-CorrelationId"]) {
    const cid = headers["x-correlationid"] || context.get("correlationId") || requestId;
    if (cid) replyHeaders["x-correlationid"] = cid;
  }
  return {
    statusCode: resp.statusCode,
    headers: replyHeaders,
    body: resp.body,
  };
}

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
