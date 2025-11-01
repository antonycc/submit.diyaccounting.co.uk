#!/usr/bin/env node
// app/bin/server.js

import path from "path";
import express from "express";
import { fileURLToPath } from "url";
// TODO: No local cognitoAuthUrlGet
import { handler as cognitoAuthUrlGet } from "../functions/auth/cognitoAuthUrlGet.js";
// TODO: local cognitoTokenPost
import { handler as cognitoTokenPost } from "../functions/auth/cognitoTokenPost.js";
import { apiEndpoint as catalogGetApiEndpoint } from "../functions/account/catalogGet.js";
import { apiEndpoint as bundlePostApiEndpoint } from "../functions/account/bundlePost.js";
import { apiEndpoint as bundleDeleteApiEndpoint } from "../functions/account/bundleDelete.js";
import { handler as hmrcAuthUrlGet } from "../functions/hmrc/hmrcAuthUrlGet.js";
import { handler as hmrcTokenPost } from "../functions/hmrc/hmrcTokenPost.js";
import { handler as hmrcVatReturnPost } from "../functions/hmrc/hmrcVatReturnPost.js";
import { handler as hmrcVatObligationGet } from "../functions/hmrc/hmrcVatObligationGet.js";
import { handler as hmrcVatLiabilityGet } from "../functions/hmrc/hmrcVatLiabilityGet.js";
import { handler as hmrcVatReturnGet } from "../functions/hmrc/hmrcVatReturnGet.js";
import { handler as hmrcVatPaymentGet } from "../functions/hmrc/hmrcVatPaymentGet.js";
import { handler as hmrcVatPenaltyGet } from "../functions/hmrc/hmrcVatPenaltyGet.js";
import { handler as hmrcReceiptPost } from "../functions/hmrc/hmrcReceiptPost.js";
import { handler as myReceiptsHttpGet, httpGetByName as myReceiptHttpGetByName } from "../functions/hmrc/hmrcReceiptGet.js";
import { handler as mockAuthUrlGet } from "../functions/non-lambda-mocks/mockAuthUrlGet.js";
import { handler as mockTokenPost } from "../functions/non-lambda-mocks/mockTokenPost.js";

import logger from "../lib/logger.js";
import { requireActivity } from "../lib/entitlementsService.js";
import { dotenvConfigIfNotBlank, validateEnv } from "../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../lib/httpHelper.js";

dotenvConfigIfNotBlank({ path: ".env" });
dotenvConfigIfNotBlank({ path: ".env.test" });

// TODO: No local cognitoAuthUrlGet
const cognitoAuthUrlGetPath = "/api/v1/cognito/authUrl";
// TODO: local cognitoTokenPost
const exchangeCognitoTokenPath = "/api/v1/cognito/token";
const hmrcAuthUrlGetUrlPath = "/api/v1/hmrc/authUrl";
const hmrcTokenPostUrlPath = "/api/v1/hmrc/token";
const hmrcVatReturnPostUrlPath = "/api/v1/hmrc/vat/return";
const hmrcVatObligationGetUrlPath = "/api/v1/hmrc/vat/obligation";
const hmrcVatReturnGetUrlPath = "/api/v1/hmrc/vat/return";
const hmrcVatLiabilityGetUrlPath = "/api/v1/hmrc/vat/liability";
const hmrcVatPaymentGetUrlPath = "/api/v1/hmrc/vat/payments";
const hmrcVatPenaltyGetUrlPath = "/api/v1/hmrc/vat/penalty";
const hmrcReceiptPostUrlPath = "/api/v1/hmrc/receipt";
const myReceiptsHttpGetUrlPath = "/api/v1/hmrc/receipt";
const mockAuthUrlPath = "/api/v1/mock/authUrl";
// TODO: Seems duplicated
const exchangeMockTokenPath = "/api/exchange-token";
const mockTokenProxyPath = "/api/mock/token";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

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

