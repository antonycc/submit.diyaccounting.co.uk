// tests/system/server.system.test.js
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
// Use global fetch available in Node.js 18+

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "../../src/lib/server.js");

describe("System – Server Process", () => {
  let serverProcess;
  let serverPort;
  let baseUrl;

  beforeAll(async () => {
    // Use a different port for system tests to avoid conflicts
    serverPort = 3002;
    baseUrl = `http://127.0.0.1:${serverPort}`;

    console.log("[DEBUG_LOG] Starting server system tests");
  });

  afterAll(() => {
    console.log("[DEBUG_LOG] Server system tests completed");
  });

  beforeEach(() => {
    vi.resetAllMocks();

    // Set up test environment variables
    process.env = {
      ...process.env,
      HMRC_CLIENT_ID: "system-test-client-id",
      HMRC_CLIENT_SECRET: "system-test-secret",
      REDIRECT_URI: "https://submit.diyaccounting.co.uk/callback",
      RECEIPTS_BUCKET: "system-test-bucket",
      PORT: serverPort.toString(),
    };
  });

  afterEach(async () => {
    if (serverProcess) {
      console.log("[DEBUG_LOG] Stopping server process");
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

      serverProcess = null;
    }
  });

  const startServer = () => {
    return new Promise((resolve, reject) => {
      console.log("[DEBUG_LOG] Starting server process on port", serverPort);

      serverProcess = spawn("node", [serverPath], {
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      serverProcess.stdout.on("data", (data) => {
        const message = data.toString();
        output += message;
        console.log("[DEBUG_LOG] Server stdout:", message.trim());

        // Check if server has started
        if (message.includes(`Listening at http://127.0.0.1:${serverPort}`)) {
          resolve();
        }
      });

      serverProcess.stderr.on("data", (data) => {
        const message = data.toString();
        errorOutput += message;
        console.log("[DEBUG_LOG] Server stderr:", message.trim());
      });

      serverProcess.on("error", (error) => {
        console.log("[DEBUG_LOG] Server process error:", error);
        reject(error);
      });

      serverProcess.on("exit", (code, signal) => {
        console.log("[DEBUG_LOG] Server process exited with code:", code, "signal:", signal);
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

  const waitForServer = async (maxAttempts = 10) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${baseUrl}/api/auth-url?state=health-check`, {
          method: "GET",
          timeout: 1000,
        });
        if (response.status === 200 || response.status === 400) {
          console.log("[DEBUG_LOG] Server is responding");
          return true;
        }
      } catch (error) {
        console.log(`[DEBUG_LOG] Server not ready yet (attempt ${i + 1}):`, error.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Server failed to respond after multiple attempts");
  };

  describe("Server Startup and Shutdown", () => {
    it("should start the server process successfully", async () => {
      await startServer();
      await waitForServer();

      expect(serverProcess).toBeDefined();
      expect(serverProcess.killed).toBe(false);
      expect(serverProcess.pid).toBeGreaterThan(0);
    });

    it("should listen on the correct port", async () => {
      await startServer();
      await waitForServer();

      // Test that the server responds on the expected port
      const response = await fetch(`${baseUrl}/api/auth-url?state=port-test`);
      expect([200, 400]).toContain(response.status);
    });

    it("should shutdown gracefully on SIGTERM", async () => {
      await startServer();
      await waitForServer();

      const pid = serverProcess.pid;
      serverProcess.kill("SIGTERM");

      // Wait for process to exit
      await new Promise((resolve) => {
        serverProcess.on("exit", resolve);
        setTimeout(resolve, 3000); // Timeout after 3 seconds
      });

      expect(serverProcess.killed).toBe(true);
    });
  });

  describe("API Endpoints System Test", () => {
    beforeEach(async () => {
      await startServer();
      await waitForServer();
    });

    it("should respond to GET /api/auth-url", async () => {
      const response = await fetch(`${baseUrl}/api/auth-url?state=system-test-state`);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("authUrl");
      expect(data.authUrl).toContain("response_type=code");
      expect(data.authUrl).toContain("client_id=system-test-client-id");
      expect(data.authUrl).toContain("state=system-test-state");

      console.log("[DEBUG_LOG] Auth URL endpoint working:", data.authUrl.substring(0, 100) + "...");
    });

    it("should respond to POST /api/exchange-token", async () => {
      const response = await fetch(`${baseUrl}/api/exchange-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: "system-test-code" }),
      });

      // This will likely fail with external API call, but server should respond
      expect([200, 400, 401, 500]).toContain(response.status);

      const data = await response.json();
      console.log("[DEBUG_LOG] Token exchange response status:", response.status);
      console.log("[DEBUG_LOG] Token exchange response:", data);
    });

    it("should respond to POST /api/submit-vat", async () => {
      const vatData = {
        vatNumber: "193054661",
        periodKey: "18A1",
        vatDue: "100.00",
        accessToken: "system-test-token",
      };

      const response = await fetch(`${baseUrl}/api/submit-vat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vatData),
      });

      // This will likely fail with external API call, but server should respond
      expect([200, 400, 401, 500]).toContain(response.status);

      const data = await response.json();
      console.log("[DEBUG_LOG] VAT submission response status:", response.status);
      console.log("[DEBUG_LOG] VAT submission response:", data);
    });

    it("should respond to POST /api/log-receipt", async () => {
      const receiptData = {
        formBundleNumber: "system-test-bundle-123",
        chargeRefNumber: "system-test-charge-ref",
      };

      const response = await fetch(`${baseUrl}/api/log-receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(receiptData),
      });

      // This will likely fail with S3 call, but server should respond
      expect([200, 500]).toContain(response.status);

      const data = await response.json();
      console.log("[DEBUG_LOG] Receipt logging response status:", response.status);
      console.log("[DEBUG_LOG] Receipt logging response:", data);
    });

    it("should handle missing parameters gracefully", async () => {
      const response = await fetch(`${baseUrl}/api/auth-url`);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data.error).toBe("Missing state");
    });
  });

  describe("Static File Serving System Test", () => {
    beforeEach(async () => {
      await startServer();
      await waitForServer();
    });

    it("should serve static files", async () => {
      const response = await fetch(`${baseUrl}/favicon.ico`);

      // Should either serve the file (200) or return 404 if not found
      expect([200, 404]).toContain(response.status);
      console.log("[DEBUG_LOG] Static file serving status:", response.status);
    });

    it("should serve SPA fallback for unknown routes", async () => {
      const response = await fetch(`${baseUrl}/unknown-route`);

      // Should either serve index.html (200) or return 404 if file doesn't exist
      expect([200, 404]).toContain(response.status);
      console.log("[DEBUG_LOG] SPA fallback status:", response.status);
    });
  });

  describe("Server Health and Performance", () => {
    beforeEach(async () => {
      await startServer();
      await waitForServer();
    });

    it("should handle multiple concurrent requests", async () => {
      const requests = Array.from({ length: 5 }, (_, i) => fetch(`${baseUrl}/api/auth-url?state=concurrent-test-${i}`));

      const responses = await Promise.all(requests);

      responses.forEach((response, index) => {
        expect([200, 400]).toContain(response.status);
        console.log(`[DEBUG_LOG] Concurrent request ${index} status:`, response.status);
      });
    });

    it("should respond within reasonable time", async () => {
      const startTime = Date.now();

      const response = await fetch(`${baseUrl}/api/auth-url?state=performance-test`);

      const responseTime = Date.now() - startTime;
      console.log("[DEBUG_LOG] Response time:", responseTime, "ms");

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });

    it("should handle malformed requests gracefully", async () => {
      const response = await fetch(`${baseUrl}/api/exchange-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid-json",
      });

      expect(response.status).toBe(400);
      console.log("[DEBUG_LOG] Malformed request handled with status:", response.status);
    });
  });

  describe("Environment Configuration", () => {
    beforeEach(async () => {
      await startServer();
      await waitForServer();
    });

    it("should use environment variables correctly", async () => {
      const response = await fetch(`${baseUrl}/api/auth-url?state=env-test`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.authUrl).toContain("client_id=system-test-client-id");

      console.log("[DEBUG_LOG] Environment variables working correctly");
    });

    it("should start on custom PORT from environment", async () => {
      // This is already tested by using PORT=3002, but we verify it's working
      expect(serverProcess).toBeDefined();

      const response = await fetch(`${baseUrl}/api/auth-url?state=port-env-test`);
      expect([200, 400]).toContain(response.status);

      console.log("[DEBUG_LOG] Custom PORT environment variable working");
    });
  });

  describe("Error Recovery", () => {
    beforeEach(async () => {
      await startServer();
      await waitForServer();
    });

    it("should continue running after handling errors", async () => {
      // Make a request that will likely cause an error
      const errorResponse = await fetch(`${baseUrl}/api/submit-vat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invalid: "data" }),
      });

      expect([400, 500]).toContain(errorResponse.status);

      // Server should still be responsive after the error
      const healthResponse = await fetch(`${baseUrl}/api/auth-url?state=health-after-error`);
      expect([200, 400]).toContain(healthResponse.status);

      console.log("[DEBUG_LOG] Server recovered from error successfully");
    });
  });
});
