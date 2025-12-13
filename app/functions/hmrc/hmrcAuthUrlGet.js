// app/functions/hmrc/hmrcAuthUrlGet.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http500ServerErrorResponse, buildValidationError } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcAuthUrlGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.get("/api/v1/hmrc/authUrl", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/hmrc/authUrl", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export function extractAndValidateParameters(event, errorMessages) {
  const queryParams = event.queryStringParameters || {};
  const { state, scope } = queryParams;
  const requestedScope = scope || "write:vat read:vat";
  const validScopes = ["write:vat", "read:vat", "write:vat read:vat", "read:vat write:vat"];

  // Collect validation errors for required fields
  if (!state) errorMessages.push("Missing state query parameter from URL");
  if (!validScopes.includes(requestedScope)) {
    errorMessages.push("Invalid scope parameter. Must be one of: write:vat, read:vat, or write:vat read:vat");
  }

  // Extract HMRC account (sandbox/live) from header hmrcAccount
  const hmrcAccountHeader = (event.headers && event.headers.hmrcaccount) || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "sandbox" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'sandbox' or 'live' if provided.");
  }

  return { state, requestedScope, hmrcAccount };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "HMRC_CLIENT_ID", "HMRC_SANDBOX_BASE_URI", "HMRC_SANDBOX_CLIENT_ID", "DIY_SUBMIT_BASE_URL"]);

  const { request } = extractRequest(event);
  const errorMessages = [];

  // If HEAD request, return 200 OK immediately
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  // Extract and validate parameters
  const { state, requestedScope, hmrcAccount } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = {};

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Processing
  try {
    logger.info({ message: "Generating HMRC authorization URL", state, scope: requestedScope });
    const { authUrl } = buildAuthUrl(state, requestedScope, hmrcAccount);

    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: { authUrl },
    });
  } catch (error) {
    logger.error({ message: "Error generating HMRC authorization URL", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export function buildAuthUrl(state, scope, hmrcAccount) {
  const clientId = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_ID : process.env.HMRC_CLIENT_ID;
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`;
  const hmrcBase = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;

  const authUrl =
    `${hmrcBase}/oauth/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  return { authUrl };
}
