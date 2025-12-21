// app/functions/account/bundleGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger, context } from "../../lib/logger.js";
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
import { getAsyncRequest, putAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { v4 as uuidv4 } from "uuid";

const logger = createLogger({ source: "app/functions/account/bundleGet.js" });

const MAX_WAIT_MS = 25_000; // 25 seconds (significantly below API Gateway timeout of 30s and Submit Lambda default 29s)
const DEFAULT_WAIT_MS = 20_000;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/bundle", async (httpRequest, httpResponse) => {
    // set 'x-wait-time-ms' to MAX_WAIT_MS in the inbound request for processing as a synchronous call if not set in the inbound request.
    // if (!httpRequest.headers["x-wait-time-ms"]) {
    //  httpRequest.headers["x-wait-time-ms"] = DEFAULT_WAIT_MS;
    // }
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

// Helper function to check if an async request exists
async function checkPersistedRequest(userId, requestId) {
  const asyncTableName = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
  if (!asyncTableName) {
    return null;
  }

  try {
    return await getAsyncRequest(userId, requestId);
  } catch (error) {
    logger.warn({ message: "Error checking for persisted request", error: error.message, requestId });
    return null;
  }
}

// Helper function to initiate async processing
async function initiateAsyncProcessing(userId, requestId) {
  const asyncTableName = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
  if (asyncTableName) {
    try {
      await putAsyncRequest(userId, requestId, "processing");
    } catch (error) {
      logger.error({ message: "Error storing processing request", error: error.message, requestId });
    }
  }

  // Start async processing
  try {
    // TODO: Async, If there is an SQS queue name put the request on the queue
    const queueName = false;
    if (queueName) {
      // TODO: Async, put the request on the queue
    } else {
      // Intentionally don't await so things run async
      retrieveUserBundles(userId, requestId).catch((error) => {
        logger.error({ message: "Unhandled error in async bundle retrieval", error: error.message, userId, requestId });
      });
    }
  } catch (error) {
    logger.error({ message: "Error in async bundle retrieval initiation", error: error.message, userId, requestId });
    // Try to mark as failed in DynamoDB
    if (asyncTableName) {
      putAsyncRequest(userId, requestId, "failed", { error: error.message }).catch((err) => {
        logger.error({ message: "Error storing failed request state", error: err.message, requestId });
      });
    }
  }
}

// Helper function to wait and poll for async completion
async function waitForAsyncCompletion(userId, requestId, waitTimeMs) {
  const asyncTableName = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
  if (!asyncTableName || waitTimeMs <= 0) {
    return null;
  }

  logger.info({ message: `Waiting for ${waitTimeMs}ms for bundles to be ready`, userId });
  const start = Date.now();
  let persistedRequest = null;

  while (Date.now() - start < waitTimeMs) {
    // Sleep for a short duration to avoid busy-waiting
    const delay = 100;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Check if request has completed
    try {
      persistedRequest = await getAsyncRequest(userId, requestId);
      if (persistedRequest?.status === "completed" && persistedRequest?.data?.bundles) {
        return persistedRequest.data.bundles;
      } else if (persistedRequest?.status === "failed") {
        throw new Error(persistedRequest.data?.error || "Request processing failed");
      }
    } catch (error) {
      if (error.message && error.message.includes("failed")) {
        throw error;
      }
      logger.warn({ message: "Error checking request status", error: error.message, requestId });
    }
  }

  return null;
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);

  const { request, requestId: extractedRequestId } = extractRequest(event);
  const requestId = extractedRequestId || uuidv4();
  if (!extractedRequestId) {
    context.set("requestId", requestId);
  }
  const errorMessages = [];

  const asyncTableName = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;

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
    // TODO: Do this case insensitive comparison more thoroughly
    const waitTimeMs = parseInt(event.headers?.["x-wait-time-ms"] || event.headers?.["X-Wait-Time-Ms"] || DEFAULT_WAIT_MS, 10);
    let formattedBundles;
    // Generate request id if not provided
    logger.info({ message: "Retrieving bundles for request", requestId });

    // Check if there is a request in a dynamo db table for this request
    const persistedRequest = await checkPersistedRequest(userId, requestId);
    const persistedRequestExists = !!persistedRequest;

    // TODO: Async, abstract to: init()
    if (!persistedRequestExists) {
      // Default behavior (no header or 0): synchronous
      // Explicit long wait (>= MAX_WAIT_MS): synchronous
      // Otherwise: asynchronous
      if (waitTimeMs >= MAX_WAIT_MS || !asyncTableName) {
        // Synchronous processing: wait for the result
        formattedBundles = await retrieveUserBundles(userId, requestId);
      } else {
        // Asynchronous processing: start the process but don't wait
        await initiateAsyncProcessing(userId, requestId);
      }
    }

    // If we have bundles (synchronous path), return them
    if (formattedBundles) {
      logger.info({ message: "Successfully retrieved bundles", userId, count: formattedBundles.length });
    }

    // TODO: Async, abstract to: wait()
    // Wait for waitTimeMs if we have been asked to do so
    if (!formattedBundles && waitTimeMs > 0) {
      formattedBundles = await waitForAsyncCompletion(userId, requestId, waitTimeMs);
    }

    // TODO: Async, abstract to check()
    // Check persisted request one more time after waiting
    if (!formattedBundles && persistedRequest) {
      if (persistedRequest.status === "completed" && persistedRequest.data?.bundles) {
        formattedBundles = persistedRequest.data.bundles;
      } else if (persistedRequest.status === "failed") {
        throw new Error(persistedRequest.data?.error || "Request processing failed");
      }
    }

    // TODO: Async, abstract to respond()
    if (!formattedBundles) {
      // Return HTTP 202 Accepted with location header for async processing
      const locationUrl = `${request.origin}${request.pathname}`;
      return http202AcceptedResponse({
        request,
        headers: { ...responseHeaders, "x-request-id": requestId, "Retry-After": "5" },
        message: "Request accepted for processing",
        location: locationUrl,
      });
    }

    return http200OkResponse({
      request,
      headers: { ...responseHeaders, "x-request-id": requestId },
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
export async function retrieveUserBundles(userId, requestId = null) {
  try {
    // Use DynamoDB as primary storage (via getUserBundles which abstracts the storage)
    const allBundles = await getUserBundles(userId);

    // Store the result in a dynamo db table for async retrieval
    if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
      try {
        await putAsyncRequest(userId, requestId, "completed", { bundles: allBundles });
      } catch (error) {
        logger.error({ message: "Error storing completed request", error: error.message, requestId });
      }
    }

    return allBundles;
  } catch (error) {
    logger.error({ message: "Error retrieving user bundles", error: error.message, userId, requestId });
    if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
      try {
        await putAsyncRequest(userId, requestId, "failed", { error: error.message });
      } catch (dbError) {
        logger.error({ message: "Error storing failed request state", error: dbError.message, requestId });
      }
    }
    throw error;
  }
}
