// app/functions/exchangeToken.js

import fetch from "node-fetch";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import dotenv from "dotenv";

import logger from "../lib/logger.js";
import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";
import { validateAuthorizationCode, validateOAuthState } from "../lib/oauthSecurity.js";

dotenv.config({ path: ".env" });

const secretsClient = new SecretsManagerClient();

// caching via module-level variables
let cachedGoogleClientSecret;
let cachedHmrcClientSecret;

// POST /api/cognito/exchange-token
export async function httpPostCognito(event) {
  const request = extractRequest(event);

  // Enhanced validation with OAuth security
  const decoded = Buffer.from(event.body, "base64").toString("utf-8");
  const searchParams = new URLSearchParams(decoded);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Validate authorization code
  const codeValidation = validateAuthorizationCode(code);
  if (!codeValidation.isValid) {
    return httpBadRequestResponse({
      request,
      message: `Invalid authorization code: ${codeValidation.message}`,
    });
  }

  // Validate OAuth state if provided (optional validation based on configuration)
  if (process.env.DIY_SUBMIT_VALIDATE_OAUTH_STATE === "true" && state) {
    const stateValidation = validateOAuthState(state);
    if (!stateValidation.isValid) {
      return httpBadRequestResponse({
        request,
        message: `Invalid OAuth state: ${stateValidation.message}`,
      });
    }
  }

  const redirectUri = process.env.DIY_SUBMIT_HOME_URL + "auth/loginWithCognitoCallback.html";

  const cognitoClientId = (process.env.DIY_SUBMIT_COGNITO_CLIENT_ID || "").trim();
  const CognitoBaseUri = (process.env.DIY_SUBMIT_COGNITO_BASE_URI || "").trim();

  // Exchange via Cognito
  const url = `${CognitoBaseUri}/oauth2/token`;
  const body = {
    grant_type: "authorization_code",
    client_id: cognitoClientId,
    redirect_uri: redirectUri,
    code,
  };
  return httpPostWithUrl(request, url, body);
}

// POST /api/hmrc/exchange-token
export async function httpPostHmrc(event) {
  const request = extractRequest(event);

  // Enhanced validation with OAuth security
  let code, state;
  try {
    const parsed = JSON.parse(event.body || "{}");
    code = parsed.code;
    state = parsed.state;
  } catch (error) {
    return httpBadRequestResponse({
      request,
      message: "Invalid JSON in request body",
    });
  }
  
  // Validate authorization code
  const codeValidation = validateAuthorizationCode(code);
  if (!codeValidation.isValid) {
    return httpBadRequestResponse({
      request,
      message: `Invalid authorization code: ${codeValidation.message}`,
    });
  }

  // Validate OAuth state if provided (optional validation based on configuration)
  if (process.env.DIY_SUBMIT_VALIDATE_OAUTH_STATE === "true" && state) {
    const stateValidation = validateOAuthState(state);
    if (!stateValidation.isValid) {
      return httpBadRequestResponse({
        request,
        message: `Invalid OAuth state: ${stateValidation.message}`,
      });
    }
  }

  // OAuth exchange token post-body
  const clientSecret = await retrieveHmrcClientSecret();
  const url = `${process.env.DIY_SUBMIT_HMRC_BASE_URI}/oauth/token`;
  const body = {
    grant_type: "authorization_code",
    client_id: process.env.DIY_SUBMIT_HMRC_CLIENT_ID,
    client_secret: clientSecret,
    redirect_uri: process.env.DIY_SUBMIT_HOME_URL + "activities/submitVatCallback.html",
    code,
  };
  return httpPostWithUrl(request, url, body);
}

export async function httpPostMock(event) {
  const request = extractRequest(event);
  
  // Enhanced validation with OAuth security
  let code, state;
  try {
    const parsed = JSON.parse(event.body || "{}");
    code = parsed.code;
    state = parsed.state;
  } catch (error) {
    return httpBadRequestResponse({
      request,
      message: "Invalid JSON in request body",
    });
  }
  
  // Validate authorization code
  const codeValidation = validateAuthorizationCode(code);
  if (!codeValidation.isValid) {
    return httpBadRequestResponse({
      request,
      message: `Invalid authorization code: ${codeValidation.message}`,
    });
  }

  // Validate OAuth state if provided (optional validation based on configuration)
  if (process.env.DIY_SUBMIT_VALIDATE_OAUTH_STATE === "true" && state) {
    const stateValidation = validateOAuthState(state);
    if (!stateValidation.isValid) {
      return httpBadRequestResponse({
        request,
        message: `Invalid OAuth state: ${stateValidation.message}`,
      });
    }
  }

  const clientSecret = await retrieveHmrcClientSecret();
  const url = `${process.env.DIY_SUBMIT_HMRC_BASE_URI}/oauth/token`;
  const body = {
    grant_type: "authorization_code",
    client_id: process.env.DIY_SUBMIT_HMRC_CLIENT_ID,
    client_secret: clientSecret,
    redirect_uri: process.env.DIY_SUBMIT_HOME_URL + "activities/submitVatCallback.html",
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
      redirect_uri: process.env.DIY_SUBMIT_HOME_URL + "activities/submitVatCallback.html",
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
    logger.warn({ message: "httpPostMock called in stubbed mode, using test access token" });
    const testAccessToken = process.env.DIY_SUBMIT_TEST_ACCESS_TOKEN;
    response = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: testAccessToken }),
      text: async () => JSON.stringify({ access_token: testAccessToken }),
    };
  } else {
    try {
      response = await fetch(providerUrl, {
        method: "POST",
        headers: {
          ...requestHeaders,
        },
        body: requestBody,
      });
    } catch (networkError) {
      logger.error({
        message: "Network error during OAuth token exchange",
        error: networkError.message,
        url: providerUrl,
      });
      // Return a synthetic error response for network failures
      response = {
        ok: false,
        status: 503, // Service Unavailable
        statusText: "Network Error",
        json: async () => ({
          error: "NETWORK_ERROR",
          error_description: "Unable to connect to OAuth provider",
        }),
        text: async () => JSON.stringify({
          error: "NETWORK_ERROR",
          error_description: "Unable to connect to OAuth provider",
        }),
      };
    }
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
