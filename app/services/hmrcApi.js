// app/services/hmrcApi.js

import { v4 as uuidv4 } from "uuid";
import { createLogger, context } from "../lib/logger.js";
import { BundleEntitlementError } from "./bundleManagement.js";
import { http400BadRequestResponse, http500ServerErrorResponse, http403ForbiddenResponse } from "../lib/httpResponseHelper.js";
import { putHmrcApiRequest } from "../data/dynamoDbHmrcApiRequestRepository.js";

const logger = createLogger({ source: "app/services/hmrcApi.js" });

export function getHmrcBaseUrl(hmrcAccount) {
  const isSandbox = hmrcAccount === "sandbox";
  const base = isSandbox ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  if (!base || String(base).trim() === "") {
    throw new Error(`Missing required environment variable ${isSandbox ? "HMRC_SANDBOX_BASE_URI" : "HMRC_BASE_URI"}`);
  }
  return base;
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

/**
 * Validate fraud prevention headers for sandbox HMRC accounts.
 * Calls the HMRC Test Fraud Prevention Headers API to validate headers before making actual API calls.
 *
 * This is a fire-and-forget validation that logs results but does not block the main API request.
 * The validation helps identify header issues during development and testing.
 *
 * @param {string} accessToken - HMRC OAuth access token
 * @param {Object} govClientHeaders - Gov-Client-* fraud prevention headers
 * @returns {Promise<Object>} Validation result with {isValid, response}
 */
export async function validateFraudPreventionHeaders(accessToken, govClientHeaders = {}) {
  const validationUrl = "https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/validate";

  const headers = {
    Accept: "application/vnd.hmrc.1.0+json",
    Authorization: `Bearer ${accessToken}`,
    ...govClientHeaders,
  };

  logger.info({
    message: `Validating fraud prevention headers`,
    url: validationUrl,
    headers: Object.keys(govClientHeaders),
  });

  try {
    const response = await fetch(validationUrl, {
      method: "GET",
      headers,
    });

    const responseBody = await response.json().catch(() => ({}));

    logger.info({
      message: `Fraud prevention header validation response`,
      status: response.status,
      code: responseBody.code,
      validationMessage: responseBody.message,
    });

    // Log any errors or warnings from the validation
    if (responseBody.errors && responseBody.errors.length > 0) {
      logger.warn({
        message: "Fraud prevention header validation errors",
        errors: responseBody.errors,
      });
    }
    if (responseBody.warnings && responseBody.warnings.length > 0) {
      logger.warn({
        message: "Fraud prevention header validation warnings",
        warnings: responseBody.warnings,
      });
    }

    return {
      isValid: response.ok && responseBody.code === "VALID_HEADERS",
      response: responseBody,
      status: response.status,
    };
  } catch (error) {
    logger.error({
      message: "Error validating fraud prevention headers",
      error: error.message,
      stack: error.stack,
    });
    // Don't fail the main request if validation fails
    return {
      isValid: false,
      error: error.message,
    };
  }
}

/**
 * Get validation feedback for fraud prevention headers from HMRC test API.
 * This retrieves feedback on all requests made to a specific API.
 *
 * @param {string} api - The API name (e.g., 'vat-mtd')
 * @param {string} accessToken - HMRC OAuth access token
 * @returns {Promise<Object>} Validation feedback
 */
export async function getFraudPreventionHeadersFeedback(api, accessToken) {
  const feedbackUrl = `https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/${api}/validation-feedback`;

  const headers = {
    Accept: "application/vnd.hmrc.1.0+json",
    Authorization: `Bearer ${accessToken}`,
  };

  logger.info({
    message: `Getting fraud prevention headers validation feedback`,
    url: feedbackUrl,
    api,
  });

  try {
    const response = await fetch(feedbackUrl, {
      method: "GET",
      headers,
    });

    const responseBody = await response.json().catch(() => ({}));

    logger.info({
      message: `Fraud prevention header validation feedback response`,
      status: response.status,
      feedback: responseBody,
    });

    return {
      ok: response.ok,
      status: response.status,
      feedback: responseBody,
    };
  } catch (error) {
    logger.error({
      message: "Error getting fraud prevention headers validation feedback",
      error: error.message,
      stack: error.stack,
    });
    return {
      ok: false,
      error: error.message,
    };
  }
}

export async function hmrcHttpGet(
  endpoint,
  accessToken,
  govClientHeaders = {},
  testScenario = null,
  hmrcAccount,
  queryParams = {},
  auditForUserSub,
) {
  const baseUrl = getHmrcBaseUrl(hmrcAccount);
  // Sanitize query params: drop undefined, null, and blank strings
  const cleanParams = Object.fromEntries(
    Object.entries(queryParams || {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ""),
  );
  const queryString = new URLSearchParams(cleanParams).toString();
  // eslint-disable-next-line sonarjs/no-nested-template-literals
  const hmrcRequestUrl = `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ""}`;
  const hmrcRequestHeaders = buildHmrcHeaders(accessToken, govClientHeaders, testScenario);
  const httpRequest = {
    method: "GET",
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
      ...(context.get("requestId") ? { "x-request-id": context.get("requestId") } : {}),
      ...(context.get("amznTraceId") ? { "x-amzn-trace-id": context.get("amznTraceId") } : {}),
      ...(context.get("traceparent") ? { traceparent: context.get("traceparent") } : {}),
    },
  };
  // Ensure x-correlationid is set; prefer existing header, otherwise mirror requestId/correlationId from context
  if (!httpRequest.headers["x-correlationid"] && !httpRequest.headers["X-CorrelationId"]) {
    const cid = context.get("correlationId") || context.get("requestId");
    if (cid) httpRequest.headers["x-correlationid"] = cid;
  }

  logger.info({
    message: `Request to GET ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    ...httpRequest,
    testScenario,
    environment: {
      hmrcBase: baseUrl,
      // nodeEnv: process.env.NODE_ENV,
    },
  });

  // Add a conservative timeout to avoid hung connections
  let duration = 0;
  const timeoutMs = 20000;
  let hmrcResponse;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs));
  try {
    const startTime = Date.now();
    hmrcResponse = await fetch(hmrcRequestUrl, httpRequest);
    duration = Date.now() - startTime;
  } finally {
    clearTimeout(timeout);
  }

  const hmrcResponseBody = await hmrcResponse.json().catch(() => ({}));

  // Normalise response headers to a plain object (Headers is not marshallable)
  let responseHeadersObj = {};
  try {
    if (hmrcResponse && typeof hmrcResponse.headers?.forEach === "function") {
      hmrcResponse.headers.forEach((value, key) => {
        responseHeadersObj[key] = value;
      });
    } else if (hmrcResponse?.headers && typeof hmrcResponse.headers === "object") {
      responseHeadersObj = { ...hmrcResponse.headers };
    }
  } catch (error) {
    logger.error({
      message: "Error normalizing HMRC response headers",
      error: error.message,
      stack: error.stack,
    });
  }

  logger.info({
    message: `Response from GET ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    status: hmrcResponse.status,
    hmrcResponseBody,
  });

  const httpResponse = {
    statusCode: hmrcResponse.status,
    headers: responseHeadersObj,
    body: hmrcResponseBody,
  };
  const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
  try {
    await putHmrcApiRequest(userSubOrUuid, { url: hmrcRequestUrl, httpRequest, httpResponse, duration });
  } catch (auditError) {
    logger.error({
      message: "Error auditing HMRC API request/response to DynamoDB",
      error: auditError.message,
      stack: auditError.stack,
    });
  }

  return {
    ok: hmrcResponse.ok,
    status: hmrcResponse.status,
    data: hmrcResponseBody,
    response: hmrcResponse,
  };
}

export async function hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub) {
  let hmrcResponse;
  const httpRequestTimeoutMillis = 20000;
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
  // Ensure x-correlationid is set; prefer existing header, otherwise mirror requestId/correlationId from context
  if (!httpRequest.headers["x-correlationid"] && !httpRequest.headers["X-CorrelationId"]) {
    const cid = context.get("correlationId") || context.get("requestId");
    if (cid) httpRequest.headers["x-correlationid"] = cid;
  }

  logger.info({
    message: `Request to POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    ...httpRequest,
  });

  let duration = 0;
  const controller = new AbortController();
  const timeoutMs = Number(httpRequestTimeoutMillis);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const startTime = Date.now();
    hmrcResponse = await fetch(hmrcRequestUrl, { ...httpRequest, signal: controller.signal });
    duration = Date.now() - startTime;
  } finally {
    clearTimeout(timeout);
  }
  const hmrcResponseBody = await hmrcResponse.json();

  // Normalise response headers to a plain object (Headers is not marshallable)
  let responseHeadersObj = {};
  try {
    if (hmrcResponse && typeof hmrcResponse.headers?.forEach === "function") {
      hmrcResponse.headers.forEach((value, key) => {
        responseHeadersObj[key] = value;
      });
    } else if (hmrcResponse?.headers && typeof hmrcResponse.headers === "object") {
      responseHeadersObj = { ...hmrcResponse.headers };
    }
  } catch (error) {
    logger.error({
      message: "Error normalizing HMRC response headers",
      error: error.message,
      stack: error.stack,
    });
  }

  logger.info({
    message: `Response from POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    status: hmrcResponse.status,
    hmrcResponseBody,
  });

  const httpResponse = {
    statusCode: hmrcResponse.status,
    headers: responseHeadersObj,
    body: hmrcResponseBody,
  };
  const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
  try {
    await putHmrcApiRequest(userSubOrUuid, { url: hmrcRequestUrl, httpRequest, httpResponse, duration });
  } catch (auditError) {
    logger.error({
      message: "Error auditing HMRC API request/response to DynamoDB",
      error: auditError.message,
      stack: auditError.stack,
    });
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
