// app/lib/responses.js

import { v4 as uuidv4 } from "uuid";
import { logger, context } from "./logger.js";
import { putHmrcApiRequest } from "./dynamoDbHmrcApiRequestStore.js";
import { fetchWithCircuitBreaker, CircuitBreakerOpenError } from "./circuitBreaker.js";

export function http200OkResponse({ request, headers, data }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  return httpResponse({
    statusCode: 200,
    request,
    headers: merged,
    data,
    levelledLogger: logger.info.bind(logger),
  });
}

export function http400BadRequestResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  return httpResponse({
    statusCode: 400,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.error.bind(logger),
  });
}

export function http500ServerErrorResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  return httpResponse({
    statusCode: 500,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.error.bind(logger),
  });
}

export function http403ForbiddenResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  return httpResponse({
    statusCode: 403,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.warn.bind(logger),
  });
}

export function http401UnauthorizedResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  return httpResponse({
    statusCode: 401,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.warn.bind(logger),
  });
}

function httpResponse({ statusCode, headers, data, request, levelledLogger }) {
  const merged = { ...(headers || {}) };
  // Always provide an x-request-id for client correlation; generate if not supplied
  merged["x-request-id"] = context.get("requestId") || String(Date.now());
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  const response = {
    statusCode: statusCode,
    headers: {
      ...merged,
    },
    body: JSON.stringify({
      ...data,
    }),
  };
  if (request) {
    levelledLogger({ message: "Responding to request with response", request, response });
  } else {
    levelledLogger({ message: "Responding with response", response });
  }
  return response;
}

export function extractRequest(event) {
  let request;
  // Extract correlation headers and set context explicitly to avoid leakage across invocations
  const requestId = event?.requestContext?.requestId || event?.headers?.["x-request-id"] || event?.headers?.["X-Request-Id"] || null;
  const amznTraceId = event?.headers?.["x-amzn-trace-id"] || event?.headers?.["X-Amzn-Trace-Id"] || null;
  const traceparent = event?.headers?.["traceparent"] || event?.headers?.["Traceparent"] || null;
  context.set("requestId", requestId || null);
  context.set("amznTraceId", amznTraceId || null);
  context.set("traceparent", traceparent || null);
  if (event.headers) {
    try {
      let baseRequestUrl;
      if (event.headers.referer) {
        const refererUrl = new URL(event.headers.referer);
        baseRequestUrl = `${refererUrl.protocol}//${refererUrl.host}`;
      } else {
        baseRequestUrl = `https://${event.headers.host || "unknown-host"}`;
      }
      const path = event.rawPath || event.path || event.requestContext?.http?.path || "";
      const queryString = event.rawQueryString || "";
      request = new URL(`${baseRequestUrl}${path}?${queryString}`);
      if (event.queryStringParameters) {
        Object.keys(event.queryStringParameters).forEach((key) => {
          request.searchParams.append(key, event.queryStringParameters[key]);
        });
      }
      logger.info({ message: "Processing request with event", request, event });
    } catch (err) {
      logger.warn({ message: "Error building request URL from event", error: err, event });
      request = "https://unknown-url"; // Fallback URL in case of error
    }
  } else {
    logger.warn({ message: "Event has missing URL path or host header", event });
    request = "https://unknown";
  }
  return { request, requestId, amznTraceId, traceparent };
}

// Helper function to extract client IP from request headers
export function extractClientIPFromHeaders(event) {
  // Try various headers that might contain the client's real IP
  const headers = event.headers || {};
  const possibleIPHeaders = [
    "x-forwarded-for",
    "x-real-ip",
    "x-client-ip",
    "cf-connecting-ip", // Cloudflare
    "x-forwarded",
    "forwarded-for",
    "forwarded",
  ];

  for (const header of possibleIPHeaders) {
    const value = headers[header];
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(",")[0].trim();
      if (ip && ip !== "unknown") {
        return ip;
      }
    }
  }

  // Fallback to source IP from event context
  return event.requestContext?.identity?.sourceIp || "unknown";
}

export function extractBearerTokenFromAuthHeaderInLambdaEvent(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split(" ")[1];
}

export function extractAuthTokenFromXAuthorization(event) {
  const headers = event.headers || {};
  let xAuthHeader = null;

  // Case-insensitive header lookup
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "x-authorization") {
      xAuthHeader = value;
      break;
    }
  }

  if (!xAuthHeader || !xAuthHeader.startsWith("Bearer ")) {
    return null;
  }
  return xAuthHeader.split(" ")[1];
}

export function extractUserFromAuthorizerContext(event) {
  // Support multiple shapes:
  // - HTTP API v2 Lambda authorizer: event.requestContext.authorizer.lambda.jwt.claims
  // - REST API custom authorizer: event.requestContext.authorizer.jwt.claims or flat fields
  // - Backward compatibility: flat fields directly under authorizer or authorizer.lambda
  const authz = event.requestContext?.authorizer;
  if (!authz) return null;

  const ctx = authz.lambda ?? authz;

  // Prefer JWT-style claims if present
  const claims = ctx?.jwt?.claims ?? ctx?.claims;
  if (claims && claims.sub) {
    return {
      sub: claims.sub,
      username: claims["cognito:username"] || claims.username || claims.sub,
      email: claims.email || "",
      scope: claims.scope || claims.scopes || "",
    };
  }

  // Fallback to flat fields (legacy)
  if (ctx && ctx.sub) {
    return {
      sub: ctx.sub,
      username: ctx["cognito:username"] || ctx.username || ctx.sub,
      email: ctx.email || "",
      scope: ctx.scope || ctx.scopes || "",
    };
  }
  return null;
}

