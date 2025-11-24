// behaviour-tests/helpers/behaviour-helpers.js
import { ensureMinioBucketExists, startMinio } from "@app/bin/minio.js";
import { startDynamoDB, ensureBundleTableExists, ensureHmrcApiRequestsTableExists } from "@app/bin/dynamodb.js";
import { spawn } from "child_process";
import { checkIfServerIsRunning } from "./serverHelper.js";
import { test } from "@playwright/test";
import { gotoWithRetries } from "./gotoWithRetries.js";

import logger from "@app/lib/logger.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-helpers";

export function getEnvVarAndLog(name, envKey, defaultValue) {
  let value;
  if (process.env[envKey] && process.env[envKey].trim() !== "") {
    value = process.env[envKey];
  } else {
    value = defaultValue;
  }
  logger.info(`${name}: ${value}`);
  return value;
}

/**
 * Determine if we're running against HMRC sandbox or production API
 * based on the HMRC_BASE_URI environment variable
 * @returns {boolean} true if using sandbox, false otherwise
 */
export function isSandboxMode() {
  // Prefer explicit HMRC_ACCOUNT when provided
  const hmrcAccount = (process.env.HMRC_ACCOUNT || "").toLowerCase();
  if (hmrcAccount === "sandbox") {
    logger.info(`Sandbox mode detection: HMRC_ACCOUNT=${hmrcAccount} => sandbox=true`);
    return true;
  } else {
    logger.info(`Sandbox mode detection: HMRC_ACCOUNT=${hmrcAccount} => sandbox=false`);
    return false;
  }
}

export async function runLocalS3(runMinioS3, receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey) {
  logger.info(
    `[minio]: runMinioS3=${runMinioS3}, receiptsBucketName=${receiptsBucketName}, optionalTestS3AccessKey=${optionalTestS3AccessKey}`,
  );
  let endpoint;
  if (runMinioS3 === "run") {
    logger.info("[minio]: Starting minio process...");
    endpoint = await startMinio(receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey);
    logger.info("[minio]: Waiting for server to initialize...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await ensureMinioBucketExists(receiptsBucketName, endpoint, optionalTestS3AccessKey, optionalTestS3SecretKey);
  } else {
    logger.info("[minio]: Skipping Minio container creation because TEST_MINIO_S3 is not set to 'run'");
  }
  return endpoint;
}

export async function runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName) {
  logger.info(
    `[dynamodb]: runDynamoDb=${runDynamoDb}, bundleTableName=${bundleTableName}, hmrcApiRequestsTableName=${hmrcApiRequestsTableName}`,
  );
  let stop;
  let endpoint;
  if (runDynamoDb === "run") {
    logger.info("[dynamodb]: Starting dynalite (local DynamoDB) server...");
    const started = await startDynamoDB();
    stop = started.stop;
    endpoint = started.endpoint;
    logger.info(`[dynamodb]: Started at ${endpoint}`);

    // Ensure AWS SDK v3 will talk to local endpoint
    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;

    // Ensure table names are set in env, with sensible defaults for behaviour tests
    const bundlesTable = bundleTableName || process.env.BUNDLE_DYNAMODB_TABLE_NAME || "behaviour-bundles";
    const hmrcReqsTable =
      hmrcApiRequestsTableName || process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME || "behaviour-hmrc-requests";

    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundlesTable;
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = hmrcReqsTable;

    // Create tables
    await ensureBundleTableExists(bundlesTable, endpoint);
    await ensureHmrcApiRequestsTableExists(hmrcReqsTable, endpoint);
  } else {
    logger.info("[dynamodb]: Skipping local DynamoDB because TEST_DYNAMODB is not set to 'run'");
  }
  return { stop, endpoint };
}

