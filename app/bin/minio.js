#!/usr/bin/env node
// app/bin/server.js

import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import dotenv from 'dotenv';

import { httpGet as authUrlHttpGet } from "../functions/authUrl.js";
import { httpPost as exchangeTokenHttpPost } from "../functions/exchangeToken.js";
import { httpPost as submitVatHttpPost } from "../functions/submitVat.js";
import { httpPost as logReceiptHttpPost } from "../functions/logReceipt.js";

dotenv.config({ path: '.env' });

import logger from "../lib/logger.js";
import {CreateBucketCommand, HeadBucketCommand, S3Client} from "@aws-sdk/client-s3";
import {GenericContainer} from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read configuration from cdk.json
const cdkJsonPath = path.join(__dirname, "../../cdk.json");
logger.info(`Reading CDK configuration from ${cdkJsonPath}`);
const cdkConfig = JSON.parse(readFileSync(cdkJsonPath, 'utf8'));
//logger.info("CDK configuration:", cdkConfig);
const context = cdkConfig.context || {};
logger.info("CDK context:", context);

export async function startMinio(receiptsBucketFullName, optionalTestS3AccessKey, optionalTestS3SecretKey) {
  const container = await new GenericContainer("minio/minio")
      .withExposedPorts(9000)
      .withEnvironment({
        MINIO_ROOT_USER: optionalTestS3AccessKey,
        MINIO_ROOT_PASSWORD: optionalTestS3SecretKey,
      })
      .withCommand(["server", "/data"])
      .start();
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
  return endpoint;
}

// Start or connect to MinIO S3 server or any S3 compatible server
export async function ensureMinioBucketExists(receiptsBucketFullName, endpoint, optionalTestS3AccessKey) {
  logger.info(`Ensuring bucket: '${receiptsBucketFullName}' exists on endpoint '${endpoint}' for access key '${optionalTestS3AccessKey}'`);
  const clientConfig = {
      endpoint,
      forcePathStyle: true,
      region: "us-east-1",
      credentials: {
        accessKeyId: optionalTestS3AccessKey,
        secretAccessKey: optionalTestS3SecretKey,
      }
    }
  const s3 = new S3Client(clientConfig);

  try {
    await s3.send(new HeadBucketCommand({ Bucket: receiptsBucketFullName }));
    logger.info(`✅ Bucket '${receiptsBucketFullName}' already exists on endpoint '${endpoint}'`);
  } catch (err) {
    if (err.name === "NotFound") {
      logger.info(`ℹ️ Bucket '${receiptsBucketFullName}' not found on endpoint '${endpoint}', creating...`);
      await s3.send(new CreateBucketCommand({Bucket: receiptsBucketFullName}));
      logger.info(`✅ Created bucket '${receiptsBucketFullName}' on endpoint '${endpoint}'`);
    } else {
      throw new Error(`Failed to check/create bucket: ${err.message} on endpoint '${endpoint}' for access key '${optionalTestS3AccessKey}'`);
    }
  }
}

// Only start the server if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const bucketNamePostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
  const homeUrl = process.env.DIY_SUBMIT_HOME_URL;
  const {hostname} = new URL(homeUrl);
  const dashedDomain = hostname.split('.').join('-');
  const receiptsBucketFullName = `${dashedDomain}-${bucketNamePostfix}`;
  const optionalTestS3AccessKey = process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY;
  const optionalTestS3SecretKey = process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY;
  const endpoint = await startMinio(receiptsBucketFullName, optionalTestS3AccessKey, optionalTestS3SecretKey);
  console.log(`MinIO started url=${endpoint}`);
}
