#!/usr/bin/env node
// app/bin/server.js

import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import fetch from "node-fetch";
import { httpPost as submitVatHttpPost } from "../functions/submitVat.js";
import { httpPost as logReceiptHttpPost } from "../functions/logReceipt.js";
import { httpPost as requestBundleHttpPost, httpDelete as removeBundleHttpDelete } from "../functions/bundle.js";
import { handler as getCatalogHttpGet } from "../functions/catalogGet.js";
import { httpGet as myBundlesHttpGet } from "../functions/myBundles.js";
import { httpGet as myReceiptsHttpGet, httpGetByName as myReceiptHttpGetByName } from "../functions/myReceipts.js";
import { httpGet as getVatObligationsHttpGet } from "../functions/getVatObligations.js";
import { httpGet as getVatReturnHttpGet } from "../functions/getVatReturn.js";
import { httpGet as getVatLiabilitiesHttpGet } from "../functions/getVatLiabilities.js";
import { httpGet as getVatPaymentsHttpGet } from "../functions/getVatPayments.js";
import { httpGet as getVatPenaltiesHttpGet } from "../functions/getVatPenalties.js";
import logger from "../lib/logger.js";
import { requireActivity } from "../lib/entitlementsService.js";
import { dotenvConfigIfNotBlank, validateEnv } from "../lib/env.js";

import { handler as mockAuthUrlGet } from "../functions/mockAuthUrlGet.js";
import { handler as hmrcAuthUrlGet } from "../functions/hmrcAuthUrlGet.js";
import { handler as cognitoAuthUrlGet } from "../functions/cognitoAuthUrlGet.js";
import { handler as mockTokenPost } from "../functions/mockTokenPost.js";
import { handler as hmrcTokenPost } from "../functions/hmrcTokenPost.js";
import { handler as cognitoTokenPost } from "../functions/cognitoTokenPost.js";

dotenvConfigIfNotBlank({ path: ".env" });
dotenvConfigIfNotBlank({ path: ".env.test" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line sonarjs/x-powered-by
const app = express();

// Read configuration from cdk.json
const cdkJsonPath = path.join(__dirname, "../../cdk-application/cdk.json");
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

// Basic CORS middleware (mostly for local tools and OPTIONS where needed)
app.use((req, res, next) => {
  // Allow same-origin (ngrok forwards host), and also enable generic CORS for dev tools
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  // Private Network Access preflight response header if requested by Chromium
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

app.use(express.static(path.join(__dirname, "../../web/public")));

const authUrlPath = context.authUrlLambdaUrlPath || "/api/hmrc/authUrl-get";
const mockAuthUrlPath = "/api/mock/authUrl-get";
const mockTokenProxyPath = "/api/mock/token";
const cognitoAuthUrlPath = context.cognitoAuthUrlLambdaUrlPath || "/api/cognito/authUrl-get";
const exchangeMockTokenPath = context.exchangeTokenLambdaUrlPath || "/api/exchange-token";
const exchangeHmrcTokenPath = context.exchangeHmrcTokenLambdaUrlPath || "/api/hmrc/token-post";
const exchangeCognitoTokenPath = context.exchangeCognitoTokenLambdaUrlPath || "/api/cognito/token-post";
const submitVatPath = context.submitVatLambdaUrlPath || "/api/submit-vat";
const logReceiptPath = context.logReceiptLambdaUrlPath || "/api/log-receipt";
const requestBundlePath = context.bundleLambdaUrlPath || "/api/request-bundle";
const catalogPath = context.catalogLambdaUrlPath || "/api/catalog-get";
const myBundlesPath = context.myBundlesLambdaUrlPath || "/api/my-bundles";
const myReceiptsPath = context.myReceiptsLambdaUrlPath || "/api/my-receipts";

app.get(authUrlPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body } = await hmrcAuthUrlGet(event);
  res["status"](statusCode).json(JSON.parse(body));
});

app.get(mockAuthUrlPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body } = await mockAuthUrlGet(event);
  res["status"](statusCode).json(JSON.parse(body));
});

app.get(cognitoAuthUrlPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body } = await cognitoAuthUrlGet(event);
  res.status(statusCode).json(JSON.parse(body));
});

// Proxy to local mock OAuth2 server token endpoint to avoid browser PNA/CORS
app.post(mockTokenProxyPath, async (req, res) => {
  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.body || {})) {
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, v);
      } else if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }

    const resp = await fetch("http://localhost:8080/default/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const contentType = resp.headers.get("content-type") || "application/json";
    const text = await resp.text();
    res.status(resp.status).set("content-type", contentType).send(text);
  } catch (e) {
    logger.error(`Mock token proxy error: ${e?.stack || e}`);
    res.status(500).json({ message: "Mock token proxy failed", error: String(e) });
  }
});

