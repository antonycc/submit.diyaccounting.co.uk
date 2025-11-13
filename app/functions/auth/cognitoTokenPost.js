// app/functions/auth/cognitoTokenPost.js

import logger from "../../lib/logger.js";
import { extractRequest, buildTokenExchangeResponse, buildValidationError } from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.post("/api/v1/cognito/token", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export function extractAndValidateParameters(event, errorMessages) {
  const decoded = Buffer.from(event.body || "", "base64").toString("utf-8");
  const searchParams = new URLSearchParams(decoded);
  const code = searchParams.get("code");

  // Collect validation errors for required fields
  if (!code) errorMessages.push("Missing code from event body");

  return { code };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["DIY_SUBMIT_BASE_URL", "COGNITO_CLIENT_ID", "COGNITO_BASE_URI"]);

  const { request, requestId } = extractRequest(event);
  const errorMessages = [];

  // Extract and validate parameters
  const { code } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { "x-request-id": requestId };

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, requestId, errorMessages, responseHeaders);
  }

  // Processing
  logger.info({ requestId, message: "Exchanging authorization code for Cognito access token" });
  const tokenResponse = await exchangeCodeForToken(code);
  return buildTokenExchangeResponse(request, tokenResponse.url, tokenResponse.body);
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function exchangeCodeForToken(code) {
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}auth/loginWithCognitoCallback.html`;
  const cognitoClientId = process.env.COGNITO_CLIENT_ID;
  const CognitoBaseUri = process.env.COGNITO_BASE_URI;

  const url = `${CognitoBaseUri}/oauth2/token`;
  const body = {
    grant_type: "authorization_code",
    client_id: cognitoClientId,
    redirect_uri: redirectUri,
    code,
  };

  return { url, body };
}