export function parseRequestBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch (error) {
    logger.error({
      message: "Failed to parse request body as JSON",
      error: error.message,
      body: event.body,
    });
    return null;
  }
}

export function buildValidationError(request, errorMessages, govClientHeaders = {}) {
  return http400BadRequestResponse({
    request,
    headers: { ...govClientHeaders },
    message: errorMessages.join(", "),
  });
}

export async function performTokenExchange(providerUrl, body, auditForUserSub) {
  const requestHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    ...(context.get("requestId") ? { "x-request-id": context.get("requestId") } : {}),
    ...(context.get("amznTraceId") ? { "x-amzn-trace-id": context.get("amznTraceId") } : {}),
    ...(context.get("traceparent") ? { traceparent: context.get("traceparent") } : {}),
  };
  const requestBody = new URLSearchParams(body);

  logger.info({
    message: `Request to POST ${providerUrl}`,
    url: providerUrl,
    headers: { ...requestHeaders },
    body: requestBody.toString(),
  });

  let duration = 0;
  const httpRequest = {
    method: "POST",
    headers: { ...requestHeaders },
    // Store a plain string for auditing to ensure DynamoDB marshalling works
    // (URLSearchParams is a class instance and not supported by the marshaller)
    body: requestBody.toString(),
  };

  logger.info({ message: "Performing HTTP POST for token exchange", providerUrl });
  const startTime = new Date().getTime();
  let response;
  try {
    // Use circuit breaker for fetch
    response = await fetchWithCircuitBreaker(providerUrl, httpRequest);
    duration = new Date().getTime() - startTime;
  } catch (error) {
    duration = new Date().getTime() - startTime;
    if (error instanceof CircuitBreakerOpenError) {
      logger.error({
        message: "Circuit breaker is OPEN for token exchange",
        providerUrl,
        hostName: error.hostName,
        circuitBreakerState: error.circuitBreakerState,
      });
      // Return error response indicating circuit breaker is open
      return http500ServerErrorResponse({
        request,
        headers,
        message: "Token exchange service is temporarily unavailable due to circuit breaker",
        error: { circuitBreakerOpen: true, hostName: error.hostName },
      });
    }
    throw error;
  }

  let responseTokens;
  try {
    responseTokens = await response.json();
  } catch (err) {
    logger.warn({ message: "Failed to parse response as JSON, attempting text parse", error: err.message });
    try {
      const text = await response.text();
      logger.info({ message: "Response text received", text });
      responseTokens = JSON.parse(text);
    } catch {
      logger.error({ message: "Failed to parse response as text, returning empty tokens" });
      responseTokens = {};
    }
  }

  // Normalise headers to a plain object for DynamoDB marshalling
  let responseHeadersObj = {};
  try {
    if (response && typeof response.headers?.forEach === "function") {
      response.headers.forEach((value, key) => {
        responseHeadersObj[key] = value;
      });
    } else if (response?.headers && typeof response.headers === "object") {
      responseHeadersObj = { ...response.headers };
    }
  } catch {}
  const httpResponse = {
    statusCode: response.status,
    headers: responseHeadersObj,
    body: responseTokens,
  };
  const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
  if (userSubOrUuid) {
    try {
      await putHmrcApiRequest(userSubOrUuid, { url: providerUrl, httpRequest, httpResponse, duration });
    } catch (auditError) {
      logger.error({
        message: "Error auditing HMRC API request/response to DynamoDB",
        error: auditError.message,
        stack: auditError.stack,
      });
    }
  }

  logger.info({
    message: "exchangeClientSecretForAccessToken response",
    responseStatus: response.status,
    responseTokens,
    tokenValidation: {
      hasAccessToken: !!responseTokens.access_token,
      accessTokenLength: responseTokens.access_token ? responseTokens.access_token.length : 0,
      tokenType: responseTokens.token_type,
      scope: responseTokens.scope,
      expiresIn: responseTokens.expires_in,
      hasRefreshToken: !!responseTokens.refresh_token,
    },
  });

  const accessToken = responseTokens.access_token;
  const responseBody = { ...responseTokens };
  delete responseBody.access_token;

  return { accessToken, response: response, responseBody };
}

export async function buildTokenExchangeResponse(request, url, body, auditForUserSub = undefined) {
  const { accessToken, response, responseBody } = await performTokenExchange(url, body, auditForUserSub);

  if (!response.ok) {
    logger.error({
      message: "Token exchange failed",
      responseCode: response.status,
      responseBody,
    });
    return http500ServerErrorResponse({
      request,
      message: "Token exchange failed",
      error: {
        responseCode: response.status,
        responseBody,
      },
    });
  }

  const idToken = responseBody.id_token;
  const refreshToken = responseBody.refresh_token;
  const expiresIn = responseBody.expires_in;
  const tokenType = responseBody.token_type;

  logger.info({
    message: "Token exchange succeeded",
    accessTokenLength: accessToken.length,
    hasIdToken: !!idToken,
    hasRefreshToken: !!refreshToken,
    expiresIn,
    tokenType,
  });
  return http200OkResponse({
    request,
    data: {
      accessToken,
      hmrcAccessToken: accessToken,
      idToken,
      refreshToken,
      expiresIn,
      tokenType,
    },
  });
}