catalogGetApiEndpoint(app);
bundlePostApiEndpoint(app);
bundleDeleteApiEndpoint(app);

app.get(hmrcAuthUrlGetUrlPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcAuthUrlGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

app.get(mockAuthUrlPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await mockAuthUrlGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

// TODO: No local cognitoAuthUrlGet
app.get(cognitoAuthUrlGetPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await cognitoAuthUrlGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
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

app.post(exchangeMockTokenPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await mockTokenPost(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

app.post(hmrcTokenPostUrlPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcTokenPost(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

app.post(exchangeCognitoTokenPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await cognitoTokenPost(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

// Submit VAT route (optionally guarded)
if (String(process.env.DIY_SUBMIT_ENABLE_CATALOG_GUARDS || "").toLowerCase() === "true") {
  app.post(hmrcVatReturnPostUrlPath, requireActivity("submit-vat"), async (req, res) => {
    const event = {
      path: req.path,
      headers: { host: req.get("host") || "localhost:3000" },
      queryStringParameters: req.query || {},
      body: JSON.stringify(req.body),
    };
    const { statusCode, body } = await hmrcVatReturnPost(event);
    res.status(statusCode).json(JSON.parse(body));
  });
} else {
  app.post(hmrcVatReturnPostUrlPath, async (req, res) => {
    const event = {
      path: req.path,
      headers: { host: req.get("host") || "localhost:3000" },
      queryStringParameters: req.query || {},
      body: JSON.stringify(req.body),
    };
    const { statusCode, body } = await hmrcVatReturnPost(event);
    res.status(statusCode).json(JSON.parse(body));
  });
}

app.post(hmrcReceiptPostUrlPath, async (req, res) => {
  const event = {
    path: req.path,
    headers: { host: req.get("host") || "localhost:3000", authorization: req.headers.authorization },
    queryStringParameters: req.query || {},
    body: JSON.stringify(req.body),
  };
  const { statusCode, body } = await hmrcReceiptPost(event);
  res.status(statusCode).json(JSON.parse(body));
});

// My receipts endpoints
app.get(myReceiptsHttpGetUrlPath, async (req, res) => {
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

app.get(`${myReceiptsHttpGetUrlPath}/:name`, async (req, res) => {
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

// VAT Obligations endpoint
app.get(hmrcVatObligationGetUrlPath, requireActivity("vat-obligations"), async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
      ...req.headers,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await hmrcVatObligationGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
    // eslint-disable-next-line sonarjs/no-ignored-exceptions
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// VAT Return endpoint (view submitted return)
app.get(`${hmrcVatReturnGetUrlPath}/:periodKey`, requireActivity("vat-obligations"), async (req, res) => {
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
  const { statusCode, body, headers } = await hmrcVatReturnGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// VAT Liabilities endpoint
app.get(hmrcVatLiabilityGetUrlPath, requireActivity("vat-obligations"), async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
      ...req.headers,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await hmrcVatLiabilityGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// VAT Payments endpoint
app.get(hmrcVatPaymentGetUrlPath, requireActivity("vat-obligations"), async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
      ...req.headers,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await hmrcVatPaymentGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// VAT Penalties endpoint
app.get(hmrcVatPenaltyGetUrlPath, requireActivity("vat-obligations"), async (req, res) => {
  const event = {
    path: req.path,
    headers: {
      host: req.get("host") || "localhost:3000",
      authorization: req.headers.authorization,
      ...req.headers,
    },
    queryStringParameters: req.query || {},
  };
  const { statusCode, body, headers } = await hmrcVatPenaltyGet(event);
  if (headers) res.set(headers);
  try {
    res.status(statusCode).json(body ? JSON.parse(body) : {});
    // eslint-disable-next-line sonarjs/no-ignored-exceptions
  } catch (_e) {
    res.status(statusCode).send(body || "");
  }
});

// fallback to index.html for SPA routing (if needed)
app.get(/.*/, (req, res) => {
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
