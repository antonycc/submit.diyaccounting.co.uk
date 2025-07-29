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
import {
  extractClientIPFromHeaders,
  extractRequest,
  httpBadRequestResponse,
  httpOkResponse,
  httpServerErrorResponse
} from "./responses.js";

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

  let { hmrcAccessToken, hmrcResponse, hmrcResponseBody } = await exchangeClientSecretForAccessToken(code);

  if (!hmrcResponse.ok) {
    return httpServerErrorResponse({
      request,
      message: "HMRC token exchange failed",
      error: {
        hmrcResponseCode: hmrcResponse.status,
        hmrcResponseBody,
      },
    });
  }

  // Generate a success response
  return httpOkResponse({
    request,
    data: {
      hmrcAccessToken,
    },
  });
}

// POST /api/submit-vat
export async function submitVatHandler(event) {
  const request = extractRequest(event);

  const detectedIP = extractClientIPFromHeaders(event);

  // Validation
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
    return httpBadRequestResponse({
      request,
      headers: { ...govClientHeaders },
      message: errorMessages.join(", "),
    });
  }

  // Processing
  let {
    receipt,
    hmrcResponse,
    hmrcResponseBody
  } = await submitVat(periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders);

  if (!hmrcResponse.ok) {
    return httpServerErrorResponse({
      request,
      message: "HMRC VAT submission failed",
      error: {
        hmrcResponseCode: hmrcResponse.status,
        hmrcResponseBody,
      },
    });
  }

  // Generate a success response
  return httpOkResponse({
    request,
    data: {
      receipt,
    },
  });
}

// POST /api/log-receipt
export async function logReceiptHandler(event) {
  const request = extractRequest(event);

  // Validation
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
    return httpBadRequestResponse({
      request,
      message: `There are ${errorMessages.length} validation errors.`,
      error: errorMessages.join(", "),
    });
  }

  // Processing
  try {
      await logReceipt(key, receipt);
  } catch(error) {
    // Generate a failure response
    return httpServerErrorResponse({
      request: request,
      message: "Failed to log receipt",
      error: { details: error.message },
    });
  }

  // Generate a success response
  return httpOkResponse({
    request,
    data: {
      receipt,
      key,
    },
  });
}

export function main(args) {
  console.log(`Run with: ${JSON.stringify(args)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  main(args);
}
