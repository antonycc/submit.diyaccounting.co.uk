// app/functions/account/bundleDelete.js

import { validateEnv } from "../../lib/env.js";
import { context, createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  http200OkResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
  buildValidationError,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles, updateUserBundles } from "../../services/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/hmrcApi.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/functions/account/bundleDelete.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
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
  app.head("/api/v1/bundle", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
  app.head("/api/v1/bundle/:id", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

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
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  // If HEAD request, return 200 OK immediately after bundle enforcement
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  logger.info({ message: "Deleting user bundle" });

  // Extract and validate parameters
  const { userId, bundleToRemove, removeAll } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Authentication errors
  if (!userId) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Authentication required",
      error: {},
    });
  }

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Processing
  try {
    const result = await deleteUserBundle(userId, bundleToRemove, removeAll);

    if (result.status === "not_found") {
      return http404NotFound(request, "Bundle not found", responseHeaders);
    }

    logger.info({ message: "Successfully deleted bundle", userId, status: result.status });

    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: result,
    });
  } catch (error) {
    logger.error({ message: "Error deleting bundle", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function deleteUserBundle(userId, bundleToRemove, removeAll) {
  const currentBundles = await getUserBundles(userId);

  if (removeAll) {
    // Use DynamoDB as primary storage via updateUserBundles
    await updateUserBundles(userId, []);
    logger.info({ message: `All bundles removed for user ${userId}` });
    return {
      status: "removed_all",
      message: "All bundles removed",
      bundles: [],
    };
  }

  logger.info({ message: `Removing bundle ${bundleToRemove} for user ${userId}` });
  const bundlesAfterRemoval = currentBundles.filter((bundle) => bundle !== bundleToRemove);

  if (bundlesAfterRemoval.length === currentBundles.length) {
    logger.error({ message: `Bundle ${bundleToRemove} not found for user ${userId}` });
    return {
      status: "not_found",
    };
  }

  // Use DynamoDB as primary storage via updateUserBundles
  await updateUserBundles(userId, bundlesAfterRemoval);
  logger.info({ message: `Bundle ${bundleToRemove} removed for user ${userId}` });
  return {
    status: "removed",
    message: "Bundle removed",
    bundle: bundleToRemove,
    bundles: bundlesAfterRemoval,
  };
}

function http404NotFound(request, message, responseHeaders) {
  // Log with clear semantics and avoid misusing headers as a response code
  logger.warn({ message, request });
  // Return a proper 404 response (was incorrectly returning 400)
  // We keep using the generic bad request builder style but with correct status
  const reqId = context.getStore().get("requestId") || String(Date.now());
  return {
    statusCode: 404,
    headers: {
      ...(responseHeaders || {}),
      "x-request-id": reqId,
      "x-correlationid": reqId,
      ...(context.getStore().get("amznTraceId") ? { "x-amzn-trace-id": context.getStore().get("amznTraceId") } : {}),
      ...(context.getStore().get("traceparent") ? { traceparent: context.getStore().get("traceparent") } : {}),
    },
    body: JSON.stringify({ message }),
  };
}
