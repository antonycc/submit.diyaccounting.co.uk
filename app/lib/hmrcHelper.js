// app/lib/hmrcHelper.js

import logger from "./logger.js";
import { BundleEntitlementError } from "./bundleEnforcement.js";
import { http400BadRequestResponse, http500ServerErrorResponse, http403ForbiddenResponse } from "./responses.js";

function isSandboxBase(base) {
  return /\b(test|sandbox)\b/i.test(base || "");
}

/**
 * Build the base URL for HMRC API calls
 */
export function getHmrcBaseUrl() {
  return process.env.HMRC_BASE_URI || "https://test-api.service.hmrc.gov.uk";
}

/**
 * Build common HMRC headers including fraud prevention headers
 */
export function buildHmrcHeaders(accessToken, govClientHeaders = {}, testScenario = null) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${accessToken}`,
    ...govClientHeaders,
  };

  // Add Gov-Test-Scenario header if provided and we're in sandbox
  if (testScenario && isSandboxBase(getHmrcBaseUrl())) {
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

export function validateHmrcAccessToken(hmrcAccessToken, requestId) {
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
    requestId,
    message: "Validating access token",
    tokenValidation,
  });
  if (!hmrcAccessToken || typeof hmrcAccessToken !== "string" || hmrcAccessToken.length < 2) {
    logger.error({
      requestId,
      message: "Invalid access token provided",
      tokenValidation,
      error: "Access token is missing, not a string, or too short",
    });
    // Keep existing behavior for tests: throw a generic Error to produce HTTP 400
    throw new Error("Invalid access token provided");
  }
}

/**
 * Make a GET request to HMRC VAT API
 */
export async function hmrcHttpGet(requestId, endpoint, accessToken, govClientHeaders = {}, testScenario = null, queryParams = {}) {
  const baseUrl = getHmrcBaseUrl();
  const queryString = new URLSearchParams(queryParams).toString();
  const url = `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ""}`;

  const headers = buildHmrcHeaders(accessToken, govClientHeaders, testScenario);

  logger.info({
    message: `Request to GET ${url}`,
    url,
    headers: { ...Object.keys(headers), "x-request-id": requestId },
    testScenario,
    environment: {
      hmrcBase: baseUrl,
      nodeEnv: process.env.NODE_ENV,
    },
  });

  const hmrcResponse = await fetch(url, {
    method: "GET",
    headers,
  });

  const hmrcResponseBody = await hmrcResponse.json().catch(() => ({}));

  logger.info({
    requestId,
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

export async function hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody) {
  let hmrcResponse;
  const timeoutEnv = 20000;
  if (timeoutEnv && Number(timeoutEnv) > 0) {
    const controller = new AbortController();
    const timeoutMs = Number(timeoutEnv);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      hmrcResponse = await fetch(hmrcRequestUrl, {
        method: "POST",
        headers: {
          ...hmrcRequestHeaders,
          ...govClientHeaders,
        },
        body: JSON.stringify(hmrcRequestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } else {
    hmrcResponse = await fetch(hmrcRequestUrl, {
      method: "POST",
      headers: {
        ...hmrcRequestHeaders,
        ...govClientHeaders,
      },
      body: JSON.stringify(hmrcRequestBody),
    });
  }
  const hmrcResponseBody = await hmrcResponse.json();
  return { hmrcResponse, hmrcResponseBody };
}

export function generateHmrcErrorResponseWithRetryAdvice(
  request,
  requestId,
  hmrcResponse,
  hmrcResponseBody,
  hmrcAccessToken,
  responseHeaders,
) {
  // Attach parsed body for downstream error helpers
  hmrcResponse.data = hmrcResponseBody;
  if (hmrcResponse.status === 403) {
    return http403ForbiddenFromHmrcResponse(hmrcAccessToken, requestId, hmrcResponse, responseHeaders);
  } else if (hmrcResponse.status === 404) {
    return http404NotFoundFromHmrcResponse(request, requestId, hmrcResponse, responseHeaders);
  } else if (hmrcResponse.status === 429) {
    const retryAfter =
      (hmrcResponse.headers &&
        (hmrcResponse.headers.get ? hmrcResponse.headers.get("Retry-After") : hmrcResponse.headers["retry-after"])) ||
      undefined;
    return http500ServerErrorResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      message: "Upstream rate limited. Please retry later.",
      error: { hmrcResponseCode: hmrcResponse.status, responseBody: hmrcResponse.data, retryAfter },
    });
  } else {
    return http500ServerErrorFromHmrcResponse(request, requestId, hmrcResponse, responseHeaders);
  }
}

export function http500ServerErrorFromBundleEnforcement(requestId, error, request) {
  if (error instanceof BundleEntitlementError) {
    logger.error({
      requestId,
      message: "Bundle enforcement failed",
      error: error.message,
      details: error.details,
    });
    return http500ServerErrorResponse({
      request,
      requestId,
      message: error.message,
      error: error.details,
    });
  }
  // Re-throw unexpected errors
  logger.error({
    requestId,
    message: "Unexpected error during bundle enforcement",
    error: error.message,
    stack: error.stack,
  });
  return http500ServerErrorResponse({
    request,
    requestId,
    message: "Authorization failure while checking entitlements",
    error: { message: error.message || String(error) },
  });
}

export function http403ForbiddenFromBundleEnforcement(requestId, error, request) {
  // Only intended for BundleEntitlementError, fall back to 500 otherwise
  if (!(error instanceof BundleEntitlementError)) {
    return http500ServerErrorFromBundleEnforcement(requestId, error, request);
  }
  logger.warn({
    requestId,
    message: "Forbidden - bundle entitlement missing or insufficient",
    error: error.message,
    details: error.details,
  });
  return http403ForbiddenResponse({
    request,
    requestId,
    message: "Forbidden - missing or insufficient bundle entitlement",
    error: { code: error.details?.code || "BUNDLE_ENTITLEMENT_REQUIRED", ...error.details },
  });
}

export function http403ForbiddenFromHmrcResponse(hmrcAccessToken, requestId, hmrcResponse, govClientHeaders) {
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
    requestId,
    message: "Forbidden - Access token may be invalid, expired, or lack required permissions",
    hmrcAccessTokenData,
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });
  return http400BadRequestResponse({
    requestId,
    hmrcAccessTokenData,
    headers: { ...govClientHeaders, "x-request-id": requestId },
    message: "Forbidden - Access token may be invalid, expired, or lack required permissions",
    error: {
      hmrcResponseCode: hmrcResponse.status,
      responseBody: hmrcResponse.data,
    },
  });
}

export function http404NotFoundFromHmrcResponse(request, requestId, hmrcResponse, govClientHeaders) {
  logger.warn({
    requestId,
    message: "Not found for request",
    request,
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });
  return http400BadRequestResponse({
    request,
    requestId,
    headers: { ...govClientHeaders, "x-request-id": requestId },
    message: "Not found for the specified query",
    error: {
      hmrcResponseCode: hmrcResponse.status,
      responseBody: hmrcResponse.data,
    },
  });
}

export function http500ServerErrorFromHmrcResponse(request, requestId, hmrcResponse, govClientHeaders) {
  logger.error({
    requestId,
    message: "HMRC request failed for request",
    request,
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });
  return http500ServerErrorResponse({
    request,
    headers: { ...govClientHeaders, "x-request-id": requestId },
    message: "HMRC request failed",
    error: {
      hmrcResponseCode: hmrcResponse.status,
      responseBody: hmrcResponse.data,
    },
  });
}
