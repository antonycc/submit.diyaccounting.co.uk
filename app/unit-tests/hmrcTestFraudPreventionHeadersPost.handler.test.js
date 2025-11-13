// app/unit-tests/hmrcTestFraudPreventionHeadersPost.handler.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handler } from "../functions/hmrc/hmrcTestFraudPreventionHeadersPost.js";

// Mock environment
process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";

describe("hmrcTestFraudPreventionHeadersPost handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  it("should successfully validate fraud prevention headers", async () => {
    const mockEvent = {
      headers: {
        "authorization": "Bearer valid-token-12345",
        "host": "localhost",
        "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0",
        "Gov-Client-Device-ID": "device-123",
        "Gov-Client-Multi-Factor": "type=OTHER",
        "Gov-Client-Public-IP": "203.0.113.1",
        "Gov-Client-Public-IP-Timestamp": "2025-01-01T00:00:00Z",
        "Gov-Client-Public-Port": "443",
        "Gov-Client-Screens": JSON.stringify({ width: 1920, height: 1080, colorDepth: 24, pixelDepth: 24 }),
        "Gov-Client-Timezone": "Europe/London",
        "Gov-Client-User-IDs": "server=1",
        "Gov-Client-Window-Size": JSON.stringify({ width: 1920, height: 1080 }),
        "Gov-Vendor-Public-IP": "203.0.113.2",
      },
      requestContext: {
        requestId: "test-request-123",
      },
    };

    // Mock successful HMRC response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: "VALID_HEADERS",
        message: "All fraud prevention headers are valid",
        warnings: [],
      }),
    });

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Fraud prevention headers validation successful");
    expect(body.validation).toBeDefined();
    expect(body.headersValidated).toContain("Gov-Client-Browser-JS-User-Agent");
    expect(body.headersValidated).toContain("Gov-Vendor-Version");

    // Verify HMRC API was called with correct URL
    expect(global.fetch).toHaveBeenCalledWith(
      "https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/validate",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Authorization": "Bearer valid-token-12345",
          "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
        }),
      }),
    );
  });

  it("should return 401 when authorization header is missing", async () => {
    const mockEvent = {
      headers: {
        host: "localhost",
      },
      requestContext: {
        requestId: "test-request-124",
      },
    };

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("Missing Authorization Bearer token");
  });

  it("should handle HMRC validation warnings", async () => {
    const mockEvent = {
      headers: {
        "authorization": "Bearer valid-token-12345",
        "host": "localhost",
        "Gov-Client-Public-IP": "203.0.113.1",
      },
      requestContext: {
        requestId: "test-request-125",
      },
    };

    // Mock HMRC response with warnings
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: "VALID_WITH_WARNINGS",
        message: "Some headers could be improved",
        warnings: ["Gov-Client-Device-ID is missing", "Gov-Client-Screens is missing"],
      }),
    });

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.validation.warnings).toBeDefined();
    expect(body.validation.warnings.length).toBeGreaterThan(0);
  });

  it("should handle HMRC 401 Unauthorized response", async () => {
    const mockEvent = {
      headers: {
        authorization: "Bearer invalid-token",
        host: "localhost",
      },
      requestContext: {
        requestId: "test-request-126",
      },
    };

    // Mock HMRC 401 response
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        code: "INVALID_CREDENTIALS",
        message: "Invalid authentication credentials",
      }),
    });

    const result = await handler(mockEvent);

    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBeDefined();
  });

  it("should handle network timeout errors", async () => {
    const mockEvent = {
      headers: {
        authorization: "Bearer valid-token-12345",
        host: "localhost",
      },
      requestContext: {
        requestId: "test-request-127",
      },
    };

    // Mock network timeout
    global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("Failed to validate fraud prevention headers");
    expect(body.error.message).toBe("Network timeout");
  });

  it("should handle HMRC 403 Forbidden response", async () => {
    const mockEvent = {
      headers: {
        authorization: "Bearer expired-token",
        host: "localhost",
      },
      requestContext: {
        requestId: "test-request-128",
      },
    };

    // Mock HMRC 403 response
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        code: "FORBIDDEN",
        message: "Access denied",
      }),
    });

    const result = await handler(mockEvent);

    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBeDefined();
  });
});
