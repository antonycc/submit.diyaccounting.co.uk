// app/functions/hmrcVatReturnPost.js

import { createLogger, context } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  extractClientIPFromHeaders,
  parseRequestBody,
  buildValidationError,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  http403ForbiddenFromBundleEnforcement,
  generateHmrcErrorResponseWithRetryAdvice,
  hmrcHttpPost,
  validateFraudPreventionHeaders,
} from "../../services/hmrcApi.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcVatReturnPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/vat/return", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/hmrc/vat/return", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const { vatNumber, periodKey, vatDue, accessToken, hmrcAccessToken: hmrcAccessTokenInBody } = parsedBody || {};
  // TODO: Remove the alternate paths at source, then remove this compatibility code
  // accessToken takes precedence over hmrcAccessToken for backward compatibility and ergonomics
  const hmrcAccessToken = accessToken || hmrcAccessTokenInBody;

  // Collect validation errors for required fields
  if (!vatNumber) errorMessages.push("Missing vatNumber parameter from body");
  if (!periodKey) errorMessages.push("Missing periodKey parameter from body");
  if (vatDue !== 0 && !vatDue) errorMessages.push("Missing vatDue parameter from body");

  // Additional numeric/format validations
  const numVatDue = typeof vatDue === "number" ? vatDue : Number(vatDue);
  if (vatDue !== undefined && vatDue !== null && Number.isNaN(numVatDue)) {
    errorMessages.push("Invalid vatDue - must be a number");
  }
  if (vatNumber && !/^\d{9}$/.test(String(vatNumber))) {
    errorMessages.push("Invalid vatNumber format - must be 9 digits");
  }
  if (periodKey && !/^[A-Z0-9#]{3,5}$/i.test(String(periodKey))) {
    errorMessages.push("Invalid periodKey format");
  }

  // Extract HMRC account (sandbox/live) from header hmrcAccount
  const hmrcAccountHeader = (event.headers && event.headers.hmrcaccount) || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "sandbox" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'sandbox' or 'live' if provided.");
  }

  return { vatNumber, periodKey, hmrcAccessToken, numVatDue, hmrcAccount };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "RECEIPTS_DYNAMODB_TABLE_NAME", "BUNDLE_DYNAMODB_TABLE_NAME", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME"]);

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

  // Extract and validate parameters
  const { vatNumber, periodKey, hmrcAccessToken, numVatDue, hmrcAccount } = extractAndValidateParameters(event, errorMessages);

  // Generate Gov-Client headers and collect any header-related validation errors
  const detectedIP = extractClientIPFromHeaders(event);
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  const govTestScenarioHeader = govClientHeaders["Gov-Test-Scenario"];
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Normalise periodKey to uppercase for HMRC if provided as string
  const normalizedPeriodKey = typeof periodKey === "string" ? periodKey.toUpperCase() : periodKey;

  const responseHeaders = { ...govClientHeaders };

  // Non-authorization validation errors (collect field/header issues first)
  if (errorMessages.length > 0) {
    if (!hmrcAccessToken) errorMessages.push("Missing accessToken parameter from body");
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Validate token format only after other validation passes
  try {
    validateHmrcAccessToken(hmrcAccessToken);
  } catch (err) {
    // If token is explicitly unauthorized, return 401; otherwise return 400 with validation message only
    if (err instanceof UnauthorizedTokenError) {
      return http401UnauthorizedResponse({
        request,
        headers: { ...responseHeaders },
        message: err.message,
        error: {},
      });
    }
    return buildValidationError(request, [err.toString()], responseHeaders);
  }

  logger.info({ "Checking for test scenario": govTestScenarioHeader });
  if (govTestScenarioHeader === "SUBMIT_API_HTTP_500") {
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: `Simulated server error for testing scenario: ${govTestScenarioHeader}`,
    });
  }

  // Processing
  let receipt;
  let hmrcResponse;
  let hmrcResponseBody;
  try {
    logger.info({
      message: "Submitting VAT return to HMRC",
      vatNumber,
      periodKey: normalizedPeriodKey,
    });
    ({ receipt, hmrcResponse, hmrcResponseBody } = await submitVat(
      normalizedPeriodKey,
      numVatDue,
      vatNumber,
      hmrcAccount,
      hmrcAccessToken,
      govClientHeaders,
      userSub,
      govTestScenarioHeader,
    ));
  } catch (error) {
    // Preserve original behavior expected by tests: bubble up network errors
    logger.error({
      message: "Error while submitting VAT to HMRC",
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }

  // Generate error responses based on HMRC response
  if (!hmrcResponse.ok) {
    return generateHmrcErrorResponseWithRetryAdvice(request, hmrcResponse, hmrcResponseBody, hmrcAccessToken, responseHeaders);
  }

  // Generate a success response
  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: {
      receipt,
    },
  });
}

