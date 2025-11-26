// app/functions/hmrc/hmrcTokenPost.js

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import logger from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildTokenExchangeResponse,
  buildValidationError,
  http200OkResponse,
} from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

const secretsClient = new SecretsManagerClient();

let cachedHmrcClientSecret;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/token", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const { code } = parsedBody || {};

  // Collect validation errors for required fields
  if (!code) errorMessages.push("Missing code from event body");

  // Extract HMRC account (sandbox/live) from header hmrcAccount
  const hmrcAccountHeader = (event.headers && event.headers.hmrcaccount) || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "sandbox" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'sandbox' or 'live' if provided.");
  }

  return { code, hmrcAccount };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  // Allow local/dev override via HMRC_CLIENT_SECRET. Only require ARN if override is not supplied.
  const required = [
    "HMRC_BASE_URI",
    "HMRC_CLIENT_ID",
    "HMRC_SANDBOX_BASE_URI",
    "HMRC_SANDBOX_CLIENT_ID",
    "DIY_SUBMIT_BASE_URL",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
  ];
  if (!process.env.HMRC_CLIENT_SECRET) required.push("HMRC_CLIENT_SECRET_ARN");
  if (!process.env.HMRC_SANDBOX_CLIENT_SECRET) required.push("HMRC_SANDBOX_CLIENT_SECRET_ARN");
  validateEnv(required);

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
  const { code, hmrcAccount } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = {};

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Processing
  logger.info({ message: "Exchanging authorization code for HMRC access token" });
  // TODO: Simplify this and/or rename because exchangeCodeForToken does not do the exchange, it just creates the body
  const tokenResponse = await exchangeCodeForToken(code, hmrcAccount);
  return buildTokenExchangeResponse(request, tokenResponse.url, tokenResponse.body); // , userSub);
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function exchangeCodeForToken(code, hmrcAccount) {
  const secretArn = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN : process.env.HMRC_CLIENT_SECRET_ARN;
  const overrideSecret = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_SECRET : process.env.HMRC_CLIENT_SECRET;
  const clientSecret = await retrieveHmrcClientSecret(overrideSecret, secretArn);
  const hmrcBaseUri = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcClientId = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_ID : process.env.HMRC_CLIENT_ID;
  const url = `${hmrcBaseUri}/oauth/token`;
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const body = {
    grant_type: "authorization_code",
    client_id: hmrcClientId,
    client_secret: clientSecret,
    redirect_uri: `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`,
    code,
  };

  return { url, body };
}

async function retrieveHmrcClientSecret(overrideSecret, secretArn) {
  logger.info("Retrieving HMRC client secret from arn " + secretArn);
  if (overrideSecret) {
    cachedHmrcClientSecret = overrideSecret;
    logger.info(`Secret retrieved from override and cached`);
  } else if (!cachedHmrcClientSecret) {
    const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
    cachedHmrcClientSecret = data.SecretString;
    logger.info(`Secret retrieved from Secrets Manager with Arn ${secretArn} and cached`);
  }
  return cachedHmrcClientSecret;
}
