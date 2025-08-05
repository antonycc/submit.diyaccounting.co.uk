// app/functions/logReceipt.js

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

import logger from "../lib/logger.js";
import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";

dotenv.config({ path: ".env" });

export async function logReceipt(key, receipt) {
  const homeUrl = process.env.DIY_SUBMIT_HOME_URL;
  const receiptsBucketPostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
  const { hostname } = new URL(homeUrl);
  let envPrefix = "";
  if (homeUrl === "https://submit.diyaccounting.co.uk/") {
    envPrefix = "prod.";
  }
  const dashedDomain = `${envPrefix}${hostname}`.split(".").join("-");
  const receiptsBucketFullName = `${dashedDomain}-${receiptsBucketPostfix}`;

  // Configure S3 client for containerized MinIO if environment variables are set
  let s3Config = {};
  if (
    process.env.NODE_ENV !== "stubbed" &&
    process.env.DIY_SUBMIT_TEST_S3_ENDPOINT &&
    process.env.DIY_SUBMIT_TEST_S3_ENDPOINT !== "off"
  ) {
    s3Config = buildTestS3Config();
  }

  if (process.env.NODE_ENV === "stubbed") {
    logger.warn({ message: ".NODE_ENV environment variable is stubbedL No receipt saved." });
  } else if (process.env.DIY_SUBMIT_TEST_S3_ENDPOINT === "off") {
    logger.warn({ message: "DIY_SUBMIT_TEST_S3_ENDPOINT is set to 'off': No receipt saved." });
  } else {
    const s3Client = new S3Client(s3Config);
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: receiptsBucketFullName,
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

// POST /api/log-receipt
export async function httpPost(event) {
  const request = extractRequest(event);

  // Validation
  const receipt = JSON.parse(event.body || "{}");
  const key = `receipts/${receipt.formBundleNumber}.json`;
  const errorMessages = [];
  if (!receipt) {
    errorMessages.push("Missing receipt parameter from body");
  }
  if (!key) {
    errorMessages.push("Missing key parameter from body");
  }
  if (!process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX) {
    errorMessages.push({
      message: "DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX environment variable is not set, cannot log receipt",
    });
  }
  if (errorMessages.length > 0) {
    return httpBadRequestResponse({
      request,
      message: `There are ${errorMessages.length} validation errors for ${key}.`,
      error: errorMessages.join(", "),
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
    endpoint: process.env.DIY_SUBMIT_TEST_S3_ENDPOINT,
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY,
      secretAccessKey: process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY,
    },
    forcePathStyle: true,
  };
}
