// app/functions/account/bundleGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http202AcceptedResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { BundleAuthorizationError, BundleEntitlementError, enforceBundles } from "../../services/bundleManagement.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/hmrcApi.js";

const logger = createLogger({ source: "app/functions/account/bundleGet.js" });

const MAX_WAIT_MS = 900_000; // 900 seconds = 15 minutes
const DEFAULT_WAIT_MS = 0;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/bundle", async (httpRequest, httpResponse) => {
    // set 'x-wait-time-ms' to MAX_WAIT_MS in the inbound request for processing as a synchronous call
    httpRequest.headers["x-wait-time-ms"] = MAX_WAIT_MS;
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/bundle", async (httpRequest, httpResponse) => {
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
  if (event?.requestContext?.http?.method === "HEAD") {
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
  // Note: errorMessages currently used only for authentication errors - consider refactoring for clarity
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
    const waitTimeMs = parseInt(event.headers?.["x-wait-time-ms"] || DEFAULT_WAIT_MS, 10);
    let formattedBundles;
    // Generate request id if not provided
    const requestId = event.headers?.["x-request-id"] || String(Date.now());
    logger.info({ message: "Retrieving bundles for request", requestId });
    // Check if there is a request in a dynamo db table for this request
    // Note: This is a placeholder for future implementation
    const persistedRequestExists = false;
    if (!persistedRequestExists) {
      // Default behavior (no header or 0): synchronous
      // Explicit long wait (>= MAX_WAIT_MS): synchronous
      // Otherwise: asynchronous
      if (!event.headers?.["x-wait-time-ms"] || waitTimeMs === 0 || waitTimeMs >= MAX_WAIT_MS) {
        // Synchronous processing: wait for the result
        formattedBundles = await retrieveUserBundles(userId);
      } else {
        // Asynchronous processing: start the process but don't wait
        // For now, without SQS, we'll just call it without await
        retrieveUserBundles(userId).catch((error) => {
          logger.error({ message: "Error in async bundle retrieval", error: error.message, userId });
        });
      }
    }

    // If we have bundles (synchronous path), return them
    if (formattedBundles) {
      logger.info({ message: "Successfully retrieved bundles", userId, count: formattedBundles.length });
      return http200OkResponse({
        request,
        headers: { ...responseHeaders },
        data: { bundles: formattedBundles },
      });
    }

    // Wait for waitTimeMs if we have been asked to do so
    if (!persistedRequestExists && !formattedBundles && waitTimeMs > 0) {
      logger.info({ message: `Waiting for ${waitTimeMs}ms for bundles to be ready`, userId });
      const start = Date.now();
      while (Date.now() - start < waitTimeMs) {
        // Sleep for a short duration to avoid busy-waiting
        const delay = 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
        logger.info({ message: `Waited one step of ${delay}ms out of ${waitTimeMs}ms for bundles to be ready`, userId });
      }
    }

    if (!formattedBundles) {
      // In future: read any persisted request from a dynamo db table for this request
      // if ( persisted request ) {
      //    switch response:
      //      completed success: formattedBundles = bundles from persistedRequest, break
      //      completed failure: throw exception for HTTP error response
      //      not completed: break
      // } else
    }

    if (!formattedBundles) {
      // Return HTTP 202 Accepted with location header for async processing
      const locationUrl = `${request.origin}${request.pathname}`;
      return http202AcceptedResponse({
        request,
        headers: { ...responseHeaders, "x-request-id": requestId },
        message: "Request accepted for processing",
        location: locationUrl,
      });
    }

    // This should not be reached, but just in case
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

// SQS consumer Lambda handler function
export async function consumer(event) {
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);
  const { request } = extractRequest(event);
  // Note: Authentication for SQS consumer is a future implementation concern
  // For now, we expect the userId to be included in the SQS message
  const userId = request.userId; // Placeholder - needs proper implementation
  await retrieveUserBundles(userId);
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function retrieveUserBundles(userId) {
  // Use DynamoDB as primary storage (via getUserBundles which abstracts the storage)
  const allBundles = await getUserBundles(userId);

  // Note: Future enhancement - store the result in a dynamo db table for async retrieval

  return allBundles;
}
