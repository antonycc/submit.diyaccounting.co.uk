// behaviour-tests/behaviour-helpers.js
import { ensureMinioBucketExists, startMinio } from "@app/bin/minio.js";
import { spawn } from "child_process";
import { checkIfServerIsRunning } from "./serverHelper.js";
import { test } from "@playwright/test";
import { gotoWithRetries } from "./gotoWithRetries.js";

export function getEnvVarAndLog(name, envKey, defaultValue) {
  let value;
  if (process.env[envKey] && process.env[envKey].trim() !== "") {
    value = process.env[envKey];
  } else {
    value = defaultValue;
  }
  console.log(`${name}: ${value}`);
  return value;
}

export async function runLocalS3(runMinioS3, receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey) {
  let endpoint;
  if (runMinioS3 === "run") {
    console.log("Starting minio process...");
    endpoint = await startMinio(receiptsBucketName, optionalTestS3AccessKey, optionalTestS3SecretKey);
    console.log("Waiting for server to initialize...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await ensureMinioBucketExists(receiptsBucketName, endpoint, optionalTestS3AccessKey, optionalTestS3SecretKey);
  } else {
    console.log("Skipping Minio container creation because TEST_MINIO_S3 is not set to 'run'");
  }
  return endpoint;
}

export async function runLocalHttpServer(runTestServer, s3Endpoint, httpServerPort) {
  let serverProcess;
  if (runTestServer === "run") {
    console.log("Starting server process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    serverProcess = spawn("npm", ["run", "start"], {
      env: {
        ...process.env,
        TEST_S3_ENDPOINT: s3Endpoint,
        TEST_SERVER_HTTP_PORT: httpServerPort.toString(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning(`http://127.0.0.1:${httpServerPort}`, 1000, undefined, "http");
  } else {
    console.log("Skipping server process as runTestServer is not set to 'run'");
  }
  return serverProcess;
}

export async function runLocalSslProxy(runProxy, httpServerPort, baseUrl) {
  let ngrokProcess;
  if (runProxy === "run") {
    console.log("Starting ngrok process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    ngrokProcess = spawn("npm", ["run", "proxy", httpServerPort.toString()], {
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning(baseUrl, 1000, undefined, "proxy");
  } else {
    console.log("Skipping ngrok process as runProxy is not set to 'run'");
  }
  return ngrokProcess;
}

export async function runLocalOAuth2Server(runMockOAuth2) {
  let serverProcess;
  if (runMockOAuth2 === "run") {
    console.log("Starting mock-oauth2-server process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    serverProcess = spawn("npm", ["run", "auth"], {
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning("http://localhost:8080/default/debugger", 2000, undefined, "auth");
  } else {
    console.log("Skipping mock-oauth2-server process as runMockOAuth2 is not set to 'run'");
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

export const loggedGoto = async (page, url, description = "") =>
  await test.step(description ? `The user navigates to ${description}` : `The user navigates to ${url}`, async () => {
    await gotoWithRetries(page, url, {
      description,
      waitUntil: "domcontentloaded",
      readySelector: "#dynamicActivities",
    });
  });

// Generate timestamp for file naming
export function timestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}
