#!/usr/bin/env node
// src/lib/main.js

import {fileURLToPath} from "url";
import dotenv from 'dotenv';
import logger from "./logger.js";
import buildOAuthOutboundRedirectUrl from "./buildOAuthOutboundRedirectUrl.js";
import exchangeClientSecretForAccessToken from "./exchangeClientSecretForAccessToken.js";
import eventToGovClientHeaders from "./eventToGovClientHeaders.js";
import submitVat from "./submitVat.js";
import logReceipt from "./logReceipt.js";
import {extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse} from "@src/lib/responses.js";

dotenv.config({ path: '.env' });

// GET /api/auth-url?state={state}
export async function authUrlHandler(event) {
  let request;
  try {
    const request = extractRequest(event);

    // Validation
    const state = event.queryStringParameters?.state;
    if (!state) {
      return httpBadRequestResponse({
        request,
        message: "Missing state query parameter from URL",
      });
    }

    // Processing
    const authUrl = buildOAuthOutboundRedirectUrl(state);

    // Generate a success response
    return httpOkResponse({
      request,
      data: {
        authUrl,
      },
    });
  }catch (error) {
    // Generate a failure response
    return httpServerErrorResponse({
      request: request,
      data: { error, message: "Internal Server Error in authUrlHandler" },
    });
  }
}

// POST /api/exchange-token
export async function exchangeTokenHandler(event) {
  const request = extractRequest(event);

  // Validation
  const { code } = JSON.parse(event.body || "{}");
  if (!code) {
    return httpBadRequestResponse({
      request,
      message: "Missing code from event body",
    });
  }

  let { hmrcAccessToken, hmrcResponse } = await exchangeClientSecretForAccessToken(code);

  // TODO: the hmrc attributes should be in the response body but this will break some tests. Do this before swapping to responses.js
  if (!hmrcResponse.ok) {
    const response = {
        statusCode: 500,
        body: JSON.stringify({
        hmrcResponseCode: hmrcResponse.status,
        hmrcResponseText: await hmrcResponse.text(),
      }),
    };
    logger.error(response);
    return response;
  }

  // Generate the response
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      hmrcAccessToken,
    }),
  };
  logger.info({ message: "submitVatHandler responding to url with", url: request, response });
  return response;
}

// Helper function to extract client IP from request headers
function extractClientIPFromHeaders(event) {
  // Try various headers that might contain the client's real IP
  const headers = event.headers || {};
  const possibleIPHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip', // Cloudflare
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ];

  for (const header of possibleIPHeaders) {
    const value = headers[header];
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(',')[0].trim();
      if (ip && ip !== 'unknown') {
        return ip;
      }
    }
  }

  // Fallback to source IP from event context
  return event.requestContext?.identity?.sourceIp || 'unknown';
}


// POST /api/submit-vat
export async function submitVatHandler(event) {
  const url = extractRequest(event);

  const detectedIP = extractClientIPFromHeaders(event);

  // Request validation
  let errorMessages = [];
  const { vatNumber, periodKey, vatDue, hmrcAccessToken } = JSON.parse(event.body || "{}");
  if (!vatNumber) {
    errorMessages.push("Missing vatNumber parameter from body");
  }
  if (!periodKey) {
    errorMessages.push("Missing periodKey parameter from body");
  }
  if (!vatDue) {
    errorMessages.push("Missing vatDue parameter from body");
  }
  if (!hmrcAccessToken) {
    errorMessages.push("Missing hmrcAccessToken parameter from body");
  }

  const {
    govClientHeaders,
    govClientErrorMessages
  } = eventToGovClientHeaders(event, detectedIP);

  errorMessages = errorMessages.concat(govClientErrorMessages || []);
  if (errorMessages.length > 0) {
    const response = {
      statusCode: 400,
      body:  JSON.stringify({ requestUrl: url, requestBody: event.body, error: errorMessages.join(", ") }),
    };
    logger.error(response);
    return response;
  }

  let {
    receipt,
    hmrcResponse,
  } = await submitVat(periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders);

  if (!hmrcResponse.ok) {
    const response = {
      statusCode: 500,
      body: JSON.stringify({
        hmrcResponseCode: hmrcResponse.status,
        hmrcResponseText: await hmrcResponse.text(),
      }),
    };
    logger.error(response);
    return response;
  }

  // Generate the response
  const response = {
    statusCode: 200,
    body: JSON.stringify({ receipt }),
  };
  logger.info({ message: "submitVatHandler responding to url with", url, response });
  return response;
}

// POST /api/log-receipt
export async function logReceiptHandler(event) {
  const url = extractRequest(event);

  // Request validation
  const receipt = JSON.parse(event.body || "{}");
  const key = `receipts/${receipt.formBundleNumber}.json`;
  let errorMessages = [];
  if (!receipt) {
    errorMessages.push("Missing receipt parameter from body");
  }
  if (!key) {
    errorMessages.push("Missing key parameter from body");
  }
  if (!process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX) {
    errorMessages.push({message: "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX environment variable is not set, cannot log receipt"});
  }
  if (errorMessages.length > 0) {
    const response = {
      statusCode: 400,
      body:  JSON.stringify({ requestUrl: url, requestBody: event.body, error: errorMessages.join(", ") }),
    };
    logger.error(response);
    return response;
  }

  try {
      await logReceipt(key, receipt);
  } catch(err) {
    const response = {
      statusCode: 500,
      body: JSON.stringify({error: "Failed to log receipt", details: err.message}),
    };
    logger.error({message: "logReceiptHandler responding to url with", url, response});
    return response;
  }

  // Generate the response
  const response = {
    statusCode: 200,
    body: JSON.stringify({ receipt, key }),
  };
  logger.info({ message: "logReceiptHandler responding to url with", url, response });
  return response;
}

export function main(args) {
  console.log(`Run with: ${JSON.stringify(args)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  main(args);
}
