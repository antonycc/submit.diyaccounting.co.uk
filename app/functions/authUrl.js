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
  const scope = "write:vat read:vat";
  const authUrl =
    `${baseUri}/oauth2/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}` +
    `&identity_provider=Google`;
  return httpGet(event, authUrl);
}

/*
Invalid:
https://auth.oidc.antonycc.com//oauth2/authorize?response_type=code&client_id=TODO&redirect_uri=https%3A%2F%2Fwanted-finally-anteater.ngrok-free.app%2Fauth%2FloginWithAntonyccCallback.html&scope=write%3Avat%20read%3Avat&state=5x0amn9xnih&identity_provider=Google

Prompt to get something from Cognito we can use for the URL above.
Please modify all the pages in ./web/index.html in @antonycc/oidc so that there is a second login button labelled login with cognito and this take the user to a new page like login.html, only this one calculates the URL to send the user to a cognito rendered login form that is backed by the OIDC Provider in this repository. Implement all the CDK changes required under ./infra to have cognito render a login form (presumably at auth.oidc.antonycc.com) and on login the user should eventually end up back at a new landing page post-authCognito.html (like post-auth.html) but using the conito approch to exchange tokens and get user information. Create new cognito variants of tests in ./tests for the live/web and load journeys. Ensure you have completed all the work for an end to end authentication process similar to what we have for the native oidc provider but using more cognit rendered stuff and this end to end jouney should be able to generate similar token responses to populate local storage and be tested by the actions workflows, dry run all the code you have changed in scenarios for local and pipeline builds and local and AWS running and fix any problems the dry runs  identify. Do as much as you can at once and as much as you can in parrallel checking and fixing every scenario and repeating until you coinsider this a finished feature ready for production use.

 */








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
