// app/functions/getVatPenalties.js

import logger from "../../lib/logger.js";
import {
  extractRequest,
  httpBadRequestResponse,
  httpOkResponse,
  httpServerErrorResponse,
  extractClientIPFromHeaders,
} from "../../lib/responses.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { hmrcVatGet, shouldUseStub, getStubData } from "../../lib/hmrcVatApi.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { requireActivity } from "../../lib/entitlementsService.js";

export function apiEndpoint(app) {
  // VAT Penalties endpoint
  app.get("/api/v1/hmrc/vat/penalty", requireActivity("vat-obligations"), async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// GET /api/v1/hmrc/vat/penalty
export async function handler(event) {
  const request = extractRequest(event);
  const detectedIP = extractClientIPFromHeaders(event);

  // Extract query parameters
  const queryParams = event.queryStringParameters || {};
  const { vrn, "Gov-Test-Scenario": testScenario } = queryParams;

  // Validation
  let errorMessages = [];
  if (!vrn) {
    errorMessages.push("Missing vrn parameter");
  }

  // Validate VRN format (9 digits)
  if (vrn && !/^\d{9}$/.test(vrn)) {
    errorMessages.push("Invalid vrn format - must be 9 digits");
  }

  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  if (errorMessages.length > 0) {
    return httpBadRequestResponse({
      request,
      headers: { ...govClientHeaders },
      message: errorMessages.join(", "),
    });
  }

  // Extract access token from headers
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return httpBadRequestResponse({
      request,
      headers: { ...govClientHeaders },
      message: "Missing Authorization Bearer token",
    });
  }
  const accessToken = authHeader.split(" ")[1];

  try {
    let penalties;

    // Check if we should use stubbed data
    if (shouldUseStub("TEST_VAT_PENALTIES")) {
      logger.info({ message: "Using stubbed VAT penalties data", testScenario });
      penalties = getStubData("TEST_VAT_PENALTIES", {
        penalties: [
          {
            penaltyCategory: "LPP1",
            penaltyChargeReference: "CHARGEREF123456789",
            penaltyAmount: 200.0,
            period: {
              from: "2024-01-01",
              to: "2024-03-31",
            },
            triggerDate: "2024-05-08",
            vatOutstandingAmount: 1000.5,
          },
        ],
      });
    } else {
      // Call HMRC API
      const hmrcResult = await hmrcVatGet(`/organisations/vat/${vrn}/penalties`, accessToken, govClientHeaders, testScenario);

      if (!hmrcResult.ok) {
        return httpServerErrorResponse({
          request,
          headers: { ...govClientHeaders },
          message: "HMRC VAT penalties retrieval failed",
          error: {
            hmrcResponseCode: hmrcResult.status,
            responseBody: hmrcResult.data,
          },
        });
      }

      penalties = hmrcResult.data;
    }

    // Return successful response
    return httpOkResponse({
      request,
      data: penalties,
    });
  } catch (error) {
    logger.error({
      message: "Error retrieving VAT penalties",
      error: error.message,
      stack: error.stack,
    });

    return httpServerErrorResponse({
      request,
      headers: { ...govClientHeaders },
      message: "Internal server error retrieving VAT penalties",
      error: error.message,
    });
  }
}
