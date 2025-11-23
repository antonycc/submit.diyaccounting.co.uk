// behaviour-tests/helpers/behaviour-helpers.js
import { ensureMinioBucketExists, startMinio } from "@app/bin/minio.js";
import { spawn } from "child_process";
import { checkIfServerIsRunning } from "./serverHelper.js";
import { test } from "@playwright/test";
import { gotoWithRetries } from "./gotoWithRetries.js";

import logger from "@app/lib/logger.js";
import { execSync } from "child_process";

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

// Start local DynamoDB using a single strategy (Testcontainers) and ensure tables exist
export async function runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName) {
  logger.info(
    `[dynamodb]: runDynamoDb=${runDynamoDb}, bundleTableName=${bundleTableName}, hmrcApiRequestsTableName=${hmrcApiRequestsTableName}`,
  );

  let container;
  let endpoint;

  // Helper: wait for DynamoDB endpoint to be responsive by calling ListTables
  async function waitForDynamoReady(testEndpoint, label = "dynamodb", attempts = 30, delay = 500) {
    const { DynamoDBClient, ListTablesCommand } = await import("@aws-sdk/client-dynamodb");
    const client = new DynamoDBClient({
      endpoint: testEndpoint,
      region: "us-east-1",
      credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" },
    });
    for (let i = 1; i <= attempts; i++) {
      try {
        await client.send(new ListTablesCommand({ Limit: 1 }));
        logger.info(`[${label}]: Endpoint is responsive at ${testEndpoint}`);
        return true;
      } catch (e) {
        logger.warn(`[${label}]: Readiness check ${i}/${attempts} failed: ${e?.message || e}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return false;
  }

  // Helper: ensure tables with retries
  async function ensureTablesWithRetries(ensureFn, label, attempts = 30, delay = 500) {
    for (let i = 1; i <= attempts; i++) {
      try {
        await ensureFn();
        return;
      } catch (e) {
        logger.warn(`[${label}]: Ensure attempt ${i}/${attempts} failed: ${e?.message || e}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error(`[${label}]: Failed to ensure required DynamoDB tables after ${attempts} attempts`);
  }

  if (runDynamoDb === "run") {
    // Always use Testcontainers for local DynamoDB; do not use alternative strategies
    const dynamodbBin = await import("@app/bin/dynamodb.js");
    const started = await dynamodbBin.startDynamoDB();
    endpoint = started.endpoint;
    container = started.container;
    logger.info(`[dynamodb]: Started Testcontainers DynamoDB at ${endpoint}`);

    // Wait for endpoint to be ready
    const ready = await waitForDynamoReady(endpoint, "dynamodb");
    if (!ready) {
      throw new Error(`[dynamodb]: Endpoint never became ready at ${endpoint}`);
    }

    // Ensure expected tables exist (with retries)
    await ensureTablesWithRetries(async () => {
      if (bundleTableName) {
        await dynamodbBin.ensureBundleTableExists(bundleTableName, endpoint);
      }
      if (hmrcApiRequestsTableName) {
        await dynamodbBin.ensureHmrcApiRequestsTableExists(hmrcApiRequestsTableName, endpoint);
      }
    }, "dynamodb-ensure");

    // Propagate endpoint so app code uses local DynamoDB
    process.env.TEST_DYNAMODB_ENDPOINT = endpoint;
    process.env.TEST_DYNAMODB_ACCESS_KEY = process.env.TEST_DYNAMODB_ACCESS_KEY || "dummy";
    process.env.TEST_DYNAMODB_SECRET_KEY = process.env.TEST_DYNAMODB_SECRET_KEY || "dummy";
  } else {
    logger.info("[dynamodb]: Skipping DynamoDB Local as TEST_DYNAMODB is not set to 'run'");
  }

  return { container, endpoint, stop: async () => (container ? container.stop() : undefined) };
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
        // Ensure DynamoDB endpoint discovered by runLocalDynamoDb wins over file-based .env
        TEST_DYNAMODB_ENDPOINT: process.env.TEST_DYNAMODB_ENDPOINT,
        TEST_DYNAMODB_ACCESS_KEY: process.env.TEST_DYNAMODB_ACCESS_KEY,
        TEST_DYNAMODB_SECRET_KEY: process.env.TEST_DYNAMODB_SECRET_KEY,
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
    // Helper: attempt to start Docker-based server
    const tryStartDockerAuth = () => {
      try {
        // Verify Docker exists; throws if not
        execSync("docker --version", { stdio: "ignore" });
        logger.info("[auth]: Starting mock-oauth2-server process via Docker...");
        // eslint-disable-next-line sonarjs/no-os-command-from-path
        serverProcess = spawn("npm", ["run", "auth"], {
          env: {
            ...process.env,
          },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (e) {
        logger.warn(`[auth]: Docker not available or failed to start: ${e?.message || e}`);
      }
    };

    // Fallback: start an in-process lightweight mock OAuth2 server compatible with our tests
    let inProcessServer;
    const startInProcessMockOAuth2 = async () => {
      if (inProcessServer) return; // already started
      logger.info("[auth]: Starting in-process mock OAuth2 server on http://localhost:8080 ...");
      const express = (await import("express")).default;
      const app = express();
      app.use(express.urlencoded({ extended: true }));
      app.use(express.json());

      // Simple readiness/debug endpoint
      app.get("/default/debugger", (_req, res) => {
        res.status(200).send("<html><body><h1>Mock OAuth2 Debugger</h1></body></html>");
      });

      // Memory to store claims by auth code for token exchange
      const codeStore = new Map();

      // Authorization endpoint: show simple login form
      app.get("/oauth/authorize", (req, res) => {
        const { redirect_uri = "", state = "" } = req.query || {};
        const html = `<!doctype html>
          <html><head><meta charset="utf-8"><title>Mock OAuth2 Login</title></head>
          <body>
            <h1>Mock OAuth2 Login</h1>
            <form method="post" action="/oauth/authorize">
              <input type="hidden" name="redirect_uri" value="${String(redirect_uri)}"/>
              <input type="hidden" name="state" value="${String(state)}"/>
              <label>Username <input class="u-full-width" required type="text" name="username" placeholder="Enter any user/subject" autofocus="on" /></label>
              <br/>
              <label>Claims JSON<br/>
                <textarea class="u-full-width claims" name="claims" rows="15" placeholder="Optional claims JSON" autofocus="on"></textarea>
              </label>
              <br/>
              <input class="button-primary" type="submit" value="Sign-in" />
            </form>
          </body></html>`;
        res.status(200).set("content-type", "text/html").send(html);
      });

      // Handle form submission -> redirect back to app with code & state
      app.post("/oauth/authorize", (req, res) => {
        const { redirect_uri = "", state = "", username = "user", claims = "{}" } = req.body || {};
        let claimsObj = {};
        try {
          claimsObj = claims ? JSON.parse(claims) : {};
        } catch (_) {
          claimsObj = {};
        }
        const code = `mock-${Date.now()}`;
        codeStore.set(code, { username, claims: claimsObj });
        const url = new URL(String(redirect_uri));
        url.searchParams.set("code", code);
        if (state) url.searchParams.set("state", String(state));
        res.redirect(302, url.toString());
      });

      // Token exchange endpoint
      app.post("/default/token", (req, res) => {
        const { code = "" } = req.body || {};
        const entry = codeStore.get(String(code)) || { username: "user", claims: {} };
        const baseClaims = {
          sub: entry.username || "user",
          email: entry.claims?.email || `${entry.username || "user"}@example.com`,
          ...entry.claims,
        };
        // Not a real JWT; sufficient for tests that don't verify signature
        const idToken = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") + "." +
          Buffer.from(JSON.stringify(baseClaims)).toString("base64url") + ".";
        res.status(200).json({
          access_token: "mock-access-token",
          token_type: "bearer",
          expires_in: 3600,
          scope: "openid somescope",
          id_token: idToken,
        });
      });

      await new Promise((resolve, reject) => {
        try {
          inProcessServer = app.listen(8080, "127.0.0.1", () => {
            logger.info("[auth]: In-process mock OAuth2 server is listening on 127.0.0.1:8080");
            resolve();
          });
          inProcessServer.on("error", (e) => {
            logger.error(`[auth]: In-process mock OAuth2 server failed to start: ${e?.message || e}`);
            reject(e);
          });
        } catch (e) {
          reject(e);
        }
      });
      // Slight delay to ensure listener fully ready
      await new Promise((r) => setTimeout(r, 50));

      // Return a kill-compatible handle for afterAll cleanup
      serverProcess = {
        kill: () => {
          try {
            inProcessServer?.close();
          } catch (_) {}
        },
      };
    };

    // First attempt docker, but provide fallback runServer to spawn in-process if readiness check fails
    tryStartDockerAuth();
    await checkIfServerIsRunning("http://127.0.0.1:8080/default/debugger", 500, startInProcessMockOAuth2, "auth");
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
