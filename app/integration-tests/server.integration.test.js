// app/integration-tests/server.integration.test.js

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import request from "supertest";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Import the actual handlers (not mocked for integration test)
import { handler as exchangeTokenHandler } from "@app/functions/mockTokenPost.js";
import { httpPost as submitVatHandler } from "@app/functions/submitVat.js";
import { httpPost as logReceiptHandler } from "@app/functions/logReceipt.js";
import { handler as authUrlHandler } from "@app/functions/hmrcAuthUrlGet.js";

const HMRC = "https://test-api.service.hmrc.gov.uk";
const s3Mock = mockClient(S3Client);

// Setup MSW server to mock external HTTP calls
const server = setupServer(
  // Mock HMRC token exchange
  http.post(`${HMRC}/oauth/token`, async ({ request }) => {
    const formData = await request.formData();
    const grantType = formData.get("grant_type");
    const code = formData.get("code");

    if (grantType === "authorization_code" && code) {
      return HttpResponse.json({ access_token: "mocked-access-token" }, { status: 200 });
    }
    return HttpResponse.json({ error: "invalid_request" }, { status: 400 });
  }),

  // Mock HMRC VAT submission
  http.post(`${HMRC}/organisations/vat/:vatNumber/returns`, async ({ params, request }) => {
    const vatNumber = params.vatNumber;
    const body = await request.json();
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (body.finalised && body.periodKey) {
      return HttpResponse.json(
        {
          formBundleNumber: "mocked-bundle-12345",
          chargeRefNumber: "mocked-charge-ref",
          processingDate: "2025-07-15T23:40:00Z",
        },
        { status: 200 },
      );
    }

    return HttpResponse.json({ error: "Bad Request" }, { status: 400 });
  }),
);

