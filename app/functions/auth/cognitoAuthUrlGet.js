// app/functions/cognitoAuthUrl.js

import {
  extractRequest,
  httpBadRequestResponse,
  httpOkResponse,
  httpServerErrorResponse,
} from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";

// GET /api/v1/cognito/authUrl?state={state}
export async function handler(event) {
  validateEnv(["COGNITO_CLIENT_ID", "COGNITO_BASE_URI", "DIY_SUBMIT_BASE_URL"]);

  const request = extractRequest(event);
  const state = event.queryStringParameters?.state;

  if (!state) {
    return httpBadRequestResponse({
      request,
      message: "Missing state query parameter from URL",
    });
  }

  try {
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

    return httpOkResponse({
      request,
      data: { authUrl },
    });
  } catch (error) {
    return httpServerErrorResponse({
      request,
      data: { error, message: "Internal Server Error in httpGetHmrc" },
    });
  }
}
