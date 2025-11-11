// app/lib/hmrcHelper.js

import logger from "./logger.js";
import { BundleEntitlementError } from "./bundleEnforcement.js";
import { http400BadRequestResponse, http500ServerErrorResponse, http403ForbiddenResponse } from "./responses.js";

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
