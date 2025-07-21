// src/lib/server.js
import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { authUrlHandler, exchangeTokenHandler, submitVatHandler, logReceiptHandler } from "./main.js";
import logger from "./logger.js";
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// parse JSON bodies
app.use(express.json());

// HTTP access logging middleware
app.use((req, res, next) => {
  logger.info(`HTTP ${req.method} ${req.url}`);
  next();
});

// 1) serve static site exactly like `http-server public/`
app.use(express.static(path.join(__dirname, "../../public")));

// 2) wire your Lambdas under /api
app.get("/api/auth-url", async (req, res) => {
  const event = { queryStringParameters: { state: req.query.state } };
  const { statusCode, body } = await authUrlHandler(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post("/api/exchange-token", async (req, res) => {
  const event = { body: JSON.stringify(req.body) };
  const { statusCode, body } = await exchangeTokenHandler(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post("/api/submit-vat", async (req, res) => {
  const event = { body: JSON.stringify(req.body) };
  const { statusCode, body } = await submitVatHandler(event);
  res.status(statusCode).json(JSON.parse(body));
});

app.post("/api/log-receipt", async (req, res) => {
  const event = { body: JSON.stringify(req.body) };
  const { statusCode, body } = await logReceiptHandler(event);
  res.status(statusCode).json(JSON.parse(body));
});

// fallback to index.html for SPA routing (if needed)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const TEST_SERVER_HTTP_PORT = process.env.TEST_SERVER_HTTP_PORT || 3000;

// Only start the server if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(TEST_SERVER_HTTP_PORT, () => {
    const hmrcBase = process.env.HMRC_BASE_URI || "HMRC_BASE_URI not set";
    console.log(`Listening at http://127.0.0.1:${TEST_SERVER_HTTP_PORT} for ${hmrcBase}`);
    logger.info(`Logging to console`);
  });
}
