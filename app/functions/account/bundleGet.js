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
import * as asyncApiServices from "../../services/asyncApiServices.js";

const logger = createLogger({ source: "app/functions/account/bundleGet.js" });

const MAX_WAIT_MS = 25_000; // 25 seconds (significantly below API Gateway timeout of 30s and Submit Lambda default 29s)
const DEFAULT_WAIT_MS = 0;

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

  let result;
  // Processing
  try {
    const waitTimeMs = parseInt(event.headers?.["x-wait-time-ms"] || event.headers?.["X-Wait-Time-Ms"] || DEFAULT_WAIT_MS, 10);

    logger.info({ message: "Retrieving bundles for request", requestId, waitTimeMs });

    // Check if there is already a persisted request for this ID
    const persistedRequest = await getAsyncRequest(userId, requestId, asyncTableName);

    if (persistedRequest) {
      logger.info({ message: "Persisted request found", status: persistedRequest.status, requestId });
    } else {
      // Not found: Initiate processing
      const processor = async ({ userId, requestId }) => {
        const bundles = await retrieveUserBundles(userId, requestId);
        return { bundles };
      };

      result = await asyncApiServices.initiateProcessing({
        processor,
        userId,
        requestId,
        waitTimeMs,
        payload: { userId, requestId },
        tableName: asyncTableName,
        maxWaitMs: MAX_WAIT_MS,
      });
    }

    // If still no result (async path) and we have a wait time, poll for completion
    if (!result && waitTimeMs > 0) {
      result = await asyncApiServices.wait({ userId, requestId, waitTimeMs, tableName: asyncTableName });
    }

    // One last check before deciding whether to yield or return the final result
    if (!result) {
      result = await asyncApiServices.check({ userId, requestId, tableName: asyncTableName });
    }
  } catch (error) {
    if (error instanceof asyncApiServices.RequestFailedError) {
      result = error.data;
    } else {
      logger.error({ message: "Error retrieving bundles", error: error.message, stack: error.stack });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  return asyncApiServices.respond({
    request,
    requestId,
    responseHeaders,
    data: result,
    dataKey: "bundles",
  });
}

// SQS consumer Lambda handler function
export async function consumer(event) {
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME", "ASYNC_REQUESTS_DYNAMODB_TABLE_NAME"]);

  logger.info({ message: "SQS Consumer entry", recordCount: event.Records?.length });

  for (const record of event.Records || []) {
    let userId;
    let requestId;
    try {
      const body = JSON.parse(record.body);
      userId = body.userId || record.messageAttributes?.userId?.stringValue;
      requestId = body.requestId || record.messageAttributes?.requestId?.stringValue;

      if (!userId || !requestId) {
        logger.error({ message: "SQS Message missing userId or requestId", recordId: record.messageId, body });
        continue;
      }

      if (!context.getStore()) {
        context.enterWith(new Map());
      }
      context.set("requestId", requestId);
      context.set("userId", userId);

      logger.info({ message: "Processing SQS message", userId, requestId, messageId: record.messageId });

      await retrieveUserBundles(userId, requestId);

      logger.info({ message: "Successfully processed SQS message", requestId });
    } catch (error) {
      logger.error({
        message: "Error processing SQS message",
        error: error.message,
        stack: error.stack,
        messageId: record.messageId,
        userId,
        requestId,
      });
      // Re-throw to trigger SQS retry/DLQ
      throw error;
    }
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function retrieveUserBundles(userId, requestId = null) {
  logger.info({ message: "retrieveUserBundles entry", userId, requestId });
  try {
    // Use DynamoDB as primary storage (via getUserBundles which abstracts the storage)
    const allBundles = await getUserBundles(userId);
    logger.info({ message: "Successfully retrieved bundles from repository", userId, count: allBundles.length });

    // Store the result in a dynamo db table for async retrieval
    if (requestId && process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME) {
      try {
        logger.info({ message: "Updating AsyncRequest status to completed", userId, requestId });
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
        logger.info({ message: "Updating AsyncRequest status to failed", userId, requestId });
        await putAsyncRequest(userId, requestId, "failed", { error: error.message });
      } catch (dbError) {
        logger.error({ message: "Error storing failed request state", error: dbError.message, requestId });
      }
    }
    throw error;
  }
}
