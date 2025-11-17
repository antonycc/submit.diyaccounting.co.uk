// app/functions/submitVat.js

import { logger, context } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  extractClientIPFromHeaders,
  parseRequestBody,
  buildValidationError,
  http401UnauthorizedResponse,
} from "../../lib/responses.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest, logHmrcRequestDetails } from "../../lib/httpHelper.js";
import { enforceBundles } from "../../lib/bundleEnforcement.js";
import {
  UnauthorizedTokenError,
  validateHmrcAccessToken,
  http403ForbiddenFromBundleEnforcement,
  generateHmrcErrorResponseWithRetryAdvice,
  hmrcHttpPost,
} from "../../lib/hmrcHelper.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/vat/return", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

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
  validateEnv(["HMRC_BASE_URI"]); // "COGNITO_USER_POOL_ID"

  const { request } = extractRequest(event);
  let errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  // Extract and validate parameters
  const { vatNumber, periodKey, hmrcAccessToken, numVatDue, hmrcAccount } = extractAndValidateParameters(event, errorMessages);

  // Generate Gov-Client headers and collect any header-related validation errors
  const detectedIP = extractClientIPFromHeaders(event);
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
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
export async function submitVat(periodKey, vatDue, vatNumber, hmrcAccount, hmrcAccessToken, govClientHeaders) {
  const hmrcRequestHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${hmrcAccessToken}`,
    "x-request-id": context.get("requestId"),
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
  let hmrcResponse;
  const hmrcBase = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/organisations/vat/${vatNumber}/returns`;
  logHmrcRequestDetails(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody);
  if (process.env.NODE_ENV === "stubbed") {
    hmrcResponse = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: hmrcAccessToken }),
      text: async () => JSON.stringify({ access_token: hmrcAccessToken }),
    };
    // TEST_RECEIPT is already a JSON string, so parse it first
    hmrcResponseBody = JSON.parse(process.env.TEST_RECEIPT || "{}");
    logger.warn({
      message: "httpPostMock called in stubbed mode, using test receipt",
      receipt: hmrcResponseBody,
    });
  } else {
    // Perform real HTTP call
    ({ hmrcResponse, hmrcResponseBody } = await hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody));
  }

  return { hmrcRequestBody, receipt: hmrcResponseBody, hmrcResponse, hmrcResponseBody, hmrcRequestUrl };
}
