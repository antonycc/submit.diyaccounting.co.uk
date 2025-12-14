// app/functions/hmrc/hmrcVatReturnGet.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  extractClientIPFromHeaders,
  buildValidationError,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  hmrcHttpGet,
  extractHmrcAccessTokenFromLambdaEvent,
  http403ForbiddenFromHmrcResponse,
  http404NotFoundFromHmrcResponse,
  http500ServerErrorFromHmrcResponse,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/hmrcApi.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { executeWithDeferral } from "../../services/deferredExecution.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcVatReturnGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.get(`/api/v1/hmrc/vat/return/:periodKey`, async (httpRequest, httpResponse) => {
    // process.env.HMRC_BASE_URI = process.env.HMRC_PROXY_BASE_URI;
    // process.env.HMRC_SANDBOX_BASE_URI = process.env.HMRC_PROXY_BASE_URI;
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

  // Extract HMRC account (sandbox/live) from header hmrcAccount
  const hmrcAccountHeader = (event.headers && event.headers.hmrcaccount) || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "sandbox" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'sandbox' or 'live' if provided.");
  }

  return { vrn, periodKey: normalizedPeriodKey, testScenario, hmrcAccount };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv([
    "HMRC_BASE_URI",
    "HMRC_SANDBOX_BASE_URI",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "DEFERRED_REQUESTS_DYNAMODB_TABLE_NAME",
  ]);

  const { request } = extractRequest(event);
  let errorMessages = [];

  // Bundle enforcement
  let userSub;
  try {
    userSub = await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  // If HEAD request, return 200 OK immediately after bundle enforcement
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  const detectedIP = extractClientIPFromHeaders(event);
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Extract and validate parameters
  const { vrn, periodKey, testScenario, hmrcAccount } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { ...govClientHeaders };

  // Non-authorization validation errors
  if (errorMessages.length > 0) {
    const hmrcAccessTokenMaybe = extractHmrcAccessTokenFromLambdaEvent(event);
    if (!hmrcAccessTokenMaybe) errorMessages.push("Missing Authorization Bearer token");
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Validate token after validating other inputs
  const hmrcAccessToken = extractHmrcAccessTokenFromLambdaEvent(event);
  if (!hmrcAccessToken) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: "Missing Authorization Bearer token",
    });
  }
  try {
    validateHmrcAccessToken(hmrcAccessToken);
  } catch (err) {
    if (err instanceof UnauthorizedTokenError) {
      return http401UnauthorizedResponse({ request, headers: { ...responseHeaders }, message: err.message, error: {} });
    }
    return buildValidationError(request, [err.toString()], responseHeaders);
  }

  // Processing
  try {
    logger.info({ message: "Checking for stubbed VAT return data", vrn, periodKey, testScenario });

    // Wrap the async operation with deferred execution support
    const asyncOperation = async () => {
      const result = await getVatReturn(vrn, periodKey, hmrcAccessToken, govClientHeaders, testScenario, hmrcAccount, userSub);

      // Generate error responses based on HMRC response
      if (result.hmrcResponse && !result.hmrcResponse.ok) {
        if (result.hmrcResponse.status === 403) {
          return http403ForbiddenFromHmrcResponse(hmrcAccessToken, result.hmrcResponse, responseHeaders);
        } else if (result.hmrcResponse.status === 404) {
          return http404NotFoundFromHmrcResponse(request, result.hmrcResponse, responseHeaders);
        } else {
          return http500ServerErrorFromHmrcResponse(request, result.hmrcResponse, responseHeaders);
        }
      }

      // Return successful response
      logger.info({ message: "Successfully retrieved VAT return", vrn, periodKey });
      return http200OkResponse({
        request,
        headers: { ...responseHeaders },
        data: result.vatReturn,
      });
    };

    // Execute with deferred support - will return 202 if timeout occurs
    const requestParams = { vrn, periodKey, testScenario, hmrcAccount };
    return await executeWithDeferral(asyncOperation, event, request, requestParams, userSub);
  } catch (error) {
    logger.error({ message: "Error while retrieving VAT return from HMRC", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getVatReturn(vrn, periodKey, hmrcAccessToken, govClientHeaders, testScenario, hmrcAccount, auditForUserSub) {
  const hmrcRequestUrl = `/organisations/vat/${vrn}/returns/${periodKey}`;
  const hmrcResponse = await hmrcHttpGet(hmrcRequestUrl, hmrcAccessToken, govClientHeaders, testScenario, hmrcAccount, {}, auditForUserSub);

  if (!hmrcResponse.ok) {
    // Consumers of this function may choose to map these to HTTP responses
    return { hmrcResponse, vatReturn: null };
  }
  return { hmrcResponse, vatReturn: hmrcResponse.data, hmrcRequestUrl };
}
