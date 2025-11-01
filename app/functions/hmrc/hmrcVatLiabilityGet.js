// app/functions/getVatLiabilities.js

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

// GET /api/v1/hmrc/vat/liability
export async function handler(event) {
  const request = extractRequest(event);
  const detectedIP = extractClientIPFromHeaders(event);

  // Extract query parameters
  const queryParams = event.queryStringParameters || {};
  const { vrn, from, to, "Gov-Test-Scenario": testScenario } = queryParams;

  // Validation
  let errorMessages = [];
  if (!vrn) {
    errorMessages.push("Missing vrn parameter");
  }

  // Validate VRN format (9 digits)
  if (vrn && !/^\d{9}$/.test(vrn)) {
    errorMessages.push("Invalid vrn format - must be 9 digits");
  }

  // Validate date formats if provided
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    errorMessages.push("Invalid from date format - must be YYYY-MM-DD");
  }
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    errorMessages.push("Invalid to date format - must be YYYY-MM-DD");
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
    let liabilities;

    // Check if we should use stubbed data
    if (shouldUseStub("TEST_VAT_LIABILITIES")) {
      logger.info({ message: "Using stubbed VAT liabilities data", testScenario });
      liabilities = getStubData("TEST_VAT_LIABILITIES", {
        liabilities: [
          {
            taxPeriod: {
              from: "2024-01-01",
              to: "2024-03-31",
            },
            type: "VAT Return Debit Charge",
            originalAmount: 1000.5,
            outstandingAmount: 500.25,
            due: "2024-05-07",
          },
        ],
      });
    } else {
      // Build query parameters for HMRC API
      const hmrcQueryParams = {};
      if (from) hmrcQueryParams.from = from;
      if (to) hmrcQueryParams.to = to;

      // Call HMRC API
      const hmrcResult = await hmrcVatGet(
        `/organisations/vat/${vrn}/liabilities`,
        accessToken,
        govClientHeaders,
        testScenario,
        hmrcQueryParams,
      );

      if (!hmrcResult.ok) {
        return httpServerErrorResponse({
          request,
          headers: { ...govClientHeaders },
          message: "HMRC VAT liabilities retrieval failed",
          error: {
            hmrcResponseCode: hmrcResult.status,
            responseBody: hmrcResult.data,
          },
        });
      }

      liabilities = hmrcResult.data;
    }

    // Return successful response
    return httpOkResponse({
      request,
      data: liabilities,
    });
  } catch (error) {
    logger.error({
      message: "Error retrieving VAT liabilities",
      error: error.message,
      stack: error.stack,
    });

    return httpServerErrorResponse({
      request,
      headers: { ...govClientHeaders },
      message: "Internal server error retrieving VAT liabilities",
      error: error.message,
    });
  }
}