export async function runLocalHttpServer(runTestServer, s3Endpoint, httpServerPort) {
  logger.info(`[minio]: runTestServer=${runTestServer}, s3Endpoint=${s3Endpoint}, httpServerPort=${httpServerPort}`);
  let serverProcess;
  if (runTestServer === "run") {
    logger.info("[http]: Starting server process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    serverProcess = spawn("npm", ["run", "server"], {
      env: {
        ...process.env,
        TEST_S3_ENDPOINT: s3Endpoint,
        TEST_SERVER_HTTP_PORT: httpServerPort.toString(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning(`http://127.0.0.1:${httpServerPort}`, 1000, undefined, "http");
  } else {
    logger.info("[http]: Skipping server process as runTestServer is not set to 'run'");
  }
  return serverProcess;
}

export async function runLocalSslProxy(runProxy, httpServerPort, baseUrl) {
  logger.info(`[proxy]: runProxy=${runProxy}, httpServerPort=${httpServerPort}, baseUrl=${baseUrl}`);
  let ngrokProcess;
  if (runProxy === "run") {
    logger.info("[proxy]: Starting ngrok process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    ngrokProcess = spawn("npm", ["run", "proxy", httpServerPort.toString()], {
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning(baseUrl, 1000, undefined, "proxy");
  } else {
    logger.info("[proxy]: Skipping ngrok process as runProxy is not set to 'run'");
  }
  return ngrokProcess;
}

export async function runLocalOAuth2Server(runMockOAuth2) {
  logger.info(`[auth]: runMockOAuth2=${runMockOAuth2}`);
  let serverProcess;
  if (runMockOAuth2 === "run") {
    logger.info("[auth]: Starting mock-oauth2-server process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    serverProcess = spawn("npm", ["run", "auth"], {
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning("http://localhost:8080/default/debugger", 2000, undefined, "auth");
  } else {
    logger.info("[auth]: Skipping mock-oauth2-server process as runMockOAuth2 is not set to 'run'");
  }
  return serverProcess;
}

export function addOnPageLogging(page) {
  page.on("console", (msg) => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]: ${msg.text()}`);
  });

  page.on("pageerror", (error) => {
    console.log(`[BROWSER ERROR]: ${error.message}`);
  });

  // Add comprehensive HTTP request/response logging
  page.on("request", (request) => {
    console.log(`[HTTP REQUEST] ${request.method()} ${request.url()}`);
    console.log(`[HTTP REQUEST HEADERS] ${JSON.stringify(request.headers(), null, 2)}`);
    if (request.postData()) {
      console.log(`[HTTP REQUEST BODY] ${request.postData()}`);
    }
  });

  page.on("response", (response) => {
    console.log(`[HTTP RESPONSE] ${response.status()} ${response.url()}`);
    console.log(`[HTTP RESPONSE HEADERS] ${JSON.stringify(response.headers(), null, 2)}`);
  });

  // Add request failure logging
  page.on("requestfailed", (request) => {
    console.log(`[HTTP REQUEST FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
  });
}

// Create helper functions for logging user interactions (narrative steps)
export const loggedClick = async (page, selector, description = "") =>
  await test.step(description ? `The user clicks ${description}` : `The user clicks selector ${selector}`, async () => {
    console.log(`[USER INTERACTION] Clicking: ${selector} ${description ? "- " + description : ""}`);
    // Wait for element to be visible and stable before clicking
    await page.waitForSelector(selector, { state: "visible", timeout: 30000 });
    await page.click(selector);
  });

export const loggedFill = async (page, selector, value, description = "") =>
  await test.step(
    description ? `The user fills ${description} with "${value}"` : `The user fills selector ${selector} with "${value}"`,
    async () => {
      console.log(`[USER INTERACTION] Filling: ${selector} with value: "${value}" ${description ? "- " + description : ""}`);
      await page.fill(selector, value);
    },
  );

export const loggedGoto = async (page, url, description = "", screenshotPath = defaultScreenshotPath) =>
  await test.step(description ? `The user navigates to ${description}` : `The user navigates to ${url}`, async () => {
    await gotoWithRetries(
      page,
      url,
      {
        description,
        waitUntil: "domcontentloaded",
        readySelector: "#dynamicActivities",
      },
      screenshotPath,
    );
  });

// Generate timestamp for file naming
export function timestamp() {
  const now = new Date();
  const iso = now.toISOString(); // e.g. 2025-11-08T12:34:56.789Z
  const datePart = iso.slice(0, 10); // YYYY-MM-DD
  const timePart = iso.slice(11, 19); // HH:MM:SS
  const [hour, minute, second] = timePart.split(":");
  const nanos = (process.hrtime.bigint() % 1000000000n).toString().padStart(9, "0");
  return `${datePart}_${hour}-${minute}-${second}-${nanos}`;
}
