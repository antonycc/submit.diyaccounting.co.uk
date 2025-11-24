// app/functions/hmrc/hmrcReceiptPost.js

import logger from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http500ServerErrorResponse,
  parseRequestBody,
  buildValidationError,
} from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { enforceBundles } from "../../lib/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../lib/hmrcHelper.js";
import { putReceipt } from "../../lib/dynamoDbReceiptStore.js";

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/receipt", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const receipt = parsedBody && parsedBody.receipt ? parsedBody.receipt : parsedBody;

  // Extract userSub from Authorization header if present
  const auth = event.headers?.authorization || event.headers?.Authorization;
  let userSub = null;
  if (auth && auth.startsWith("Bearer ")) {
    try {
      const token = auth.split(" ")[1];
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const json = Buffer.from(payload, "base64").toString("utf8");
        const claims = JSON.parse(json);
        userSub = claims.sub || null;
      }
    } catch {
      // JWT parsing failed - userSub remains null
      userSub = null;
    }
  }

  const formBundle = receipt?.formBundleNumber;
  const timestamp = new Date().toISOString();
  // Build receiptId from timestamp and formBundle
  let receiptId = null;
  let key = null; // Legacy S3-style key for compatibility
  if (userSub && formBundle) {
    receiptId = `${timestamp}-${formBundle}`;
    key = `receipts/${userSub}/${receiptId}.json`;
  } else if (formBundle) {
    receiptId = formBundle;
    key = `receipts/${formBundle}.json`;
  }

  // Collect validation errors for required fields
  if (!receipt || Object.keys(receipt).length === 0) errorMessages.push("Missing receipt parameter from body");
  if (!formBundle) errorMessages.push("Missing formBundleNumber in receipt body");
  if (!receiptId) errorMessages.push("Missing receiptId parameter derived from body");

  // Extract HMRC account (sandbox/live) from header hmrcAccount
  const hmrcAccountHeader = (event.headers && event.headers.hmrcaccount) || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "sandbox" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'sandbox' or 'live' if provided.");
  }

  return { receipt, receiptId, key, formBundle, hmrcAccount, userSub };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["DIY_SUBMIT_RECEIPTS_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  // If HEAD request, return 200 OK immediately after bundle enforcement
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  // Extract and validate parameters
  const { receipt, receiptId, key, formBundle, userSub } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = {};

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Processing
  try {
    logger.info({ message: "Logging receipt to DynamoDB", receiptId, key, formBundle });
    await saveReceiptToDynamoDB(userSub, receiptId, receipt);

    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: { receipt, key },
    });
  } catch (error) {
    logger.error({ message: "Error saving receipt to DynamoDB", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: `Failed to log receipt ${key}.`,
      error: { details: error.message },
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function saveReceiptToDynamoDB(userSub, receiptId, receipt) {
  const receiptsTableName = process.env.DIY_SUBMIT_RECEIPTS_TABLE_NAME;

  logger.info({
    message: `Environment variables: DIY_SUBMIT_RECEIPTS_TABLE_NAME=${receiptsTableName}`,
  });

  if (process.env.NODE_ENV === "stubbed") {
    logger.warn({ message: "NODE_ENV environment variable is stubbed: No receipt saved." });
  } else {
    logger.info({
      message: `Logging receipt to DynamoDB table ${receiptsTableName} with receiptId ${receiptId}`,
    });
    try {
      await putReceipt(userSub, receiptId, receipt);
    } catch (error) {
      logger.error({ message: "Failed to log receipt to DynamoDB", error });
      throw new Error(`Failed to log receipt: ${error.message}`);
    }
  }
}
