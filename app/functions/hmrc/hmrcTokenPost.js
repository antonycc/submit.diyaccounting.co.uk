// app/functions/hmrcTokenPost.js

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import logger from "../../lib/logger.js";
import { extractRequest, http400BadRequestResponse, parseRequestBody, buildTokenExchangeResponse } from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

const secretsClient = new SecretsManagerClient();

let cachedHmrcClientSecret;

export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/token", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// POST /api/v1/hmrc/token
export async function handler(event) {
  // Allow local/dev override via HMRC_CLIENT_SECRET. Only require ARN if override is not supplied.
  const required = ["HMRC_BASE_URI", "HMRC_CLIENT_ID", "DIY_SUBMIT_BASE_URL"];
  if (!process.env.HMRC_CLIENT_SECRET) required.push("HMRC_CLIENT_SECRET_ARN");
  validateEnv(required);

  const secretArn = process.env.HMRC_CLIENT_SECRET_ARN;
  const overrideSecret = process.env.HMRC_CLIENT_SECRET;

  const { request, requestId } = extractRequest(event);
  const { code } = parseRequestBody(event);

  if (!code) {
    logger.warn("Missing code from event body");
    return http400BadRequestResponse({
      request,
      requestId,
      message: "Missing code from event body",
    });
  }

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

  logger.info("Exchanging code for token at HMRC with url " + url);
  return buildTokenExchangeResponse(request, url, body);
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
