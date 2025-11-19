// app/functions/account/bundleGet.js

import { validateEnv } from "../../lib/env.js";
import logger from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http401UnauthorizedResponse, http500ServerErrorResponse } from "../../lib/responses.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { getUserBundles } from "../../lib/bundleHelpers.js";
import { BundleAuthorizationError, BundleEntitlementError, enforceBundles } from "../../lib/bundleEnforcement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../lib/hmrcHelper.js";

/**
 * Parse bundle string to extract bundleId and expiry
 * @param {string} bundleStr - Bundle string in format "BUNDLE_ID" or "BUNDLE_ID|EXPIRY=2025-12-31"
 * @returns {Object} Object with bundleId and expiry (ISO date string or empty string)
 */
function parseBundleString(bundleStr) {
  if (!bundleStr || typeof bundleStr !== "string") {
    return { bundleId: "", expiry: "" };
  }

  const parts = bundleStr.split("|");
  const bundleId = parts[0] || "";
  let expiry = "";

  if (parts.length > 1) {
    const expiryMatch = parts[1].match(/EXPIRY=(.+)/);
    if (expiryMatch && expiryMatch[1]) {
      // Keep the entry with the latest expiry date
      expiry = expiryMatch[1]; // ISO date string like "2025-12-31"
    }
  }

  return { bundleId, expiry };
}

/**
 * Get de-duplicated bundles with expiry dates
 * @param {Array<string>} bundles - Array of bundle strings
 * @returns {Array<Object>} Array of bundle objects with bundleId and expiry
 */
function formatBundles(bundles) {
  const bundleMap = new Map();

  for (const bundleStr of bundles) {
    const { bundleId, expiry } = parseBundleString(bundleStr);
    if (bundleId) {
      // Keep the entry with the latest expiry date if duplicates exist
      const existing = bundleMap.get(bundleId);
      if (!existing) {
        bundleMap.set(bundleId, { bundleId, expiry });
      } else if (expiry) {
        // Update if new expiry is later than existing
        if (expiry > (existing.expiry || "")) {
          bundleMap.set(bundleId, { bundleId, expiry });
        }
      }
    }
  }

  return Array.from(bundleMap.values());
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.get("/api/v1/bundle", async (httpRequest, httpResponse) => {
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
  validateEnv(["COGNITO_USER_POOL_ID", "BUNDLE_DYNAMODB_TABLE_NAME"]);

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
  const userPoolId = process.env.COGNITO_USER_POOL_ID;

  // Use DynamoDB as primary storage (via getUserBundles which abstracts the storage)
  const allBundles = await getUserBundles(userId, userPoolId);

  // Format bundles with expiry information
  const formattedBundles = formatBundles(allBundles);

  return formattedBundles;
}
