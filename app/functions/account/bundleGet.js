// app/functions/account/bundleGet.js

import { validateEnv } from "../../lib/env.js";
import logger from "../../lib/logger.js";
import { extractRequest } from "../../lib/responses.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { getUserBundles } from "../../lib/bundleHelpers.js";

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
      } else if (expiry && expiry > (existing.expiry || "")) {
        bundleMap.set(bundleId, { bundleId, expiry });
      }
    }
  }

  return Array.from(bundleMap.values());
}

export function apiEndpoint(app) {
  app.get("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export async function handler(event) {
  const { request, requestId } = extractRequest(event);
  logger.info({ message: "bundleGet entry", route: "/api/v1/bundle", request });

  validateEnv(["COGNITO_USER_POOL_ID"]);

  try {
    logger.info({ message: "Bundle get request received:", event: JSON.stringify(event, null, 2) });

    // Decode JWT token to get user ID
    let decodedToken;
    try {
      decodedToken = decodeJwtToken(event.headers);
    } catch (error) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(error),
      };
    }
    const userId = decodedToken.sub;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;

    logger.info({ message: "Retrieving bundles for user:", userId });

    // Use DynamoDB as primary storage (via getUserBundles which abstracts the storage)
    const allBundles = await getUserBundles(userId, userPoolId);

    // Format bundles with expiry information
    const formattedBundles = formatBundles(allBundles);

    logger.info({ message: "Retrieved bundles for user:", userId, count: formattedBundles.length });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        bundles: formattedBundles,
      }),
    };
  } catch (error) {
    logger.error({ message: "Unexpected error:", error: error?.message || String(error) });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}
