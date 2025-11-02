// app/functions/getVatObligations.js

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
  // VAT Obligations endpoint
  // requireActivity("vat-obligations-sandbox"),
  app.get("/api/v1/hmrc/vat/obligation", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// GET /api/v1/hmrc/vat/obligation
export async function handler(event) {
  const request = extractRequest(event);
  const detectedIP = extractClientIPFromHeaders(event);

  const queryParams = event.queryStringParameters || {};
  const { vrn, from, to, status, "Gov-Test-Scenario": testScenario } = queryParams;

  let errorMessages = [];
  if (!vrn) errorMessages.push("Missing vrn parameter");
  if (vrn && !/^\d{9}$/.test(vrn)) errorMessages.push("Invalid vrn format - must be 9 digits");
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) errorMessages.push("Invalid from date format - must be YYYY-MM-DD");
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) errorMessages.push("Invalid to date format - must be YYYY-MM-DD");
  if (status && !["O", "F"].includes(status)) errorMessages.push("Invalid status - must be O (Open) or F (Fulfilled)");

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
    let obligations;

    if (shouldUseStub("TEST_VAT_OBLIGATIONS")) {
      logger.info({ message: "Using stubbed VAT obligations data", testScenario });
      obligations = getStubData("TEST_VAT_OBLIGATIONS", {
        obligations: [
          {
            start: "2024-01-01",
            end: "2024-03-31",
            due: "2024-05-07",
            status: "F",
            periodKey: "24A1",
            received: "2024-05-06",
          },
          {
            start: "2024-04-01",
            end: "2024-06-30",
            due: "2024-08-07",
            status: "O",
            periodKey: "24A2",
          },
        ],
      });
    } else {
      const hmrcQueryParams = {};
      if (from) hmrcQueryParams.from = from;
      if (to) hmrcQueryParams.to = to;
      if (status) hmrcQueryParams.status = status;

      const hmrcResult = await hmrcVatGet(
        `/organisations/vat/${vrn}/obligations`,
        accessToken,
        govClientHeaders,
        testScenario,
        hmrcQueryParams,
      );

      if (!hmrcResult.ok) {
        return httpServerErrorResponse({
          request,
          headers: { ...govClientHeaders },
          message: "HMRC VAT obligations retrieval failed",
          error: {
            hmrcResponseCode: hmrcResult.status,
            responseBody: hmrcResult.data,
          },
        });
      }

      obligations = hmrcResult.data;
    }

    return httpOkResponse({
      request,
      data: obligations,
    });
  });
}
