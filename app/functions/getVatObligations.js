// app/functions/getVatObligations.js

import dotenv from "dotenv";
import logger from "../lib/logger.js";
import {
  extractRequest,
  httpBadRequestResponse,
  httpOkResponse,
  httpServerErrorResponse,
  extractClientIPFromHeaders,
} from "../lib/responses.js";
import eventToGovClientHeaders from "../lib/eventToGovClientHeaders.js";
import { hmrcVatGet, shouldUseStub, getStubData } from "../lib/hmrcVatApi.js";

dotenv.config({ path: ".env" });

// GET /api/vat/obligations
export async function httpGet(event) {
  const request = extractRequest(event);
  const detectedIP = extractClientIPFromHeaders(event);

  // Extract query parameters
  const queryParams = event.queryStringParameters || {};
  const { vrn, from, to, status, "Gov-Test-Scenario": testScenario } = queryParams;

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

  // Validate status if provided
  if (status && !["O", "F"].includes(status)) {
    errorMessages.push("Invalid status - must be O (Open) or F (Fulfilled)");
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
    let obligations;

    // Check if we should use stubbed data
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
      // Build query parameters for HMRC API
      const hmrcQueryParams = {};
      if (from) hmrcQueryParams.from = from;
      if (to) hmrcQueryParams.to = to;
      if (status) hmrcQueryParams.status = status;

      // Call HMRC API
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

    // Return successful response
    return httpOkResponse({
      request,
      data: obligations,
    });
  } catch (error) {
    logger.error({
      message: "Error retrieving VAT obligations",
      error: error.message,
      stack: error.stack,
    });

    return httpServerErrorResponse({
      request,
      headers: { ...govClientHeaders },
      message: "Internal server error retrieving VAT obligations",
      error: error.message,
    });
  }
}
