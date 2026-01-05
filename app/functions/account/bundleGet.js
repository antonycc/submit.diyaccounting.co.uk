// app/functions/account/bundleGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger, context } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { v4 as uuidv4 } from "uuid";
import * as asyncApiServices from "../../services/asyncApiServices.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/account/bundleGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
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

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);

  const { request, requestId: extractedRequestId } = extractRequest(event);
  const requestId = extractedRequestId || uuidv4();
  if (!extractedRequestId) {
    context.set("requestId", requestId);
  }
  const errorMessages = [];

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
    logger.info({ message: "Retrieving bundles for request", requestId });
    result = await retrieveUserBundles(userId, requestId);
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

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function retrieveUserBundles(userId, requestId = null) {
  logger.info({ message: "retrieveUserBundles entry", userId, requestId });
  try {
    // Use DynamoDB as primary storage (via getUserBundles which abstracts the storage)
    const allBundles = await getUserBundles(userId);
    logger.info({ message: "Successfully retrieved bundles from repository", userId, count: allBundles.length });

    return allBundles;
  } catch (error) {
    logger.error({ message: "Error retrieving user bundles", error: error.message, userId, requestId });
    throw error;
  }
}
