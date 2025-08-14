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
    // TODO: Remove this when tests are otherwise stable.
    logger.warn({ message: "exchangeToken called with code and no body, defaulting to HMRC" });
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
    body: requestBody.toString(),
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
  const decoded = Buffer.from(event.body, "base64").toString("utf-8");
  const searchParams = new URLSearchParams(decoded);
  const code = searchParams.get("code");

  if (!code) {
    return httpBadRequestResponse({
      request,
      message: "Missing code from event body",
    });
  }

  const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "loginWithGoogleCallback.html";

  const cognitoClientId = (process.env.DIY_SUBMIT_COGNITO_CLIENT_ID || "").trim();
  const cognitoBaseUri = (process.env.DIY_SUBMIT_COGNITO_BASE_URI || "").trim();

  if (cognitoClientId && cognitoBaseUri) {
    // Exchange via Cognito
    const url = `${cognitoBaseUri}/oauth/token`;
    const body = {
      grant_type: "authorization_code",
      client_id: cognitoClientId,
      redirect_uri: redirectUri,
      code,
    };
    return httpPostWithUrl(request, url, body);
  }

  // Fallback: exchange directly with Google
  const googleClientId = (process.env.DIY_SUBMIT_GOOGLE_CLIENT_ID || "").trim();
  if (!googleClientId) {
    return httpServerErrorResponse({
      request,
      message: "Google login misconfigured: neither DIY_SUBMIT_COGNITO_CLIENT_ID nor DIY_SUBMIT_GOOGLE_CLIENT_ID is set",
    });
  }
  const clientSecret = await retrieveGoogleClientSecret();
  const googleTokenUrl = "https://oauth2.googleapis.com/token";
  const googleBody = {
    grant_type: "authorization_code",
    client_id: googleClientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  };
  return httpPostWithUrl(request, googleTokenUrl, googleBody);
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
