// app/functions/hmrc/hmrcReceiptGet.js

import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import logger from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http500ServerErrorResponse,
  buildValidationError,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
} from "../../lib/responses.js";
import { makeReceiptsS3 } from "../../lib/s3Env.js";
import { streamToString } from "../../lib/streams.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { getUserSub } from "../../lib/jwtHelper.js";
import { enforceBundles } from "../../lib/bundleEnforcement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../lib/hmrcHelper.js";

function parseReceiptKey(key) {
  // receipts/{sub}/{timestamp}-{bundle}.json
  const parts = String(key || "").split("/");
  if (parts.length < 3) return { ok: false };
  const name = parts[parts.length - 1];
  const sub = parts[1];
  if (!name.endsWith(".json")) return { ok: false };
  const base = name.slice(0, -5);
  const dashIdx = base.lastIndexOf("-");
  if (dashIdx === -1) return { ok: false };
  const timestamp = base.substring(0, dashIdx);
  const formBundleNumber = base.substring(dashIdx + 1);
  return { ok: true, name, sub, timestamp, formBundleNumber };
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  app.get("/api/v1/hmrc/receipt", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.get(`/api/v1/hmrc/receipt/:name`, async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export function extractAndValidateParameters(event, errorMessages, userSub) {
  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};
  const { name, key: providedKey } = { ...pathParams, ...queryParams };

  // Determine if this is a list or single-item request
  const hasNameOrKey = Boolean(name || providedKey);

  if (hasNameOrKey) {
    // Single item validation
    let Key;
    if (providedKey) {
      if (!providedKey.startsWith(`receipts/${userSub}/`) || providedKey.includes("..")) {
        errorMessages.push("Invalid or forbidden key parameter");
      }
      Key = providedKey;
    } else if (name) {
      if (!/^[^/]+\.json$/.test(name)) {
        errorMessages.push("Invalid name format - must be a filename ending in .json");
      }
      Key = `receipts/${userSub}/${name}`;
    }
    return { hasNameOrKey, Key };
  }

  return { hasNameOrKey: false };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["DIY_SUBMIT_RECEIPTS_BUCKET_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Check authentication
  const userSub = getUserSub(event || {});
  if (!userSub) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Authentication required",
      error: {},
    });
  }

  const errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  // If HEAD request, return 200 OK immediately after bundle enforcement
  if (request.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  // Extract and validate parameters
  const { hasNameOrKey, Key } = extractAndValidateParameters(event, errorMessages, userSub);

  // Validation errors
  if (errorMessages.length > 0) {
    // Check for forbidden error specifically
    if (errorMessages.some((msg) => msg.includes("forbidden"))) {
      return http403ForbiddenResponse({
        request,
        headers: { ...responseHeaders },
        message: "Forbidden",
      });
    }
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Processing
  try {
    if (hasNameOrKey) {
      logger.info({ message: "Retrieving single receipt", key: Key });
      const receipt = await getReceiptByKey(userSub, Key);
      return {
        statusCode: 200,
        headers: { ...responseHeaders },
        body: JSON.stringify(receipt),
      };
    } else {
      logger.info({ message: "Listing user receipts", userSub });
      const receipts = await listUserReceipts(userSub);
      return http200OkResponse({
        request,
        headers: { ...responseHeaders },
        data: { receipts },
      });
    }
  } catch (error) {
    logger.error({ message: "Error retrieving receipts", error: error.message, stack: error.stack });
    // Check if this is a not found error
    if (error.message && error.message.includes("not found")) {
      return buildValidationError(request, ["Receipt not found"], responseHeaders);
    }
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function listUserReceipts(userSub) {
  const { s3, Bucket } = makeReceiptsS3(process.env);
  const Prefix = `receipts/${userSub}/`;

  let ContinuationToken = undefined;
  const items = [];

  do {
    const resp = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken, MaxKeys: 1000 }));
    (resp.Contents || []).forEach((o) => {
      const meta = parseReceiptKey(o.Key);
      if (meta.ok) {
        items.push({
          key: o.Key,
          name: meta.name,
          timestamp: meta.timestamp,
          formBundleNumber: meta.formBundleNumber,
          size: o.Size,
          lastModified: o.LastModified ? new Date(o.LastModified).toISOString() : undefined,
        });
      }
    });
    ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (ContinuationToken);

  items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return items;
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getReceiptByKey(userSub, Key) {
  const { s3, Bucket } = makeReceiptsS3(process.env);

  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket, Key }));
    const bodyString = await streamToString(resp.Body);
    return JSON.parse(bodyString);
  } catch (e) {
    const statusCode = e?.$metadata?.httpStatusCode || 500;
    if (statusCode === 404) {
      throw new Error("Receipt not found");
    }
    throw new Error(`Failed to get receipt: ${e?.message || String(e)}`);
  }
}
