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

dotenv.config({ path: '.env' });

function buildUrl(event) {
  let url;
  if (event.path && event.headers && event.headers.host) {
    url = new URL(event.path, `http://${event.headers.host}`);
    Object.keys(event.queryStringParameters).forEach((key) => {
      url.searchParams.append(key, event.queryStringParameters[key]);
    });
  } else {
    logger.warn({ message: "buildUrl called with missing path or host header", event });
    url = "https://unknown";
  }
  return url;
}

// GET /api/auth-url?state={state}
export async function authUrlHandler(event) {
  const url = buildUrl(event);
  logger.info({ message: "authUrlHandler responding to url by processing event", url, event });

  // Request validation
  const state = event.queryStringParameters?.state;
  if (!state) {
    const response = {
      statusCode: 400,
      body: JSON.stringify({ requestUrl: url, error: "Missing state query parameter from URL" }),
    };
    logger.error(response);
    return response;
  }
  const authUrl = buildOAuthOutboundRedirectUrl(state);

  // Generate the response
  const response = {
    statusCode: 200,
    body: JSON.stringify({ authUrl }),
  };
  logger.info({ message: "authUrlHandler responding to url with", url, response });
  return response;
}

// POST /api/exchange-token
export async function exchangeTokenHandler(event) {
  const url = buildUrl(event);
  logger.info({ message: "exchangeTokenHandler responding to url by processing event", url, event });

  // Request validation
  const { code } = JSON.parse(event.body || "{}");
  if (!code) {
    const response = {
      statusCode: 400,
      body: JSON.stringify({ requestUrl: url, requestBody: event.body, error: "Missing code from event body" }),
    };
    logger.error(response);
    return response;
  }

  let { hmrcAccessToken, hmrcResponse } = await exchangeClientSecretForAccessToken(code);

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
  logger.info({ message: "submitVatHandler responding to url with", url, response });
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
  const url = buildUrl(event);
  logger.info({ message: "submitVatHandler responding to url by processing event", url, event, headers: event.headers });

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
  const url = buildUrl(event);
  logger.info({ message: "logReceiptHandler responding to url by processing event", url, event });

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
