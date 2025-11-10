// app/functions/submitVat.js

import logger from "../../lib/logger.js";
import {
  extractRequest,
  httpOkResponse,
  extractClientIPFromHeaders,
  parseRequestBody,
  buildValidationError,
  httpUnauthorizedResponse,
} from "../../lib/responses.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest, logHmrcRequestDetails } from "../../lib/httpHelper.js";
import { enforceBundles } from "../../lib/bundleEnforcement.js";
import {
  UnauthorizedTokenError,
  http403ForbiddenFromHmrcResponse,
  http404NotFoundFromHmrcResponse,
  http500ServerErrorFromHmrcResponse,
  validateHmrcAccessToken,
  http403ForbiddenFromBundleEnforcement,
} from "../../lib/hmrcHelper.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/vat/return", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "COGNITO_USER_POOL_ID"]);

  const request = extractRequest(event);
  let errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  // Extract and validate parameters
  const parsedBody = parseRequestBody(event);
  const { vatNumber, periodKey, vatDue, accessToken, hmrcAccessToken: hmrcAccessTokenInBody } = parsedBody || {};
  const hmrcAccessToken = accessToken || hmrcAccessTokenInBody;

  // Collect validation errors for required fields
  if (!vatNumber) errorMessages.push("Missing vatNumber parameter from body");
  if (!periodKey) errorMessages.push("Missing periodKey parameter from body");
  if (!vatDue) errorMessages.push("Missing vatDue parameter from body");

  // Generate Gov-Client headers and collect any header-related validation errors
  const detectedIP = extractClientIPFromHeaders(event);
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Non-authorization validation errors (collect field/header issues first)
  if (errorMessages.length > 0) {
    if (!hmrcAccessToken) errorMessages.push("Missing accessToken parameter from body");
    return buildValidationError(request, errorMessages, govClientHeaders);
  }

  // Validate token format only after other validation passes
  try {
    validateHmrcAccessToken(hmrcAccessToken);
  } catch (err) {
    // If token is explicitly unauthorized, return 401; otherwise return 400 with validation message only
    if (err instanceof UnauthorizedTokenError) {
      return httpUnauthorizedResponse({ request, headers: { ...govClientHeaders }, message: err.message, error: {} });
    }
    return buildValidationError(request, [err.toString()], govClientHeaders);
  }

  // Processing
  let receipt;
  let hmrcResponse;
  let hmrcResponseBody;
  try {
    ({ receipt, hmrcResponse, hmrcResponseBody } = await submitVat(periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders));
  } catch (error) {
    // Preserve original behavior expected by tests: bubble up network errors
    logger.error({ message: "Error while submitting VAT to HMRC", error: error.message, stack: error.stack });
    throw error;
  }

  // Generate error responses based on HMRC response
  if (!hmrcResponse.ok) {
    // Attach parsed body for downstream error helpers
    hmrcResponse.data = hmrcResponseBody;
    if (hmrcResponse.status === 403) {
      return http403ForbiddenFromHmrcResponse(hmrcAccessToken, hmrcResponse, govClientHeaders);
    } else if (hmrcResponse.status === 404) {
      return http404NotFoundFromHmrcResponse(request, hmrcResponse, govClientHeaders);
    } else {
      return http500ServerErrorFromHmrcResponse(request, hmrcResponse, govClientHeaders);
    }
  }

  // Generate a success response
  return httpOkResponse({
    request,
    data: {
      receipt,
    },
  });
}

// Service adaptor for aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function submitVat(periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders) {
  const hmrcRequestHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${hmrcAccessToken}`,
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
  const hmrcBase = process.env.HMRC_BASE_URI;
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
    logger.warn({ message: "httpPostMock called in stubbed mode, using test receipt", receipt: hmrcResponseBody });
  } else {
    hmrcResponse = await fetch(hmrcRequestUrl, {
      method: "POST",
      headers: {
        ...hmrcRequestHeaders,
        ...govClientHeaders,
      },
      body: JSON.stringify(hmrcRequestBody),
    });
    hmrcResponseBody = await hmrcResponse.json();
  }

  return { hmrcRequestBody, receipt: hmrcResponseBody, hmrcResponse, hmrcResponseBody, hmrcRequestUrl };
}
