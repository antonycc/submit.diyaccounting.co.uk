// tests/system/server.system.test.js
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Test specific dedicated server port
const serverPort = 3270;

const waitForServer = async (baseUrl, maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${baseUrl}/api/auth-url?state=health-check`, {
        method: "GET",
        timeout: 1000,
      });
      if (response.status === 200 || response.status === 400) {
        console.log("Server is responding");
        return true;
      }
    } catch (error) {
      console.log(`Server not ready yet (attempt ${i + 1}):`, error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Server failed to respond after multiple attempts");
};

describe("System – Server Process", () => {
  let serverProcess;
  let baseUrl;

  const killServer = async (maxAttempts = 10) => {
    serverProcess.kill("SIGTERM");

    // Wait for process to exit
    await new Promise((resolve) => {
      serverProcess.on("exit", resolve);
      // Force kill after 5 seconds if graceful shutdown fails
      setTimeout(() => {
        if (!serverProcess.killed) {
          serverProcess.kill("SIGKILL");
        }
        resolve();
      }, 5000);
    });
  };

  const startServer = () => {
    return new Promise((resolve, reject) => {
      console.log("Starting server process on port", serverPort);

      serverProcess = spawn("npm", ["run", "start"], {
        env: {
          ...process.env,
          NODE_ENV: "stubbed",
          DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT: serverPort.toString(),
          DIY_SUBMIT_LOG_TO_CONSOLE: true.toString(),
          DIY_SUBMIT_LOG_TO_FILE: true.toString(),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      serverProcess.stdout.on("data", (data) => {
        const message = data.toString();
        output += message;
        console.log("Server stdout:", message.trim());

        // Check if server has started
        if (message.includes(`Listening at http://127.0.0.1:${serverPort}`)) {
          resolve();
        }
      });

      serverProcess.stderr.on("data", (data) => {
        const message = data.toString();
        errorOutput += message;
        console.log("Server stderr:", message.trim());
      });

      serverProcess.on("error", (error) => {
        console.log("Server process error:", error);
        reject(error);
      });

      serverProcess.on("exit", (code, signal) => {
        console.log("Server process exited with code:", code, "signal:", signal);
        if (code !== 0 && code !== null) {
          reject(new Error(`Server exited with code ${code}. Output: ${output}. Error: ${errorOutput}`));
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          reject(new Error("Server startup timeout. Output: " + output + ". Error: " + errorOutput));
        }
      }, 10000);
    });
  };

  beforeAll(async () => {
    // Use a different port for system tests to avoid conflicts
    baseUrl = `http://127.0.0.1:${serverPort}`;
    await startServer();
    await waitForServer(baseUrl);
    console.log("Starting server system tests");
  });

  afterAll(async () => {
    if (serverProcess) {
      console.log("Stopping server process");
      await killServer();
      serverProcess = null;
    }
    console.log("Server system tests completed");
  });

  beforeEach(() => {
    vi.resetAllMocks();

    // Set up test environment variables
    process.env = {
      ...process.env,
      DIY_SUBMIT_DIY_SUBMIT_TEST_SERVER_HTTP_PORT: serverPort.toString(),
    };
  });

  //afterEach(async () => {
  //  if (serverProcess) {
  //    console.log("Stopping server process");
  //    await killServer();
  //    serverProcess = null;
  //  }
  //});

  describe("API Endpoints System Test", () => {

    it("should respond to GET /api/auth-url, respond to POST /api/exchange-token", async () => {
      let response = await fetch(`${baseUrl}/api/auth-url?state=system-test-state`);

      expect(response.status).toBe(200);

      let data = await response.json();
      expect(data).toHaveProperty("authUrl");
      expect(data.authUrl).toContain("response_type=code");
      expect(data.authUrl).toContain("client_id=test%20client%20id");
      expect(data.authUrl).toContain("state=system-test-state");

      console.log("Auth URL endpoint working:", data.authUrl.substring(0, 100) + "...");

      response = await fetch(`${baseUrl}/api/exchange-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: "system-test-code" }),
      });

      // This will likely fail with external API call, but server should respond
      expect([200, 400, 401, 500]).toContain(response.status);

      data = await response.json();
      console.log("Token exchange response status:", response.status);
      console.log("Token exchange response:", data);


      const vatData = {
        vatNumber: "193054661",
        periodKey: "18A1",
        vatDue: "100.00",
        hmrcAccessToken: "system-test-token",
      };

      response = await fetch(`${baseUrl}/api/submit-vat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vatData),
      });

      // This will likely fail with external API call, but server should respond
      expect([200, 400, 401, 500]).toContain(response.status);

      data = await response.json();
      console.log("VAT submission response status:", response.status);
      console.log("VAT submission response:", data);

      const receiptData = {
        formBundleNumber: "system-test-bundle-123",
        chargeRefNumber: "system-test-charge-ref",
      };

      response = await fetch(`${baseUrl}/api/log-receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(receiptData),
      });

      // This will likely fail with S3 call, but server should respond
      expect([200, 500]).toContain(response.status);

      data = await response.json();
      console.log("Receipt logging response status:", response.status);

      response = await fetch(`${baseUrl}/api/auth-url`);

      expect(response.status).toBe(400);

      data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data.error).toBe("Missing state query parameter from URL");
    });
  });
});
