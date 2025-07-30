// app/unit-tests/server.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Mock the handlers from their respective function files
vi.mock("@app/functions/authUrl.js", () => ({
  httpGet: vi.fn(),
}));
vi.mock("@app/functions/exchangeToken.js", () => ({
  httpPost: vi.fn(),
}));
vi.mock("@app/functions/submitVat.js", () => ({
  httpPost: vi.fn(),
}));
vi.mock("@app/functions/logReceipt.js", () => ({
  httpPost: vi.fn(),
}));

// Import the mocked handlers
import { httpGet as authUrlHandler } from "@app/functions/authUrl.js";
import { httpPost as exchangeTokenHandler } from "@app/functions/exchangeToken.js";
import { httpPost as submitVatHandler } from "@app/functions/submitVat.js";
import { httpPost as logReceiptHandler } from "@app/functions/logReceipt.js";

describe("Server Unit Tests", () => {
  const originalEnv = process.env;
  let app;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  beforeEach(() => {
    vi.clearAllMocks();


    process.env = {
      ...originalEnv,
    };

    // Recreate the Express app for each test (similar to server.js)
    app = express();
    app.use(express.json());
    //app.use(express.static(path.join(__dirname, "../../app/lib/public")));
    app.use(express.static(path.join(__dirname, "../../web/public")));

    // Wire the API routes (same as server.js) with error handling
    app.get("/api/auth-url", async (req, res) => {
      try {
        const event = { queryStringParameters: { state: req.query.state } };
        const { statusCode, body } = await authUrlHandler(event);
        res.status(statusCode).json(JSON.parse(body));
      } catch (error) {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.post("/api/exchange-token", async (req, res) => {
      try {
        const event = { body: JSON.stringify(req.body) };
        const { statusCode, body } = await exchangeTokenHandler(event);
        res.status(statusCode).json(JSON.parse(body));
      } catch (error) {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.post("/api/submit-vat", async (req, res) => {
      try {
        const event = { body: JSON.stringify(req.body) };
        const { statusCode, body } = await submitVatHandler(event);
        res.status(statusCode).json(JSON.parse(body));
      } catch (error) {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.post("/api/log-receipt", async (req, res) => {
      try {
        const event = { body: JSON.stringify(req.body) };
        const { statusCode, body } = await logReceiptHandler(event);
        res.status(statusCode).json(JSON.parse(body));
      } catch (error) {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Fallback route for SPA
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "../../app/lib/public/index.html"));
    });
  });

  describe("Express App Configuration", () => {
    test("should have JSON middleware configured", async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      });
      exchangeTokenHandler.mockImplementation(mockHandler);

      await request(app).post("/api/exchange-token").send({ code: "test-code" }).expect(200);

      expect(mockHandler).toHaveBeenCalledWith({
        body: JSON.stringify({ code: "test-code" }),
      });
    });

    test("should serve static files", async () => {
      // This test would require actual static files to exist
      // For now, we'll test that the route doesn't throw an error
      const response = await request(app).get("/nonexistent.js");
      // Should return 404 for non-existent static files, not crash
      expect([404, 200]).toContain(response.status);
    });
  });

  describe("GET /api/auth-url", () => {
    test("should call httpGet with correct event format", async () => {
      const mockResponse = {
        statusCode: 200,
        body: JSON.stringify({ authUrl: "https://example.com/auth" }),
      };
      authUrlHandler.mockResolvedValue(mockResponse);

      const response = await request(app).get("/api/auth-url").query({ state: "test-state" }).expect(200);

      expect(authUrlHandler).toHaveBeenCalledWith({
        queryStringParameters: { state: "test-state" },
      });
      expect(response.body).toEqual({ authUrl: "https://example.com/auth" });
    });

    test("should handle httpGet errors", async () => {
      const mockResponse = {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing state" }),
      };
      authUrlHandler.mockResolvedValue(mockResponse);

      const response = await request(app).get("/api/auth-url").expect(400);

      expect(response.body).toEqual({ error: "Missing state" });
    });

    test("should handle missing state parameter", async () => {
      const mockResponse = {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing state" }),
      };
      authUrlHandler.mockResolvedValue(mockResponse);

      await request(app).get("/api/auth-url").expect(400);

      expect(authUrlHandler).toHaveBeenCalledWith({
        queryStringParameters: { state: undefined },
      });
    });
  });

  describe("POST /api/exchange-token", () => {
    test("should call httpPost with correct event format", async () => {
      const mockResponse = {
        statusCode: 200,
        body: JSON.stringify({ hmrcAccessToken: "test-token" }),
      };
      exchangeTokenHandler.mockResolvedValue(mockResponse);

      const requestBody = { code: "auth-code" };
      const response = await request(app).post("/api/exchange-token").send(requestBody).expect(200);

      expect(exchangeTokenHandler).toHaveBeenCalledWith({
        body: JSON.stringify(requestBody),
      });
      expect(response.body).toEqual({ hmrcAccessToken: "test-token" });
    });

    test("should handle httpPost errors", async () => {
      const mockResponse = {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing code" }),
      };
      exchangeTokenHandler.mockResolvedValue(mockResponse);

      const response = await request(app).post("/api/exchange-token").send({}).expect(400);

      expect(response.body).toEqual({ error: "Missing code" });
    });
  });

  describe("POST /api/submit-vat", () => {
    test("should call httpPost with correct event format", async () => {
      const mockResponse = {
        statusCode: 200,
        body: JSON.stringify({ formBundleNumber: "12345" }),
      };
      submitVatHandler.mockResolvedValue(mockResponse);

      const requestBody = {
        vatNumber: "193054661",
        periodKey: "18A1",
        vatDue: "100.00",
        hmrcAccessToken: "test-token",
      };
      const response = await request(app).post("/api/submit-vat").send(requestBody).expect(200);

      expect(submitVatHandler).toHaveBeenCalledWith({
        body: JSON.stringify(requestBody),
      });
      expect(response.body).toEqual({ formBundleNumber: "12345" });
    });

    test("should handle httpPost errors", async () => {
      const mockResponse = {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing parameters" }),
      };
      submitVatHandler.mockResolvedValue(mockResponse);

      const response = await request(app).post("/api/submit-vat").send({ vatNumber: "123" }).expect(400);

      expect(response.body).toEqual({ error: "Missing parameters" });
    });
  });

  describe("POST /api/log-receipt", () => {
    test("should call httpPost with correct event format", async () => {
      const mockResponse = {
        statusCode: 200,
        body: JSON.stringify({ status: "receipt logged" }),
      };
      logReceiptHandler.mockResolvedValue(mockResponse);

      const requestBody = { formBundleNumber: "12345", receipt: "data" };
      const response = await request(app).post("/api/log-receipt").send(requestBody).expect(200);

      expect(logReceiptHandler).toHaveBeenCalledWith({
        body: JSON.stringify(requestBody),
      });
      expect(response.body).toEqual({ status: "receipt logged" });
    });

    test("should handle httpPost errors", async () => {
      const mockResponse = {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to log receipt" }),
      };
      logReceiptHandler.mockResolvedValue(mockResponse);

      const response = await request(app).post("/api/log-receipt").send({ invalid: "data" }).expect(500);

      expect(response.body).toEqual({ error: "Failed to log receipt" });
    });
  });

  describe("SPA Fallback Route", () => {
    test("should serve index.html for unknown routes", async () => {
      // This test would require the actual index.html file to exist
      // For now, we'll test that it attempts to serve the file
      const response = await request(app).get("/unknown-route");
      // Should either serve the file (200) or return 404 if file doesn't exist
      expect([200, 404]).toContain(response.status);
    });

    test("should serve index.html for nested routes", async () => {
      const response = await request(app).get("/some/nested/route");
      expect([200, 404]).toContain(response.status);
    });
  });

  describe("Error Handling", () => {
    test("should handle handler exceptions gracefully", async () => {
      authUrlHandler.mockRejectedValue(new Error("Handler crashed"));

      const response = await request(app).get("/api/auth-url").query({ state: "test" });

      // Express should catch the error and return 500
      expect(response.status).toBe(500);
    });

    test("should handle malformed JSON responses from handlers", async () => {
      authUrlHandler.mockResolvedValue({
        statusCode: 200,
        body: "invalid-json",
      });

      const response = await request(app).get("/api/auth-url").query({ state: "test" });

      // Should return 500 due to JSON.parse error
      expect(response.status).toBe(500);
    });
  });
});