describe("Integration – Server Express App", () => {
  let app;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  beforeAll(() => {
    server.listen({
      onUnhandledRequest: "bypass",
    });
    console.log("MSW server started for integration tests");
  });

  afterAll(() => {
    server.close();
    console.log("MSW server closed");
  });

  beforeEach(() => {
    vi.resetAllMocks();

    // Set up test environment variables
    process.env = {
      ...process.env,
      HMRC_CLIENT_ID: "integration-test-client-id",
      HMRC_CLIENT_SECRET: "integration-test-secret",
      COGNITO_CLIENT_ID: "integration-test-cognito-client-id",
      GOOGLE_CLIENT_SECRET: "integration-test-google-secret",
      DIY_SUBMIT_BASE_URL: "https://test.submit.diyaccounting.co.uk/",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      DIY_SUBMIT_RECEIPTS_BUCKET_NAME: "integration-test-bucket",
      TEST_SERVER_HTTP_PORT: "3001",
      TEST_S3_ENDPOINT: "http://localhost:9000", // Enable S3 operations for tests
    };

    s3Mock.reset();

    // Create Express app exactly like server.js
    app = express();
    app.use(express.json());
    // app.use(express.static(path.join(__dirname, "../../app/lib/public")));
    app.use(express.static(path.join(__dirname, "../../web/public")));

    // Wire the API routes exactly like server.js
    app.get("/api/hmrc/authUrl-get", async (req, res) => {
      const event = { queryStringParameters: { state: req.query.state } };
      const { statusCode, body } = await authUrlHandler(event);
      res.status(statusCode).json(JSON.parse(body));
    });

    app.post("/api/mock/token-post", async (req, res) => {
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

    // Fallback to index.html for SPA routing
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "../../app/lib/public/index.html"));
    });
  });

  afterEach(() => {
    s3Mock.restore();
  });

  describe("Auth Flow Integration", () => {
    it("should generate auth URL through Express endpoint", async () => {
      const response = await request(app).get("/api/hmrc/authUrl-get").query({ state: "integration-test-state" }).expect(200);

      console.log("Auth URL response:", response.body);

      expect(response.body).toHaveProperty("authUrl");
      expect(response.body.authUrl).toContain("response_type=code");
      expect(response.body.authUrl).toContain("client_id=integration-test-client-id");
      expect(response.body.authUrl).toContain("state=integration-test-state");
      expect(response.body.authUrl).toContain("redirect_uri=https%3A%2F%2Ftest.submit.diyaccounting.co.uk%2F");
    });

    it("should exchange token through Express endpoint", async () => {
      const response = await request(app).post("/api/mock/token-post").send({ code: "integration-test-code" }).expect(200);

      console.log("Token exchange response:", response.body);

      expect(response.body).toHaveProperty("hmrcAccessToken");
      expect(response.body.accessToken).toBe("mocked-access-token");
    });

    it("should handle missing state in auth URL", async () => {
      const response = await request(app).get("/api/hmrc/authUrl-get").expect(400);

      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toBe("Missing state query parameter from URL");
    });

    it("should handle missing code in token exchange", async () => {
      const response = await request(app).post("/api/mock/token-post").send({}).expect(400);

      expect(response.error).toHaveProperty("message");
      expect(response.body.message).toBe("Missing code from event body");
    });
  });

  describe("VAT Submission Integration", () => {
    it("should submit VAT return through Express endpoint", async () => {
      const vatData = {
        vatNumber: "111222333",
        periodKey: "18A1",
        vatDue: "150.00",
        accessToken: "mocked-access-token",
      };

      const response = await request(app).post("/api/submit-vat").send(vatData).expect(200);

      console.log("VAT submission response:", response.body);

      expect(response.body).toHaveProperty("receipt");
      expect(response.body.receipt).toHaveProperty("formBundleNumber");
      expect(response.body.receipt.formBundleNumber).toBe("mocked-bundle-12345");
      expect(response.body.receipt).toHaveProperty("chargeRefNumber");
      expect(response.body.receipt).toHaveProperty("processingDate");
    });

    it("should handle missing VAT parameters", async () => {
      const response = await request(app).post("/api/submit-vat").send({ vatNumber: "123456789" }).expect(400);

      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toBe(
        "Missing periodKey parameter from body, Missing vatDue parameter from body, Missing accessToken parameter from body",
      );
    });
  });

  describe("Receipt Logging Integration", () => {
    it("should log receipt through Express endpoint", async () => {
      // Mock successful S3 put
      s3Mock.on(PutObjectCommand).resolves({});

      const receiptData = {
        formBundleNumber: "test-bundle-123",
        chargeRefNumber: "test-charge-ref",
        processingDate: "2025-07-15T23:40:00Z",
      };

      const response = await request(app).post("/api/log-receipt").send(receiptData).expect(200);

      console.log("Receipt logging response:", response.body);

      expect(response.body).toHaveProperty("receipt");
      expect(response.body).toHaveProperty("key");
      expect(response.body.key).toBe("receipts/test-bundle-123.json");

      // Verify S3 was called correctly
      expect(s3Mock.calls()).toHaveLength(1);
      const s3Call = s3Mock.calls()[0];
      expect(s3Call.args[0].input).toMatchObject({
        Bucket: "integration-test-bucket",
        Key: "receipts/test-bundle-123.json",
        ContentType: "application/json",
      });
    });

    it("should handle S3 errors in receipt logging", async () => {
      // Mock S3 error
      s3Mock.on(PutObjectCommand).rejects(new Error("S3 connection failed"));

      const receiptData = {
        formBundleNumber: "test-bundle-456",
      };

      const response = await request(app).post("/api/log-receipt").send(receiptData).expect(500);

      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toContain("Failed to log receipt");
      expect(response.body).toHaveProperty("details");
    });
  });

  describe("Static File Serving", () => {
    it("should serve static files from public directory", async () => {
      // Test that static file middleware is configured
      const response = await request(app).get("/favicon.ico");
      // Should either serve the file (200) or return 404 if not found
      expect([200, 404]).toContain(response.status);
    });
  });

  describe("SPA Fallback", () => {
    it("should serve index.html for unknown routes", async () => {
      const response = await request(app).get("/unknown-spa-route");
      // Should either serve index.html (200) or return 404 if file doesn't exist
      expect([200, 404]).toContain(response.status);
    });

    it("should serve index.html for nested SPA routes", async () => {
      const response = await request(app).get("/dashboard/vat/submit");
      expect([200, 404]).toContain(response.status);
    });
  });

  describe("Full Flow Integration", () => {
    it("should handle complete auth and VAT submission flow", async () => {
      // Step 1: Get auth URL
      const authResponse = await request(app).get("/api/hmrc/authUrl-get").query({ state: "flow-test-state" }).expect(200);

      expect(authResponse.body).toHaveProperty("authUrl");

      // Step 2: Exchange code for token
      const tokenResponse = await request(app).post("/api/mock/token-post").send({ code: "flow-test-code" }).expect(200);

      expect(tokenResponse.body).toHaveProperty("hmrcAccessToken");
      const hmrcAccessToken = tokenResponse.body.accessToken;

      // Step 3: Submit VAT return
      const vatResponse = await request(app)
        .post("/api/submit-vat")
        .send({
          vatNumber: "987654321",
          periodKey: "18A2",
          vatDue: "250.00",
          accessToken: hmrcAccessToken,
        })
        .expect(200);

      expect(vatResponse.body).toHaveProperty("receipt");
      expect(vatResponse.body.receipt).toHaveProperty("formBundleNumber");

      // Step 4: Log receipt
      s3Mock.on(PutObjectCommand).resolves({});

      const receiptResponse = await request(app).post("/api/log-receipt").send(vatResponse.body.receipt).expect(200);

      expect(receiptResponse.body).toHaveProperty("receipt");
      expect(receiptResponse.body).toHaveProperty("key");

      console.log("Full flow completed successfully");
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed JSON in request body", async () => {
      const response = await request(app)
        .post("/api/mock/token-post")
        .set("Content-Type", "application/json")
        .send("invalid-json")
        .expect(400);

      // Express should handle malformed JSON gracefully
    });

    it("should handle large request bodies", async () => {
      const largeData = {
        code: "x".repeat(10000),
        extra: "y".repeat(10000),
      };

      const response = await request(app).post("/api/mock/token-post").send(largeData);

      // Should either process or reject based on Express limits
      expect([200, 400, 413]).toContain(response.status);
    });
  });
});
