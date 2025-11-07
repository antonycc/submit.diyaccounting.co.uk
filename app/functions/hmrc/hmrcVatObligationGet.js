// app/functions/getVatObligations.js

import logger from "../../lib/logger.js";
import {
  extractRequest,
  httpBadRequestResponse,
  httpOkResponse,
  extractClientIPFromHeaders,
  buildValidationError,
  withErrorHandling,
} from "../../lib/responses.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { hmrcVatGet, shouldUseStub, getStubData } from "../../lib/hmrcVatApi.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import {
  extractHmrcAccessTokenFromLambdaEvent,
  httpForbiddenFromHmrcResponse,
  httpNotFoundFromHmrcResponse,
  httpServerErrorFromHmrcResponse,
  validateHmrcAccessToken,
} from "../../lib/hmrcHelper.js";

export function apiEndpoint(app) {
  app.get("/api/v1/hmrc/vat/obligation", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

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

  const hmrcAccessToken = extractHmrcAccessTokenFromLambdaEvent(event);
  if (!hmrcAccessToken) {
    return httpBadRequestResponse({
      request,
      headers: { ...govClientHeaders },
      message: "Missing Authorization Bearer token",
    });
  }
  validateHmrcAccessToken(hmrcAccessToken);

  return withErrorHandling(request, govClientHeaders, async () => {
    let obligations;

    // Check if we should use stubbed data
    logger.info({ message: "Checking for stubbed VAT obligations data", testScenario });
    if (shouldUseStub("TEST_VAT_OBLIGATIONS")) {
      logger.info({ message: "[MOCK] Using stubbed VAT obligations data", testScenario });
      obligations = getStubData("TEST_VAT_OBLIGATIONS");
    } else {
      logger.info({ message: "Retrieving VAT obligations from HMRC API", vrn, testScenario });
      // Build query parameters for HMRC API
      const hmrcQueryParams = {};
      if (from) hmrcQueryParams.from = from;
      if (to) hmrcQueryParams.to = to;
      if (status) hmrcQueryParams.status = status;

      const hmrcRequestUrl = `/organisations/vat/${vrn}/obligations`;
      const hmrcResponse = await hmrcVatGet(hmrcRequestUrl, hmrcAccessToken, govClientHeaders, testScenario, hmrcQueryParams);

      // Generate error responses based on HMRC response
      if (!hmrcResponse.ok) {
        if (hmrcResponse.status === 403) {
          httpForbiddenFromHmrcResponse(hmrcAccessToken, hmrcResponse, govClientHeaders);
        } else if (hmrcResponse.status === 404) {
          return httpNotFoundFromHmrcResponse(request, hmrcResponse, govClientHeaders);
        } else {
          return httpServerErrorFromHmrcResponse(request, hmrcResponse, govClientHeaders);
        }
      }

      obligations = hmrcResponse.data;
    }

    return httpOkResponse({
      request,
      data: obligations,
    });
  });
}
