#!/usr/bin/env node
// app/bin/server.js

import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { apiEndpoint as catalogGetApiEndpoint } from "../functions/account/catalogGet.js";
import { apiEndpoint as bundleGetApiEndpoint } from "../functions/account/bundleGet.js";
import { apiEndpoint as bundlePostApiEndpoint } from "../functions/account/bundlePost.js";
import { apiEndpoint as bundleDeleteApiEndpoint } from "../functions/account/bundleDelete.js";
import { apiEndpoint as hmrcAuthUrlGetApiEndpoint } from "../functions/hmrc/hmrcAuthUrlGet.js";
import { apiEndpoint as hmrcTokenPostApiEndpoint } from "../functions/hmrc/hmrcTokenPost.js";
import { apiEndpoint as hmrcVatReturnPostApiEndpoint } from "../functions/hmrc/hmrcVatReturnPost.js";
import { apiEndpoint as hmrcVatObligationGetApiEndpoint } from "../functions/hmrc/hmrcVatObligationGet.js";
import { apiEndpoint as hmrcVatReturnGetApiEndpoint } from "../functions/hmrc/hmrcVatReturnGet.js";
import { apiEndpoint as hmrcReceiptPostApiEndpoint } from "../functions/hmrc/hmrcReceiptPost.js";
import { apiEndpoint as hmrcReceiptGetApiEndpoint } from "../functions/hmrc/hmrcReceiptGet.js";
import { apiEndpoint as mockAuthUrlGetApiEndpoint } from "../functions/non-lambda-mocks/mockAuthUrlGet.js";
import { apiEndpoint as mockTokenPostApiEndpoint } from "../functions/non-lambda-mocks/mockTokenPost.js";
import { dotenvConfigIfNotBlank, validateEnv } from "../lib/env.js";
import logger from "../lib/logger.js";
import { securityHeadersMiddleware } from "../lib/securityHeaders.js";

dotenvConfigIfNotBlank({ path: ".env" });
dotenvConfigIfNotBlank({ path: ".env.test" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Disable Express fingerprinting header
app.disable("x-powered-by");

// parse bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Security headers middleware (applies to all responses)
app.use(securityHeadersMiddleware);

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
bundleGetApiEndpoint(app);
bundlePostApiEndpoint(app);
bundleDeleteApiEndpoint(app);
mockAuthUrlGetApiEndpoint(app);
mockTokenPostApiEndpoint(app);
hmrcAuthUrlGetApiEndpoint(app);
hmrcTokenPostApiEndpoint(app);
hmrcVatReturnPostApiEndpoint(app);
hmrcVatObligationGetApiEndpoint(app);
hmrcVatReturnGetApiEndpoint(app);
hmrcReceiptPostApiEndpoint(app);
hmrcReceiptGetApiEndpoint(app);

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
  const strict = process.env.STRICT_ENV_VALIDATION === "true";
  try {
    if (strict) {
      validateEnv([
        "DIY_SUBMIT_BASE_URL",
        "COGNITO_CLIENT_ID",
        "COGNITO_BASE_URI",
        "HMRC_BASE_URI",
        "HMRC_CLIENT_ID",
        "HMRC_CLIENT_SECRET_ARN",
        "DIY_SUBMIT_RECEIPTS_BUCKET_NAME",
      ]);
    } else {
      // In local/dev and behaviour tests, validate only essential vars
      validateEnv(["DIY_SUBMIT_BASE_URL", "HMRC_BASE_URI"]);
    }
  } catch (e) {
    if (strict) {
      throw e;
    } else {
      console.warn(`Non-strict env validation warning: ${e}`);
      logger.warn(`Non-strict env validation warning: ${e}`);
    }
  }
  app.listen(TEST_SERVER_HTTP_PORT, () => {
    const message = `Listening at http://127.0.0.1:${TEST_SERVER_HTTP_PORT}`;
    console.log(message);
    logger.info(message);
  });
}
