// app/functions/mockAuthUrlGet.js

import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";
import { validateEnv } from "../lib/env.js";

// GET /api/v1/mock/authUrl?state={state}
export async function handler(event) {
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

  let request = "Not created";
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

    return httpOkResponse({
      request,
      data: {
        authUrl,
      },
    });
  } catch (error) {
    return httpServerErrorResponse({
      request: request,
      data: { error, message: "Internal Server Error in httpGetHmrc" },
    });
  }
}
