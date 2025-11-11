// app/functions/hmrc/hmrcVatReturnGet.js

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
} from "../../lib/hmrcHelper.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.get(`/api/v1/hmrc/vat/return/:periodKey`, async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};
  const { vrn, periodKey } = { ...pathParams, ...queryParams };
  const { "Gov-Test-Scenario": testScenario } = queryParams;

  // Collect validation errors for required fields and formats
  if (!vrn) errorMessages.push("Missing vrn parameter");
  if (!periodKey) errorMessages.push("Missing periodKey parameter");
  if (vrn && !/^\d{9}$/.test(String(vrn))) errorMessages.push("Invalid vrn format - must be 9 digits");
  if (periodKey && !/^[A-Z0-9#]{3,5}$/i.test(String(periodKey))) errorMessages.push("Invalid periodKey format");

  // Normalize periodKey to uppercase if provided as string
  const normalizedPeriodKey = typeof periodKey === "string" ? periodKey.toUpperCase() : periodKey;
  return { vrn, periodKey: normalizedPeriodKey, testScenario };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI"]);

  const { request, requestId } = extractRequest(event);
  let errorMessages = [];

  const detectedIP = extractClientIPFromHeaders(event);
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Extract and validate parameters
  const { vrn, periodKey, testScenario } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { ...govClientHeaders, "x-request-id": requestId };

  // Non-authorization validation errors
  if (errorMessages.length > 0) {
    const hmrcAccessTokenMaybe = extractHmrcAccessTokenFromLambdaEvent(event);
    if (!hmrcAccessTokenMaybe) errorMessages.push("Missing Authorization Bearer token");
    return buildValidationError(request, requestId, errorMessages, responseHeaders);
  }

  // Validate token after validating other inputs
  const hmrcAccessToken = extractHmrcAccessTokenFromLambdaEvent(event);
  if (!hmrcAccessToken) {
    return http400BadRequestResponse({ request, requestId, headers: { ...responseHeaders }, message: "Missing Authorization Bearer token" });
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
  let vatReturn;
  let hmrcResponse;
  try {
    logger.info({ requestId, message: "Checking for stubbed VAT return data", vrn, periodKey, testScenario });
    if (shouldUseStub("TEST_VAT_RETURN")) {
      logger.warn({ requestId, message: "[MOCK] Using stubbed VAT return data", vrn, periodKey, testScenario });
      vatReturn = getStubData("TEST_VAT_RETURN");
    } else {
      ({ vatReturn, hmrcResponse } = await getVatReturn(requestId, vrn, periodKey, hmrcAccessToken, govClientHeaders, testScenario));
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
    logger.error({ requestId, message: "Error while retrieving VAT return from HMRC", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }

  // Return successful response
  logger.info({ requestId, message: "Successfully retrieved VAT return", vrn, periodKey });
  return http200OkResponse({
    request,
    requestId,
    headers: { ...responseHeaders },
    data: vatReturn,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getVatReturn(requestId, vrn, periodKey, hmrcAccessToken, govClientHeaders, testScenario) {
  const hmrcRequestUrl = `/organisations/vat/${vrn}/returns/${periodKey}`;
  const hmrcResponse = await hmrcHttpGet(requestId, hmrcRequestUrl, hmrcAccessToken, govClientHeaders, testScenario);

  if (!hmrcResponse.ok) {
    // Consumers of this function may choose to map these to HTTP responses
    return { hmrcResponse, vatReturn: null };
  }
  return { hmrcResponse, vatReturn: hmrcResponse.data, hmrcRequestUrl };
}
