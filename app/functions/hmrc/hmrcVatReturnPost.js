// app/functions/submitVat.js

import logger from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  extractClientIPFromHeaders,
  parseRequestBody,
  buildValidationError,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
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

function extractAndValidateParameters(event, errorMessages) {
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
  return { vatNumber, periodKey, hmrcAccessToken, numVatDue };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "COGNITO_USER_POOL_ID"]);

  const { request, requestId } = extractRequest(event);
  let errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(requestId, error, request);
  }

  // Extract and validate parameters
  const { vatNumber, periodKey, hmrcAccessToken, numVatDue } = extractAndValidateParameters(event, errorMessages);

  // Generate Gov-Client headers and collect any header-related validation errors
  const detectedIP = extractClientIPFromHeaders(event);
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  // Normalise periodKey to uppercase for HMRC if provided as string
  const normalizedPeriodKey = typeof periodKey === "string" ? periodKey.toUpperCase() : periodKey;
  // Correlation/Request ID header for tracing
  const responseHeaders = { ...govClientHeaders, "x-request-id": requestId };

  // Non-authorization validation errors (collect field/header issues first)
  if (errorMessages.length > 0) {
    if (!hmrcAccessToken) errorMessages.push("Missing accessToken parameter from body");
    return buildValidationError(request, requestId, errorMessages, responseHeaders);
  }

  // Validate token format only after other validation passes
  try {
    validateHmrcAccessToken(hmrcAccessToken, requestId);
  } catch (err) {
    // If token is explicitly unauthorized, return 401; otherwise return 400 with validation message only
    if (err instanceof UnauthorizedTokenError) {
      return http401UnauthorizedResponse({ request, requestId, headers: { ...responseHeaders }, message: err.message, error: {} });
    }
    return buildValidationError(request, requestId, [err.toString()], responseHeaders);
  }

  // Processing
  let receipt;
  let hmrcResponse;
  let hmrcResponseBody;
  try {
    logger.info({ requestId, message: "Submitting VAT return to HMRC", vatNumber, periodKey: normalizedPeriodKey });
    ({ receipt, hmrcResponse, hmrcResponseBody } = await submitVat(
      requestId,
      normalizedPeriodKey,
      numVatDue,
      vatNumber,
      hmrcAccessToken,
      govClientHeaders,
    ));
  } catch (error) {
    // Preserve original behavior expected by tests: bubble up network errors
    logger.error({ requestId, message: "Error while submitting VAT to HMRC", error: error.message, stack: error.stack });
    throw error;
  }

  // Generate error responses based on HMRC response
  if (!hmrcResponse.ok) {
    return generateErrorResponse(request, requestId, hmrcResponse, hmrcResponseBody, hmrcAccessToken, responseHeaders);
  }

  // Generate a success response
  return http200OkResponse({
    request,
    requestId,
    headers: { ...responseHeaders },
    data: {
      receipt,
    },
  });
}

// Service adaptor for aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function submitVat(requestId, periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders) {
  const hmrcRequestHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${hmrcAccessToken}`,
    "x-request-id": requestId,
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
  logHmrcRequestDetails(requestId, hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody);
  if (process.env.NODE_ENV === "stubbed") {
    hmrcResponse = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: hmrcAccessToken }),
      text: async () => JSON.stringify({ access_token: hmrcAccessToken }),
    };
    // TEST_RECEIPT is already a JSON string, so parse it first
    hmrcResponseBody = JSON.parse(process.env.TEST_RECEIPT || "{}");
    logger.warn({ requestId, message: "httpPostMock called in stubbed mode, using test receipt", receipt: hmrcResponseBody });
  } else {
    const timeoutEnv = 20000;
    if (timeoutEnv && Number(timeoutEnv) > 0) {
      const controller = new AbortController();
      const timeoutMs = Number(timeoutEnv);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        hmrcResponse = await fetch(hmrcRequestUrl, {
          method: "POST",
          headers: {
            ...hmrcRequestHeaders,
            ...govClientHeaders,
          },
          body: JSON.stringify(hmrcRequestBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } else {
      hmrcResponse = await fetch(hmrcRequestUrl, {
        method: "POST",
        headers: {
          ...hmrcRequestHeaders,
          ...govClientHeaders,
        },
        body: JSON.stringify(hmrcRequestBody),
      });
    }
    hmrcResponseBody = await hmrcResponse.json();
  }

  return { hmrcRequestBody, receipt: hmrcResponseBody, hmrcResponse, hmrcResponseBody, hmrcRequestUrl };
}

function generateErrorResponse(request, requestId, hmrcResponse, hmrcResponseBody, hmrcAccessToken, responseHeaders) {
  // Attach parsed body for downstream error helpers
  hmrcResponse.data = hmrcResponseBody;
  if (hmrcResponse.status === 403) {
    return http403ForbiddenFromHmrcResponse(hmrcAccessToken, requestId, hmrcResponse, responseHeaders);
  } else if (hmrcResponse.status === 404) {
    return http404NotFoundFromHmrcResponse(request, requestId, hmrcResponse, responseHeaders);
  } else if (hmrcResponse.status === 429) {
    const retryAfter =
      (hmrcResponse.headers &&
        (hmrcResponse.headers.get ? hmrcResponse.headers.get("Retry-After") : hmrcResponse.headers["retry-after"])) ||
      undefined;
    return http500ServerErrorResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      message: "Upstream rate limited. Please retry later.",
      error: { hmrcResponseCode: hmrcResponse.status, responseBody: hmrcResponse.data, retryAfter },
    });
  } else {
    return http500ServerErrorFromHmrcResponse(request, requestId, hmrcResponse, responseHeaders);
  }
}
