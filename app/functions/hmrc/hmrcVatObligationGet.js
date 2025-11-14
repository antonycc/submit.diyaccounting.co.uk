// app/functions/hmrc/hmrcVatObligationGet.js

import logger from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  extractClientIPFromHeaders,
  buildValidationError,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/responses.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
// Stub controls remain in hmrcVatApi; HTTP client moved to hmrcHelper during refactor
import { shouldUseStub, getStubData } from "../../lib/hmrcVatApi.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  hmrcHttpGet,
  extractHmrcAccessTokenFromLambdaEvent,
  http403ForbiddenFromHmrcResponse,
  http404NotFoundFromHmrcResponse,
  http500ServerErrorFromHmrcResponse,
  http403ForbiddenFromBundleEnforcement,
} from "../../lib/hmrcHelper.js";
import { enforceBundles } from "@app/lib/bundleEnforcement.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.get("/api/v1/hmrc/vat/obligation", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export function extractAndValidateParameters(event, errorMessages) {
  const queryParams = event.queryStringParameters || {};
  const { vrn, from, to, status, "Gov-Test-Scenario": testScenario } = queryParams;

  if (!vrn) errorMessages.push("Missing vrn parameter");
  if (vrn && !/^\d{9}$/.test(String(vrn))) errorMessages.push("Invalid vrn format - must be 9 digits");
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) errorMessages.push("Invalid from date format - must be YYYY-MM-DD");
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) errorMessages.push("Invalid to date format - must be YYYY-MM-DD");
  if (status && !["O", "F"].includes(status)) errorMessages.push("Invalid status - must be O (Open) or F (Fulfilled)");

  // If from or to are not set, set them to the beginning of the current calendar year to today
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const defaultFromDate = `${currentYear}-01-01`;
  const defaultToDate = currentDate.toISOString().split("T")[0]; // YYYY-MM-DD
  const finalFrom = from || defaultFromDate;
  const finalTo = to || defaultToDate;

  // Additional validation: from date should not be after to date
  if (new Date(finalFrom) > new Date(finalTo)) {
    errorMessages.push("Invalid date range - from date cannot be after to date");
  }

  return { vrn, from: finalFrom, to: finalTo, status, testScenario };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI"]);

  const { request, requestId } = extractRequest(event);
  let errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(requestId, error, request);
  }

  const detectedIP = extractClientIPFromHeaders(event);
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Extract and validate parameters
  const { vrn, from, to, status, testScenario } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { ...govClientHeaders, "x-request-id": requestId };

  // Non-authorization validation errors
  if (errorMessages.length > 0) {
    const hmrcAccessTokenMaybe = extractHmrcAccessTokenFromLambdaEvent(event);
    if (!hmrcAccessTokenMaybe) errorMessages.push("Missing Authorization Bearer token");
    return buildValidationError(request, requestId, errorMessages, responseHeaders);
  }

  const hmrcAccessToken = extractHmrcAccessTokenFromLambdaEvent(event);
  if (!hmrcAccessToken) {
    return http400BadRequestResponse({
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
      return http401UnauthorizedResponse({ request, requestId, headers: { ...responseHeaders }, message: err.message, error: {} });
    }
    return buildValidationError(request, requestId, [err.toString()], responseHeaders);
  }

  // Processing
  let obligations;
  let hmrcResponse;
  try {
    // Check if we should use stubbed data
    logger.info({ requestId, message: "Checking for stubbed VAT obligations data", testScenario });
    if (shouldUseStub("TEST_VAT_OBLIGATIONS")) {
      logger.info({ requestId, message: "[MOCK] Using stubbed VAT obligations data", testScenario });
      obligations = getStubData("TEST_VAT_OBLIGATIONS");
    } else {
      ({ obligations, hmrcResponse } = await getVatObligations(requestId, vrn, hmrcAccessToken, govClientHeaders, testScenario, {
        from,
        to,
        status,
      }));

      // Generate error responses based on HMRC response
      if (hmrcResponse && !hmrcResponse.ok) {
        if (hmrcResponse.status === 403) {
          return http403ForbiddenFromHmrcResponse(hmrcAccessToken, requestId, hmrcResponse, responseHeaders);
        } else if (hmrcResponse.status === 404) {
          return http404NotFoundFromHmrcResponse(request, requestId, hmrcResponse, responseHeaders);
        } else {
          return http500ServerErrorFromHmrcResponse(request, requestId, hmrcResponse, responseHeaders);
        }
      }
    }
  } catch (error) {
    logger.error({
      requestId,
      message: "Error in handler",
      error: error.message,
      stack: error.stack,
    });
    return http500ServerErrorResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }

  return http200OkResponse({
    request,
    requestId,
    headers: { ...responseHeaders },
    data: obligations,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getVatObligations(requestId, vrn, hmrcAccessToken, govClientHeaders, testScenario, hmrcQueryParams = {}) {
  const hmrcRequestUrl = `/organisations/vat/${vrn}/obligations`;
  const hmrcResponse = await hmrcHttpGet(requestId, hmrcRequestUrl, hmrcAccessToken, govClientHeaders, testScenario, hmrcQueryParams);

  if (!hmrcResponse.ok) {
    return { hmrcResponse, obligations: null };
  }
  return { hmrcResponse, obligations: hmrcResponse.data, hmrcRequestUrl };
}
