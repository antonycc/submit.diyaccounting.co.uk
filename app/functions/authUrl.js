// app/functions/authUrl.js

import dotenv from "dotenv";

import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";

dotenv.config({ path: ".env" });

// GET /api/hmrc/auth-url?state={state}
export async function httpGetHmrc(event) {
  const state = event.queryStringParameters?.state;
  const clientId = process.env.DIY_SUBMIT_HMRC_CLIENT_ID;
  const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "activities/submitVatCallback.html";
  const hmrcBase = process.env.DIY_SUBMIT_HMRC_BASE_URI;
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
  const state = event.queryStringParameters?.state;
  const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "auth/loginWithMockCallback.html";
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

// GET /api/google/auth-url?state={state}
export async function httpGetGoogle(event) {
  const state = event.queryStringParameters?.state;
  const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "auth/loginWithGoogleCallback.html";
  const scope = "openid profile email";

  const cognitoClientId = (process.env.DIY_SUBMIT_COGNITO_CLIENT_ID || "").trim();
  const cognitoBaseUri = (process.env.DIY_SUBMIT_COGNITO_BASE_URI || "").trim();

  let authUrl;
  if (cognitoClientId && cognitoBaseUri) {
    // Normal path via Cognito Hosted UI -> Google IdP
    authUrl =
      `${cognitoBaseUri}/oauth2/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(cognitoClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&identity_provider=Google`;
  } else {
    // TODO: remove this fallback after removing whatever needed it
    // Fallback: direct Google OAuth when Cognito is not configured
    const googleClientId = (process.env.DIY_SUBMIT_GOOGLE_CLIENT_ID || "").trim();
    if (!googleClientId) {
      throw new Error(
        "Google login misconfigured: neither DIY_SUBMIT_COGNITO_CLIENT_ID nor DIY_SUBMIT_GOOGLE_CLIENT_ID is set",
      );
    }
    const googleAuthorize = "https://accounts.google.com/o/oauth2/v2/auth";
    authUrl =
      `${googleAuthorize}?response_type=code` +
      `&client_id=${encodeURIComponent(googleClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&access_type=offline&include_granted_scopes=true`;
  }

  return httpGet(event, authUrl);
}

// GET /api/antonycc/auth-url?state={state}
export async function httpGetAntonycc(event) {
  const state = event.queryStringParameters?.state;
  const clientId = process.env.DIY_SUBMIT_ANTONYCC_CLIENT_ID;
  const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "auth/loginWithAntonyccCallback.html";
  const baseUri = process.env.DIY_SUBMIT_ANTONYCC_BASE_URI;
  const scope = "openid profile email";
  const authUrl =
    `${baseUri}/loginDirect.html?` +
    "response_type=code" +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;
  return httpGet(event, authUrl);
}

// GET /api/ac-cog/auth-url?state={state}
export async function httpGetAcCog(event) {
  const state = event.queryStringParameters?.state;
  const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "auth/loginWithAcCogCallback.html";
  const scope = "openid profile email";

  const cognitoClientId = (process.env.DIY_SUBMIT_AC_COG_CLIENT_ID || "").trim();
  const cognitoBaseUri = (process.env.DIY_SUBMIT_AC_COG_BASE_URI || "").trim();

  const authUrl =
      `${cognitoBaseUri}/oauth2/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(cognitoClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&identity_provider=ac-cog`;

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
