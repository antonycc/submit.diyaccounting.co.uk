// app/functions/exchangeToken.js

import fetch from "node-fetch";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import dotenv from "dotenv";

import logger from "../lib/logger.js";
import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";

dotenv.config({ path: ".env" });

const secretsClient = new SecretsManagerClient();

// caching via module-level variables
let cachedGoogleClientSecret;
let cachedHmrcClientSecret;

export async function httpPost(event) {
  const request = extractRequest(event);
  const { code } = JSON.parse(event.body || "{}");
  if (!code) {
    return httpBadRequestResponse({ request, message: "Missing code from event body" });
  }
  const clientSecret = await retrieveHmrcClientSecret();
  const url = `${process.env.DIY_SUBMIT_HMRC_BASE_URI}/oauth/token`;
  const body = {
    grant_type: "authorization_code",
    client_id: process.env.DIY_SUBMIT_HMRC_CLIENT_ID,
    client_secret: clientSecret,
    redirect_uri: process.env.DIY_SUBMIT_HOME_URL + "submitVatCallback.html",
    code,
  };
  return httpPostWithUrl(request, url, body);
}

export async function exchangeToken(providerUrlOrCode, maybeBody) {
  // Overloaded signature for tests/backward-compat:
  // - exchangeToken(code)
  // - exchangeToken(providerUrl, body)
  if (typeof providerUrlOrCode === "string" && (!maybeBody || typeof maybeBody !== "object")) {
    const clientSecret = await retrieveHmrcClientSecret();
    const url = `${process.env.DIY_SUBMIT_HMRC_BASE_URI}/oauth/token`;
    const body = {
      grant_type: "authorization_code",
      client_id: process.env.DIY_SUBMIT_HMRC_CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: process.env.DIY_SUBMIT_HOME_URL + "submitVatCallback.html",
      code: providerUrlOrCode,
    };
    return performTokenExchange(url, body);
  }
  return performTokenExchange(providerUrlOrCode, maybeBody);
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
    body: requestBody,
  });
  if (process.env.NODE_ENV === "stubbed") {
    logger.warn({ message: "httpPost called in stubbed mode, using test access token" });
    const testAccessToken = process.env.DIY_SUBMIT_TEST_ACCESS_TOKEN;
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

// POST /api/google/exchange-token
export async function httpPostGoogle(event) {
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
  const clientSecret = await retrieveGoogleClientSecret();
  const url = `${process.env.DIY_SUBMIT_COGNITO_BASE_URI}/oauth/token`;
  const body = {
    grant_type: "authorization_code",
    client_id: process.env.DIY_SUBMIT_COGNITO_CLIENT_ID,
    client_secret: clientSecret,
    redirect_uri: process.env.DIY_SUBMIT_HOME_URL + "loginWithGoogleCallback.html",
    code,
  };
  return httpPostWithUrl(request, url, body);
}

// POST /api/hmrc/exchange-token
export async function httpPostHmrc(event) {
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
  const clientSecret = await retrieveHmrcClientSecret();
  const url = `${process.env.DIY_SUBMIT_HMRC_BASE_URI}/oauth/token`;
  const body = {
    grant_type: "authorization_code",
    client_id: process.env.DIY_SUBMIT_HMRC_CLIENT_ID,
    client_secret: clientSecret,
    redirect_uri: process.env.DIY_SUBMIT_HOME_URL + "submitVatCallback.html",
    code,
  };
  return httpPostWithUrl(request, url, body);
}

export async function httpPostWithUrl(request, url, body) {
  const { accessToken, response, responseBody } = await exchangeToken(url, body);

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
  return httpOkResponse({
    request,
    data: {
      accessToken,
      hmrcAccessToken: accessToken,
    },
  });
}

async function retrieveGoogleClientSecret() {
  const secretFromEnv = process.env.DIY_SUBMIT_GOOGLE_CLIENT_SECRET;
  // Always update the secret from the environment variable if it exists
  if (secretFromEnv) {
    cachedGoogleClientSecret = secretFromEnv;
    logger.info(`Secret retrieved from environment variable DIY_SUBMIT_GOOGLE_CLIENT_SECRET and cached`);
    // Only update the cached secret if it isn't set
  } else if (!cachedGoogleClientSecret) {
    const secretArn = process.env.DIY_SUBMIT_GOOGLE_CLIENT_SECRET_ARN; // set via Lambda environment variable
    const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
    cachedGoogleClientSecret = data.SecretString;
    logger.info(`Secret retrieved from Secrets Manager with Arn ${secretArn} and cached`);
  }
  return cachedGoogleClientSecret;
}

async function retrieveHmrcClientSecret() {
  const secretFromEnv = process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET;
  // Always update the secret from the environment variable if it exists
  if (secretFromEnv) {
    cachedHmrcClientSecret = secretFromEnv;
    logger.info(`Secret retrieved from environment variable DIY_SUBMIT_HMRC_CLIENT_SECRET and cached`);
    // Only update the cached secret if it isn't set
  } else if (!cachedHmrcClientSecret) {
    const secretArn = process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN; // set via Lambda environment variable
    const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
    cachedHmrcClientSecret = data.SecretString;
    logger.info(`Secret retrieved from Secrets Manager with Arn ${secretArn} and cached`);
  }
  return cachedHmrcClientSecret;
}

// Export function to reset cached secret for testing
export function resetCachedSecrets() {
  cachedGoogleClientSecret = undefined;
  cachedHmrcClientSecret = undefined;
}

// Backwards-compatible alias expected by tests
export function resetCachedSecret() {
  return resetCachedSecrets();
}
