// app/functions/hmrc/hmrcVatObligationGet.js

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
  validateFraudPreventionHeaders,
} from "../../services/hmrcApi.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidVrn, isValidIsoDate, isValidDateRange } from "../../lib/hmrcValidation.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcVatObligationGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/hmrc/vat/obligation", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/hmrc/vat/obligation", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const queryParams = event.queryStringParameters || {};
  const { vrn, from, to, status, "Gov-Test-Scenario": testScenario } = queryParams;

  if (!vrn) errorMessages.push("Missing vrn parameter");
  if (vrn && !isValidVrn(vrn)) errorMessages.push("Invalid vrn format - must be 9 digits");
  if (from && !isValidIsoDate(from)) errorMessages.push("Invalid from date format - must be YYYY-MM-DD");
  if (to && !isValidIsoDate(to)) errorMessages.push("Invalid to date format - must be YYYY-MM-DD");
  if (status && !["O", "F"].includes(status)) errorMessages.push("Invalid status - must be O (Open) or F (Fulfilled)");

  // If from or to are not set, set them to the beginning of the current calendar year to today
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const defaultFromDate = `${currentYear}-01-01`;
  const defaultToDate = currentDate.toISOString().split("T")[0]; // YYYY-MM-DD
  const finalFrom = from || defaultFromDate;
  const finalTo = to || defaultToDate;

  // Additional validation: from date should not be after to date
  if (from && to && !isValidDateRange(finalFrom, finalTo)) {
    errorMessages.push("Invalid date range - from date cannot be after to date");
  }

  // Extract HMRC account (sandbox/live) from header hmrcAccount
  const hmrcAccountHeader = (event.headers && event.headers.hmrcaccount) || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "sandbox" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'sandbox' or 'live' if provided.");
  }

  return { vrn, from: finalFrom, to: finalTo, status, testScenario, hmrcAccount };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "HMRC_SANDBOX_BASE_URI", "BUNDLE_DYNAMODB_TABLE_NAME", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME"]);

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
  const { vrn, from, to, status, testScenario, hmrcAccount } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { ...govClientHeaders };

  // Non-authorization validation errors
  if (errorMessages.length > 0) {
    const hmrcAccessTokenMaybe = extractHmrcAccessTokenFromLambdaEvent(event);
    if (!hmrcAccessTokenMaybe) errorMessages.push("Missing Authorization Bearer token");
    return buildValidationError(request, errorMessages, responseHeaders);
  }

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

  // Keep local override for test scenarios in a consistent variable name
  const govTestScenarioHeader = govClientHeaders["Gov-Test-Scenario"] || testScenario;

  // Simulate an immediate API (this lambda) failure for testing, mirroring POST handler
  logger.info({ "Checking for test scenario": govTestScenarioHeader });
  if (govTestScenarioHeader === "SUBMIT_API_HTTP_500") {
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: `Simulated server error for testing scenario: ${govTestScenarioHeader}`,
    });
  }

  // Processing
  let obligations;
  let hmrcResponse;
  try {
    // Check if we should use stubbed data
    logger.info({ message: "Checking for stubbed VAT obligations data", testScenario: govTestScenarioHeader });
    ({ obligations, hmrcResponse } = await getVatObligations(
      vrn,
      hmrcAccessToken,
      govClientHeaders,
      govTestScenarioHeader,
      hmrcAccount, // TODO: Instead of the account, the prod/sandbox should be picked in the lambda and allow a local proxy override
      {
        from,
        to,
        status,
      },
      userSub,
    ));

    // Generate error responses based on HMRC response
    if (hmrcResponse && !hmrcResponse.ok) {
      if (hmrcResponse.status === 403) {
        return http403ForbiddenFromHmrcResponse(hmrcAccessToken, hmrcResponse, responseHeaders);
      } else if (hmrcResponse.status === 404) {
        return http404NotFoundFromHmrcResponse(request, hmrcResponse, responseHeaders);
      } else {
        return http500ServerErrorFromHmrcResponse(request, hmrcResponse, responseHeaders);
      }
    }
  } catch (error) {
    logger.error({
      message: "Error in handler",
      error: error.message,
      stack: error.stack,
    });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: obligations,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getVatObligations(
  vrn,
  hmrcAccessToken,
  govClientHeaders,
  testScenario,
  hmrcAccount,
  hmrcQueryParams = {},
  auditForUserSub,
) {
  // Validate fraud prevention headers for sandbox accounts
  if (hmrcAccount === "sandbox") {
    await validateFraudPreventionHeaders(hmrcAccessToken, govClientHeaders, auditForUserSub);
  }

  const hmrcRequestUrl = `/organisations/vat/${vrn}/obligations`;
  let hmrcResponse = {};
  /* v8 ignore start */
  // TODO: Move the error simulation into the proxy (mirrors POST implementation)
  if (testScenario === "SUBMIT_HMRC_API_HTTP_500") {
    logger.error({ message: `Simulated server error for testing scenario: ${testScenario}` });
    hmrcResponse.ok = false;
    hmrcResponse.status = 500;
  } else if (testScenario === "SUBMIT_HMRC_API_HTTP_503") {
    logger.error({ message: `Simulated server unavailable for testing scenario: ${testScenario}` });
    hmrcResponse.ok = false;
    hmrcResponse.status = 503;
  } else {
    if (testScenario === "SUBMIT_HMRC_API_HTTP_SLOW_10S") {
      // Strip Gov-Test-Scenario from headers to avoid triggering reject from HMRC
      delete govClientHeaders["Gov-Test-Scenario"];
      const slowTime = 10000;
      logger.warn({ message: `Simulating slow HMRC API response for testing scenario (waiting...): ${testScenario}`, slowTime });
      await new Promise((resolve) => setTimeout(resolve, slowTime));
      logger.warn({ message: `Simulating slow HMRC API response for testing scenario (waited): ${testScenario}`, slowTime });
    }
    /* v8 ignore stop */
    hmrcResponse = await hmrcHttpGet(
      hmrcRequestUrl,
      hmrcAccessToken,
      govClientHeaders,
      testScenario === "SUBMIT_HMRC_API_HTTP_SLOW_10S" ? null : testScenario,
      hmrcAccount,
      hmrcQueryParams,
      auditForUserSub,
    );
  }

  if (!hmrcResponse.ok) {
    return { hmrcResponse, obligations: null };
  }
  return { hmrcResponse, obligations: hmrcResponse.data, hmrcRequestUrl };
}
