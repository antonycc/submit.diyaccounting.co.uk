// app/functions/account/bundleGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
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
  // TODO: It looks like we are cover treating errorMessages as related to authentication errors, check and fix here and everywhere.
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
    const waitTimeMs = parseInt(request.headers["x-wait-time-ms"] || DEFAULT_WAIT_MS, 10);
    let formattedBundles;
    // TODO: Async, get request id generated if not provided.
    const requestId = request.headers["x-request-id"] || String(Date.now());
    logger.info({ message: "Retrieving bundles for request", requestId });
    // TODO: Async, check if there is a request in a dynamo db table for this request
    const persistedRequestExists = false;
    if (!persistedRequestExists) {
      if (waitTimeMs >= MAX_WAIT_MS) {
        formattedBundles = await retrieveUserBundles(userId);
      } else {
        // TODO: Async, If there is a queue name put the request on the queue
        const queueName = false;
        if (queueName) {
          // TODO: Async, put the request on the queue
        } else {
          // Async direct call
          retrieveUserBundles(userId);
        }
      }
    }
    logger.info({ message: "Successfully retrieved bundles", userId, count: formattedBundles.length });

    // Wait for waitTimeMs is we have been asked to do so.
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
      // TODO: Async, read any persisted request from a dynamo db table for this request
      // if ( persisted request ) {
      //    switch response:
      //      completed success: TODO: Async, formattedBundles = bundles from persistedRequest, break
      //      completed failure: TODO: Async, throw exception for HTTP error response
      //      not completed: break
      // } else
    }

    if (!formattedBundles) {
      // TODO: Async, HTTP 202 ++ location header with this URL and request id header to use when checking.
    } else {
      return http200OkResponse({
        request,
        headers: { ...responseHeaders },
        data: { bundles: formattedBundles },
      });
    }
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
  // TODO Async, How is the request authenticated at this point when reading from the queue? Need to check where the token is.
  const userId = request.userId; // TODO Async, this is made up
  await retrieveUserBundles(userId);
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function retrieveUserBundles(userId) {
  // Use DynamoDB as primary storage (via getUserBundles which abstracts the storage)
  const allBundles = await getUserBundles(userId);

  // TODO: Async, store the result in a dynamo db table

  return allBundles;
}
