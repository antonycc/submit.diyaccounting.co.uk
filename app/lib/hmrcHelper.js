// app/lib/hmrcHelper.js

import { v4 as uuidv4 } from "uuid";
import logger, { context } from "./logger.js";
import { BundleEntitlementError } from "./bundleEnforcement.js";
import { http400BadRequestResponse, http500ServerErrorResponse, http403ForbiddenResponse } from "./responses.js";
import { putHmrcApiRequest } from "./dynamoDbHmrcApiRequestStore.js";

export function getHmrcBaseUrl(hmrcAccount) {
  // TODO: Ensure we always have these when otherwise stable and remove defaults
  return hmrcAccount === "sandbox"
    ? process.env.HMRC_SANDBOX_BASE_URI || "https://test-api.service.hmrc.gov.uk"
    : process.env.HMRC_BASE_URI || "https://api.service.hmrc.gov.uk";
}

export function buildHmrcHeaders(accessToken, govClientHeaders = {}, testScenario = null) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${accessToken}`,
    ...govClientHeaders,
  };

  // Add Gov-Test-Scenario header // && isSandboxBase(getHmrcBaseUrl()) if provided and we're in sandbox
  if (testScenario) {
    headers["Gov-Test-Scenario"] = testScenario;
  }

  return headers;
}

export class UnauthorizedTokenError extends Error {
  constructor(message = "Unauthorized - invalid or expired HMRC access token") {
    super(message);
    this.name = "UnauthorizedTokenError";
  }
}

export function extractHmrcAccessTokenFromLambdaEvent(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split(" ")[1];
}

export function validateHmrcAccessToken(hmrcAccessToken) {
  // Test hook to force Unauthorized for coverage
  if (process.env.TEST_FORCE_UNAUTHORIZED_TOKEN === "true") {
    throw new UnauthorizedTokenError();
  }
  // Validate access token format
  const tokenValidation = {
    hasAccessToken: !!hmrcAccessToken,
    accessTokenLength: hmrcAccessToken ? hmrcAccessToken.length : 0,
    accessTokenPrefix: hmrcAccessToken ? hmrcAccessToken.substring(0, 8) + "..." : "none",
    isValidFormat: hmrcAccessToken && typeof hmrcAccessToken === "string" && hmrcAccessToken.length > 10,
  };
  logger.info({
    message: "Validating access token",
    tokenValidation,
  });
  if (!hmrcAccessToken || typeof hmrcAccessToken !== "string" || hmrcAccessToken.length < 2) {
    logger.error({
      message: "Invalid access token provided",
      tokenValidation,
      error: "Access token is missing, not a string, or too short",
    });
    // Keep existing behavior for tests: throw a generic Error to produce HTTP 400
    throw new Error("Invalid access token provided");
  }
}

export async function hmrcHttpGet(endpoint, accessToken, govClientHeaders = {}, testScenario = null, hmrcAccount, queryParams = {}) {
  const baseUrl = getHmrcBaseUrl(hmrcAccount);
  // Sanitize query params: drop undefined, null, and blank strings
  const cleanParams = Object.fromEntries(
    Object.entries(queryParams || {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ""),
  );
  const queryString = new URLSearchParams(cleanParams).toString();
  // eslint-disable-next-line sonarjs/no-nested-template-literals
  const url = `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ""}`;

  const headers = buildHmrcHeaders(accessToken, govClientHeaders, testScenario);
  // Provide request correlation header to HMRC
  if (context.get("requestId")) headers["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) headers["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) headers["traceparent"] = context.get("traceparent");

  logger.info({
    message: `Request to GET ${url}`,
    url,
    headers: Object.keys(headers),
    testScenario,
    environment: {
      hmrcBase: baseUrl,
      nodeEnv: process.env.NODE_ENV,
    },
  });

  // Add a conservative timeout to avoid hung connections
  const timeoutMs = 20000;
  let hmrcResponse;
  if (timeoutMs && Number(timeoutMs) > 0) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(timeoutMs));
    try {
      hmrcResponse = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } else {
    hmrcResponse = await fetch(url, {
      method: "GET",
      headers,
    });
  }

  const hmrcResponseBody = await hmrcResponse.json().catch(() => ({}));

  logger.info({
    message: `Response from GET ${url}`,
    url,
    status: hmrcResponse.status,
    hmrcResponseBody,
  });

  return {
    ok: hmrcResponse.ok,
    status: hmrcResponse.status,
    data: hmrcResponseBody,
    response: hmrcResponse,
  };
}

export async function hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub) {
  let hmrcResponse;
  const timeoutEnv = 20000;
  const httpRequest = {
    method: "POST",
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
      ...(context.get("requestId") ? { "x-request-id": context.get("requestId") } : {}),
      ...(context.get("amznTraceId") ? { "x-amzn-trace-id": context.get("amznTraceId") } : {}),
      ...(context.get("traceparent") ? { traceparent: context.get("traceparent") } : {}),
    },
    body: JSON.stringify(hmrcRequestBody),
  };
  let duration = 0;
  // TODO: Remove this optionality and always have a timeout
  if (timeoutEnv && Number(timeoutEnv) > 0) {
    const controller = new AbortController();
    const timeoutMs = Number(timeoutEnv);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const startTime = Date.now();
      hmrcResponse = await fetch(hmrcRequestUrl, { ...httpRequest, signal: controller.signal });
      duration = Date.now() - startTime;
    } finally {
      clearTimeout(timeout);
    }
  } else {
    const startTime = Date.now();
    hmrcResponse = await fetch(hmrcRequestUrl, httpRequest);
    duration = Date.now() - startTime;
  }
  const hmrcResponseBody = await hmrcResponse.json();

  const httpResponse = {
    statusCode: hmrcResponse.status,
    headers: hmrcResponse.headers ?? {},
    body: hmrcResponseBody,
  };
  const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
  if (userSubOrUuid) {
    try {
      await putHmrcApiRequest(auditForUserSub, { url: hmrcRequestUrl, httpRequest, httpResponse, duration });
    } catch (auditError) {
      logger.error({
        message: "Error auditing HMRC API request/response to DynamoDB",
        error: auditError.message,
        stack: auditError.stack,
      });
    }
  }

  return { hmrcResponse, hmrcResponseBody };
}

export function generateHmrcErrorResponseWithRetryAdvice(request, hmrcResponse, hmrcResponseBody, hmrcAccessToken, responseHeaders) {
  // Attach parsed body for downstream error helpers
  hmrcResponse.data = hmrcResponseBody;
  if (hmrcResponse.status === 403) {
    return http403ForbiddenFromHmrcResponse(hmrcAccessToken, hmrcResponse, responseHeaders);
  } else if (hmrcResponse.status === 404) {
    return http404NotFoundFromHmrcResponse(request, hmrcResponse, responseHeaders);
  } else if (hmrcResponse.status === 429) {
    const retryAfter =
      (hmrcResponse.headers &&
        (hmrcResponse.headers.get ? hmrcResponse.headers.get("Retry-After") : hmrcResponse.headers["retry-after"])) ||
      undefined;
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Upstream rate limited. Please retry later.",
      error: { hmrcResponseCode: hmrcResponse.status, responseBody: hmrcResponse.data, retryAfter },
    });
  } else {
    return http500ServerErrorFromHmrcResponse(request, hmrcResponse, responseHeaders);
  }
}

export function http500ServerErrorFromBundleEnforcement(error, request) {
  if (error instanceof BundleEntitlementError) {
    logger.error({
      message: "Bundle enforcement failed",
      error: error.message,
      details: error.details,
    });
    return http500ServerErrorResponse({
      request,
      message: error.message,
      error: error.details,
    });
  }
  // Re-throw unexpected errors
  logger.error({
    message: "Unexpected error during bundle enforcement",
    error: error.message,
    stack: error.stack,
  });
  return http500ServerErrorResponse({
    request,
    message: "Authorization failure while checking entitlements",
    error: { message: error.message || String(error) },
  });
}

export function http403ForbiddenFromBundleEnforcement(error, request) {
  // Only intended for BundleEntitlementError, fall back to 500 otherwise
  if (!(error instanceof BundleEntitlementError)) {
    return http500ServerErrorFromBundleEnforcement(error, request);
  }
  logger.warn({
    message: "Forbidden - bundle entitlement missing or insufficient",
    error: error.message,
    details: error.details,
  });
  return http403ForbiddenResponse({
    request,
    message: "Forbidden - missing or insufficient bundle entitlement",
    error: { code: error.details?.code || "BUNDLE_ENTITLEMENT_REQUIRED", ...error.details },
  });
}

export function http403ForbiddenFromHmrcResponse(hmrcAccessToken, hmrcResponse, govClientHeaders) {
  const hmrcAccessTokenData = {
    tokenInfo: {
      hasAccessToken: !!hmrcAccessToken,
      accessTokenLength: hmrcAccessToken ? hmrcAccessToken.length : 0,
      accessTokenPrefix: hmrcAccessToken ? hmrcAccessToken.substring(0, 8) + "..." : "none",
    },
    requestHeaders: {
      authorization: hmrcAccessToken ? `Bearer ${hmrcAccessToken.substring(0, 8)}...` : "missing",
      govClientHeadersCount: Object.keys(govClientHeaders || {}).length,
      govClientHeaderKeys: Object.keys(govClientHeaders || {}),
    },
  };
  logger.warn({
    message: "Forbidden - Access token may be invalid, expired, or lack required permissions",
    hmrcAccessTokenData,
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });
  return http400BadRequestResponse({
    hmrcAccessTokenData,
    headers: { ...govClientHeaders },
    message: "Forbidden - Access token may be invalid, expired, or lack required permissions",
    error: {
      hmrcResponseCode: hmrcResponse.status,
      responseBody: hmrcResponse.data,
    },
  });
}

export function http404NotFoundFromHmrcResponse(request, hmrcResponse, govClientHeaders) {
  logger.warn({
    message: "Not found for request",
    request,
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });
  return http400BadRequestResponse({
    request,
    headers: { ...govClientHeaders },
    message: "Not found for the specified query",
    error: {
      hmrcResponseCode: hmrcResponse.status,
      responseBody: hmrcResponse.data,
    },
  });
}

export function http500ServerErrorFromHmrcResponse(request, hmrcResponse, govClientHeaders) {
  logger.error({
    message: "HMRC request failed for request",
    request,
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });
  return http500ServerErrorResponse({
    request,
    headers: { ...govClientHeaders },
    message: "HMRC request failed",
    error: {
      hmrcResponseCode: hmrcResponse.status,
      responseBody: hmrcResponse.data,
    },
  });
}
