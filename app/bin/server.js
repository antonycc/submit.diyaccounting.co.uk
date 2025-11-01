#!/usr/bin/env node
// app/bin/server.js

import path from "path";
import express from "express";
import { fileURLToPath } from "url";
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
// TODO: Get receipt isn't working on the deployed version, it could be that a single parameterised endpoint is required.
import { handler as hmrcReceiptGet, httpGetByName as myReceiptHttpGetByName } from "../functions/hmrc/hmrcReceiptGet.js";
import { apiEndpoint as mockAuthUrlGetApiEndpoint } from "../functions/non-lambda-mocks/mockAuthUrlGet.js";
import { apiEndpoint as mockTokenPostApiEndpoint } from "../functions/non-lambda-mocks/mockTokenPost.js";

import logger from "../lib/logger.js";
import { requireActivity } from "../lib/entitlementsService.js";
import { dotenvConfigIfNotBlank, validateEnv } from "../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../lib/httpHelper.js";

dotenvConfigIfNotBlank({ path: ".env" });
dotenvConfigIfNotBlank({ path: ".env.test" });

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
mockAuthUrlGetApiEndpoint(app);
mockTokenPostApiEndpoint(app);

app.get(hmrcAuthUrlGetUrlPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcAuthUrlGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

app.post(hmrcTokenPostUrlPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcTokenPost(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

// Submit VAT route (optionally guarded)
if (String(process.env.DIY_SUBMIT_ENABLE_CATALOG_GUARDS || "").toLowerCase() === "true") {
  app.post(hmrcVatReturnPostUrlPath, requireActivity("submit-vat"), async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await hmrcVatReturnPost(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
} else {
  app.post(hmrcVatReturnPostUrlPath, async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await hmrcVatReturnPost(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

app.post(hmrcReceiptPostUrlPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcReceiptPost(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

// My receipts endpoints
app.get(myReceiptsHttpGetUrlPath, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcReceiptGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

app.get(`${myReceiptsHttpGetUrlPath}/:name`, async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await myReceiptHttpGetByName(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

// VAT Obligations endpoint
app.get(hmrcVatObligationGetUrlPath, requireActivity("vat-obligations"), async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcVatObligationGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

// VAT Return endpoint (view submitted return)
app.get(`${hmrcVatReturnGetUrlPath}/:periodKey`, requireActivity("vat-obligations"), async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcVatReturnGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

// VAT Liabilities endpoint
app.get(hmrcVatLiabilityGetUrlPath, requireActivity("vat-obligations"), async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcVatLiabilityGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

// VAT Payments endpoint
app.get(hmrcVatPaymentGetUrlPath, requireActivity("vat-obligations"), async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcVatPaymentGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
});

// VAT Penalties endpoint
app.get(hmrcVatPenaltyGetUrlPath, requireActivity("vat-obligations"), async (httpRequest, httpResponse) => {
  const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
  const lambdaResult = await hmrcVatPenaltyGet(lambdaEvent);
  return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
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
