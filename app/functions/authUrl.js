// app/functions/authUrl.js

import dotenv from "dotenv";

import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";

dotenv.config({ path: ".env" });

export function authUrl(state, provider = "hmrc") {
  if (provider === "mock") {
    const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "loginWithMockCallback.html";
    const mockBase = "http://localhost:8080";
    const scope = "openid somescope";
    return (
      `${mockBase}/oauth/authorize?` +
      "response_type=code" +
      "&client_id=debugger" +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      "&identity_provider=MockOAuth2Server"
    );
  } else if (provider === "hmrc") {
    const clientId = process.env.DIY_SUBMIT_HMRC_CLIENT_ID;
    const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "submitVatCallback.html";
    const hmrcBase = "TODO: Harc code";
    const scope = "write:todo read:tofo";
    return (
      `${hmrcBase}/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`
    );
  } else if (provider === "google") {
    const clientId = process.env.DIY_SUBMIT_GOOGLE_CLIENT_ID;
    const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "loginWithGoogleCallback.html";
    const cognitoBaseUri = process.env.DIY_SUBMIT_COGNITO_BASE_URI;
    const scope = "write:vat read:vat";
    return (
      `${cognitoBaseUri}/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`
    );
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
}

// GET /api/hmrc/auth-url?state={state}
export async function httpGetHmrc(event) {
  return httpGet(event, "hmrc");
}

// GET /api/mock/auth-url?state={state}
export async function httpGetMock(event) {
  return httpGet(event, "mock");
}

// GET /api/google/auth-url?state={state}
export async function httpGetGoogle(event) {
  return httpGet(event, "google");
}

export async function httpGet(event, provider = "hmrc") {
  let request;
  try {
    const request = extractRequest(event);

    // Validation
    const state = event.queryStringParameters?.state;
    if (!state) {
      return httpBadRequestResponse({
        request,
        message: "Missing state query parameter from URL",
      });
    }

    // Processing
    const authUrlResult = authUrl(state, provider);

    // Generate a success response
    return httpOkResponse({
      request,
      data: {
        authUrl: authUrlResult,
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
