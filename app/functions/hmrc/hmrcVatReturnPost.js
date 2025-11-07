// app/functions/submitVat.js

import logger from "../../lib/logger.js";
import { extractRequest, httpOkResponse, extractClientIPFromHeaders, parseRequestBody, buildValidationError } from "../../lib/responses.js";
import eventToGovClientHeaders from "../../lib/eventToGovClientHeaders.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { enforceBundles } from "../../lib/bundleEnforcement.js";
import {
  httpForbiddenFromHmrcResponse,
  httpNotFoundFromHmrcResponse,
  httpServerErrorFromBundleEnforcement,
  httpServerErrorFromHmrcResponse,
  validateHmrcAccessToken,
} from "../../lib/hmrcHelper.js";

export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/vat/return", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "COGNITO_USER_POOL_ID"]);

  const request = extractRequest(event);
  let errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return httpServerErrorFromBundleEnforcement(error, request);
  }

  // Extract and validate parameters
  const { vatNumber, periodKey, vatDue, accessToken, hmrcAccessToken: hmrcAccessTokenInBody } = parseRequestBody(event);
  const hmrcAccessToken = accessToken || hmrcAccessTokenInBody;
  if (!vatNumber) errorMessages.push("Missing vatNumber parameter from body");
  if (!periodKey) errorMessages.push("Missing periodKey parameter from body");
  if (!vatDue) errorMessages.push("Missing vatDue parameter from body");
  if (!hmrcAccessToken) errorMessages.push("Missing accessToken parameter from body");

  // Generate and validate Gov-Client headers
  const detectedIP = extractClientIPFromHeaders(event);
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);

  validateHmrcAccessToken(hmrcAccessToken); // TODO: Generate validation errors instead of throwing

  // Fail if any validation errors are present
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, govClientHeaders);
  }

  // Processing
  const { receipt, hmrcResponse } = await submitVat(periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders);

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

  // Generate a success response
  return httpOkResponse({
    request,
    data: {
      receipt,
    },
  });
}

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
  logger.info({
    message: `Request to POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
    },
    body: hmrcRequestBody,
    environment: {
      hmrcBase,
      nodeEnv: process.env.NODE_ENV,
    },
  });
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
