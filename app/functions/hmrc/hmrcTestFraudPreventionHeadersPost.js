// app/functions/hmrc/hmrcTestFraudPreventionHeadersPost.js
// Test Fraud Prevention Headers endpoint for HMRC validation
// This endpoint is required for HMRC production approval
// See: https://developer.service.hmrc.gov.uk/api-documentation/docs/fraud-prevention

import logger from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  extractClientIPFromHeaders,
  buildValidationError,
  http401UnauthorizedResponse,
} from "../../lib/responses.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  extractHmrcAccessTokenFromLambdaEvent,
  generateHmrcErrorResponseWithRetryAdvice,
  getHmrcBaseUrl,
  buildHmrcHeaders,
} from "../../lib/hmrcHelper.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request
export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/test/fraud-prevention-headers", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// HTTP request/response aware Lambda handler function
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI"]);

  const { request, requestId } = extractRequest(event);
  logger.info({ requestId, message: "Testing fraud prevention headers with HMRC" });

  const detectedIP = extractClientIPFromHeaders(event);
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  const errorMessages = [...(govClientErrorMessages || [])];

  const responseHeaders = { ...govClientHeaders, "x-request-id": requestId };

  // Extract access token from Authorization header
  const hmrcAccessToken = extractHmrcAccessTokenFromLambdaEvent(event);

  // Non-authorization validation errors
  if (errorMessages.length > 0) {
    if (!hmrcAccessToken) errorMessages.push("Missing Authorization Bearer token");
    return buildValidationError(request, requestId, errorMessages, responseHeaders);
  }

  // Validate access token
  if (!hmrcAccessToken) {
    return http401UnauthorizedResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      message: "Missing Authorization Bearer token",
    });
  }

  try {
    validateHmrcAccessToken(hmrcAccessToken, requestId);
  } catch (err) {
    if (err instanceof UnauthorizedTokenError) {
      return http401UnauthorizedResponse({
        request,
        requestId,
        headers: { ...responseHeaders },
        message: err.message,
        error: {},
      });
    }
    throw err;
  }

  // Build HMRC request
  const hmrcBaseUrl = getHmrcBaseUrl();
  const hmrcRequestUrl = `${hmrcBaseUrl}/test/fraud-prevention-headers/validate`;

  logger.info({
    requestId,
    message: "Sending fraud prevention headers validation request to HMRC",
    url: hmrcRequestUrl,
    headers: Object.keys(govClientHeaders),
  });

  // Make request to HMRC Test Fraud Prevention Headers API
  let hmrcResponse;
  let hmrcResponseBody;

  try {
    const timeoutMs = 20000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      hmrcResponse = await fetch(hmrcRequestUrl, {
        method: "GET",
        headers: buildHmrcHeaders(hmrcAccessToken, govClientHeaders, null),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    // Parse response
    hmrcResponseBody = await hmrcResponse.json().catch(() => ({}));

    logger.info({
      requestId,
      message: "Received response from HMRC fraud prevention headers validation",
      status: hmrcResponse.status,
      hmrcResponseBody,
    });

    // Handle successful response
    if (hmrcResponse.ok) {
      return http200OkResponse({
        request,
        requestId,
        headers: responseHeaders,
        data: {
          message: "Fraud prevention headers validation successful",
          validation: hmrcResponseBody,
          headersValidated: Object.keys(govClientHeaders).filter((h) => h.startsWith("Gov-")),
        },
      });
    }

    // Handle error responses from HMRC
    return generateHmrcErrorResponseWithRetryAdvice(request, requestId, hmrcResponse, hmrcResponseBody, hmrcAccessToken, responseHeaders);
  } catch (error) {
    // Handle network or timeout errors
    logger.error({
      requestId,
      message: "Error calling HMRC fraud prevention headers validation API",
      error: error.message,
      stack: error.stack,
    });

    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({
        message: "Failed to validate fraud prevention headers with HMRC",
        error: {
          message: error.message,
          type: error.name,
        },
      }),
    };
  }
}
