// app/functions/auth/cognitoAuthUrlGet.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http500ServerErrorResponse, buildValidationError } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";

const logger = createLogger({ source: "app/functions/auth/cognitoAuthUrlGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/cognito/authUrl", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/cognito/authUrl", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const queryParams = event.queryStringParameters || {};
  const { state } = queryParams;

  // Collect validation errors for required fields
  if (!state) errorMessages.push("Missing state query parameter from URL");

  return { state };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["COGNITO_CLIENT_ID", "COGNITO_BASE_URI", "DIY_SUBMIT_BASE_URL"]);

  const { request } = extractRequest(event);
  const errorMessages = [];

  // If HEAD request, return 200 OK immediately after bundle enforcement
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  // Extract and validate parameters
  const { state } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = {};

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Processing
  try {
    logger.info({ message: "Generating Cognito authorization URL", state });
    const { authUrl } = buildAuthUrl(state);

    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: { authUrl },
    });
  } catch (error) {
    logger.error({ message: "Error generating Cognito authorization URL", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export function buildAuthUrl(state) {
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}auth/loginWithCognitoCallback.html`;
  const cognitoClientId = process.env.COGNITO_CLIENT_ID;
  const cognitoBaseUri = process.env.COGNITO_BASE_URI;
  const scope = "openid profile email";

  const authUrl =
    `${cognitoBaseUri}/oauth2/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(cognitoClientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  return { authUrl };
}
