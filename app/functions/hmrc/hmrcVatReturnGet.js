// app/functions/hmrcVatReturnGet.js

import logger from "../../lib/logger.js";
import {
  extractRequest,
  httpBadRequestResponse,
  httpOkResponse,
  httpServerErrorResponse,
  extractClientIPFromHeaders,
  extractAuthToken,
  buildValidationError,
  withErrorHandling,
} from "../../lib/responses.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { hmrcVatGet, shouldUseStub, getStubData } from "../../lib/hmrcVatApi.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
// import { requireActivity } from "../../lib/entitlementsService.js";

export function apiEndpoint(app) {
  // VAT Return endpoint (view submitted return)
  // requireActivity("view-vat-return-sandbox"),
  app.get(`/api/v1/hmrc/vat/return/:periodKey`, async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// GET /api/v1/hmrc/vat/return/:periodKey?sandbox={true|false}
export async function handler(event) {
  const request = extractRequest(event);
  const detectedIP = extractClientIPFromHeaders(event);

  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};
  const { vrn, periodKey, sandbox } = { ...pathParams, ...queryParams };
  const { "Gov-Test-Scenario": testScenario } = queryParams;
  const useSandbox = sandbox === "true";

  let errorMessages = [];
  if (!vrn) errorMessages.push("Missing vrn parameter");
  if (!periodKey) errorMessages.push("Missing periodKey parameter");
  if (vrn && !/^\d{9}$/.test(vrn)) errorMessages.push("Invalid vrn format - must be 9 digits");
  if (periodKey && !/^[A-Z0-9#]{3,5}$/i.test(periodKey)) errorMessages.push("Invalid periodKey format");

  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, govClientHeaders);
  }

  const accessToken = extractAuthToken(event);
  if (!accessToken) {
    return httpBadRequestResponse({
      request,
      headers: { ...govClientHeaders },
      message: "Missing Authorization Bearer token",
    });
  }

  return withErrorHandling(request, govClientHeaders, async () => {
    let vatReturn;

    // Check if we should use stubbed data
    logger.info({ message: "Checking for stubbed VAT return data", vrn, periodKey, testScenario });
    if (shouldUseStub("TEST_VAT_RETURN")) {
      logger.warn({ message: "[MOCK] Using stubbed VAT return data", vrn, periodKey, testScenario });
      vatReturn = getStubData("TEST_VAT_RETURN");
    } else {
      // Call HMRC API
      logger.info({ message: "Retrieving VAT return from HMRC", vrn, periodKey, testScenario, useSandbox });
      const hmrcResult = await hmrcVatGet(
        `/organisations/vat/${vrn}/returns/${periodKey}`,
        accessToken,
        govClientHeaders,
        testScenario,
        {},
        useSandbox,
      );

      if (!hmrcResult.ok) {
        if (hmrcResult.status === 404) {
          logger.warn({
            message: "VAT return not found for specified period",
            vrn,
            periodKey,
            hmrcResponseCode: hmrcResult.status,
            responseBody: hmrcResult.data,
          });
          return httpBadRequestResponse({
            request,
            headers: { ...govClientHeaders },
            message: "VAT return not found for the specified period",
            error: {
              hmrcResponseCode: hmrcResult.status,
              responseBody: hmrcResult.data,
            },
          });
        }

        logger.error({
          message: "HMRC VAT return retrieval failed",
          vrn,
          periodKey,
          hmrcResponseCode: hmrcResult.status,
          responseBody: hmrcResult.data,
        });
        return httpServerErrorResponse({
          request,
          headers: { ...govClientHeaders },
          message: "HMRC VAT return retrieval failed",
          error: {
            hmrcResponseCode: hmrcResult.status,
            responseBody: hmrcResult.data,
          },
        });
      }

      vatReturn = hmrcResult.data;
    }

    // Return successful response
    logger.info({ message: "Successfully retrieved VAT return", vrn, periodKey });
    return httpOkResponse({
      request,
      data: vatReturn,
    });
  });
}
