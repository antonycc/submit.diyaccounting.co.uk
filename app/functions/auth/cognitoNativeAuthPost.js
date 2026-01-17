// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/auth/cognitoNativeAuthPost.js
// Native Cognito user authentication using USER_PASSWORD_AUTH flow
// Used for behavior tests with TEST_AUTH_PROVIDER=cognito-native

import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { createLogger } from "../../lib/logger.js";
import { extractRequest, buildValidationError, http200OkResponse } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/auth/cognitoNativeAuthPost.js" });

// Cognito client - initialized lazily
let cognitoClient = null;

function getCognitoClient() {
  if (!cognitoClient) {
    const region = process.env.AWS_REGION || process.env.COGNITO_REGION || "eu-west-2";
    cognitoClient = new CognitoIdentityProviderClient({ region });
  }
  return cognitoClient;
}

// Server hook for Express app
/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/cognito/native-auth", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/cognito/native-auth", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  let body;

  // Try to parse JSON body first
  try {
    const decoded = Buffer.from(event.body || "", "base64").toString("utf-8");
    body = JSON.parse(decoded);
  } catch {
    // Fall back to URL-encoded form data
    const decoded = Buffer.from(event.body || "", "base64").toString("utf-8");
    const searchParams = new URLSearchParams(decoded);
    body = {
      username: searchParams.get("username"),
      password: searchParams.get("password"),
    };
  }

  const username = body?.username;
  const password = body?.password;

  if (!username) {
    errorMessages.push("Missing username");
  }
  if (!password) {
    errorMessages.push("Missing password");
  }

  return { username, password };
}

// HTTP request/response aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COGNITO_CLIENT_ID", "COGNITO_USER_POOL_ID"]);

  const { request } = extractRequest(event);
  const errorMessages = [];

  // If HEAD request, return 200 OK immediately
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  // Extract and validate parameters
  const { username, password } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, {});
  }

  logger.info({ message: "Authenticating native Cognito user", username });

  try {
    const tokens = await authenticateUser(username, password);

    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {
        accessToken: tokens.AccessToken,
        idToken: tokens.IdToken,
        refreshToken: tokens.RefreshToken,
        expiresIn: tokens.ExpiresIn,
        tokenType: tokens.TokenType || "Bearer",
      },
    });
  } catch (error) {
    logger.error({ message: "Native Cognito authentication failed", error: error.message, username });

    // Return appropriate error based on Cognito exception
    const cognitoErrorStatusCodes = {
      NotAuthorizedException: 401,
      UserNotFoundException: 401,
      UserNotConfirmedException: 403,
    };
    const statusCode = cognitoErrorStatusCodes[error.name] || 500;

    return {
      statusCode,
      headers: {
        "Content-Type": "application/json",
        "x-request-id": request?.requestId || "unknown",
      },
      body: JSON.stringify({
        error: error.name || "AuthenticationError",
        message: error.message || "Authentication failed",
        requestId: request?.requestId,
      }),
    };
  }
}

// Authenticate user with Cognito using USER_PASSWORD_AUTH flow
export async function authenticateUser(username, password) {
  const client = getCognitoClient();

  const command = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  });

  const response = await client.send(command);

  if (!response.AuthenticationResult) {
    // This could happen if MFA is required or other challenges
    throw new Error(`Authentication challenge required: ${response.ChallengeName || "unknown"}`);
  }

  return response.AuthenticationResult;
}

// For testing - allow injecting a mock client
export function setCognitoClient(client) {
  cognitoClient = client;
}
