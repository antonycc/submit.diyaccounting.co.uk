// app/functions/hmrcVatReturnGet.js

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
import { hmrcVatGet, shouldUseStub, getStubData } from "../../lib/hmrcVatApi.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import {
  extractHmrcAccessTokenFromLambdaEvent,
  http403ForbiddenFromHmrcResponse,
  http404NotFoundFromHmrcResponse,
  http500ServerErrorFromHmrcResponse,
  validateHmrcAccessToken,
} from "../../lib/hmrcHelper.js";

export function apiEndpoint(app) {
  app.get(`/api/v1/hmrc/vat/return/:periodKey`, async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export async function handler(event) {
  const { request, requestId } = extractRequest(event);
  const detectedIP = extractClientIPFromHeaders(event);

  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};
  const { vrn, periodKey } = { ...pathParams, ...queryParams };
  const { "Gov-Test-Scenario": testScenario } = queryParams;

  let errorMessages = [];
  if (!vrn) errorMessages.push("Missing vrn parameter");
  if (!periodKey) errorMessages.push("Missing periodKey parameter");
  if (vrn && !/^\d{9}$/.test(vrn)) errorMessages.push("Invalid vrn format - must be 9 digits");
  if (periodKey && !/^[A-Z0-9#]{3,5}$/i.test(periodKey)) errorMessages.push("Invalid periodKey format");

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

  let vatReturn;
  try {
    logger.info({ requestId, message: "Checking for stubbed VAT return data", vrn, periodKey, testScenario });
    if (shouldUseStub("TEST_VAT_RETURN")) {
      logger.warn({ requestId, message: "[MOCK] Using stubbed VAT return data", vrn, periodKey, testScenario });
      vatReturn = getStubData("TEST_VAT_RETURN");
    } else {
      logger.info({ requestId, message: "Retrieving VAT return from HMRC", vrn, periodKey, testScenario });
      const hmrcRequestUrl = `/organisations/vat/${vrn}/returns/${periodKey}`;
      const hmrcResponse = await hmrcVatGet(requestId, hmrcRequestUrl, hmrcAccessToken, govClientHeaders, testScenario);

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
      vatReturn = hmrcResponse.data;
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

  // Return successful response
  logger.info({ message: "Successfully retrieved VAT return", vrn, periodKey });
  return http200OkResponse({
    request,
    requestId,
    data: vatReturn,
  });
}
