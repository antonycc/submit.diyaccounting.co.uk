// app/functions/hmrcTokenPost.js

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import logger from "../lib/logger.js";
import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";
import { validateEnv } from "../lib/env.js";

const secretsClient = new SecretsManagerClient();

// caching via module-level variables
let cachedHmrcClientSecret;

// POST /api/v1/hmrc/token
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "HMRC_CLIENT_ID", "DIY_SUBMIT_BASE_URL", "HMRC_CLIENT_SECRET_ARN"]);
  const secretArn = process.env.HMRC_CLIENT_SECRET_ARN;
  const overrideSecret = process.env.HMRC_CLIENT_SECRET;

  const request = extractRequest(event);

  // Validation
  const { code } = JSON.parse(event.body || "{}");
  if (!code) {
    return httpBadRequestResponse({
      request,
      message: "Missing code from event body",
    });
  }

  // OAuth exchange token post-body
  const clientSecret = await retrieveHmrcClientSecret(overrideSecret, secretArn);
  const url = `${process.env.HMRC_BASE_URI}/oauth/token`;
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const body = {
    grant_type: "authorization_code",
    client_id: process.env.HMRC_CLIENT_ID,
    client_secret: clientSecret,
    redirect_uri: `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`,
    code,
  };
  return httpPostWithUrl(request, url, body);
}

async function performTokenExchange(providerUrl, body) {
  const requestHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const requestBody = new URLSearchParams(body);

  let response;
  logger.info({
    message: `Request to POST ${providerUrl}`,
    url: providerUrl,
    headers: {
      ...requestHeaders,
    },
    body: requestBody.toString(),
  });
  if (process.env.NODE_ENV === "stubbed") {
    logger.warn({ message: "httpPostMock called in stubbed mode, using test access token" });
    const testAccessToken = process.env.TEST_ACCESS_TOKEN;
    response = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: testAccessToken }),
      text: async () => JSON.stringify({ access_token: testAccessToken }),
    };
  } else {
    response = await fetch(providerUrl, {
      method: "POST",
      headers: {
        ...requestHeaders,
      },
      body: requestBody,
    });
  }

  let responseTokens;
  try {
    responseTokens = await response.json();
  } catch (err) {
    try {
      const text = await response.text();
      responseTokens = JSON.parse(text);
    } catch {
      responseTokens = {};
    }
  }

  logger.info({
    message: "exchangeClientSecretForAccessToken response",
    responseStatus: response.status,
    responseTokens,
    tokenValidation: {
      hasAccessToken: !!responseTokens.access_token,
      accessTokenLength: responseTokens.access_token ? responseTokens.access_token.length : 0,
      tokenType: responseTokens.token_type,
      scope: responseTokens.scope,
      expiresIn: responseTokens.expires_in,
      hasRefreshToken: !!responseTokens.refresh_token,
    },
  });

  const accessToken = responseTokens.access_token;
  const responseBody = { ...responseTokens };
  delete responseBody.access_token;

  return { accessToken, response, responseBody };
}

export async function httpPostWithUrl(request, url, body) {
  const { accessToken, response, responseBody } = await performTokenExchange(url, body);

  if (!response.ok) {
    return httpServerErrorResponse({
      request,
      message: "Token exchange failed",
      error: {
        responseCode: response.status,
        responseBody,
      },
    });
  }

  // Generate a success response
  // Include additional tokens (e.g., id_token, refresh_token) when available so the client can derive user info
  const idToken = responseBody.id_token;
  const refreshToken = responseBody.refresh_token;
  const expiresIn = responseBody.expires_in;
  const tokenType = responseBody.token_type;

  return httpOkResponse({
    request,
    data: {
      accessToken,
      hmrcAccessToken: accessToken,
      idToken,
      refreshToken,
      expiresIn,
      tokenType,
    },
  });
}

async function retrieveHmrcClientSecret(overrideSecret, secretArn) {
  if (overrideSecret) {
    cachedHmrcClientSecret = overrideSecret;
    logger.info(`Secret retrieved from override and cached`);
    // Only update the cached secret if it isn't set
  } else if (!cachedHmrcClientSecret) {
    const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
    cachedHmrcClientSecret = data.SecretString;
    logger.info(`Secret retrieved from Secrets Manager with Arn ${secretArn} and cached`);
  }
  return cachedHmrcClientSecret;
}

// Export function to reset cached secret for testing
export function resetCachedSecrets() {
  cachedHmrcClientSecret = undefined;
}
