// app/functions/getVatObligations.js

import logger from "../../lib/logger.js";
import {
  extractRequest,
  http400BadRequestResponse,
  http200OkResponse,
  extractClientIPFromHeaders,
  buildValidationError,
  http500ServerErrorResponse,
} from "../../lib/responses.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
// Stub controls remain in hmrcVatApi; HTTP client moved to hmrcHelper during refactor
import { shouldUseStub, getStubData } from "../../lib/hmrcVatApi.js";
import { hmrcHttpGet } from "../../lib/hmrcHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import {
  extractHmrcAccessTokenFromLambdaEvent,
  http403ForbiddenFromHmrcResponse,
  http404NotFoundFromHmrcResponse,
  http500ServerErrorFromHmrcResponse,
  validateHmrcAccessToken,
} from "../../lib/hmrcHelper.js";

export function apiEndpoint(app) {
  app.get("/api/v1/hmrc/vat/obligation", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export async function handler(event) {
  const { request, requestId } = extractRequest(event);
  const detectedIP = extractClientIPFromHeaders(event);

  const queryParams = event.queryStringParameters || {};
  const { vrn, from, to, status, "Gov-Test-Scenario": testScenario } = queryParams;

  let errorMessages = [];
  if (!vrn) errorMessages.push("Missing vrn parameter");
  if (vrn && !/^\d{9}$/.test(vrn)) errorMessages.push("Invalid vrn format - must be 9 digits");
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) errorMessages.push("Invalid from date format - must be YYYY-MM-DD");
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) errorMessages.push("Invalid to date format - must be YYYY-MM-DD");
  if (status && !["O", "F"].includes(status)) errorMessages.push("Invalid status - must be O (Open) or F (Fulfilled)");

  // If from or to are not set, set them to the begining of the current calendar year to today
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

  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  if (errorMessages.length > 0) {
    return buildValidationError(request, requestId, errorMessages, govClientHeaders);
  }

  const hmrcAccessToken = extractHmrcAccessTokenFromLambdaEvent(event);
  if (!hmrcAccessToken) {
    return http400BadRequestResponse({
      request,
      headers: { ...govClientHeaders },
      message: "Missing Authorization Bearer token",
    });
  }

  validateHmrcAccessToken(hmrcAccessToken, requestId);

  let obligations;
  try {
    // Check if we should use stubbed data
    logger.info({ requestId, message: "Checking for stubbed VAT obligations data", testScenario });
    if (shouldUseStub("TEST_VAT_OBLIGATIONS")) {
      logger.info({ requestId, message: "[MOCK] Using stubbed VAT obligations data", testScenario });
      obligations = getStubData("TEST_VAT_OBLIGATIONS");
    } else {
      logger.info({ requestId, message: "Retrieving VAT obligations from HMRC API", vrn, testScenario });

      // Build query parameters for HMRC API
      const hmrcQueryParams = {};
      if (from) hmrcQueryParams.from = from;
      if (to) hmrcQueryParams.to = to;
      if (status) hmrcQueryParams.status = status;

      const hmrcRequestUrl = `/organisations/vat/${vrn}/obligations`;
      const hmrcResponse = await hmrcHttpGet(requestId, hmrcRequestUrl, hmrcAccessToken, govClientHeaders, testScenario, hmrcQueryParams);

      // Generate error responses based on HMRC response
      if (!hmrcResponse.ok) {
        if (hmrcResponse.status === 403) {
          return http403ForbiddenFromHmrcResponse(hmrcAccessToken, requestId, hmrcResponse, govClientHeaders);
        } else if (hmrcResponse.status === 404) {
          return http404NotFoundFromHmrcResponse(request, requestId, hmrcResponse, govClientHeaders);
        } else {
          return http500ServerErrorFromHmrcResponse(request, requestId, hmrcResponse, govClientHeaders);
        }
      }
      obligations = hmrcResponse.data;
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
      headers: { ...govClientHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }

  return http200OkResponse({
    request,
    requestId,
    data: obligations,
  });
}