// Service adaptor for aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function submitVat(
  periodKey,
  vatDue,
  vatNumber,
  hmrcAccount,
  hmrcAccessToken,
  govClientHeaders,
  auditForUserSub,
  govTestScenarioHeader,
) {
  // Validate fraud prevention headers for sandbox accounts
  if (hmrcAccount === "sandbox") {
    await validateFraudPreventionHeaders(hmrcAccessToken, govClientHeaders, auditForUserSub);
  }

  const hmrcRequestHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${hmrcAccessToken}`,
    "x-request-id": context.get("requestId"),
    ...(context.get("correlationId") || context.get("requestId")
      ? { "x-correlationid": context.get("correlationId") || context.get("requestId") }
      : {}),
  };
  const hmrcRequestBody = {
    periodKey,
    vatDueSales: parseFloat(vatDue),
    vatDueAcquisitions: 0,
    totalVatDue: parseFloat(vatDue),
    vatReclaimedCurrPeriod: 0,
    netVatDue: parseFloat(vatDue),
    totalValueSalesExVAT: 0,
    totalValuePurchasesExVAT: 0,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
    finalised: true,
  };
  let hmrcResponseBody;
  let hmrcResponse = {};

  const hmrcBase = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/organisations/vat/${vatNumber}/returns`;
  /* v8 ignore start */
  // TODO: Move the error simulation into the proxy
  if (govTestScenarioHeader === "SUBMIT_HMRC_API_HTTP_500") {
    logger.error({ message: `Simulated server error for testing scenario: ${govTestScenarioHeader}` });
    hmrcResponse.ok = false;
    hmrcResponse.status = 500;
  } else if (govTestScenarioHeader === "SUBMIT_HMRC_API_HTTP_503") {
    logger.error({ message: `Simulated server unavailable for testing scenario: ${govTestScenarioHeader}` });
    hmrcResponse.ok = false;
    hmrcResponse.status = 503;
  } else {
    if (govTestScenarioHeader === "SUBMIT_HMRC_API_HTTP_SLOW_10S") {
      // Strip Gov-Test-Scenario from headers to avoid triggering reject from HMRC
      delete hmrcRequestHeaders["Gov-Test-Scenario"];
      delete govClientHeaders["Gov-Test-Scenario"];
      const slowTime = 10000;
      logger.warn({ message: `Simulating slow HMRC API response for testing scenario (waiting...): ${govTestScenarioHeader}`, slowTime });
      await new Promise((resolve) => setTimeout(resolve, slowTime));
      logger.warn({ message: `Simulating slow HMRC API response for testing scenario (waited): ${govTestScenarioHeader}`, slowTime });
    }
    /* v8 ignore stop */
    logHmrcRequestDetails(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody);
    const httpResult = await hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub);
    logger.info({ message: `Received HMRC response: ${JSON.stringify(httpResult.hmrcResponse)}`, httpResult });
    hmrcResponse = httpResult.hmrcResponse;
    hmrcResponseBody = httpResult.hmrcResponseBody;
  }

  return { hmrcRequestBody, receipt: hmrcResponseBody, hmrcResponse, hmrcResponseBody, hmrcRequestUrl };
}

function logHmrcRequestDetails(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody) {
  logger.info({
    message: `Request to POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
    },
    body: hmrcRequestBody,
    environment: {
      // nodeEnv: process.env.NODE_ENV,
    },
  });
}
