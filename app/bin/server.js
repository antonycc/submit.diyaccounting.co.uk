#!/usr/bin/env node
// app/bin/server.js

import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import dotenv from "dotenv";

import { httpGetGoogle, httpGetHmrc, httpGetMock } from "../functions/authUrl.js";
import { httpPost as exchangeTokenHttpPost, httpPostGoogle, httpPostHmrc } from "../functions/exchangeToken.js";
import { httpPost as submitVatHttpPost } from "../functions/submitVat.js";
import { httpPost as logReceiptHttpPost } from "../functions/logReceipt.js";
import { httpPost as requestBundleHttpPost } from "../functions/bundle.js";
import { httpGet as getCatalogHttpGet } from "../functions/getCatalog.js";
import logger from "../lib/logger.js";

dotenv.config({ path: ".env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Read configuration from cdk.json
const cdkJsonPath = path.join(__dirname, "../../cdk.json");
logger.info(`Reading CDK configuration from ${cdkJsonPath}`);
const cdkConfig = JSON.parse(readFileSync(cdkJsonPath, "utf8"));
// logger.info(`CDK configuration: ${JSON.stringify(cdkConfig, null, 2)}`);
const context = cdkConfig.context || {};
logger.info("CDK context:", context);

// parse bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// HTTP access logging middleware
app.use((req, res, next) => {
  logger.info(`HTTP ${req.method} ${req.url}`);
  next();
});

// 1) serve static site
app.use(express.static(path.join(__dirname, "../../web/public")));

// 2) wire your Lambdas under configurable paths from cdk.json
const authUrlPath = context.authUrlLambdaUrlPath || "/api/hmrc/auth-url";
const mockAuthUrlPath = "/api/mock/auth-url";
const exchangeTokenPath = context.exchangeTokenLambdaUrlPath || "/api/exchange-token";
const exchangeHmrcTokenPath = context.exchangeHmrcTokenLambdaUrlPath || "/api/hmrc/exchange-token";
const exchangeGoogleTokenPath = context.exchangeGoogleTokenLambdaUrlPath || "/api/google/exchange-token";
const submitVatPath = context.submitVatLambdaUrlPath || "/api/submit-vat";
const logReceiptPath = context.logReceiptLambdaUrlPath || "/api/log-receipt";
const googleAuthUrlPath = context.googleAuthUrlLambdaUrlPath || "/api/google/auth-url";
const requestBundlePath = context.bundleLambdaUrlPath || "/api/request-bundle";
const catalogPath = context.catalogLambdaUrlPath || "/api/catalog";

app.get(authUrlPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body } = await httpGetHmrc(event);
  res["status"](statusCode).json(JSON.parse(body));
});

app.get(mockAuthUrlPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body } = await httpGetMock(event);
  res["status"](statusCode).json(JSON.parse(body));
});

app.get(googleAuthUrlPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body } = await httpGetGoogle(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post(exchangeTokenPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await exchangeTokenHttpPost(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post(exchangeHmrcTokenPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await httpPostHmrc(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post(exchangeGoogleTokenPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await httpPostGoogle(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post(submitVatPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await submitVatHttpPost(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post(logReceiptPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await logReceiptHttpPost(event);
  res.status(statusCode).json(JSON.parse(body));
});

// Bundle management route
app.post(requestBundlePath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await requestBundleHttpPost(event);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});
app.options(requestBundlePath, async (_req, res) => {
  const { statusCode, body } = await requestBundleHttpPost({ httpMethod: "OPTIONS" });
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// Catalog endpoint
app.get(catalogPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      "if-none-match": req.headers["if-none-match"],
      "if-modified-since": req.headers["if-modified-since"],
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await getCatalogHttpGet(event);
  if (headers) res.set(headers);
  if (statusCode === 304) return res.status(304).end();
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// fallback to index.html for SPA routing (if needed)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../web/public/index.html"));
});

const DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT = process.env.DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT || 3000;

// Only start the server if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT, () => {
    const hmrcBase = process.env.DIY_SUBMIT_HMRC_BASE_URI || "DIY_SUBMIT_HMRC_BASE_URI not set";
    const message = `Listening at http://127.0.0.1:${DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT} for ${hmrcBase}`;
    console.log(message);
    logger.info(message);
  });
}
