// app/functions/hmrcVatReturnGet.js

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

// GET /api/v1/hmrc/vat/return/:periodKey
export async function httpGet(event) {
  const request = extractRequest(event);
  const detectedIP = extractClientIPFromHeaders(event);

  // Extract path parameters and query parameters
  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};
  const { vrn, periodKey } = { ...pathParams, ...queryParams };
  const { "Gov-Test-Scenario": testScenario } = queryParams;

  // Validation
  let errorMessages = [];
  if (!vrn) {
    errorMessages.push("Missing vrn parameter");
  }
  if (!periodKey) {
    errorMessages.push("Missing periodKey parameter");
  }

  // Validate VRN format (9 digits)
  if (vrn && !/^\d{9}$/.test(vrn)) {
    errorMessages.push("Invalid vrn format - must be 9 digits");
  }

  // Validate periodKey format
  if (periodKey && !/^[A-Z0-9#]{3,5}$/i.test(periodKey)) {
    errorMessages.push("Invalid periodKey format");
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
    let vatReturn;

    // Check if we should use stubbed data
    if (shouldUseStub("TEST_VAT_RETURN")) {
      logger.info({ message: "Using stubbed VAT return data", vrn, periodKey, testScenario });
      vatReturn = getStubData("TEST_VAT_RETURN", {
        periodKey: periodKey,
        vatDueSales: 1000.5,
        vatDueAcquisitions: 0.0,
        totalVatDue: 1000.5,
        vatReclaimedCurrPeriod: 0.0,
        netVatDue: 1000.5,
        totalValueSalesExVAT: 4000.0,
        totalValuePurchasesExVAT: 1000.0,
        totalValueGoodsSuppliedExVAT: 0.0,
        totalAcquisitionsExVAT: 0.0,
        finalised: true,
      });
    } else {
      // Call HMRC API
      const hmrcResult = await hmrcVatGet(`/organisations/vat/${vrn}/returns/${periodKey}`, accessToken, govClientHeaders, testScenario);

      if (!hmrcResult.ok) {
        // Handle 404 specifically for not found returns
        if (hmrcResult.status === 404) {
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
    return httpOkResponse({
      request,
      data: vatReturn,
    });
  } catch (error) {
    logger.error({
      message: "Error retrieving VAT return",
      error: error.message,
      stack: error.stack,
      vrn,
      periodKey,
    });

    return httpServerErrorResponse({
      request,
      headers: { ...govClientHeaders },
      message: "Internal server error retrieving VAT return",
      error: error.message,
    });
  }
}
