// app/functions/account/bundleGet.js

import { validateEnv } from "../../lib/env.js";
import logger from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http401UnauthorizedResponse, http500ServerErrorResponse } from "../../lib/responses.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { getUserBundles } from "../../lib/bundleHelpers.js";
import { BundleAuthorizationError, BundleEntitlementError, enforceBundles } from "../../lib/bundleEnforcement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../lib/hmrcHelper.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.get("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/bundle", async (httpRequest, httpResponse) => {
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
    return { userId: null };
  }

  const userId = decodedToken.sub;
  return { userId };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
    // Handle BundleAuthorizationError and BundleEntitlementError with different response generators
  } catch (error) {
    if (error instanceof BundleAuthorizationError) {
      return http401UnauthorizedResponse({
        request,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        message: "Unauthorized access to bundles",
        error: {},
      });
    }

    if (error instanceof BundleEntitlementError) {
      return http403ForbiddenFromBundleEnforcement(error, request);
    }
  }

  // If HEAD request, return 200 OK immediately after bundle enforcement
  if (request.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  logger.info({ message: "Retrieving user bundles" });

  // Extract and validate parameters
  const { userId } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Authentication errors
  if (errorMessages.length > 0 || !userId) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Authentication required",
      error: {},
    });
  }

  // Processing
  try {
    const formattedBundles = await retrieveUserBundles(userId);

    logger.info({ message: "Successfully retrieved bundles", userId, count: formattedBundles.length });

    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: { bundles: formattedBundles },
    });
  } catch (error) {
    logger.error({ message: "Error retrieving bundles", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function retrieveUserBundles(userId) {
  // Use DynamoDB as primary storage (via getUserBundles which abstracts the storage)
  const allBundles = await getUserBundles(userId);

  return allBundles;
}
