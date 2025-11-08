// app/functions/hmrcTokenPost.js

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import logger from "../../lib/logger.js";
import { extractRequest, httpBadRequestResponse, parseRequestBody, buildTokenExchangeResponse } from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

const secretsClient = new SecretsManagerClient();

let cachedHmrcClientSecret;
let cachedHmrcSandboxClientSecret;

export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/token", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// POST /api/v1/hmrc/token?sandbox={true|false}
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "HMRC_CLIENT_ID", "DIY_SUBMIT_BASE_URL", "HMRC_CLIENT_SECRET_ARN"]);
  
  const request = extractRequest(event);
  const { code } = parseRequestBody(event);

  if (!code) {
    logger.warn("Missing code from event body");
    return httpBadRequestResponse({
      request,
      message: "Missing code from event body",
    });
  }

  const useSandbox = event.queryStringParameters?.sandbox === "true";
  const secretArn = useSandbox && process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN
    ? process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN
    : process.env.HMRC_CLIENT_SECRET_ARN;
  const overrideSecret = useSandbox && process.env.HMRC_SANDBOX_CLIENT_SECRET
    ? process.env.HMRC_SANDBOX_CLIENT_SECRET
    : process.env.HMRC_CLIENT_SECRET;
  const clientId = useSandbox && process.env.HMRC_SANDBOX_CLIENT_ID
    ? process.env.HMRC_SANDBOX_CLIENT_ID
    : process.env.HMRC_CLIENT_ID;
  const hmrcBase = useSandbox && process.env.HMRC_SANDBOX_BASE_URI
    ? process.env.HMRC_SANDBOX_BASE_URI
    : process.env.HMRC_BASE_URI;

  const clientSecret = await retrieveHmrcClientSecret(overrideSecret, secretArn, useSandbox);
  const url = `${hmrcBase}/oauth/token`;
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const body = {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`,
    code,
  };

  logger.info("Exchanging code for token at HMRC with url " + url);
  return buildTokenExchangeResponse(request, url, body);
}

async function retrieveHmrcClientSecret(overrideSecret, secretArn, useSandbox = false) {
  logger.info("Retrieving HMRC client secret from arn " + secretArn);
  const cache = useSandbox ? cachedHmrcSandboxClientSecret : cachedHmrcClientSecret;
  
  if (overrideSecret) {
    if (useSandbox) {
      cachedHmrcSandboxClientSecret = overrideSecret;
    } else {
      cachedHmrcClientSecret = overrideSecret;
    }
    logger.info(`Secret retrieved from override and cached`);
    return overrideSecret;
  } else if (!cache) {
    const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const secretValue = data.SecretString;
    if (useSandbox) {
      cachedHmrcSandboxClientSecret = secretValue;
    } else {
      cachedHmrcClientSecret = secretValue;
    }
    logger.info(`Secret retrieved from Secrets Manager with Arn ${secretArn} and cached`);
    return secretValue;
  }
  return cache;
}

export function resetCachedSecrets() {
  cachedHmrcClientSecret = undefined;
  cachedHmrcSandboxClientSecret = undefined;
}
