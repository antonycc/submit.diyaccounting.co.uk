// app/functions/hmrc/hmrcReceiptPost.js

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
import { enforceBundles } from "../../lib/bundleEnforcement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../lib/hmrcHelper.js";

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
  // Build key: with userSub if available, otherwise just formBundle
  let key = null;
  if (userSub && formBundle) {
    key = `receipts/${userSub}/${timestamp}-${formBundle}.json`;
  } else if (formBundle) {
    key = `receipts/${formBundle}.json`;
  }

  // Collect validation errors for required fields
  if (!receipt || Object.keys(receipt).length === 0) errorMessages.push("Missing receipt parameter from body");
  if (!formBundle) errorMessages.push("Missing formBundleNumber in receipt body");
  if (!key) errorMessages.push("Missing key parameter derived from body");

  return { receipt, key, formBundle };
}

// HTTP request/response, aware Lambda handler function
export async function handler(event) {
  validateEnv(["DIY_SUBMIT_RECEIPTS_BUCKET_NAME"]);

  const { request, requestId } = extractRequest(event);
  const errorMessages = [];

  // Bundle enforcement
  try {
    await enforceBundles(event);
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(requestId, error, request);
  }

  // Extract and validate parameters
  const { receipt, key, formBundle } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = { "x-request-id": requestId };

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, requestId, errorMessages, responseHeaders);
  }

  // Processing
  try {
    logger.info({ requestId, message: "Logging receipt to S3", key, formBundle });
    await saveReceiptToS3(key, receipt);

    return http200OkResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      data: { receipt, key },
    });
  } catch (error) {
    logger.error({ requestId, message: "Error saving receipt to S3", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      requestId,
      headers: { ...responseHeaders },
      message: `Failed to log receipt ${key}.`,
      error: { details: error.message },
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function saveReceiptToS3(key, receipt) {
  const receiptsBucketName = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_NAME;
  const testMinioS3 = process.env.TEST_MINIO_S3;
  const testS3Endpoint = process.env.TEST_S3_ENDPOINT;

  logger.info({
    message:
      `Environment variables: ` +
      `DIY_SUBMIT_RECEIPTS_BUCKET_NAME=${receiptsBucketName}, ` +
      `TEST_MINIO_S3=${testMinioS3}, ` +
      `TEST_S3_ENDPOINT=${testS3Endpoint}`,
  });

  // Configure S3 client for containerized MinIO if environment variables are set
  let s3Config = {};
  if (testMinioS3 === "run" || testMinioS3 === "useExisting") {
    logger.info({ message: `Using TEST_S3_ENDPOINT ${testS3Endpoint}` });
    s3Config = buildTestS3Config();
  }

  if (process.env.NODE_ENV === "stubbed") {
    logger.warn({ message: ".NODE_ENV environment variable is stubbedL No receipt saved." });
  } else if (testMinioS3 === "off") {
    logger.warn({ message: "TEST_S3_ENDPOINT is set to 'off': No receipt saved." });
  } else {
    logger.info({
      message: `Logging receipt to S3 bucket ${receiptsBucketName} with key ${key} with config ${JSON.stringify(s3Config)}`,
    });
    const s3Client = new S3Client(s3Config);
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: receiptsBucketName,
          Key: key,
          Body: JSON.stringify(receipt),
          ContentType: "application/json",
        }),
      );
    } catch (error) {
      logger.error({ message: "Failed to log receipt to S3", error });
      throw new Error(`Failed to log receipt: ${error.message}`);
    }
  }
}

function buildTestS3Config() {
  return {
    endpoint: process.env.TEST_S3_ENDPOINT,
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.TEST_S3_ACCESS_KEY,
      secretAccessKey: process.env.TEST_S3_SECRET_KEY,
    },
    forcePathStyle: true,
  };
}
