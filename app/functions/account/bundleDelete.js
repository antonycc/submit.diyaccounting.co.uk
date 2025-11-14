// app/functions/account/bundleDelete.js

import { validateEnv } from "../../lib/env.js";
import logger from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  http200OkResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
  buildValidationError,
} from "../../lib/responses.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest, http404NotFound } from "../../lib/httpHelper.js";
import { getUserBundles, updateUserBundles } from "../../lib/bundleHelpers.js";
import { enforceBundles } from "@app/lib/bundleEnforcement.js";
import { http403ForbiddenFromBundleEnforcement } from "@app/lib/hmrcHelper.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.delete("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  // Also support deletion via path parameter for parity with API Gateway
  app.delete("/api/v1/bundle/:id", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export function extractAndValidateParameters(event, errorMessages) {
  // Decode JWT token to get user ID
  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch {
    // JWT decoding failed - authentication error
    errorMessages.push("Invalid or missing authentication token");
    return { userId: null, bundleToRemove: null, removeAll: false };
  }

  const userId = decodedToken.sub;
  const body = parseRequestBody(event);

  // Accept bundle id via body.bundleId, path parameter {id}, or query parameter bundleId
  const pathId = event?.pathParameters?.id;
  const queryId = event?.queryStringParameters?.bundleId;
  const bundleToRemove = body?.bundleId || pathId || queryId;

  // Accept removeAll via body.removeAll or query removeAll=true
  const removeAll = Boolean(body?.removeAll || String(event?.queryStringParameters?.removeAll || "").toLowerCase() === "true");

  // Collect validation errors
  if (!bundleToRemove && !removeAll) {
    errorMessages.push("Missing bundle Id in request");
  }

  return { userId, bundleToRemove, removeAll };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["COGNITO_USER_POOL_ID"]);

  const { request, requestId } = extractRequest(event);
  const errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(requestId, error, request);
  }

  logger.info({ requestId, message: "Deleting user bundle" });

  // Extract and validate parameters
  const { userId, bundleToRemove, removeAll } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "x-request-id": requestId };

  // Authentication errors
  if (!userId) {
    return http401UnauthorizedResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      message: "Authentication required",
      error: {},
    });
  }

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, requestId, errorMessages, responseHeaders);
  }

  // Processing
  try {
    const result = await deleteUserBundle(userId, bundleToRemove, removeAll);

    if (result.status === "not_found") {
      return http404NotFound(request, requestId, "Bundle not found", responseHeaders);
    }

    logger.info({ requestId, message: "Successfully deleted bundle", userId, status: result.status });

    return http200OkResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      data: result,
    });
  } catch (error) {
    logger.error({ requestId, message: "Error deleting bundle", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function deleteUserBundle(userId, bundleToRemove, removeAll) {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const currentBundles = await getUserBundles(userId, userPoolId);

  if (removeAll) {
    // Use DynamoDB as primary storage via updateUserBundles
    await updateUserBundles(userId, userPoolId, []);
    logger.info({ message: `All bundles removed for user ${userId}` });
    return {
      status: "removed_all",
      message: "All bundles removed",
      bundles: [],
    };
  }

  logger.info({ message: `Removing bundle ${bundleToRemove} for user ${userId}` });
  const bundlesAfterRemoval = currentBundles.filter((bundle) => !bundle.startsWith(bundleToRemove + "|") && bundle !== bundleToRemove);

  if (bundlesAfterRemoval.length === currentBundles.length) {
    logger.error({ message: `Bundle ${bundleToRemove} not found for user ${userId}` });
    return {
      status: "not_found",
    };
  }

  // Use DynamoDB as primary storage via updateUserBundles
  await updateUserBundles(userId, userPoolId, bundlesAfterRemoval);
  logger.info({ message: `Bundle ${bundleToRemove} removed for user ${userId}` });
  return {
    status: "removed",
    message: "Bundle removed",
    bundle: bundleToRemove,
    bundles: bundlesAfterRemoval,
  };
}