app.post(exchangeMockTokenPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await mockTokenPost(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post(exchangeHmrcTokenPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await hmrcTokenPost(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post(exchangeCognitoTokenPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000" },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await cognitoTokenPost(event);
  res.status(statusCode).json(JSON.parse(body));
});

// Submit VAT route (optionally guarded)
if (String(process.env.DIY_SUBMIT_ENABLE_CATALOG_GUARDS || "").toLowerCase() === "true") {
  app.post(submitVatPath, requireActivity("submit-vat"), async (req, res) => {
    const event = {
      path: req.path,
      headers: { host: req.get("host") || "localhost:3000" },
      queryStringParameters: req.query || {},
      body: JSON.stringify(req.body),
    };
    const { statusCode, body } = await submitVatHttpPost(event);
    res.status(statusCode).json(JSON.parse(body));
  });
} else {
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
}

app.post(logReceiptPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
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
    // eslint-disable-next-line sonarjs/no-ignored-exceptions
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});
app.options(requestBundlePath, async (_req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
  });
  res.status(200).send();
});

// Bundle removal route
app.delete(requestBundlePath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await removeBundleHttpDelete(event);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
    // eslint-disable-next-line sonarjs/no-ignored-exceptions
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// Catalog endpoint
app.get(catalogPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      "host": req.get("host") || "localhost:3000",
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

// My bundles endpoint
app.get(myBundlesPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await myBundlesHttpGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// My receipts endpoints
app.get(myReceiptsPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await myReceiptsHttpGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

app.get(`${myReceiptsPath}/:name`, async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
    },
    pathParameters: { name: req.params.name },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await myReceiptHttpGetByName(event);
  if (headers) res.set(headers);
  try {
    // For GET receipt by name, response body is already JSON string of the receipt
    res.status(statusCode).send(body || "{}");
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// VAT API endpoints
const vatObligationsPath = "/api/vat/obligations";
const vatReturnPath = "/api/vat/returns";
const vatLiabilitiesPath = "/api/vat/liabilities";
const vatPaymentsPath = "/api/vat/payments";
const vatPenaltiesPath = "/api/vat/penalties";

// VAT Obligations endpoint
app.get(vatObligationsPath, requireActivity("vat-obligations"), async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
      ...req.headers,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await getVatObligationsHttpGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
    // eslint-disable-next-line sonarjs/no-ignored-exceptions
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// VAT Return endpoint (view submitted return)
app.get(`${vatReturnPath}/:periodKey`, requireActivity("vat-obligations"), async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
      ...req.headers,
    },
    pathParameters: { periodKey: req.params.periodKey },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await getVatReturnHttpGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// VAT Liabilities endpoint
app.get(vatLiabilitiesPath, requireActivity("vat-obligations"), async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
      ...req.headers,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await getVatLiabilitiesHttpGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// VAT Payments endpoint
app.get(vatPaymentsPath, requireActivity("vat-obligations"), async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
      ...req.headers,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await getVatPaymentsHttpGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// VAT Penalties endpoint
app.get(vatPenaltiesPath, requireActivity("vat-obligations"), async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
      ...req.headers,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await getVatPenaltiesHttpGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
    // eslint-disable-next-line sonarjs/no-ignored-exceptions
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// fallback to index.html for SPA routing (if needed)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../web/public/index.html"));
});

const TEST_SERVER_HTTP_PORT = process.env.TEST_SERVER_HTTP_PORT || 3000;

// Only start the server if this file is being run directly (compare absolute paths) or under test harness
const __thisFile = fileURLToPath(import.meta.url);
const __argv1 = process.argv[1] ? path.resolve(process.argv[1]) : "";
const __runDirect = __thisFile === __argv1 || String(process.env.TEST_SERVER_HTTP || "") === "run";

if (__runDirect) {
  validateEnv([
    "DIY_SUBMIT_BASE_URL",
    "COGNITO_CLIENT_ID",
    "COGNITO_BASE_URI",
    "HMRC_BASE_URI",
    "HMRC_CLIENT_ID",
    "HMRC_CLIENT_SECRET_ARN",
    "DIY_SUBMIT_RECEIPTS_BUCKET_NAME",
  ]);
  app.listen(TEST_SERVER_HTTP_PORT, () => {
    const message = `Listening at http://127.0.0.1:${TEST_SERVER_HTTP_PORT}`;
    console.log(message);
    logger.info(message);
  });
}
