// app/services/deferredExecution.js

import { createLogger } from "../lib/logger.js";
import {
  putDeferredRequest,
  getDeferredRequest,
  updateDeferredRequest,
  deleteDeferredRequest,
} from "../data/dynamoDbDeferredRequestRepository.js";
import { http202AcceptedResponse } from "../lib/httpResponseHelper.js";

const logger = createLogger({ source: "app/services/deferredExecution.js" });

/**
 * Get the deferred execution timeout from environment or use default
 * @returns {number} Timeout in milliseconds
 */
export function getDeferredExecutionTimeout() {
  const envTimeout = process.env.DEFERRED_EXECUTION_TIMEOUT_MS;
  if (envTimeout) {
    const parsed = parseInt(envTimeout, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 100; // Default 100ms
}

/**
 * Extract or generate a client request ID from the event
 * @param {object} event - Lambda event
 * @returns {string} Client request ID
 */
export function extractOrGenerateClientRequestId(event) {
  // Try to get from header first
  const headers = event.headers || {};
  const clientRequestId =
    headers["x-client-request-id"] || headers["X-Client-Request-Id"] || headers["x-request-id"] || headers["X-Request-Id"];

  if (clientRequestId) {
    return clientRequestId;
  }

  // Generate a new one using crypto if available
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (error) {
    logger.warn({ message: "Failed to generate UUID using crypto.randomUUID", error: error.message });
  }

  // Fallback to timestamp-based generation
  const timestamp = Date.now();
  const perfNow = typeof performance !== "undefined" && performance.now ? performance.now().toString(36) : "0";
  return `gen-${timestamp}-${perfNow}`;
}

/**
 * Execute a function with timeout, returning 202 if it times out
 * @param {Function} asyncFunction - The async function to execute
 * @param {object} event - Lambda event
 * @param {object} request - Request metadata
 * @param {object} requestParams - Request parameters for validation
 * @param {string} userSub - User subject/ID
 * @returns {Promise<object>} Lambda response
 */
export async function executeWithDeferral(asyncFunction, event, request, requestParams, userSub) {
  const timeout = getDeferredExecutionTimeout();
  const clientRequestId = extractOrGenerateClientRequestId(event);

  logger.info({
    message: "Executing with deferral support",
    clientRequestId,
    timeout,
  });

  // Check if this is a continuation request (polling for result)
  if (event.queryStringParameters?.["x-continuation"] === "true") {
    logger.info({
      message: "Processing continuation request",
      clientRequestId,
    });
    return await handleContinuationRequest(clientRequestId, request);
  }

  // Create a promise that races between the actual function and timeout
  const functionPromise = asyncFunction();
  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), timeout));

  const result = await Promise.race([functionPromise, timeoutPromise]);

  if (result && result.timedOut) {
    // Timeout occurred - store request and return 202
    logger.info({
      message: "Request timed out, deferring execution",
      clientRequestId,
      timeout,
    });

    try {
      await putDeferredRequest(clientRequestId, userSub, requestParams, {
        endpointPath: event.rawPath || event.path,
        method: event.requestContext?.http?.method || event.httpMethod,
      });

      // Continue processing in background (fire and forget)
      functionPromise
        .then((asyncResult) => {
          logger.info({
            message: "Background processing completed",
            clientRequestId,
          });
          return updateDeferredRequest(clientRequestId, "COMPLETED", asyncResult, null);
        })
        .catch((asyncError) => {
          logger.error({
            message: "Background processing failed",
            clientRequestId,
            error: asyncError.message,
          });
          return updateDeferredRequest(clientRequestId, "FAILED", null, {
            message: asyncError.message,
            stack: asyncError.stack,
          });
        });

      return http202AcceptedResponse({
        request,
        headers: {
          "X-Client-Request-Id": clientRequestId,
          "Retry-After": "0.1", // Suggest retry in 100ms
        },
        message: "Request accepted for processing. Poll with x-continuation=true query parameter.",
        data: {
          clientRequestId,
          status: "PROCESSING",
          retryAfter: 100,
        },
      });
    } catch (error) {
      logger.error({
        message: "Failed to store deferred request",
        clientRequestId,
        error: error.message,
      });
      // If we can't store the request, wait for the result synchronously
      return await functionPromise;
    }
  }

  // Function completed within timeout
  logger.info({
    message: "Request completed within timeout",
    clientRequestId,
  });
  return result;
}

/**
 * Handle a continuation request (polling for result)
 * @param {string} clientRequestId - Client request ID
 * @param {object} request - Request metadata
 * @returns {Promise<object>} Lambda response
 */
async function handleContinuationRequest(clientRequestId, request) {
  try {
    const deferredRequest = await getDeferredRequest(clientRequestId);

    if (!deferredRequest) {
      logger.warn({
        message: "Deferred request not found for continuation",
        clientRequestId,
      });
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "X-Client-Request-Id": clientRequestId,
        },
        body: JSON.stringify({
          request,
          message: "Request not found. It may have expired or already been retrieved.",
          error: {
            code: "REQUEST_NOT_FOUND",
            clientRequestId,
          },
        }),
      };
    }

    if (deferredRequest.status === "PROCESSING") {
      // Still processing - return 202 again
      logger.info({
        message: "Request still processing",
        clientRequestId,
      });
      return http202AcceptedResponse({
        request,
        headers: {
          "X-Client-Request-Id": clientRequestId,
          "Retry-After": "0.1",
        },
        message: "Request still processing. Please retry.",
        data: {
          clientRequestId,
          status: "PROCESSING",
          retryAfter: 100,
        },
      });
    }

    if (deferredRequest.status === "COMPLETED") {
      // Request completed - return result and clean up
      logger.info({
        message: "Request completed, returning result",
        clientRequestId,
      });

      // Delete the deferred request (fire and forget)
      deleteDeferredRequest(clientRequestId).catch((err) => {
        logger.warn({
          message: "Failed to delete completed deferred request",
          clientRequestId,
          error: err.message,
        });
      });

      return deferredRequest.result;
    }

    if (deferredRequest.status === "FAILED") {
      // Request failed - return error
      logger.info({
        message: "Request failed, returning error",
        clientRequestId,
      });

      // Delete the deferred request (fire and forget)
      deleteDeferredRequest(clientRequestId).catch((err) => {
        logger.warn({
          message: "Failed to delete failed deferred request",
          clientRequestId,
          error: err.message,
        });
      });

      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "X-Client-Request-Id": clientRequestId,
        },
        body: JSON.stringify({
          request,
          message: "Request processing failed",
          error: deferredRequest.error || {
            message: "Unknown error",
          },
        }),
      };
    }

    // Unknown status
    logger.warn({
      message: "Unknown deferred request status",
      clientRequestId,
      status: deferredRequest.status,
    });
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "X-Client-Request-Id": clientRequestId,
      },
      body: JSON.stringify({
        request,
        message: "Unexpected request status",
        error: {
          status: deferredRequest.status,
        },
      }),
    };
  } catch (error) {
    logger.error({
      message: "Error handling continuation request",
      clientRequestId,
      error: error.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "X-Client-Request-Id": clientRequestId,
      },
      body: JSON.stringify({
        request,
        message: "Error retrieving request status",
        error: {
          message: error.message,
        },
      }),
    };
  }
}
