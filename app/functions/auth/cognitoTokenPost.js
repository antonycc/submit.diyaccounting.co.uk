// app/functions/cognitoTokenPost.js

import logger from "../../lib/logger.js";
import { extractRequest, httpBadRequestResponse, buildTokenExchangeResponse } from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";

// POST /api/v1/cognito/token
export async function handler(event) {
  validateEnv(["DIY_SUBMIT_BASE_URL", "COGNITO_CLIENT_ID", "COGNITO_BASE_URI"]);
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}auth/loginWithCognitoCallback.html`;
  const cognitoClientId = process.env.COGNITO_CLIENT_ID;
  const CognitoBaseUri = process.env.COGNITO_BASE_URI;

  const request = extractRequest(event);

  const decoded = Buffer.from(event.body, "base64").toString("utf-8");
  const searchParams = new URLSearchParams(decoded);
  const code = searchParams.get("code");

  if (!code) {
    return httpBadRequestResponse({
      request,
      message: "Missing code from event body",
    });
  }

  const url = `${CognitoBaseUri}/oauth2/token`;
  const body = {
    grant_type: "authorization_code",
    client_id: cognitoClientId,
    redirect_uri: redirectUri,
    code,
  };
  return buildTokenExchangeResponse(request, url, body);
}
