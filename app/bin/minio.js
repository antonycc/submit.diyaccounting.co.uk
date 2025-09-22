#!/usr/bin/env node
// app/bin/server.js

import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import dotenv from "dotenv";

import { httpGetHmrc as authUrlHttpGet } from "../functions/authUrl.js";
import { httpPostMock as exchangeTokenHttpPost } from "../functions/exchangeToken.js";
import { httpPost as submitVatHttpPost } from "../functions/submitVat.js";
import { httpPost as logReceiptHttpPost } from "../functions/logReceipt.js";

dotenv.config({ path: ".env" });

import logger from "../lib/logger.js";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { GenericContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read configuration from cdk.json
const cdkJsonPath = path.join(__dirname, "../../cdk-application/cdk.json");
logger.info(`Reading CDK configuration from ${cdkJsonPath}`);
const cdkConfig = JSON.parse(readFileSync(cdkJsonPath, "utf8"));
// logger.info("CDK configuration:", cdkConfig);
const context = cdkConfig.context || {};
logger.info("CDK context:", context);

async function startMinioContainer(optionalTestS3AccessKey, optionalTestS3SecretKey) {
  return await new GenericContainer("minio/minio")
    .withExposedPorts(9000)
    .withEnvironment({
      MINIO_ROOT_USER: optionalTestS3AccessKey,
      MINIO_ROOT_PASSWORD: optionalTestS3SecretKey,
    })
    .withCommand(["server", "/data"])
    .start();
}

export async function startMinio(receiptsBucketFullName, optionalTestS3AccessKey, optionalTestS3SecretKey) {
  const container = await startMinioContainer(optionalTestS3AccessKey, optionalTestS3SecretKey);
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
  return endpoint;
}

// Start or connect to MinIO S3 server or any S3 compatible server
export async function ensureMinioBucketExists(
  receiptsBucketFullName,
  endpoint,
  optionalTestS3AccessKey,
  optionalTestS3SecretKey,
) {
  logger.info(
    `Ensuring bucket: '${receiptsBucketFullName}' exists on endpoint '${endpoint}' for access key '${optionalTestS3AccessKey}'`,
  );
  const clientConfig = {
    endpoint,
    forcePathStyle: true,
    region: "us-east-1",
    credentials: {
      accessKeyId: optionalTestS3AccessKey,
      secretAccessKey: optionalTestS3SecretKey,
    },
  };
  const s3 = new S3Client(clientConfig);

  try {
    await s3.send(new HeadBucketCommand({ Bucket: receiptsBucketFullName }));
    logger.info(`✅ Bucket '${receiptsBucketFullName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "NotFound") {
      logger.info(`ℹ️ Bucket '${receiptsBucketFullName}' not found on endpoint '${endpoint}', creating...`);
      await s3.send(new CreateBucketCommand({ Bucket: receiptsBucketFullName }));
      logger.info(`✅ Created bucket '${receiptsBucketFullName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(
        `Failed to check/create bucket: ${err.message} on endpoint '${endpoint}' for access key '${optionalTestS3AccessKey}'`,
      );
    }
  }
}

// Only start the server if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const bucketNamePostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
  const homeUrl = process.env.DIY_SUBMIT_HOME_URL;
  const { hostname } = new URL(homeUrl);
  const dashedDomain = hostname.split(".").join("-");
  const receiptsBucketFullName = `${dashedDomain}-${bucketNamePostfix}`;
  const optionalTestS3AccessKey = process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY;
  const optionalTestS3SecretKey = process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY;

  let container;

  try {
    logger.info("Starting MinIO server...");
    container = await startMinioContainer(optionalTestS3AccessKey, optionalTestS3SecretKey);

    const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
    console.log(`MinIO started url=${endpoint}`);

    // Ensure bucket exists
    await ensureMinioBucketExists(receiptsBucketFullName, endpoint, optionalTestS3AccessKey, optionalTestS3SecretKey);

    logger.info("MinIO server is running. Press CTRL-C to stop.");

    // Handle graceful shutdown
    let isShuttingDown = false;
    const gracefulShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`\nReceived ${signal}. Shutting down MinIO server...`);
      if (container) {
        try {
          await container.stop();
          logger.info("MinIO server stopped successfully.");
        } catch (error) {
          logger.error("Error stopping MinIO server:", error);
        }
      }
      process.exit(0);
    };

    // Listen for termination signals
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    // Keep the process alive
    const keepAlive = setInterval(() => {
      // This interval keeps the process running
    }, 1000);

    // Clean up interval on exit
    process.on("exit", () => {
      clearInterval(keepAlive);
    });
  } catch (error) {
    logger.error("Failed to start MinIO server:", error);
    process.exit(1);
  }
}
