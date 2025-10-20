// app/functions/authUrl.js

import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";
import { validateEnv } from "../lib/env.js";

// GET /api/hmrc/authUrl-get?state={state}
export async function httpGetHmrc(event) {
  validateEnv(["HMRC_BASE_URI", "HMRC_CLIENT_ID", "DIY_SUBMIT_BASE_URL"]);
  const clientId = process.env.HMRC_CLIENT_ID;
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`;
  const hmrcBase = process.env.HMRC_BASE_URI;

  const state = event.queryStringParameters?.state;

  const scope = "write:vat read:vat";

  const authUrl =
    `${hmrcBase}/oauth/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;
  return httpGet(event, authUrl);
}

// GET /api/mock/auth-url?state={state}
export async function httpGetMock(event) {
  validateEnv(["DIY_SUBMIT_BASE_URL"]);
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}auth/loginWithMockCallback.html`;

  const state = event.queryStringParameters?.state;

  const mockBase = "http://localhost:8080";
  const scope = "openid somescope";
  const authUrl =
    `${mockBase}/oauth/authorize?` +
    "response_type=code" +
    "&client_id=debugger" +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}` +
    "&identity_provider=MockOAuth2Server";
  return httpGet(event, authUrl);
}

// GET /api/cognito/auth-url?state={state}
export async function httpGetCognito(event) {
  validateEnv(["COGNITO_CLIENT_ID", "COGNITO_BASE_URI", "DIY_SUBMIT_BASE_URL"]);
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}auth/loginWithCognitoCallback.html`;
  const cognitoClientId = process.env.COGNITO_CLIENT_ID;
  const cognitoBaseUri = process.env.COGNITO_BASE_URI;

  const state = event.queryStringParameters?.state;

  const scope = "openid profile email";

  const authUrl =
    `${cognitoBaseUri}/oauth2/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(cognitoClientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  return httpGet(event, authUrl);
}

export async function httpGet(event, authUrl) {
  let request;
  try {
    request = extractRequest(event);

    // Validation
    const state = event.queryStringParameters?.state;
    if (!state) {
      return httpBadRequestResponse({
        request,
        message: "Missing state query parameter from URL",
      });
    }

    // Processing - occurs in the caller to allow different authUrl construction

    // Generate a success response
    return httpOkResponse({
      request,
      data: {
        authUrl,
      },
    });
  } catch (error) {
    // Generate a failure response
    return httpServerErrorResponse({
      request: request,
      data: { error, message: "Internal Server Error in httpGetHmrc" },
    });
  }
}
