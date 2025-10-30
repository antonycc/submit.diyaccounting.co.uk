// app/functions/logReceipt.js

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import logger from "../../lib/logger.js";
import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";

export async function logReceipt(key, receipt) {
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
  // if (process.env.NODE_ENV !== "stubbed" && process.env.TEST_S3_ENDPOINT && process.env.TEST_S3_ENDPOINT !== "off") {
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

// POST /api/v1/hmrc/receipt
export async function handler(event) {
  validateEnv(["DIY_SUBMIT_RECEIPTS_BUCKET_NAME"]);

  const request = extractRequest(event);

  // Parse body – allow either {receipt: {...}} or direct receipt fields
  const parsed = JSON.parse(event.body || "{}");
  const receipt = parsed && parsed.receipt ? parsed.receipt : parsed;

  // Extract user sub (if available) from Authorization header without verification
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
    } catch (_e) {
      userSub = null;
    }
  }

  // Build S3 key
  const formBundle = receipt?.formBundleNumber;
  const timestamp = new Date().toISOString();
  const key =
    userSub && formBundle ? `receipts/${userSub}/${timestamp}-${formBundle}.json` : formBundle ? `receipts/${formBundle}.json` : null;

  // Validation
  const errorMessages = [];
  if (!receipt || Object.keys(receipt).length === 0) {
    errorMessages.push("Missing receipt parameter from body");
  }
  if (!formBundle) {
    errorMessages.push("Missing formBundleNumber in receipt body");
  }
  if (!key) {
    errorMessages.push("Missing key parameter derived from body");
  }
  if (errorMessages.length > 0) {
    return httpBadRequestResponse({
      request,
      message: `There are ${errorMessages.length} validation errors for ${formBundle || "unknown"}.`,
      error: { error: errorMessages.join(", ") },
    });
  }

  // Processing
  try {
    await logReceipt(key, receipt);
  } catch (error) {
    // Generate a failure response
    return httpServerErrorResponse({
      request: request,
      message: `Failed to log receipt ${key}.`,
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
