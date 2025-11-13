// app/functions/hmrc/hmrcTokenPost.js

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import logger from "../../lib/logger.js";
import { extractRequest, parseRequestBody, buildTokenExchangeResponse, buildValidationError } from "../../lib/responses.js";
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

  return { code };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  // Allow local/dev override via HMRC_CLIENT_SECRET. Only require ARN if override is not supplied.
  const required = ["HMRC_BASE_URI", "HMRC_CLIENT_ID", "DIY_SUBMIT_BASE_URL"];
  if (!process.env.HMRC_CLIENT_SECRET) required.push("HMRC_CLIENT_SECRET_ARN");
  validateEnv(required);

  const { request, requestId } = extractRequest(event);
  const errorMessages = [];

  // Extract and validate parameters
  const { code } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { "x-request-id": requestId };

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, requestId, errorMessages, responseHeaders);
  }

  // Processing
  logger.info({ requestId, message: "Exchanging authorization code for HMRC access token" });
  const tokenResponse = await exchangeCodeForToken(code);
  return buildTokenExchangeResponse(request, tokenResponse.url, tokenResponse.body);
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function exchangeCodeForToken(code) {
  const secretArn = process.env.HMRC_CLIENT_SECRET_ARN;
  const overrideSecret = process.env.HMRC_CLIENT_SECRET;
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

export function resetCachedSecrets() {
  cachedHmrcClientSecret = undefined;
}
