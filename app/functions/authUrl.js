// app/functions/authUrl.js

import dotenv from "dotenv";

import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";
import { isAuthMockMode } from "../lib/parameterStore.js";

dotenv.config({ path: ".env" });

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
    request = extractRequest(event);

    // Validation
    const state = event.queryStringParameters?.state;
    if (!state) {
      return httpBadRequestResponse({
        request,
        message: "Missing state query parameter from URL",
      });
    }

    // Check if we should override provider to mock based on runtime parameter
    let actualProvider = provider;
    if ((provider === "hmrc" || provider === "google") && (await isAuthMockMode())) {
      console.log(`[AUTH] Runtime mock mode enabled, switching ${provider} to mock`);
      actualProvider = "mock";
    }

    // Processing
    const authUrlResult = authUrl(state, actualProvider);

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

export function authUrl(state, provider = "hmrc") {
  if (provider === "mock") {
    const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "auth/loginWithMockCallback.html";
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
    const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "activities/submitVatCallback.html";
    const hmrcBase = process.env.DIY_SUBMIT_HMRC_BASE_URI;
    const scope = "write:vat read:vat";
    return (
      `${hmrcBase}/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`
    );
  } else if (provider === "google") {
    const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "auth/loginWithGoogleCallback.html";
    const scope = "openid profile email";

    const cognitoClientId = (process.env.DIY_SUBMIT_COGNITO_CLIENT_ID || "").trim();
    const cognitoBaseUri = (process.env.DIY_SUBMIT_COGNITO_BASE_URI || "").trim();

    if (cognitoClientId && cognitoBaseUri) {
      // Normal path via Cognito Hosted UI -> Google IdP
      return (
        `${cognitoBaseUri}/oauth2/authorize?response_type=code` +
        `&client_id=${encodeURIComponent(cognitoClientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${encodeURIComponent(state)}` +
        `&identity_provider=Google`
      );
    }

    // Fallback: direct Google OAuth when Cognito is not configured
    const googleClientId = (process.env.DIY_SUBMIT_GOOGLE_CLIENT_ID || "").trim();
    if (!googleClientId) {
      throw new Error(
        "Google login misconfigured: neither DIY_SUBMIT_COGNITO_CLIENT_ID nor DIY_SUBMIT_GOOGLE_CLIENT_ID is set",
      );
    }
    const googleAuthorize = "https://accounts.google.com/o/oauth2/v2/auth";
    return (
      `${googleAuthorize}?response_type=code` +
      `&client_id=${encodeURIComponent(googleClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&access_type=offline&include_granted_scopes=true`
    );
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
}
